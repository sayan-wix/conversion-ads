import { GUARDRAIL_RULES } from "./guardrails";
import { getFrameworkInstructions, FRAMEWORKS, type FrameworkId } from "./frameworks";
import type { WizardInput } from "../validate";
import { PATTERN_LIBRARY } from "../generated/pattern-library";

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
Your job: produce ONE complete ad that follows the chosen framework, matches the voice
signals in the library, and obeys the guardrails below.

You do NOT invent facts, numbers, or testimonials. You work with what the user gives you.`;

  const patternBlock = `# PATTERN LIBRARY (your source of truth)\n\n${library}`;

  // Block 1+2 are stable → cache them together with one breakpoint at the end of guardrails.
  const stableHead: SystemBlock = {
    type: "text",
    text: `${preamble}\n\n${patternBlock}\n\n${GUARDRAIL_RULES}`,
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
    "Output ONLY the ad, using the [HOOK] / [BODY] / [PROOF] / [CTA] section markers.",
  ].join("\n");
}

/**
 * Build a regenerate-single-section user message. Reuses the same system prompt.
 */
export function buildRegenerateMessage(
  input: WizardInput,
  section: "hook" | "body" | "proof" | "cta",
  previousVersion?: string,
): string {
  const base = buildUserMessage(input);
  const prev = previousVersion?.trim()
    ? `\n\nThe previous version of the [${section.toUpperCase()}] section was:\n"""\n${previousVersion.trim()}\n"""\nWrite a meaningfully DIFFERENT version — new angle, new opening line, or new beats.`
    : "";
  return `${base}\n\nONLY regenerate the [${section.toUpperCase()}] section. Return ONLY that section with its marker, not the full ad.${prev}`;
}
