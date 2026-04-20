/**
 * Framework-specific directives. Each framework entry describes the structural
 * beats the model must hit, in plain prose — NOT as labeled sections.
 *
 * The output is ONE flowing Meta-ready ad. No [HOOK]/[BODY]/[PROOF]/[CTA]
 * markers appear in the final text; the elements are woven naturally in
 * whatever sequence the framework calls for.
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

REQUIREMENT: This framework needs real <proof>. If <proof> is empty, write a
single sentence telling the user to either add proof or pick a different
framework — and stop. Do NOT invent a client story.

Flow (weave as one piece of copy, no section labels):
- Open with a one-line result statement naming the client and the outcome, taken
  VERBATIM from what the user supplied under <proof>.
- Backstory beat: where the client was before. What they had tried. Why nothing
  worked.
- Turning-point beat: introduce <mechanism> as the thing that changed it.
- Outcome beat: what the result looked like, using only numbers the user gave.
- Paraphrase the rest of <proof> as confirmation — no invention.
- End with <cta>, verbatim or tightened by one edit.

Opening line pattern: "[Name] came to me [time period] ago [state of problem]."
`.trim(),
  },

  "belief-shifter": {
    id: "belief-shifter",
    name: "Belief Shifter",
    tagline: "Break a belief the prospect is holding, replace it with your mechanism.",
    bestFor: "When the audience is stuck because of a wrong assumption about the problem.",
    lengthHint: "Medium (200–350 words).",
    instructions: `
Use the BELIEF SHIFTER framework from the pattern library (Ben Valen's Belief
Shifter + the Belief Bridge Blueprint doctrine).

Flow (one continuous piece of copy, no section labels):
- Open with a belief-break line. MUST break a belief, not describe a feature.
  Examples:
    "If [audience], stop [thing they think works]."
    "The biggest misconception about [problem] is [wrong belief]."
    "You don't [problem] because [wrong reason they believe]. You [problem]
     because [real reason]."
- State the OLD belief the prospect holds. Explain why it keeps them stuck.
- Introduce the NEW belief rooted in <mechanism>.
- Paint the bridge from old to new — why the new belief actually explains what
  they've been experiencing.
- If <proof> is supplied, weave it in as confirmation of the new belief. If
  empty, skip — do NOT invent proof.
- Close with <cta>, framed as "the next step on the new belief path."
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

Flow (one continuous ad, no section labels, do NOT write the words "WHY:",
"WHAT:", "HOW:" in the output):
- Open with a "why now" line: the shift, trend, or reason this matters today.
- WHY beat: why the old way is failing the audience (pull from <audience>).
- WHAT beat: what <product> actually is, in one plain sentence.
- HOW beat: how <mechanism> produces <promise>. Concrete steps or principles.
- If <proof> is present, fold one line of it in naturally. If empty, skip.
- Close with <cta>, verbatim.
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

Flow (ONE short ad, no section labels, hard cap 120 words total):
- Open with the offer stated plainly, one line:
  "[Product] for [audience] who want [promise]."
- 2–3 short lines: what's inside, who it's for, who it's not for.
- If <proof> exists, one line of it. If empty, skip.
- Close with <cta>, verb-first, verbatim.
`.trim(),
  },

  "problem-solution-story": {
    id: "problem-solution-story",
    name: "Problem / Solution Story",
    tagline: "Name the pain viscerally, then show the mechanism as the way out.",
    bestFor: "Cold audiences. When the pain is well-understood but solutions feel broken.",
    lengthHint: "Long (300–500 words).",
    instructions: `
Use the PROBLEM / SOLUTION STORY framework (hybrid of Zac's Story Ads + Ben's
Hate/Story).

Flow (one continuous ad, no section labels — this is a story, not a sales page):
- Open with a visceral snapshot of the pain, written in the prospect's internal
  voice. Examples:
    "It's 3am and you're still awake, scrolling…"
    "You open the closet and nothing fits."
- The trap beat: why the common solutions have failed them.
- The turn beat: the moment things can be different — introduce <mechanism>.
- The after beat: what life looks like when <promise> is real.
- If <proof> is present, weave it in as evidence the "after" is possible. If
  empty, skip.
- Close with <cta> as a soft bridge into action.

Do NOT sound like a sales page.
`.trim(),
  },
};

export function getFrameworkInstructions(id: FrameworkId): string {
  return FRAMEWORKS[id].instructions;
}
