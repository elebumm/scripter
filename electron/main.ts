import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { buildMenu } from "./menu";

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "Scripter",
    backgroundColor: "#09090b", // zinc-950 (dark theme default)
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in the user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Build native menu with keyboard shortcuts (always active)
  buildMenu();

  // In production, Electron owns the DB and all IPC handlers.
  // In dev, the Next.js dev server handles API routes via fetch(),
  // so we only register file/config handlers that are Electron-only.
  if (!isDev) {
    // Dynamic imports so better-sqlite3 (Electron-ABI) isn't loaded
    // when running in dev alongside a Next.js server (Node-ABI).
    const { loadApiKeyFromStore, registerConfigHandlers } = await import(
      "./ipc/config"
    );
    const { ensureDb } = await import("@/lib/db/init");
    const { registerScriptsHandlers } = await import("./ipc/scripts");
    const { registerProfilesHandlers } = await import("./ipc/profiles");
    const { registerModelsHandlers } = await import("./ipc/models");
    const { registerSuggestionsHandlers } = await import("./ipc/suggestions");
    const { registerEvaluationsHandlers } = await import("./ipc/evaluations");
    const { registerSummarizeHandlers } = await import("./ipc/summarize");
    const { registerKickoffHandlers } = await import("./ipc/kickoff");
    const { registerFilesHandlers } = await import("./ipc/files");

    loadApiKeyFromStore();
    ensureDb();

    registerScriptsHandlers();
    registerProfilesHandlers();
    registerModelsHandlers();
    registerSuggestionsHandlers();
    registerEvaluationsHandlers();
    registerSummarizeHandlers();
    registerKickoffHandlers();
    registerFilesHandlers();
    registerConfigHandlers();
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

export { mainWindow };
