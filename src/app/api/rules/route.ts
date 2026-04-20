/**
 * GET  /api/rules — list all universal custom rules.
 * POST /api/rules — add a new rule (body: { text: string }).
 *
 * These are INTENTIONALLY unauthenticated — anyone who uses the tool can
 * view and add rules. The app owner curates the list by using the tool.
 * If you ever want to lock writes behind a password, that's a small change
 * at this layer.
 *
 * Writes are lightly rate-limited (reusing the same per-IP bucket as
 * /api/generate) to keep drive-by spam at bay.
 */
import { loadRules, addRule } from "@/lib/serverRules";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await loadRules();
  return Response.json({ rules });
}

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

  const text =
    body && typeof body === "object" && "text" in body
      ? (body as { text?: unknown }).text
      : undefined;

  if (typeof text !== "string") {
    return Response.json({ error: "invalid_text" }, { status: 400 });
  }
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 500) {
    return Response.json(
      { error: "invalid_length", message: "Rule must be 2-500 chars." },
      { status: 400 },
    );
  }

  const rules = await addRule(trimmed);
  return Response.json({ rules });
}
