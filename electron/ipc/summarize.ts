import { ipcMain, BrowserWindow } from "electron";
import { streamSummary } from "@/lib/llm/summarize";
import { getLatestEvaluations } from "@/lib/db/queries/evaluations";
import {
  deleteSuggestionsForVersion,
  createSuggestionsBatch,
} from "@/lib/db/queries/suggestions";

export function registerSummarizeHandlers() {
  ipcMain.handle(
    "summarize:run",
    async (
      event,
      params: {
        scriptContent: string;
        evaluations: Array<{ modelName: string; result: string }>;
        scriptId: number;
        versionId: number;
      },
      channelId: string
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("No window found");

      // Enrich evaluations with structured data from DB
      const enrichedEvaluations = params.evaluations.map((e) => ({
        modelName: e.modelName,
        result: e.result,
        structuredResult: null as string | null,
      }));

      if (params.scriptId && params.versionId) {
        const dbEvals = getLatestEvaluations(
          params.scriptId,
          params.versionId
        );
        for (const enriched of enrichedEvaluations) {
          const dbMatch = dbEvals.find(
            (d) => d.structuredResult && d.result === enriched.result
          );
          if (dbMatch) {
            enriched.structuredResult = dbMatch.structuredResult;
          }
        }
      }

      try {
        const result = streamSummary({
          scriptContent: params.scriptContent,
          evaluations: enrichedEvaluations,
        });

        let fullText = "";

        for await (const chunk of result.textStream) {
          fullText += chunk;
          if (!window.isDestroyed()) {
            window.webContents.send(channelId, chunk);
          }
        }

        // Signal stream end
        if (!window.isDestroyed()) {
          window.webContents.send(channelId, null);
        }

        // Capture suggestions tool call and persist
        if (params.scriptId && params.versionId) {
          try {
            const toolCalls = await result.toolCalls;
            const submitCall = toolCalls.find(
              (tc: { toolName: string }) =>
                tc.toolName === "submit_suggestions"
            );
            if (submitCall) {
              const { suggestions } = (
                submitCall as {
                  input: {
                    suggestions: Array<{
                      originalText: string;
                      suggestedText: string;
                      reasoning: string;
                      priority: string;
                      category: string;
                      sourceModels: string[];
                    }>;
                  };
                }
              ).input;

              // Filter to only suggestions where originalText exists in script
              const validSuggestions = suggestions.filter((s) =>
                params.scriptContent.includes(s.originalText)
              );

              if (validSuggestions.length > 0) {
                deleteSuggestionsForVersion(
                  params.scriptId,
                  params.versionId
                );
                createSuggestionsBatch(
                  params.scriptId,
                  params.versionId,
                  validSuggestions
                );
              }
            }
          } catch {
            // Model didn't call the tool
          }
        }

        return { text: fullText };
      } catch (err) {
        if (!window.isDestroyed()) {
          window.webContents.send(channelId, null);
        }
        throw err;
      }
    }
  );
}
