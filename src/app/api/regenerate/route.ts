/**
 * POST /api/regenerate
 * Streams a single-section regenerate (hook, body, proof, or cta).
 * Shares the exact same cached system prefix as /api/generate — cache hit expected.
 */
import { anthropic, MODEL } from "@/lib/anthropic";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { RegenerateInputSchema } from "@/lib/validate";
import { buildSystemBlocks, buildRegenerateMessage } from "@/lib/prompt/system";
import { sanitizeOutput } from "@/lib/prompt/guardrails";

export const runtime = "nodejs";
// Vercel Pro: 300s cap. Shares the same cached system prefix as /api/generate,
// so most regens are fast, but huge inputs still need room to rebuild the user msg.
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

  const parsed = RegenerateInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { previousVersion, ...rest } = parsed.data;
  const systemBlocks = buildSystemBlocks(rest.framework);
  const userMessage = buildRegenerateMessage(rest, previousVersion);

  // Thinking disabled — see /api/generate for full rationale. Regenerate produces
  // the same shape (ad + 20 headlines) so we match its max_tokens ceiling.
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    max_tokens: 32768,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.95,
  };

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      // Matches /api/generate: breadcrumb comments stripped by client, useful for
      // diagnosing timeouts. See src/app/api/generate/route.ts for full rationale.
      const hb = (tag: string) => `<!--hb:${tag}:${((Date.now() - startedAt) / 1000).toFixed(1)}s-->\n`;
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
            // Same punctuation sanitizer as /api/generate — strip em dashes etc.
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
    },
  });
}
