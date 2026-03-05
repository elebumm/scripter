import { ensureDb } from "@/lib/db/init";
import { streamEvaluation } from "@/lib/llm/evaluate";
import { createEvaluation, updateEvaluation, getPriorModelEvaluation } from "@/lib/db/queries/evaluations";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const {
    scriptContent,
    scriptContext,
    sectionOnly,
    scriptStatus,
    modelId,
    modelProvider,
    modelBaseUrl,
    profilePrompt,
    scriptId,
    versionId,
    profileId,
  } = body;

  const evaluation = createEvaluation({
    scriptId,
    versionId,
    profileId: profileId || null,
    modelId,
    modelProvider,
    result: "",
    isMasterSummary: false,
    sectionOnly: sectionOnly || null,
    status: "streaming",
  });

  try {
    const prior = getPriorModelEvaluation(scriptId, modelId, evaluation.id);
    const priorFeedback = prior
      ? { result: prior.result, structuredResult: prior.structuredResult }
      : undefined;

    const result = streamEvaluation({
      scriptContent,
      scriptContext,
      sectionOnly,
      modelProvider,
      modelId,
      modelBaseUrl,
      systemPrompt: profilePrompt,
      scriptStatus,
      priorFeedback,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, persist full text and structured tool call data
    Promise.resolve(result.text).then(async (fullText) => {
      let structuredResult: string | null = null;

      try {
        const toolCalls = await result.toolCalls;
        const submitCall = toolCalls.find(
          (tc: { toolName: string }) => tc.toolName === "submit_evaluation"
        );
        if (submitCall) {
          structuredResult = JSON.stringify(submitCall.input);
        }
      } catch {
        // Model didn't call the tool — that's fine, structuredResult stays null
      }

      updateEvaluation(evaluation.id, {
        result: fullText,
        structuredResult,
        status: "complete",
        durationMs: Date.now() - new Date(evaluation.createdAt).getTime(),
      });
    }).catch((err) => {
      updateEvaluation(evaluation.id, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    });

    return response;
  } catch (err) {
    updateEvaluation(evaluation.id, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
