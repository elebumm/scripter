import { ensureDb } from "@/lib/db/init";
import { getLatestEvaluations } from "@/lib/db/queries/evaluations";
import {
  deleteSuggestionsForVersion,
  createSuggestionsBatch,
} from "@/lib/db/queries/suggestions";
import { streamSummary } from "@/lib/llm/summarize";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const { scriptContent, evaluations, scriptId, versionId, scriptStatus } = body;

  try {
    // Enrich client evaluations with structured data from DB
    let enrichedEvaluations = evaluations.map(
      (e: { modelName: string; result: string }) => ({
        modelName: e.modelName,
        result: e.result,
        structuredResult: null as string | null,
      })
    );

    if (scriptId && versionId) {
      const dbEvals = getLatestEvaluations(scriptId, versionId);
      for (const enriched of enrichedEvaluations) {
        const dbMatch = dbEvals.find(
          (d) => d.structuredResult && d.result === enriched.result
        );
        if (dbMatch) {
          enriched.structuredResult = dbMatch.structuredResult;
        }
      }
    }

    const result = streamSummary({
      scriptContent,
      evaluations: enrichedEvaluations,
      scriptStatus,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, capture tool calls and persist suggestions
    if (scriptId && versionId) {
      Promise.resolve(result.text)
        .then(async () => {
          try {
            const toolCalls = await result.toolCalls;
            const submitCall = toolCalls.find(
              (tc: { toolName: string }) =>
                tc.toolName === "submit_suggestions"
            );
            if (submitCall) {
              const { suggestions } = submitCall.input as {
                suggestions: Array<{
                  originalText: string;
                  suggestedText: string;
                  reasoning: string;
                  priority: string;
                  category: string;
                  sourceModels: string[];
                }>;
              };

              // Filter to only suggestions where originalText exists in script
              const validSuggestions = suggestions.filter((s) =>
                scriptContent.includes(s.originalText)
              );

              if (validSuggestions.length > 0) {
                // Clear previous suggestions for this version
                deleteSuggestionsForVersion(scriptId, versionId);
                createSuggestionsBatch(scriptId, versionId, validSuggestions);
              }
            }
          } catch {
            // Model didn't call the tool — no suggestions to persist
          }
        })
        .catch(() => {
          // Stream error — handled elsewhere
        });
    }

    return response;
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
