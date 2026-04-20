import Anthropic from "@anthropic-ai/sdk";

/**
 * Singleton Anthropic client. Server-only — NEVER import from a client component.
 *
 * Model selection: ANTHROPIC_MODEL env var, defaults to Sonnet 4.6.
 * Flip to `claude-opus-4-7` if copy quality feels weak in production.
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/**
 * Whether the current model supports adaptive thinking.
 * Sonnet 4.6, Opus 4.6, Opus 4.7 = yes. Older = no.
 */
export function supportsAdaptiveThinking(model: string = MODEL): boolean {
  return (
    model.startsWith("claude-sonnet-4-6") ||
    model.startsWith("claude-opus-4-6") ||
    model.startsWith("claude-opus-4-7")
  );
}
