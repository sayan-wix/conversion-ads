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
import { sanitizeOutput } from "@/lib/prompt/guardrails";

export const runtime = "nodejs";
// Vercel Pro: 300s cap. Gives Claude room to read huge pasted documents
// (avatar, mechanism) before emitting the first streamed token.
export const maxDuration = 300;
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
    // Adaptive thinking counts against max_tokens. With a big prompt (60K+ input
    // tokens) Claude's thinking can easily consume 3-8K tokens before it starts
    // writing — and if it hits the cap mid-think, zero ad text is emitted
    // (stop_reason=max_tokens). 16384 gives thinking room to finish AND leaves
    // ~8-12K tokens for the actual ad, which is comfortably more than any real
    // Meta ad needs (~500-1500 tokens).
    max_tokens: 16384,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    ...(adaptive ? { thinking: { type: "adaptive" } } : { temperature: 0.9 }),
  };

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      // Emit a visible HTML comment as the first byte so (a) Vercel / reverse proxies
      // flush immediately and (b) we have a diagnostic breadcrumb in the stream. The
      // client strips `<!--...-->` comments before rendering.
      const hb = (tag: string) => `<!--hb:${tag}:${((Date.now() - startedAt) / 1000).toFixed(1)}s-->\n`;
      const safeEnqueue = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* controller may be closed */
        }
      };
      safeEnqueue(hb("open"));

      // Keepalive breadcrumbs every 10s while we wait for Claude's first real token.
      // When the stream times out mid-way, the client can read the LAST breadcrumb to
      // tell how far the function got before Vercel killed it.
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
            // Strip em dashes / en dashes / ellipses on the way out. Claude ignores
            // the "no em dash" rule too often to trust the prompt alone.
            const clean = sanitizeOutput(event.delta.text);
            if (clean) safeEnqueue(clean);
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
          safeEnqueue(
            `\n\n[GENERATION_ERROR] Claude produced no output text. stop_reason=${stopReason}${usage}. Try shorter inputs or retry.`,
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
