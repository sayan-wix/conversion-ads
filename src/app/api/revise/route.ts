/**
 * POST /api/revise
 * Targeted revision of an ad OR headlines block. User provides explicit
 * feedback (e.g. "change the third paragraph to first person", "the CTA is
 * weak") and Claude applies it surgically — keeping everything the feedback
 * doesn't touch exactly as-is.
 *
 * Same cached system prefix as the other endpoints → cache hit expected on
 * the second+ call.
 */
import { anthropic, MODEL } from "@/lib/anthropic";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { ReviseInputSchema } from "@/lib/validate";
import {
  buildSystemBlocks,
  buildReviseUserMessage,
} from "@/lib/prompt/system";
import { sanitizeOutput } from "@/lib/prompt/guardrails";

export const runtime = "nodejs";
// Vercel Pro: 300s cap. Matches /api/generate + /api/headlines.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await checkRateLimit(ip);
  if (!limit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ReviseInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { target, currentText, feedback, adText, ...rest } = parsed.data;
  const systemBlocks = buildSystemBlocks(rest.framework, rest.customRules);
  const userMessage = buildReviseUserMessage({
    input: rest,
    target,
    currentText,
    feedback,
    adText,
  });

  // Revise is focused work (apply edits to existing text), not expansive — 8K
  // max_tokens comfortably covers either a revised ad or a revised headlines
  // block with headroom.
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    max_tokens: 8192,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    // Slightly lower temp than regen — we want precision (apply feedback), not
    // a wildly different take.
    temperature: 0.7,
  };

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const hb = (tag: string) =>
        `<!--hb:${tag}:${((Date.now() - startedAt) / 1000).toFixed(1)}s-->\n`;
      const safeEnqueue = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* controller may be closed */
        }
      };
      safeEnqueue(hb("open"));

      let gotFirstToken = false;
      const heartbeat = setInterval(() => {
        if (!gotFirstToken) safeEnqueue(hb("wait"));
      }, 10_000);

      try {
        const claudeStream = anthropic.messages.stream(params);
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            if (!gotFirstToken) {
              gotFirstToken = true;
              safeEnqueue(hb("firsttoken"));
            }
            const clean = sanitizeOutput(event.delta.text);
            if (clean) safeEnqueue(clean);
          }
        }
        if (!gotFirstToken) {
          const final = await claudeStream.finalMessage().catch(() => null);
          const stopReason = final?.stop_reason ?? "unknown";
          const usage = final?.usage
            ? ` (in=${final.usage.input_tokens} out=${final.usage.output_tokens})`
            : "";
          safeEnqueue(
            `\n\n[GENERATION_ERROR] Claude produced no revised text. stop_reason=${stopReason}${usage}. Try again.`,
          );
        }
        safeEnqueue(hb("done"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "generation_failed";
        safeEnqueue(`\n\n[GENERATION_ERROR] ${msg}`);
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
