"use client";

import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  /** Ctrl/Cmd+Enter: consult the council on the whole script. */
  onConsult?: () => void;
  /** Ctrl/Cmd+S: save a version (the browser's "Save page" dialog is always suppressed). */
  onSaveVersion?: () => void;
  /** Ctrl/Cmd+Shift+F */
  onFactCheck?: () => void;
  /** Ctrl/Cmd+Alt+N (Ctrl+N is reserved by the browser) */
  onNewScript?: () => void;
  /** Ctrl/Cmd+Alt+1 (Ctrl+1 is reserved by the browser) */
  onViewWysiwyg?: () => void;
  /** Ctrl/Cmd+Alt+2 (Ctrl+2 is reserved by the browser) */
  onViewMarkdown?: () => void;
}

/** One entry per shortcut, for menus and help text. */
export const SHORTCUTS = {
  consult: "Ctrl+Enter",
  saveVersion: "Ctrl+S",
  factCheck: "Ctrl+Shift+F",
  newScript: "Ctrl+Alt+N",
  viewWysiwyg: "Ctrl+Alt+1",
  viewMarkdown: "Ctrl+Alt+2",
} as const;

/**
 * True while a modal surface (dialog, sheet, alert, open menu) owns the
 * keyboard. App shortcuts and custom Esc handlers stand down then; Radix
 * handles Esc for its own surfaces.
 */
export function isBlockingSurfaceOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]'
    ) !== null
  );
}

function pickAction(e: KeyboardEvent, h: ShortcutHandlers): (() => void) | undefined {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return undefined;
  // On Windows, AltGr reports as Ctrl+Alt; never hijack AltGr characters.
  if (e.getModifierState?.("AltGraph")) return undefined;

  const key = e.key.toLowerCase();
  if (!e.altKey && !e.shiftKey) {
    if (e.key === "Enter") return h.onConsult;
    if (key === "s") return h.onSaveVersion;
    return undefined;
  }
  if (e.shiftKey && !e.altKey) {
    if (key === "f") return h.onFactCheck;
    return undefined;
  }
  if (e.altKey && !e.shiftKey) {
    if (e.code === "KeyN") return h.onNewScript;
    if (e.code === "Digit1") return h.onViewWysiwyg;
    if (e.code === "Digit2") return h.onViewMarkdown;
  }
  return undefined;
}

function isSaveCombo(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s";
}

/**
 * In-page keyboard shortcuts. Listens on `window` in the capture phase so app
 * shortcuts win over editor keymaps (Tiptap binds Mod-Enter to a hard break).
 * Handlers are read through a ref, so the listener is bound once.
 *
 * Esc is deliberately not handled here: it never stops a run (Stop is a
 * button) and each surface closes itself, topmost first.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const action = pickAction(e, handlersRef.current);

      if (isBlockingSurfaceOpen()) {
        // A dialog or sheet owns the keyboard. Still keep the browser's
        // "Save page" dialog away; nothing in this app wants it.
        if (isSaveCombo(e)) e.preventDefault();
        return;
      }

      if (!action) {
        if (isSaveCombo(e)) e.preventDefault();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) action();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
