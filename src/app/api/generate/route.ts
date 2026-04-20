/**
 * POST /api/generate
 * Streams a full ad generation for the provided wizard inputs + framework.
 *
 * Runtime: Node (needed for the embedded pattern library; Edge works too but unnecessary)
 * Duration: up to 60s (Vercel Hobby tier allows this for streaming)
 */
import { anthropic, MODEL } from "@/lib/anthropic";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { WizardInputSchema } from "@/lib/validate";
import { buildSystemBlocks, buildAdUserMessage } from "@/lib/prompt/system";
import { sanitizeOutput } from "@/lib/prompt/guardrails";
import { loadRuleTexts } from "@/lib/serverRules";

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

  // 3. Build prompt — ad-only. Headlines are produced by a follow-up call to
  // /api/headlines. Splitting keeps each request's output budget small (faster
  // first token, no risk of max_tokens starving either block) and the system
  // prompt is byte-identical across both endpoints so /api/headlines gets a
  // cache hit on the second call.
  // Universal custom rules are stored in Upstash and read server-side on every
  // request. The client never sends them — they're curated by whoever uses the
  // tool via the "Also save as a universal rule" checkbox, and they apply to
  // every visitor going forward.
  const customRules = await loadRuleTexts();
  const systemBlocks = buildSystemBlocks(input.framework, customRules);
  const userMessage = buildAdUserMessage(input);

  // 4. Stream from Anthropic
  //
  // Thinking is DISABLED on purpose. Per CLAUDE.md Mistake #7: this project runs
  // retrieval + style-matching against the 120KB embedded pattern library — it is
  // NOT a reasoning task. Real symptoms when thinking was on (adaptive) with
  // 60K+ input tokens: Claude consumed the entire 16K output budget thinking and
  // emitted zero ad text (stop_reason=max_tokens, out=16384, no text deltas).
  // With thinking off, the model goes straight to writing — cheaper, faster, and
  // the pattern library does the heavy lifting anyway.
  //
  // Because thinking is off, `temperature` is allowed and we use 0.9 for varied copy.
  // 8K max_tokens is plenty for one ad (~500-1500 tokens) — headlines run in a
  // separate /api/headlines call so we don't need budget for them here.
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    max_tokens: 8192,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.9,
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
