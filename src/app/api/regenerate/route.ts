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
export const maxDuration = 60;
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
    max_tokens: 2048,
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
