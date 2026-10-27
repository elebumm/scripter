import { ensureDb } from "@/lib/db/init";
import { streamDirectionAnalysis } from "@/lib/llm/directions";
import {
  createDirectionRun,
  updateDirectionRun,
} from "@/lib/db/queries/directions";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const {
    scriptContent,
    scriptContext,
    modelId,
    modelProvider,
    modelBaseUrl,
    scriptId,
    versionId,
  } = body;

  const run = createDirectionRun({
    scriptId,
    versionId,
    modelId,
    modelProvider,
    result: "",
    isSummary: false,
    status: "streaming",
  });

  try {
    const result = streamDirectionAnalysis({
      scriptContent,
      scriptContext,
      modelProvider,
      modelId,
      modelBaseUrl,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, persist full text and structured tool call data
    Promise.resolve(result.text)
      .then(async (fullText) => {
        let structuredResult: string | null = null;

        try {
          const toolCalls = await result.toolCalls;
          const submitCall = toolCalls.find(
            (tc: { toolName: string }) =>
              tc.toolName === "submit_directions"
          );
          if (submitCall) {
            structuredResult = JSON.stringify(submitCall.input);
          }
        } catch {
          // Model didn't call the tool — that's fine
        }

        updateDirectionRun(run.id, {
          result: fullText,
          structuredResult,
          status: "complete",
          durationMs: Date.now() - new Date(run.createdAt).getTime(),
        });
      })
      .catch((err) => {
        updateDirectionRun(run.id, {
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "Unknown error",
        });
      });

    return response;
  } catch (err) {
    updateDirectionRun(run.id, {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
