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
  // Adaptive thinking on Sonnet 4.6 / Opus 4.6 / Opus 4.7 — but DO NOT send temperature etc on Opus 4.7
  const isOpus47 = MODEL.startsWith("claude-opus-4-7");
  const params: Parameters<typeof anthropic.messages.stream>[0] = {
    model: MODEL,
    max_tokens: 2048,
    // biome-ignore lint/suspicious/noExplicitAny: SDK accepts structured blocks
    system: systemBlocks as any,
    messages: [{ role: "user", content: userMessage }],
    ...(supportsAdaptiveThinking(MODEL) ? { thinking: { type: "adaptive" } } : {}),
    // Only send temperature on older models (not Opus 4.7 — it 400s)
    ...(isOpus47 ? {} : { temperature: 0.9 }),
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
      "X-Accel-Buffering": "no",
      "X-RateLimit-Limit": String(limit.limit),
      "X-RateLimit-Remaining": String(limit.remaining),
    },
  });
}
