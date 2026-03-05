import { z } from "zod";

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query to verify a factual claim. Be specific and include key terms."
    ),
});

export const factCheckClaimSchema = z.object({
  claimText: z
    .string()
    .describe(
      "The EXACT verbatim text from the script containing the factual claim. Copy-paste directly."
    ),
  verdict: z
    .enum([
      "verified",
      "inaccurate",
      "misleading",
      "unverifiable",
      "exaggeration-ok",
    ])
    .describe(
      "verified = confirmed accurate, inaccurate = factually wrong, misleading = partially true but misleading, unverifiable = cannot find reliable sources, exaggeration-ok = intentional video hyperbole"
    ),
  accuracy: z
    .number()
    .min(0)
    .max(100)
    .describe("Accuracy percentage: 0 = completely wrong, 100 = perfectly accurate"),
  correction: z
    .string()
    .nullable()
    .describe(
      "The corrected text to replace the claim, or null if no correction needed (verified/exaggeration-ok)"
    ),
  reasoning: z
    .string()
    .describe(
      "Brief explanation of the verification result with key evidence"
    ),
  sources: z
    .array(z.string())
    .describe("URLs of sources used to verify this claim"),
  isExaggeration: z
    .boolean()
    .describe(
      "True if the claim is intentional video hyperbole/dramatic framing rather than a genuine error"
    ),
  category: z
    .enum(["statistic", "date", "attribution", "technical", "general"])
    .describe(
      "Type of factual claim: statistic = numbers/data, date = dates/timelines, attribution = quotes/names, technical = technical/scientific, general = other"
    ),
});

export const factCheckResultSchema = z.object({
  claims: z
    .array(factCheckClaimSchema)
    .describe("All factual claims found in the script with verification results"),
  overallAccuracy: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall accuracy percentage across all claims"),
  searchesPerformed: z
    .number()
    .describe("Total number of web searches performed"),
});

export const factCheckSummaryIssueSchema = z.object({
  claimText: z
    .string()
    .describe("The exact text from the script containing the claim"),
  verdict: z
    .enum([
      "verified",
      "inaccurate",
      "misleading",
      "unverifiable",
      "exaggeration-ok",
    ]),
  accuracy: z.number().min(0).max(100),
  correction: z.string().nullable(),
  reasoning: z.string(),
  sources: z.array(z.string()),
  isExaggeration: z.boolean(),
  category: z.enum(["statistic", "date", "attribution", "technical", "general"]),
  agentModels: z
    .array(z.string())
    .describe("Names of the models that identified this claim"),
});

export const factIssuesToolSchema = z.object({
  issues: z
    .array(factCheckSummaryIssueSchema)
    .min(1)
    .describe(
      "De-duplicated fact issues merged from all agents. Include ALL claims — verified, inaccurate, misleading, etc."
    ),
});

export type FactCheckClaim = z.infer<typeof factCheckClaimSchema>;
export type FactCheckResult = z.infer<typeof factCheckResultSchema>;
