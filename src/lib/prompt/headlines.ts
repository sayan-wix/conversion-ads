/**
 * Headline-generation rules.
 *
 * These rules are written by the app owner and must be followed verbatim.
 * The domain knowledge (power words, fill-in-the-blank templates, head-turner
 * frameworks) lives in content/pattern-library.md under the
 * `## Headline Generation` section — Claude references that library; this file
 * just dictates format, rules, and the 5+5+5+5 breakdown.
 *
 * IMPORTANT: generation is two-phase. The preamble tells Claude that each user
 * message asks for EITHER the ad OR the headlines, never both. These rules only
 * apply when the user message asks for headlines — when the user asks for the
 * ad only, Claude must NOT emit anything from this section.
 */

/**
 * Historical in-stream separator — kept exported for backward-compat with any
 * older client code path, but no longer used by the two-endpoint flow.
 */
export const HEADLINES_MARKER = "<<<HEADLINES>>>";

export const HEADLINE_RULES = `
# HEADLINE GENERATION (only when asked — never in an ad-only response)

When — and ONLY when — the user message explicitly asks for the 20 headlines,
generate EXACTLY 20 ad headlines following the rules below. When the user
message asks for the ad only, IGNORE this entire section and output zero
headlines, zero category labels, and no <<<HEADLINES>>> string.

When asked for headlines, directly reference these three sub-sections of the
pattern library (under "## Headline Generation"):

  - "### Headline Templates & Fill-in-the-Blank Frameworks" — use these as the
     structural skeleton for the short & punchy and longer categories.
  - "### Power Words Reference" — pull from the categorized power-word lists
     when writing the 5 power-word headlines.
  - "### Head Turner Frameworks" — use these Story and Direct patterns,
     especially for the polarizing headlines.

Your headlines should feel like they were written by someone who had those
three references open on the desk, not generic ad copy.

## Rule of thumb (apply to every headline)

1. **Start with a verb.** Verbs lead to action. Default every headline to a
   verb-first opening unless a specific framework explicitly calls for a
   different opener (e.g. a belief-break question).
2. **Clear outcome.** The outcome of the offer must be crystal clear from just
   reading the headline alone, even with zero context.
3. **Short AND (not too) long.** Usually shorter hits harder. Some longer
   headlines land — but never bloated.
4. **Never vague.** Every headline must state the thing it's promising,
   concretely.

## Mandatory breakdown — EXACTLY this distribution of 20 headlines

- **5 short & punchy** headlines — under 8 words each. Maximum compression.
- **5 longer but not bloated** headlines — 10-18 words. Specificity earns the
  extra length.
- **5 power-word headlines** — use vivid power words from the Power Words
  Reference in the pattern library to punch the headline harder. Still verb-led
  and outcome-clear.
- **5 polarizing / controversial** headlines — make a provocative claim that
  challenges a common belief, e.g. "Throw away your CBD". Use sparingly but
  make them bite.

## Output format (strict)

Emit the headlines grouped under these exact four category labels, each group
numbered continuously 1-20. No extra commentary. No preamble. Example shape:

Short & Punchy:
1. [headline]
2. [headline]
3. [headline]
4. [headline]
5. [headline]

Longer:
6. [headline]
7. [headline]
8. [headline]
9. [headline]
10. [headline]

Power Words:
11. [headline]
12. [headline]
13. [headline]
14. [headline]
15. [headline]

Polarizing:
16. [headline]
17. [headline]
18. [headline]
19. [headline]
20. [headline]

Obey the punctuation bans from the main guardrails — no em dashes, no en
dashes, no ellipses. A headline with "—" in it is an automatic fail.
`.trim();
