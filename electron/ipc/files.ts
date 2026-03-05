import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import {
  createScript,
  findScriptByFilePath,
  getScript,
  getLatestVersion,
} from "@/lib/db/queries/scripts";
import { db } from "@/lib/db/index";
import { scriptVersions, scripts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Simple recent files list (kept in memory, persisted later via electron-store)
let recentFiles: string[] = [];
const MAX_RECENT = 10;

function addToRecent(filePath: string) {
  recentFiles = [filePath, ...recentFiles.filter((f) => f !== filePath)].slice(
    0,
    MAX_RECENT
  );
}

// Chokidar watcher for external file changes
let watchedPaths = new Map<
  string,
  { scriptId: number; close: () => void }
>();
let pausedPaths = new Set<string>();

async function watchFile(filePath: string, scriptId: number) {
  // Stop any existing watcher for this path
  const existing = watchedPaths.get(filePath);
  if (existing) {
    existing.close();
  }

  // Dynamic import of chokidar (ESM module)
  const { watch } = await import("chokidar");

  const watcher = watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  watcher.on("change", () => {
    if (pausedPaths.has(filePath)) return;

    try {
      const newContent = fs.readFileSync(filePath, "utf-8");
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send("file:external-change", scriptId, newContent);
        }
      }
    } catch {
      // File might be temporarily locked
    }
  });

  watchedPaths.set(filePath, {
    scriptId,
    close: () => watcher.close(),
  });
}

export function registerFilesHandlers() {
  // Open a file via native dialog
  ipcMain.handle("files:open", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Open Markdown File",
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    return openFilePath(filePath);
  });

  // Open a specific file path (for recent files, drag-and-drop)
  ipcMain.handle("files:openPath", async (_event, filePath: string) => {
    return openFilePath(filePath);
  });

  // Save file-backed script content to disk
  ipcMain.handle("files:save", async (_event, scriptId: number) => {
    const script = getScript(scriptId);
    if (!script || script.source !== "file" || !script.filePath) return false;

    const latestVersion = getLatestVersion(scriptId);
    if (!latestVersion) return false;

    try {
      // Pause watcher to avoid self-trigger
      pausedPaths.add(script.filePath);
      fs.writeFileSync(script.filePath, latestVersion.content, "utf-8");
      setTimeout(() => pausedPaths.delete(script.filePath!), 500);
      return true;
    } catch {
      pausedPaths.delete(script.filePath);
      return false;
    }
  });

  // Save As — create new file on disk
  ipcMain.handle("files:saveAs", async (event, scriptId: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const script = getScript(scriptId);
    if (!script) return null;

    const latestVersion = getLatestVersion(scriptId);
    if (!latestVersion) return null;

    const result = await dialog.showSaveDialog(win, {
      title: "Save As",
      defaultPath: `${script.title.replace(/[^a-zA-Z0-9-_ ]/g, "")}.md`,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePath) return null;

    try {
      fs.writeFileSync(result.filePath, latestVersion.content, "utf-8");

      // Update script to be file-backed
      db.update(scripts)
        .set({
          source: "file",
          filePath: result.filePath,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scripts.id, scriptId))
        .run();

      addToRecent(result.filePath);
      watchFile(result.filePath, scriptId);

      return result.filePath;
    } catch {
      return null;
    }
  });

  // Get recent files list
  ipcMain.handle("files:getRecent", () => {
    // Filter to only files that still exist
    recentFiles = recentFiles.filter((f) => fs.existsSync(f));
    return recentFiles;
  });
}

async function openFilePath(
  filePath: string
): Promise<{ scriptId: number; filePath: string } | null> {
  if (!fs.existsSync(filePath)) return null;

  // Check if we already have a script for this file
  const existing = findScriptByFilePath(filePath);
  if (existing) {
    // Re-read from disk and update the latest version
    const content = fs.readFileSync(filePath, "utf-8");
    const latestVersion = getLatestVersion(existing.id);
    if (latestVersion) {
      const wordCount = content.trim()
        ? content.trim().split(/\s+/).length
        : 0;
      db.update(scriptVersions)
        .set({ content, wordCount })
        .where(
          and(
            eq(scriptVersions.scriptId, existing.id),
            eq(scriptVersions.version, existing.currentVersion)
          )
        )
        .run();
    }

    addToRecent(filePath);
    watchFile(filePath, existing.id);
    return { scriptId: existing.id, filePath };
  }

  // Create new script from file
  const content = fs.readFileSync(filePath, "utf-8");
  const title = path.basename(filePath, path.extname(filePath));
  const script = createScript(title, content, {
    source: "file",
    filePath,
  });

  addToRecent(filePath);
  watchFile(filePath, script.id);

  return { scriptId: script.id, filePath };
}
