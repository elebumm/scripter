"use client";

import { useEffect } from "react";

interface ShortcutHandlers {
  onNewScript?: () => void;
  onOpenFile?: () => void;
  onSaveVersion?: () => void;
  onSaveAs?: () => void;
  onExport?: () => void;
  onEvaluate?: () => void;
  onAbort?: () => void;
  onToggleScriptList?: () => void;
  onViewWysiwyg?: () => void;
  onViewMarkdown?: () => void;
  onToggleTheme?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    // Only active in Electron — menu actions arrive via IPC
    if (!window.scripterAPI?.isElectron) return;

    const cleanup = window.scripterAPI.onMenuAction((action: string) => {
      switch (action) {
        case "new-script":
          handlers.onNewScript?.();
          break;
        case "open-file":
          handlers.onOpenFile?.();
          break;
        case "save-version":
          handlers.onSaveVersion?.();
          break;
        case "save-as":
          handlers.onSaveAs?.();
          break;
        case "export":
          handlers.onExport?.();
          break;
        case "evaluate":
          handlers.onEvaluate?.();
          break;
        case "abort":
          handlers.onAbort?.();
          break;
        case "toggle-script-list":
          handlers.onToggleScriptList?.();
          break;
        case "view-wysiwyg":
          handlers.onViewWysiwyg?.();
          break;
        case "view-markdown":
          handlers.onViewMarkdown?.();
          break;
        case "toggle-theme":
          handlers.onToggleTheme?.();
          break;
      }
    });

    return cleanup;
  }, [handlers]);
}
