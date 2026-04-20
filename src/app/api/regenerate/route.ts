/**
 * POST /api/regenerate
 * Streams a single-section regenerate (hook, body, proof, or cta).
 * Shares the exact same cached system prefix as /api/generate — cache hit expected.
 */
import { anthropic, MODEL, supportsAdaptiveThinking } from "@/lib/anthropic";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { RegenerateInputSchema } from "@/lib/validate";
import { buildSystemBlocks, buildRegenerateMessage } from "@/lib/prompt/system";

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

  const { section, previousVersion, ...rest } = parsed.data;
  const systemBlocks = buildSystemBlocks(rest.framework);
  const userMessage = buildRegenerateMessage(rest, section, previousVersion);

  // Adaptive thinking forbids custom temperature. Only send a temperature when
  // the model doesn't support adaptive thinking.
  const adaptive = supportsAdaptiveThinking(MODEL);
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    // Same reasoning as /api/generate: adaptive thinking shares the max_tokens
    // budget with output. 8192 is plenty for one section + thinking overhead.
    max_tokens: 8192,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    ...(adaptive ? { thinking: { type: "adaptive" } } : { temperature: 0.95 }),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream(params);
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "generation_failed";
        controller.enqueue(encoder.encode(`\n\n[ERROR] ${msg}`));
        controller.close();
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
