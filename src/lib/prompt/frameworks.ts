/**
 * Framework-specific directives. Each framework entry describes:
 * - the structural skeleton the model must follow
 * - the opening style
 * - pattern-library sections the model should lean on
 *
 * These strings get injected as a DYNAMIC block in the system prompt
 * (after the CACHED pattern library + guardrails).
 */

export type FrameworkId =
  | "client-story"
  | "belief-shifter"
  | "why-what-how"
  | "direct-short"
  | "problem-solution-story";

export type FrameworkMeta = {
  id: FrameworkId;
  name: string;
  tagline: string;
  bestFor: string;
  lengthHint: string;
  instructions: string;
};

export const FRAMEWORKS: Record<FrameworkId, FrameworkMeta> = {
  "client-story": {
    id: "client-story",
    name: "Client Story",
    tagline: "Open with a real transformation, reverse-engineer the method.",
    bestFor: "When the user has a specific client win with numbers and a timeline.",
    lengthHint: "Medium-long (250–450 words).",
    instructions: `
Use the CLIENT STORY framework from the pattern library.

Structure:
1. [HOOK] — One-line result statement naming the client and the outcome ONLY if the user
   supplied it under <proof>. If <proof> is empty, DO NOT use this framework — write a
   [HOOK] line saying "[PROOF MISSING — pick a different framework]" and stop.
2. [BODY] — Backstory: where the client was before. What they had tried. Why nothing worked.
   Then the turning point (the mechanism from <mechanism>). Then the outcome, using only
   numbers the user provided.
3. [PROOF] — Paraphrase the user's <proof> verbatim. No invention.
4. [CTA] — Use the user's <cta> verbatim or tightened by one edit.

Opening pattern: "[Name] came to me [time period] ago [state of problem]."
`.trim(),
  },

  "belief-shifter": {
    id: "belief-shifter",
    name: "Belief Shifter",
    tagline: "Break a belief the prospect is holding, replace it with your mechanism.",
    bestFor: "When the audience is stuck because of a wrong assumption about the problem.",
    lengthHint: "Medium (200–350 words).",
    instructions: `
Use the BELIEF SHIFTER framework from the pattern library (Ben Valen's Belief Shifter +
the Belief Bridge Blueprint doctrine).

Structure:
1. [HOOK] — A misconception question or a belief-break opener. Examples:
   - "If [audience], stop [thing they think works]."
   - "The biggest misconception about [problem] is [wrong belief]."
   - "You don't [problem] because [wrong reason they believe]. You [problem] because [real reason]."
2. [BODY] — State the OLD belief they hold. Explain why it keeps them stuck. Introduce
   the NEW belief (rooted in <mechanism>). Paint the bridge from old to new.
3. [PROOF] — If <proof> supplied, weave it in as confirmation of the new belief. If empty,
   skip this block (write "SKIP" on the PROOF line).
4. [CTA] — Frame the CTA as "the next step on the new belief path."

The hook MUST break a belief, not describe a feature or outcome.
`.trim(),
  },

  "why-what-how": {
    id: "why-what-how",
    name: "Why / What / How",
    tagline: "Why it matters → What it is → How it works.",
    bestFor: "New mechanisms or categories the audience doesn't know exists yet.",
    lengthHint: "Medium (200–350 words).",
    instructions: `
Use the WHY / WHAT / HOW framework.

Structure:
1. [HOOK] — A "why now" line. The shift, trend, or reason this matters today.
2. [BODY] — Three explicit beats:
   - WHY: Why the old way is failing the audience (from <audience> + their pains).
   - WHAT: What <product> actually is, in one plain sentence.
   - HOW: How <mechanism> produces <promise>. Concrete steps or principles.
3. [PROOF] — User's <proof> if present, else "SKIP".
4. [CTA] — Direct, action-oriented. Use <cta> verbatim.

Do NOT label the sections "WHY:", "WHAT:", "HOW:" in the output — flow them naturally.
`.trim(),
  },

  "direct-short": {
    id: "direct-short",
    name: "Direct / Short Ad",
    tagline: "Sub-100-word direct ad. Offer-first. No story.",
    bestFor: "Retargeting, warm audiences, low-ticket offers, urgency windows.",
    lengthHint: "Short (60–120 words total).",
    instructions: `
Use the DIRECT / SHORT AD framework (Zac's Direct Ad variations).

Structure:
1. [HOOK] — Offer-stated-plainly. One line. E.g., "[Product] for [audience] who want [promise]."
2. [BODY] — 2–3 short lines. What's inside. Who it's for. Not for.
3. [PROOF] — One line if <proof> exists. Else "SKIP".
4. [CTA] — One line. Verb-first. Use <cta> verbatim.

Hard length cap: the four sections combined must not exceed 120 words.
`.trim(),
  },

  "problem-solution-story": {
    id: "problem-solution-story",
    name: "Problem / Solution Story",
    tagline: "Name the pain viscerally, then show the mechanism as the way out.",
    bestFor: "Cold audiences. When the pain is well-understood but solutions feel broken.",
    lengthHint: "Long (300–500 words).",
    instructions: `
Use the PROBLEM / SOLUTION STORY framework (hybrid of Zac's Story Ads + Ben's Hate/Story).

Structure:
1. [HOOK] — A visceral snapshot of the pain. Written in the prospect's internal voice.
   Examples: "It's 3am and you're still awake, scrolling…" / "You open the closet and nothing fits."
2. [BODY] — Three beats:
   - The trap: why the common solutions have failed them.
   - The turn: the moment things can be different — introduce <mechanism>.
   - The after: what life looks like when <promise> is real.
3. [PROOF] — User's <proof> if present, else "SKIP".
4. [CTA] — Soft bridge into action. Use <cta>.

Do NOT sound like a sales page. This is a story that happens to have an offer at the end.
`.trim(),
  },
};

export function getFrameworkInstructions(id: FrameworkId): string {
  return FRAMEWORKS[id].instructions;
}
