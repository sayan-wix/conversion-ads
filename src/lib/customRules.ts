"use client";

/**
 * Client-side wrappers around the /api/rules endpoints.
 *
 * Rules live on the server (Upstash Redis) and are shared across every
 * visitor to the tool — not in localStorage. These helpers just wrap
 * fetch() calls so components can treat rule management as a simple async
 * API.
 *
 * If the network fails or the server returns non-ok, callers fall back to
 * the empty list or re-query — we never throw from here. A Redis hiccup
 * shouldn't break the output page.
 */

export type CustomRule = {
  id: string;
  text: string;
  createdAt: number;
};

async function parseRules(res: Response): Promise<CustomRule[] | null> {
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as { rules?: unknown };
    if (!Array.isArray(j.rules)) return null;
    return j.rules.filter(
      (r): r is CustomRule =>
        !!r &&
        typeof r === "object" &&
        typeof (r as CustomRule).id === "string" &&
        typeof (r as CustomRule).text === "string",
    );
  } catch {
    return null;
  }
}

/** Pull the current list from the server. Returns [] on any failure. */
export async function fetchRules(): Promise<CustomRule[]> {
  try {
    const res = await fetch("/api/rules", { cache: "no-store" });
    return (await parseRules(res)) ?? [];
  } catch {
    return [];
  }
}

/**
 * Persist a new rule server-side. Returns the authoritative post-write
 * list (may equal the prior list if the rule was a duplicate).
 */
export async function addRule(text: string): Promise<CustomRule[]> {
  try {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const parsed = await parseRules(res);
    if (parsed) return parsed;
  } catch {
    /* fall through */
  }
  // On failure, best-effort: return whatever the server currently thinks.
  return fetchRules();
}

/** Delete a rule by id. Returns the authoritative post-delete list. */
export async function deleteRule(id: string): Promise<CustomRule[]> {
  try {
    const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const parsed = await parseRules(res);
    if (parsed) return parsed;
  } catch {
    /* fall through */
  }
  return fetchRules();
}

/** Convenience for rendering / debugging. */
export function rulesToStringArray(rules: CustomRule[]): string[] {
  return rules.map((r) => r.text);
}
