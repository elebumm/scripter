import { ensureDb } from "@/lib/db/init";
import {
  getLatestDirectionRuns,
  deleteDirectionsForVersion,
  createDirectionsBatch,
} from "@/lib/db/queries/directions";
import { streamDirectionSummary } from "@/lib/llm/directions";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const { scriptContent, directionRuns, scriptId, versionId } = body;

  try {
    // Enrich client-provided runs with structured data from DB
    let enrichedRuns = directionRuns.map(
      (r: { modelName: string; result: string }) => ({
        modelName: r.modelName,
        result: r.result,
        structuredResult: null as string | null,
      })
    );

    if (scriptId && versionId) {
      const dbRuns = getLatestDirectionRuns(scriptId, versionId);
      for (const enriched of enrichedRuns) {
        const dbMatch = dbRuns.find(
          (d) => d.structuredResult && d.result === enriched.result
        );
        if (dbMatch) {
          enriched.structuredResult = dbMatch.structuredResult;
        }
      }
    }

    const result = streamDirectionSummary({
      scriptContent,
      directionRuns: enrichedRuns,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, capture tool calls and persist directions
    if (scriptId && versionId) {
      Promise.resolve(result.text)
        .then(async () => {
          try {
            const toolCalls = await result.toolCalls;
            const submitCall = toolCalls.find(
              (tc: { toolName: string }) =>
                tc.toolName === "submit_direction_consensus"
            );
            if (submitCall) {
              const { directions } = submitCall.input as {
                directions: Array<{
                  originalText: string;
                  directionType: string;
                  reasoning: string;
                  visualNotes?: string;
                  confidence: string;
                  agreeingModels: string[];
                  disagreeingModels: Array<{
                    model: string;
                    alternativeType: string;
                  }>;
                }>;
              };

              // Filter to only directions where originalText exists in script
              const validDirections = directions.filter((d) =>
                scriptContent.includes(d.originalText)
              );

              if (validDirections.length > 0) {
                deleteDirectionsForVersion(scriptId, versionId);
                createDirectionsBatch(scriptId, versionId, validDirections);
              }
            }
          } catch {
            // Model didn't call the tool — no directions to persist
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
