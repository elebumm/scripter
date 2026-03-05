import { ipcMain, BrowserWindow } from "electron";
import { streamEvaluation } from "@/lib/llm/evaluate";
import {
  createEvaluation,
  updateEvaluation,
} from "@/lib/db/queries/evaluations";

// Track active abort controllers per window
const activeStreams = new Map<string, AbortController>();

export function registerEvaluationsHandlers() {
  ipcMain.handle(
    "evaluate:run",
    async (
      event,
      params: {
        scriptContent: string;
        scriptContext?: string;
        sectionOnly?: string;
        modelId: string;
        modelProvider: string;
        modelBaseUrl?: string;
        profilePrompt?: string;
        scriptId: number;
        versionId: number;
        profileId?: number | null;
      },
      channelId: string
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("No window found");

      const abortController = new AbortController();
      activeStreams.set(channelId, abortController);

      // Create evaluation record
      const evaluation = createEvaluation({
        scriptId: params.scriptId,
        versionId: params.versionId,
        profileId: params.profileId ?? null,
        modelId: params.modelId,
        modelProvider: params.modelProvider,
        result: "",
        isMasterSummary: false,
        sectionOnly: params.sectionOnly ?? null,
        status: "streaming",
      });

      try {
        const result = streamEvaluation({
          scriptContent: params.scriptContent,
          scriptContext: params.scriptContext,
          sectionOnly: params.sectionOnly,
          modelProvider: params.modelProvider,
          modelId: params.modelId,
          modelBaseUrl: params.modelBaseUrl,
          systemPrompt: params.profilePrompt,
        });

        let fullText = "";

        // Stream chunks to the renderer via the unique channel
        for await (const chunk of result.textStream) {
          if (abortController.signal.aborted) break;
          fullText += chunk;
          if (!window.isDestroyed()) {
            window.webContents.send(channelId, chunk);
          }
        }

        // Signal stream end
        if (!window.isDestroyed()) {
          window.webContents.send(channelId, null);
        }

        // Capture structured tool call data
        let structuredResult: string | null = null;
        try {
          const toolCalls = await result.toolCalls;
          const submitCall = toolCalls.find(
            (tc: { toolName: string }) => tc.toolName === "submit_evaluation"
          );
          if (submitCall) {
            structuredResult = JSON.stringify(
              (submitCall as { input: unknown }).input
            );
          }
        } catch {
          // Model didn't call the tool
        }

        // Persist to DB
        updateEvaluation(evaluation.id, {
          result: fullText,
          structuredResult,
          status: "complete",
          durationMs: Date.now() - new Date(evaluation.createdAt).getTime(),
        });

        return { text: fullText };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        updateEvaluation(evaluation.id, {
          status: "error",
          errorMessage,
        });

        // Signal error to renderer
        if (!window.isDestroyed()) {
          window.webContents.send(channelId, null);
        }

        throw err;
      } finally {
        activeStreams.delete(channelId);
      }
    }
  );

  ipcMain.handle("evaluate:abort", (_event, channelId: string) => {
    const controller = activeStreams.get(channelId);
    if (controller) {
      controller.abort();
      activeStreams.delete(channelId);
    }
  });
}
