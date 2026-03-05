import { ensureDb } from "@/lib/db/init";
import { getLatestFactChecks } from "@/lib/db/queries/fact-checks";
import {
  deleteFactIssuesForVersion,
  createFactIssuesBatch,
} from "@/lib/db/queries/fact-issues";
import { streamFactCheckSummary } from "@/lib/llm/fact-check-summarize";

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const { scriptContent, factChecks, scriptId, versionId } = body;

  try {
    // Enrich client fact-checks with structured data from DB
    let enrichedChecks = factChecks.map(
      (fc: { modelName: string; result: string }) => ({
        modelName: fc.modelName,
        result: fc.result,
        structuredResult: null as string | null,
      })
    );

    if (scriptId && versionId) {
      const dbChecks = getLatestFactChecks(scriptId, versionId);
      for (const enriched of enrichedChecks) {
        const dbMatch = dbChecks.find(
          (d) => d.structuredResult && d.result === enriched.result
        );
        if (dbMatch) {
          enriched.structuredResult = dbMatch.structuredResult;
        }
      }
    }

    const result = streamFactCheckSummary({
      scriptContent,
      factChecks: enrichedChecks,
    });

    const response = result.toTextStreamResponse();

    // After stream completes, capture tool calls and persist fact issues
    if (scriptId && versionId) {
      Promise.resolve(result.text)
        .then(async () => {
          try {
            const toolCalls = await result.toolCalls;
            const submitCall = toolCalls.find(
              (tc: { toolName: string }) =>
                tc.toolName === "submit_fact_issues"
            );
            if (submitCall) {
              const { issues } = submitCall.input as {
                issues: Array<{
                  claimText: string;
                  verdict: string;
                  accuracy: number;
                  correction: string | null;
                  reasoning: string;
                  sources: string[];
                  isExaggeration: boolean;
                  category: string;
                  agentModels: string[];
                }>;
              };

              // Filter to only issues where claimText exists in script
              const validIssues = issues.filter((issue) =>
                scriptContent.includes(issue.claimText)
              );

              if (validIssues.length > 0) {
                // Clear previous fact issues for this version
                deleteFactIssuesForVersion(scriptId, versionId);
                createFactIssuesBatch(scriptId, versionId, validIssues);
              }
            }
          } catch {
            // Model didn't call the tool — no fact issues to persist
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
