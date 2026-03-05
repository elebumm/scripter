import { streamText, tool } from "ai";
import { getModel } from "./providers";
import { buildEvalPrompt, buildSectionPrompt, formatPriorFeedback } from "./prompts";
import { structuredEvaluationSchema } from "./eval-schema";

export function streamEvaluation({
  scriptContent,
  scriptContext,
  sectionOnly,
  modelProvider,
  modelId,
  modelBaseUrl,
  systemPrompt,
  criteriaWeights,
  scriptStatus,
  priorFeedback,
}: {
  scriptContent: string;
  scriptContext?: string;
  sectionOnly?: string;
  modelProvider: string;
  modelId: string;
  modelBaseUrl?: string;
  systemPrompt?: string;
  criteriaWeights?: Record<string, number>;
  scriptStatus?: string;
  priorFeedback?: { result: string; structuredResult?: string | null };
}) {
  const model = getModel(modelProvider, modelId, { baseUrl: modelBaseUrl });

  const system = sectionOnly
    ? buildSectionPrompt(sectionOnly, scriptContent, systemPrompt)
    : buildEvalPrompt(systemPrompt, criteriaWeights, scriptStatus);

  const contextBlock = scriptContext
    ? `## Author's Context & Notes\n${scriptContext}\n\n---\n\n`
    : "";

  const priorBlock = priorFeedback
    ? formatPriorFeedback(priorFeedback.result, priorFeedback.structuredResult)
    : "";

  const userMessage = sectionOnly
    ? "Please evaluate the selected section as described above."
    : `${contextBlock}Please evaluate the following video script:\n\n${scriptContent}${priorBlock}`;

  return streamText({
    model,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2048,
    tools: {
      submit_evaluation: tool({
        description:
          "Submit your structured evaluation scores and feedback. Call this AFTER writing your full markdown analysis.",
        inputSchema: structuredEvaluationSchema,
      }),
    },
    toolChoice: "auto",
  });
}
