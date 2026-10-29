// Output schemas for every AI job. Shared by routes (Output.object) and the
// client (typing streamed partials). None of them has a field for replacement
// wording: AI output is diagnosis, structure and sources only.

import { z } from "zod";
import { CRITERIA_IDS } from "./rubric";

export const NOTE_CATEGORIES = [
  "hook",
  "structure",
  "pacing",
  "clarity",
  "accuracy",
  "voice",
  "humanity",
  "visuals",
  "ending",
  "other",
] as const;

export const PRIORITIES = ["high", "medium", "low"] as const;

// No minimum/maximum is sent to the model: Anthropic's structured outputs
// reject numeric constraints. The prompt states the range; zod still checks it.
const score = z
  .number()
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 10, "Expected a whole number from 1 to 10")
  .meta({ type: "integer" });

const anchorText = z
  .string()
  .describe(
    "A VERBATIM quote of the writer's script (copy it exactly, 4-30 words, from a single paragraph). It marks where the note applies. Never invent or alter text here."
  );

export const noteSchema = z.object({
  anchorText,
  issue: z.string().describe("What isn't working in the quoted passage, in at most 40 words. Diagnose; do not supply new wording."),
  why: z.string().describe("Why it matters to the viewer, in at most 40 words."),
  question: z
    .string()
    .optional()
    .describe("Optional: one question that helps the writer find their own fix (at most 25 words). Never a suggested line."),
  category: z.enum(NOTE_CATEGORIES),
  priority: z.enum(PRIORITIES).describe("high = the video is noticeably worse because of this; medium = worth fixing; low = polish"),
});

export const personaCritiqueSchema = z.object({
  summary: z.string().describe("Your overall read through your lens, at most 120 words, markdown allowed. No suggested lines."),
  criteria: z
    .array(
      z.object({
        id: z.enum(CRITERIA_IDS),
        score: score.describe("1-10."),
        observation: z.string().describe("At most 40 words, pointing at what in the script earned this score."),
      })
    )
    .describe("Score every criterion exactly once."),
  overallScore: score.describe("1-10. Holistic judgement of the whole video, NOT an average."),
  notes: z.array(noteSchema).describe("3-8 notes, most important first."),
  landed: z
    .array(z.object({ anchorText, why: z.string().describe("Why this works, at most 30 words.") }))
    .describe("1-3 passages that work and should be protected."),
});

export const synthesisSchema = z.object({
  overview: z
    .string()
    .describe(
      "Markdown, at most 250 words: where the lenses agree, where they disagree (name the lenses), and what the writer should work on first. Diagnosis only, no suggested lines."
    ),
  notes: z
    .array(
      noteSchema.extend({
        personaSlugs: z.array(z.string()).describe("Slugs of the lenses that raised this note."),
      })
    )
    .describe("Merged, de-duplicated notes across lenses, 5-12, most important first. Reuse the lenses' anchors exactly."),
});

export const beatSuggestionSchema = z.object({
  beats: z
    .array(
      z.object({
        title: z.string().describe("A label for the beat, at most 8 words. Not a line of script."),
        purpose: z.string().describe("What this beat must do for the viewer, at most 35 words. Describe the job, never the words."),
        // No bounds here: one stray value would fail the whole proposal.
        // sanitizeBeatSuggestion rounds and clamps it instead.
        targetSeconds: z.number().optional().describe("Roughly how long this beat runs, in whole seconds (5-900)."),
      })
    )
    .describe("5-14 beats in order."),
  rationale: z.string().describe("Why this shape suits the brief, at most 80 words."),
});

export const beatCheckSchema = z.object({
  coverage: z.array(
    z.object({
      // An id that isn't on the sheet is skipped by the beats guard.
      beatId: z.number().meta({ type: "integer" }).describe("The beat's id, copied exactly."),
      covered: z.boolean(),
      anchorText: z
        .string()
        .optional()
        .describe("If covered: a VERBATIM quote (4-30 words) of where the beat happens in the draft."),
      comment: z.string().describe("At most 30 words: how well the draft does this beat's job. Diagnosis only."),
    })
  ),
  missing: z
    .array(
      z.object({
        title: z.string().describe("At most 8 words."),
        purpose: z.string().describe("At most 35 words: the job this missing beat would do."),
      })
    )
    .describe("Beats the draft seems to need that aren't on the sheet (0-4)."),
});

export const FACT_VERDICTS = ["verified", "inaccurate", "misleading", "unverifiable", "exaggeration-ok"] as const;
export const FACT_CATEGORIES = ["statistic", "date", "attribution", "technical", "general"] as const;

export const factCheckSchema = z.object({
  claims: z.array(
    z.object({
      claimText: z.string().describe("The VERBATIM sentence or phrase from the script that makes the claim."),
      verdict: z.enum(FACT_VERDICTS),
      explanation: z
        .string()
        .describe("At most 60 words: what the sources say and how it compares to the script. Never rewrite the writer's sentence."),
      sources: z
        .array(z.object({ url: z.string(), title: z.string().optional() }))
        .describe("Only URLs you actually read in search results."),
      category: z.enum(FACT_CATEGORIES),
    })
  ),
});

export type NoteOutput = z.infer<typeof noteSchema>;
export type PersonaCritique = z.infer<typeof personaCritiqueSchema>;
export type SynthesisOutput = z.infer<typeof synthesisSchema>;
export type BeatSuggestion = z.infer<typeof beatSuggestionSchema>;
export type BeatCheck = z.infer<typeof beatCheckSchema>;
export type FactCheckOutput = z.infer<typeof factCheckSchema>;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type FactVerdict = (typeof FACT_VERDICTS)[number];
