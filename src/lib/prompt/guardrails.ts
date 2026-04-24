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

  // Humanizer additions — high-frequency AI vocabulary (post-2023 markers)
  // Source: Wikipedia "Signs of AI writing" / humanizer skill
  "moreover",
  "furthermore",
  "testament to",
  "stands as a testament",
  "serves as a testament",
  "pivotal",
  "pivotal moment",
  "pivotal role",
  "tapestry",
  "intricate",
  "intricacies",
  "seamless",
  "seamlessly",
  "vibrant",
  "nestled",
  "in the heart of",
  "breathtaking",
  "must[- ]?visit",
  "renowned",
  "underscore(s|d)?",
  "foster(s|ing)?",
  "cultivat(e|es|ing)",
  "showcase(s|d)?",
  "exemplif(y|ies)",
  "evolving landscape",
  "changing landscape",
  "digital landscape",
  "ever[- ]?evolving",
  "setting the stage",
  "marking a shift",
  "a shift in the",
  "rich (tradition|history|tapestry|heritage)",
  "vital role",
  "crucial role",
  "key role",
  "ensuring that",
  "not just a .{1,30}, it's a",
  "not only .{1,40} but also",
  "elevate your",
  "time[- ]?tested",
  "tried and true",

  // Copula avoidance (LLMs dodge simple "is/are")
  "stands as",
  "serves as",
  "boasts a",
  "boasts an",

  // Filler / hedge phrases
  "in order to",
  "due to the fact that",
  "at this point in time",
  "in the event that",
  "has the ability to",
  "have the ability to",
  "it could potentially",
  "may potentially",

  // Sycophancy / chatbot artifacts
  "i hope this helps",
  "great question",
  "let me know if",

  // Knowledge-cutoff disclaimers
  "as of my last",
  "based on available information",
  "while specific details",

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

## 6. Humanizer rules (anti-AI-slop — strict).
Trained marketers can spot AI-written copy in under 5 seconds. These patterns are
statistical tells that appear far more often in LLM output than in human writing.
Avoid all of them.

### 6a. No inflated significance / legacy / trend language.
Do NOT write that anything "stands as", "serves as", "is a testament to", "marks a
pivotal moment", "shapes the evolving landscape", "represents a shift", "sets the
stage for", etc. Ads sell a specific outcome, not historical significance.

### 6b. No superficial -ing tails.
Do NOT bolt on fake-depth present-participle clauses like "...highlighting the
importance of X", "...ensuring you get Y", "...fostering a sense of Z",
"...reflecting the community's connection to W". If the sentence is complete, stop.

### 6c. No promotional / brochure language.
Ban: "vibrant", "nestled", "in the heart of", "breathtaking", "stunning", "renowned",
"must-visit", "seamless", "seamlessly", "cutting-edge", "boasts". This is real-estate-
listing language. Ads should sound like a specific human talking, not a brochure.

### 6d. No vague attributions ("weasel words").
Do NOT write "experts believe", "industry reports suggest", "observers have cited",
"many people say", "it is widely known". Either cite a specific number/person the user
provided under <proof>, or omit the claim. Never launder an invented opinion through
vague authority.

### 6e. No negative parallelisms.
Do NOT use "not just X, but Y", "not merely A, it's B", "not only P but also Q".
This is a rhetorical tic AI leans on for false punch. Say the second thing directly.

### 6f. No rule-of-three padding.
Do NOT force lists of exactly three items to sound comprehensive ("keynotes, panels,
and networking", "innovation, inspiration, and insights"). Use one specific claim or
two if two is true — don't invent a third to complete the triad.

### 6g. No elegant variation (synonym cycling).
Within a short ad, use the SAME noun for the same thing. If it's "your business" in
paragraph one, don't switch to "your enterprise" then "your venture" then "your firm".
Repetition of a real word is better than parade of synonyms.

### 6h. No copula avoidance.
Use "is", "are", "has" — not "stands as", "serves as", "represents", "boasts",
"features". "Gallery 825 is LAAA's exhibition space" beats "Gallery 825 serves as
LAAA's exhibition space". Same for "has" vs "boasts".

### 6i. No AI filler / hedging.
Ban: "in order to" (just "to"), "due to the fact that" (just "because"),
"at this point in time" (just "now"), "has the ability to" (just "can"),
"it could potentially possibly" (just "may"), "in the event that" (just "if").
"Moreover" and "Furthermore" are AI tells — use "Also" or just start a new sentence.

### 6j. No chatbot / sycophancy artifacts.
Never write "Great question!", "Certainly!", "Absolutely!", "I hope this helps",
"Let me know if you'd like", "Here is a...". This is assistant-residue, not ad copy.

### 6k. No generic upbeat conclusions.
Do NOT end with "The future looks bright", "Exciting times lie ahead", "a journey
toward excellence", "a step in the right direction". End on a specific action or a
sharp statement. If you can't, end one sentence earlier.

### 6l. No false ranges.
Do NOT write "from X to Y" when X and Y aren't on the same meaningful scale.
("from ancient wisdom to modern science", "from the tiniest detail to the biggest
picture"). This pattern is almost always AI filler.

### 6m. Use straight quotes, not curly quotes.
Write "like this", not "like this". (The server strips curly quotes as a fallback,
but don't rely on it.)

### 6n. Vary sentence rhythm.
Short punchy sentences. Then longer ones that take their time. Mix fragments with
full sentences. If every sentence is the same length and clause-structure, it reads
as algorithmic. Real writing has uneven rhythm because real thought does.
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
 * - Curly double quotes (" ") and single quotes (' ') become straight ASCII quotes
 *   (humanizer rule 6m — curly quotes are a ChatGPT tell)
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
    .replace(/[\u201C\u201D]/g, '"')  // curly double quotes -> straight
    .replace(/[\u2018\u2019]/g, "'")  // curly single quotes -> straight
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
