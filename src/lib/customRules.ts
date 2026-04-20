/**
 * Client-side storage for user-defined custom rules (e.g. "never break first
 * person POV", "always end with a question"). Stored in localStorage so they are
 * scoped to this browser / device — no backend, no auth, no cross-user leakage.
 *
 * Every API call sends the current rules array; the server appends them into the
 * system prompt as a dedicated MY CUSTOM RULES block that takes precedence over
 * every soft guideline.
 */

export type CustomRule = {
  id: string;
  text: string;
  createdAt: number;
};

const STORAGE_KEY = "evergreen-ads.customRules";

/** Read all rules from localStorage. SSR-safe (returns []). */
export function loadRules(): CustomRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Trust-but-verify: filter out any malformed entries.
    return parsed.filter(
      (r): r is CustomRule =>
        !!r &&
        typeof r === "object" &&
        typeof (r as { id?: unknown }).id === "string" &&
        typeof (r as { text?: unknown }).text === "string" &&
        typeof (r as { createdAt?: unknown }).createdAt === "number",
    );
  } catch {
    return [];
  }
}

export function saveRules(rules: CustomRule[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* quota exceeded / private mode — silently ignore */
  }
}

export function addRule(text: string): CustomRule[] {
  const trimmed = text.trim();
  if (!trimmed) return loadRules();
  const current = loadRules();
  // Don't double-add if the exact same text already exists.
  if (current.some((r) => r.text.trim() === trimmed)) return current;
  const rule: CustomRule = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    createdAt: Date.now(),
  };
  const next = [...current, rule];
  saveRules(next);
  return next;
}

export function deleteRule(id: string): CustomRule[] {
  const next = loadRules().filter((r) => r.id !== id);
  saveRules(next);
  return next;
}

/** Helper for API calls — returns just the rule text strings. */
export function rulesToStringArray(rules: CustomRule[]): string[] {
  return rules.map((r) => r.text.trim()).filter(Boolean);
}
