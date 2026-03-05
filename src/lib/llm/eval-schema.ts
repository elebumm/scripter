import { z } from "zod";

export const evaluationCriterionSchema = z.object({
  name: z.string().describe("The criterion name, e.g. 'Hook & Opening'"),
  score: z.number().min(1).max(10).describe("Score from 1 (worst) to 10 (best)"),
  explanation: z.string().describe("Brief explanation of the score"),
  strengths: z.array(z.string()).describe("Specific strengths for this criterion"),
  improvements: z.array(z.string()).describe("Specific areas for improvement"),
  suggestedRewrites: z
    .array(z.string())
    .describe("Concrete rewrite suggestions, if any"),
});

export const structuredEvaluationSchema = z.object({
  criteria: z
    .array(evaluationCriterionSchema)
    .describe("Scores and feedback for each evaluation criterion"),
  overallScore: z
    .number()
    .min(1)
    .max(10)
    .describe("Overall score averaging all criteria"),
  topPriorities: z
    .array(
      z.object({
        rank: z.number().describe("Priority rank, 1 = most impactful"),
        description: z.string().describe("What should be changed"),
        impact: z.string().describe("Why this change matters"),
      })
    )
    .describe("Top 3 most impactful changes, ranked"),
});

export type StructuredEvaluation = z.infer<typeof structuredEvaluationSchema>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;
