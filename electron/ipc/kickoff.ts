import { ipcMain, BrowserWindow } from "electron";
import { streamOutline } from "@/lib/llm/outline";

const activeStreams = new Map<string, AbortController>();

export function registerKickoffHandlers() {
  ipcMain.handle(
    "kickoff:run",
    async (
      event,
      params: {
        concept: string;
        themes?: string;
        targetLength: number;
        tone?: string;
      },
      channelId: string
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("No window found");

      const abortController = new AbortController();
      activeStreams.set(channelId, abortController);

      try {
        const result = streamOutline({
          concept: params.concept,
          themes: params.themes,
          targetLength: params.targetLength,
          tone: params.tone,
        });

        let fullText = "";

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

        return { text: fullText };
      } catch (err) {
        if (!window.isDestroyed()) {
          window.webContents.send(channelId, null);
        }
        throw err;
      } finally {
        activeStreams.delete(channelId);
      }
    }
  );

  ipcMain.handle("kickoff:abort", (_event, channelId: string) => {
    const controller = activeStreams.get(channelId);
    if (controller) {
      controller.abort();
      activeStreams.delete(channelId);
    }
  });
}
