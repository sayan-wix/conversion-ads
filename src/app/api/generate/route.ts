/**
 * POST /api/generate
 * Streams a full ad generation for the provided wizard inputs + framework.
 *
 * Runtime: Node (needed for the embedded pattern library; Edge works too but unnecessary)
 * Duration: up to 60s (Vercel Hobby tier allows this for streaming)
 */
import { anthropic, MODEL, supportsAdaptiveThinking } from "@/lib/anthropic";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { WizardInputSchema } from "@/lib/validate";
import { buildSystemBlocks, buildUserMessage } from "@/lib/prompt/system";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type BetaHeaders = Record<string, string>;

export async function POST(req: Request) {
  // 1. Rate limit per IP
  const ip = getClientIp(req);
  const limit = await checkRateLimit(ip);
  if (!limit.ok) {
    return Response.json(
      {
        error: "rate_limited",
        message: `Too many generations. Resets in ${Math.max(
          0,
          Math.ceil((limit.reset - Date.now()) / 1000),
        )} seconds.`,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
          "X-RateLimit-Reset": String(limit.reset),
        },
      },
    );
  }

  // 2. Validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = WizardInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 3. Build prompt
  const systemBlocks = buildSystemBlocks(input.framework);
  const userMessage = buildUserMessage(input);

  // 4. Stream from Anthropic
  // When adaptive thinking is on (Sonnet 4.6, Opus 4.6, Opus 4.7) the API rejects
  // `temperature` values other than 1 — so omit it entirely in that case. Only send
  // a custom temperature on older models that don't use adaptive thinking.
  const adaptive = supportsAdaptiveThinking(MODEL);
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    // 4096 gives adaptive thinking room to "think" without starving the final
    // ad output. With 2048 and a huge prompt, thinking can eat the whole budget
    // and the stream ends with zero text_deltas.
    max_tokens: 4096,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    ...(adaptive ? { thinking: { type: "adaptive" } } : { temperature: 0.9 }),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Flush a zero-width-space immediately so Vercel / any reverse proxy stops
      // buffering and the browser sees bytes right away. Without this, huge prompts
      // can leave the client staring at nothing for 30-60s and it looks frozen.
      controller.enqueue(encoder.encode("\u200B"));

      // Keepalive heartbeats every 10s while we wait for Claude to produce the first
      // real token. Each heartbeat is a zero-width-space that the client filters out.
      let gotFirstToken = false;
      const heartbeat = setInterval(() => {
        if (!gotFirstToken) {
          try {
            controller.enqueue(encoder.encode("\u200B"));
          } catch {
            /* controller may be closed */
          }
        }
      }, 10_000);

      try {
        const claudeStream = anthropic.messages.stream(params);
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            gotFirstToken = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        // If Claude never emitted a text delta (e.g. adaptive thinking consumed the
        // whole max_tokens budget, or stop_reason was unexpected), surface that
        // clearly so the client doesn't end up with an empty silent UI.
        if (!gotFirstToken) {
          const final = await claudeStream.finalMessage().catch(() => null);
          const stopReason = final?.stop_reason ?? "unknown";
          const usage = final?.usage
            ? ` (in=${final.usage.input_tokens} out=${final.usage.output_tokens})`
            : "";
          controller.enqueue(
            encoder.encode(
              `\n\n[GENERATION_ERROR] Claude produced no output text. stop_reason=${stopReason}${usage}. Try shorter inputs or retry.`,
            ),
          );
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "generation_failed";
        controller.enqueue(encoder.encode(`\n\n[GENERATION_ERROR] ${msg}`));
        controller.close();
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Limit": String(limit.limit),
      "X-RateLimit-Remaining": String(limit.remaining),
    },
  });
}
