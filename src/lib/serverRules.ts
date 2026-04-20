/**
 * Server-side persistent rules store — backed by Upstash Redis.
 *
 * Rules entered via the "Also save as a universal rule" checkbox on the
 * output page are stored HERE, not in the browser. That means every visitor
 * to the tool inherits the same rules — the app owner curates them by
 * using the tool.
 *
 * Design notes:
 * - One Redis hash keyed by `evergreen-ads:custom-rules`, field = rule id,
 *   value = JSON { text, createdAt }. Upstash auto-handles JSON parse/stringify.
 * - Hash semantics give us atomic per-field writes, so concurrent ticks of
 *   the checkbox don't stomp on each other.
 * - If Upstash env vars are missing (local dev without creds), everything is
 *   a no-op: loadRules returns [], addRule/deleteRule return the current
 *   list. Matches the ratelimit.ts fail-open pattern.
 */
import { Redis } from "@upstash/redis";

const HASH_KEY = "evergreen-ads:custom-rules";

export type CustomRule = {
  id: string;
  text: string;
  createdAt: number;
};

type StoredRule = { text: string; createdAt: number };

function getClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function makeId(): string {
  return `r_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Fetch the full rules list, oldest-first. */
export async function loadRules(): Promise<CustomRule[]> {
  const client = getClient();
  if (!client) return [];
  const map = await client.hgetall<Record<string, StoredRule | string>>(
    HASH_KEY,
  );
  if (!map) return [];

  const rules: CustomRule[] = [];
  for (const [id, raw] of Object.entries(map)) {
    // Upstash usually auto-parses stored JSON, but handle both shapes defensively.
    let parsed: StoredRule | null = null;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw) as StoredRule;
      } catch {
        parsed = null;
      }
    } else if (raw && typeof raw === "object") {
      parsed = raw as StoredRule;
    }
    if (parsed && typeof parsed.text === "string") {
      rules.push({
        id,
        text: parsed.text,
        createdAt:
          typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
      });
    }
  }
  rules.sort((a, b) => a.createdAt - b.createdAt);
  return rules;
}

/**
 * Add a rule. Dedupes by exact (trimmed) text match — two users saving the
 * same "no em-dashes" rule doesn't create two copies. Returns the
 * post-write list.
 */
export async function addRule(text: string): Promise<CustomRule[]> {
  const trimmed = text.trim();
  if (!trimmed) return loadRules();

  const client = getClient();
  if (!client) return loadRules();

  const existing = await loadRules();
  if (existing.some((r) => r.text === trimmed)) return existing;

  const id = makeId();
  const entry: StoredRule = { text: trimmed, createdAt: Date.now() };
  await client.hset(HASH_KEY, { [id]: entry });

  return [...existing, { id, ...entry }];
}

/** Delete a rule by id. Returns the post-delete list. */
export async function deleteRule(id: string): Promise<CustomRule[]> {
  const client = getClient();
  if (!client) return loadRules();
  await client.hdel(HASH_KEY, id);
  return loadRules();
}

/** Convenience for API routes: just the text strings, in stable order. */
export async function loadRuleTexts(): Promise<string[]> {
  const rules = await loadRules();
  return rules.map((r) => r.text);
}
