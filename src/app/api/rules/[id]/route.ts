/**
 * DELETE /api/rules/:id — remove a universal rule by id.
 *
 * Unauthenticated, same posture as POST /api/rules. Rate-limited via the
 * shared per-IP bucket so nobody can drive-by-delete the whole list.
 */
import { deleteRule } from "@/lib/serverRules";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const limit = await checkRateLimit(ip);
  if (!limit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await context.params;
  if (!id || typeof id !== "string") {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const rules = await deleteRule(id);
  return Response.json({ rules });
}
