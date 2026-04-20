import { z } from "zod";

/**
 * Wizard input schema. Limits are intentionally generous — users may paste or upload
 * full avatar documents (20+ pages) or mechanism briefs (30-40+ pages). At ~3,000 chars
 * per page, we allow well above that. The Anthropic model has a 1M-token context; long
 * inputs are fine but will push per-generation token cost up linearly.
 */
const MAX_SMALL = 50_000;      // product, promise — short-form fields, but allow long notes
const MAX_DOC = 500_000;       // audience, proof — ~160 pages of text
const MAX_BIG_DOC = 1_000_000; // mechanism — ~330 pages of text
const MAX_CTA = 5_000;

export const WizardInputSchema = z.object({
  /** Step 1: What is the product/offer? (or a detailed offer brief) */
  product: z.string().min(3).max(MAX_SMALL),

  /** Step 2: Audience / avatar (can paste full avatar doc) */
  audience: z.string().min(3).max(MAX_DOC),

  /** Step 3: Big promise / desired outcome */
  promise: z.string().min(3).max(MAX_SMALL),

  /** Step 4: Mechanism (can paste full mechanism brief — 30-40 pages typical) */
  mechanism: z.string().min(3).max(MAX_BIG_DOC),

  /** Step 5: Real proof — client wins, testimonials, numbers. Never fabricated. */
  proof: z.string().max(MAX_DOC).optional(),

  /** Call to action */
  cta: z.string().min(2).max(MAX_CTA),

  /** Framework selected in the picker */
  framework: z.enum([
    "client-story",
    "belief-shifter",
    "why-what-how",
    "direct-short",
    "problem-solution-story",
  ]),
});

export type WizardInput = z.infer<typeof WizardInputSchema>;

/** Regenerate the whole ad, optionally referencing a previous version to differ from */
export const RegenerateInputSchema = WizardInputSchema.extend({
  previousVersion: z.string().optional(),
});

export type RegenerateInput = z.infer<typeof RegenerateInputSchema>;

/**
 * Headlines-only generation. Takes the wizard input PLUS the finalized ad text so
 * the model can reference the ad's angle / hook when writing matching headlines.
 * Optional `previousHeadlines` lets the user regenerate headlines with fresh variation.
 */
export const HeadlinesInputSchema = WizardInputSchema.extend({
  adText: z.string().min(10).max(20_000),
  previousHeadlines: z.string().optional(),
});

export type HeadlinesInput = z.infer<typeof HeadlinesInputSchema>;
