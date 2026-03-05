import { ensureDb } from "@/lib/db/init";
import { streamFactCheck } from "@/lib/llm/fact-check";
import {
  createFactCheck,
  updateFactCheck,
} from "@/lib/db/queries/fact-checks";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const {
    scriptContent,
    scriptContext,
    modelId,
    modelProvider,
    scriptId,
    versionId,
  } = body;

  const factCheck = createFactCheck({
    scriptId,
    versionId,
    modelId,
    modelProvider,
    result: "",
    isSummary: false,
    status: "streaming",
  });

  try {
    const result = streamFactCheck({
      scriptContent,
      scriptContext,
      modelProvider,
      modelId,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, persist full text and structured tool call data
    Promise.resolve(result.text)
      .then(async (fullText) => {
        let structuredResult: string | null = null;
        let searchCount = 0;

        try {
          const toolCalls = await result.toolCalls;
          const submitCall = toolCalls.find(
            (tc: { toolName: string }) =>
              tc.toolName === "submit_fact_check"
          );
          if (submitCall) {
            structuredResult = JSON.stringify(submitCall.input);
            const parsed = submitCall.input as {
              searchesPerformed?: number;
            };
            searchCount = parsed.searchesPerformed ?? 0;
          }
        } catch {
          // Model didn't call the tool — structuredResult stays null
        }

        updateFactCheck(factCheck.id, {
          result: fullText,
          structuredResult,
          status: "complete",
          searchCount,
          durationMs:
            Date.now() - new Date(factCheck.createdAt).getTime(),
        });
      })
      .catch((err) => {
        updateFactCheck(factCheck.id, {
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "Unknown error",
        });
      });

    return response;
  } catch (err) {
    updateFactCheck(factCheck.id, {
      status: "error",
      errorMessage:
        err instanceof Error ? err.message : "Unknown error",
    });
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
