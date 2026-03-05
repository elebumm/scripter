import { z } from "zod";

export const suggestionItemSchema = z.object({
  originalText: z
    .string()
    .describe(
      "The EXACT verbatim substring from the original script to replace. Must be case-sensitive and include punctuation. Copy-paste directly from the script."
    ),
  suggestedText: z
    .string()
    .describe("The improved replacement text"),
  reasoning: z
    .string()
    .describe("1-2 sentence explanation of why this change improves the script"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("high = critical fix, medium = notable improvement, low = minor polish"),
  category: z
    .enum([
      "hook",
      "clarity",
      "pacing",
      "engagement",
      "structure",
      "tone",
      "cta",
      "visual-cues",
      "other",
    ])
    .describe("The evaluation area this suggestion addresses"),
  sourceModels: z
    .array(z.string())
    .describe("Names of the models whose feedback supports this suggestion"),
});

export const suggestionsToolSchema = z.object({
  suggestions: z
    .array(suggestionItemSchema)
    .min(1)
    .max(15)
    .describe("List of specific text edit suggestions extracted from all model evaluations"),
});

export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
