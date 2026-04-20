import { z } from "zod";

/**
 * Wizard input schema. These are the raw user inputs from the 5-step wizard.
 * Field order matches the wizard screens.
 */
export const WizardInputSchema = z.object({
  /** Step 1: What is the product/offer? (e.g., "90-day online fitness coaching for men 40+") */
  product: z.string().min(5).max(300),

  /** Step 2: Who is the target audience? (e.g., "Men 40-55 who've tried every diet and nothing sticks") */
  audience: z.string().min(5).max(300),

  /** Step 3: What is the big promise / outcome? (e.g., "Lose 20 lbs in 90 days without giving up beer") */
  promise: z.string().min(5).max(300),

  /** Step 4: What is the unique mechanism / how? (e.g., "Metabolic cycling — eat more 4 days/week, less for 3") */
  mechanism: z.string().min(5).max(500),

  /**
   * Step 5: Real proof / CTA details. Accept objects so we never fabricate.
   * The user types what they actually have; prompt engine passes through verbatim.
   */
  proof: z.string().max(1000).optional(),
  cta: z.string().min(3).max(200),

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

/** Regenerate a single section */
export const RegenerateInputSchema = WizardInputSchema.extend({
  section: z.enum(["hook", "body", "proof", "cta"]),
  previousVersion: z.string().optional(),
});

export type RegenerateInput = z.infer<typeof RegenerateInputSchema>;
