import { ipcMain } from "electron";
import {
  listScripts,
  getScript,
  createScript,
  updateScript,
  deleteScript,
  getScriptVersions,
  getLatestVersion,
  createVersion,
} from "@/lib/db/queries/scripts";
import { db } from "@/lib/db/index";
import { scriptVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export function registerScriptsHandlers() {
  ipcMain.handle("scripts:list", () => {
    return listScripts();
  });

  ipcMain.handle("scripts:get", (_event, id: number) => {
    const script = getScript(id);
    if (!script) return { script: null, latestVersion: null };
    const latestVersion = getLatestVersion(id);
    return { script, latestVersion };
  });

  ipcMain.handle(
    "scripts:create",
    (_event, title: string, content: string, options?: { context?: string; targetLength?: number }) => {
      return createScript(title ?? "Untitled Script", content ?? "", options);
    }
  );

  ipcMain.handle(
    "scripts:update",
    (
      _event,
      id: number,
      data: {
        title?: string;
        context?: string;
        targetLength?: number | null;
        content?: string;
      }
    ) => {
      // If content is provided, update the latest version content directly
      if (data.content !== undefined) {
        const script = getScript(id);
        if (script) {
          const wordCount = data.content.trim()
            ? data.content.trim().split(/\s+/).length
            : 0;
          db.update(scriptVersions)
            .set({ content: data.content, wordCount })
            .where(
              and(
                eq(scriptVersions.scriptId, id),
                eq(scriptVersions.version, script.currentVersion)
              )
            )
            .run();
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.context !== undefined) updateData.context = data.context;
      if (data.targetLength !== undefined)
        updateData.targetLength = data.targetLength;

      if (Object.keys(updateData).length > 0) {
        return updateScript(
          id,
          updateData as {
            title?: string;
            context?: string;
            targetLength?: number | null;
          }
        );
      }

      return getScript(id);
    }
  );

  ipcMain.handle("scripts:delete", (_event, id: number) => {
    deleteScript(id);
    return { ok: true };
  });

  ipcMain.handle("scripts:getVersions", (_event, scriptId: number) => {
    return getScriptVersions(scriptId);
  });

  ipcMain.handle(
    "scripts:createVersion",
    (_event, scriptId: number, content: string) => {
      const script = getScript(scriptId);
      if (!script) throw new Error("Script not found");
      const nextVersion = script.currentVersion + 1;
      return createVersion(scriptId, content, nextVersion);
    }
  );
}
