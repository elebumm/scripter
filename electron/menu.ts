import { app, Menu, BrowserWindow } from "electron";

const isMac = process.platform === "darwin";

function sendMenuAction(action: string) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send("menu-action", action);
  }
}

export function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),

    // File
    {
      label: "File",
      submenu: [
        {
          label: "New Script",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction("new-script"),
        },
        {
          label: "Open File...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuAction("open-file"),
        },
        { type: "separator" },
        {
          label: "Save Version",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuAction("save-version"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuAction("save-as"),
        },
        { type: "separator" },
        {
          label: "Export...",
          accelerator: "CmdOrCtrl+E",
          click: () => sendMenuAction("export"),
        },
        { type: "separator" },
        ...(isMac ? [] : [{ role: "quit" as const }]),
      ],
    },

    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },

    // Script
    {
      label: "Script",
      submenu: [
        {
          label: "Evaluate",
          accelerator: "CmdOrCtrl+Return",
          click: () => sendMenuAction("evaluate"),
        },
        {
          label: "Abort Evaluation",
          accelerator: "CmdOrCtrl+.",
          click: () => sendMenuAction("abort"),
        },
        { type: "separator" },
        {
          label: "Toggle Script List",
          accelerator: "CmdOrCtrl+\\",
          click: () => sendMenuAction("toggle-script-list"),
        },
      ],
    },

    // View
    {
      label: "View",
      submenu: [
        {
          label: "Rich Text",
          accelerator: "CmdOrCtrl+1",
          click: () => sendMenuAction("view-wysiwyg"),
        },
        {
          label: "Markdown",
          accelerator: "CmdOrCtrl+2",
          click: () => sendMenuAction("view-markdown"),
        },
        { type: "separator" },
        {
          label: "Toggle Dark Mode",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => sendMenuAction("toggle-theme"),
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    // Window
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },

    // Help
    {
      label: "Help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          click: () => sendMenuAction("show-shortcuts"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
