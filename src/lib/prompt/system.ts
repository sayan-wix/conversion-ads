import { GUARDRAIL_RULES } from "./guardrails";
import { getFrameworkInstructions, FRAMEWORKS, type FrameworkId } from "./frameworks";
import { HEADLINE_RULES, HEADLINES_MARKER } from "./headlines";
import type { WizardInput } from "../validate";
import { PATTERN_LIBRARY } from "../generated/pattern-library";

export { HEADLINES_MARKER };

/**
 * The pattern library is embedded at build time via scripts/embed-library.mjs.
 * This ensures byte-stability for prompt caching and eliminates runtime fs access
 * (works on any Next.js runtime).
 */
export function loadPatternLibrary(): string {
  return PATTERN_LIBRARY;
}

/**
 * Build the system prompt as an array of blocks, with prompt caching enabled
 * on the stable prefix (pattern library + guardrails).
 *
 * Rendering order matters for cache hits:
 *   1. Pattern library (CACHED — biggest, most stable)
 *   2. Guardrails (CACHED — short, stable)
 *   3. Framework instructions (DYNAMIC — changes per request)
 *
 * The user's wizard inputs go into the USER message, not the system prompt.
 */
export type SystemBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "text"; text: string };

export function buildSystemBlocks(framework: FrameworkId): SystemBlock[] {
  const library = loadPatternLibrary();

  const preamble = `You are an elite direct-response copywriter generating Meta-ready evergreen ads.
You have been trained on a master pattern library of proven ad frameworks (below).
Your job: produce TWO things in order:

1. ONE complete, flowing ad that follows the chosen framework, matches the voice
   signals in the library, and obeys the guardrails below.
2. After the ad, a second block of 20 ad headlines following the Headline
   Generation rules that appear later in this system prompt.

The ad itself is a single continuous Meta ad — no section headers, no [HOOK]/[BODY]/
[PROOF]/[CTA] markers, no labels. Weave the hook, body, proof (if supplied), and
call-to-action naturally into the shape the chosen framework calls for.

The user's inputs under <product>, <audience>, <promise>, <mechanism>, and <proof>
may be long reference documents (10–40 pages). Treat them as source knowledge to
pull from — NOT as material to paraphrase or repeat. Use your judgment: extract only
what strengthens the ad for the chosen framework. The best ads leave 90% of the
source material on the cutting room floor.

You do NOT invent facts, numbers, or testimonials. You work with what the user gives
you. If <proof> is empty, the ad stands without specific proof — never fabricate it.`;

  const patternBlock = `# PATTERN LIBRARY (your source of truth)\n\n${library}`;

  // Block 1+2 are stable → cache them together with one breakpoint at the end of
  // guardrails + headline rules. Headline rules are also stable (per-user-owner)
  // so they belong in the cached prefix.
  const stableHead: SystemBlock = {
    type: "text",
    text: `${preamble}\n\n${patternBlock}\n\n${GUARDRAIL_RULES}\n\n${HEADLINE_RULES}`,
    cache_control: { type: "ephemeral" },
  };

  // Block 3 is dynamic per framework → not cached.
  const dynamic: SystemBlock = {
    type: "text",
    text: `# CHOSEN FRAMEWORK: ${FRAMEWORKS[framework].name}\n\n${getFrameworkInstructions(framework)}`,
  };

  return [stableHead, dynamic];
}

/**
 * Build the user message payload. Wizard inputs wrapped in explicit tags so the
 * model treats each field as a scoped directive (not advisory text).
 */
export function buildUserMessage(input: WizardInput): string {
  const proofBlock = input.proof?.trim()
    ? `<proof>\n${input.proof.trim()}\n</proof>`
    : `<proof>\n(none supplied — do NOT invent any)\n</proof>`;

  return [
    "Generate the ad now using the chosen framework. Respect ALL hard rules.",
    "",
    `<product>\n${input.product.trim()}\n</product>`,
    `<audience>\n${input.audience.trim()}\n</audience>`,
    `<promise>\n${input.promise.trim()}\n</promise>`,
    `<mechanism>\n${input.mechanism.trim()}\n</mechanism>`,
    proofBlock,
    `<cta>\n${input.cta.trim()}\n</cta>`,
    "",
    "Output the ad copy first — one continuous, flowing piece of writing with",
    "no section headers or labels. Then emit the exact marker",
    `${HEADLINES_MARKER} on its own line, then the 20 headlines following the`,
    "Headline Generation rules (5 short & punchy, 5 longer, 5 power words,",
    "5 polarizing, in that order, numbered 1-20 under their category labels).",
  ].join("\n");
}

/**
 * Build a regenerate-whole-ad user message. Reuses the same system prompt and
 * asks Claude to produce a meaningfully different angle / opening / beats than
 * the previous version (if supplied).
 */
export function buildRegenerateMessage(
  input: WizardInput,
  previousVersion?: string,
): string {
  const base = buildUserMessage(input);
  if (!previousVersion?.trim()) return base;

  return `${base}\n\nThe previous version of the full output (ad + headlines) was:\n"""\n${previousVersion.trim()}\n"""\n\nWrite a meaningfully DIFFERENT version — new opening line, new angle into the mechanism, new beats, and 20 fresh headlines (no repeats from the previous list). Do not repeat the same hook or structure. Same framework, same inputs, fresh execution. Still emit the ${HEADLINES_MARKER} marker between the ad and the headlines.`;
}
