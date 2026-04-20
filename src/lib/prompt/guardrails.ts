/**
 * Hard guardrails the generator must obey. These are pinned into the system
 * prompt (CACHED block) and also enforced post-generation via `scanForViolations`.
 *
 * Two classes of rules:
 * 1. Fabrication bans — never invent proof the user didn't provide.
 * 2. AI-slop bans — phrases that scream "LLM wrote this" and tank ad credibility.
 */

/** Phrases that are banned outright — case-insensitive regex match. */
export const BANNED_PHRASES: readonly string[] = [
  // AI-slop tells
  "in today's fast-paced world",
  "in the world of",
  "unlock the power",
  "unleash",
  "game[- ]?changer",
  "game[- ]?changing",
  "revolutionize",
  "revolutionary",
  "cutting[- ]?edge",
  "state[- ]?of[- ]?the[- ]?art",
  "transformative",
  "paradigm shift",
  "navigate the complexities",
  "delve into",
  "it's important to note",
  "it is important to note",
  "leverage",
  "leveraging",
  "harness the power",
  "embark on",
  "journey of self[- ]?discovery",
  "in conclusion",
  "to sum up",
  "rest assured",

  // Fabricated-proof tells
  "studies show",
  "research proves",
  "scientifically proven",
  "clinically proven",
  "9 out of 10",
  "99% of",
  "thousands of satisfied",
];

/** Rules shown to the model in plain English. */
export const GUARDRAIL_RULES = `
# HARD RULES — NON-NEGOTIABLE

## 1. Never fabricate proof.
- Do NOT invent client names, quotes, testimonials, case studies, or numbers.
- Do NOT invent credentials, years of experience, or "helped N clients" claims.
- If the user provided proof details under <proof>, use them verbatim or paraphrase lightly.
- If <proof> is empty, write the ad WITHOUT specific proof. Use pattern-library-appropriate
  substitutes: personal observation, industry-wide patterns, or skip the proof section.
- NEVER write things like "one of my clients", "a client of mine", "last week a student of mine"
  unless the user supplied that exact story under <proof>.

## 2. Never use these banned phrases (case-insensitive):
in today's fast-paced world, in the world of, unlock the power, unleash, game-changer,
revolutionize, revolutionary, cutting-edge, state-of-the-art, transformative, paradigm shift,
navigate the complexities, delve into, it's important to note, leverage, harness the power,
embark on, journey of self-discovery, in conclusion, to sum up, rest assured,
studies show, research proves, scientifically proven, clinically proven,
9 out of 10, 99% of, thousands of satisfied.

## 2a. Punctuation bans — these are the #1 AI-text tell.
- NEVER use em dashes (—, U+2014). Not once. Replace with a period, comma, or line break.
  Example fix: "before resentment calcifies — before patterns become permanent" becomes
  "before resentment calcifies. before patterns become permanent."
- NEVER use en dashes (–, U+2013). Same rule.
- AVOID ellipses ("..." or "…"). Use a period or a line break. An ellipsis is only acceptable
  in rare cases where a character is literally trailing off mid-thought in dialogue.
- Prefer periods and fragments. Short sentences punch harder than em-dash-connected clauses.

## 3. Voice discipline.
- Match the voice signals in the pattern library: "So…", "Which is why…", "👉🏼", "👇🏼"
  used sparingly and only where they feel natural.
- Conversational warmth. No corporate-speak. No hype-bro language either.
- Short sentences. Fragments OK. One idea per line when it hits harder that way.

## 4. Framework discipline.
- The user picked a specific framework. Follow ITS structure — not a generic ad shape.
- Do not mix frameworks unless the pattern library explicitly describes a hybrid.
- If the framework requires a hook style (e.g., Belief Shifter opens with a misconception
  question), use that exact opening pattern.

## 5. Output format.
- Return ONLY the ad copy. No preamble like "Here's your ad:" or "Sure, here you go:".
- No meta-commentary about the ad at the end.
- Use plain text suitable for Meta Ads Manager. Line breaks and emoji OK.
- Output ONE continuous piece of ad copy — no section headers, no labels, no
  [HOOK]/[BODY]/[PROOF]/[CTA] markers. The hook, body, proof (if supplied), and
  call-to-action should flow naturally in the order the chosen framework calls for.
`.trim();

/**
 * Strip forbidden punctuation from generated output. Claude will ignore the
 * "no em dash" instruction ~10-20% of the time because em dashes are its
 * single strongest default tic — so we also sanitize on the server.
 *
 * Rules:
 * - em dash (—, U+2014) and en dash (–, U+2013) become a comma + space
 *   (rarely wrong grammatically, preserves flow)
 * - Unicode ellipsis (…) and triple-dot ASCII ellipsis (...) become a single period
 * - Double-comma / stray-space cleanup afterwards
 *
 * Safe to apply to a streaming delta: all replacements are per-codepoint or short
 * fixed strings, nothing that can be split across chunk boundaries by the decoder.
 */
export function sanitizeOutput(text: string): string {
  return text
    .replace(/[\u2014\u2013]/g, ", ") // em / en dash -> comma+space
    .replace(/\u2026/g, ".")          // unicode ellipsis -> period
    .replace(/\.{3,}/g, ".")          // ascii ellipsis (... or more) -> period
    .replace(/,\s*,/g, ",")           // collapse accidental double commas
    .replace(/ {2,}/g, " ");          // collapse doubled spaces
}

/**
 * Scan generated text for banned phrase violations.
 * Returns matched phrases (empty array = clean).
 */
export function scanForViolations(text: string): string[] {
  const hits: string[] = [];
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b`, "i");
    if (re.test(text)) hits.push(phrase);
  }
  return hits;
}

/**
 * Scan for likely-fabricated proof claims — heuristic, not perfect.
 * Only runs when user did NOT supply any <proof>.
 */
export function scanForFabricatedProof(text: string, userProvidedProof: boolean): string[] {
  if (userProvidedProof) return [];
  const hits: string[] = [];
  const redFlags = [
    /one of my (clients|students)/i,
    /a (client|student) of mine/i,
    /last (week|month|year),? (a|one of)/i,
    /\b[A-Z][a-z]+,?\s+(a|an)\s+\d+[- ]year[- ]old/i, // "Sarah, a 42-year-old..."
    /I('| ha)ve helped \d{2,}/i, // "I've helped 500..."
    /my \d+[- ]?year[- ]old (client|student)/i,
  ];
  for (const rx of redFlags) {
    const m = text.match(rx);
    if (m) hits.push(m[0]);
  }
  return hits;
}
