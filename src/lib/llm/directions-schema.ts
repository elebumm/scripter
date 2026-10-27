import { z } from "zod";

const directionTypeEnum = z.enum([
  "talking-head",
  "b-roll",
  "motion-graphics",
  "screen-recording",
  "text-overlay",
  "archival",
  "interview-clip",
  "mixed",
]);

export const directionItemSchema = z.object({
  originalText: z
    .string()
    .describe(
      "The EXACT verbatim substring from the original script that this direction covers. Must be case-sensitive and include punctuation. Copy-paste directly from the script."
    ),
  directionType: directionTypeEnum.describe(
    "The production direction type for this segment"
  ),
  reasoning: z
    .string()
    .describe(
      "1-2 sentence explanation of why this direction type is appropriate for this segment"
    ),
  visualNotes: z
    .string()
    .optional()
    .describe(
      "Specific visual guidance: camera angles, graphics style, B-roll suggestions, etc."
    ),
});

export const directionsToolSchema = z.object({
  directions: z
    .array(directionItemSchema)
    .min(1)
    .max(50)
    .describe(
      "List of production direction annotations covering the entire script"
    ),
});

export const directionConsensusItemSchema = z.object({
  originalText: z
    .string()
    .describe(
      "The EXACT verbatim substring from the original script. Copy-paste directly."
    ),
  directionType: directionTypeEnum.describe(
    "The consensus production direction type"
  ),
  reasoning: z
    .string()
    .describe("Why this direction type was chosen as the consensus"),
  visualNotes: z
    .string()
    .optional()
    .describe("Merged visual guidance from all models"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high = all models agree, medium = majority agree, low = significant disagreement"
    ),
  agreeingModels: z
    .array(z.string())
    .describe("Names of models that chose this direction type"),
  disagreeingModels: z
    .array(
      z.object({
        model: z.string(),
        alternativeType: directionTypeEnum,
      })
    )
    .describe("Models that chose a different type, with their alternative"),
});

export const directionConsensusToolSchema = z.object({
  directions: z
    .array(directionConsensusItemSchema)
    .min(1)
    .max(50)
    .describe(
      "Consensus production directions with model agreement data"
    ),
});

export type DirectionItem = z.infer<typeof directionItemSchema>;
export type DirectionConsensusItem = z.infer<typeof directionConsensusItemSchema>;
