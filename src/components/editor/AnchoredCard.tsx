"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { findAnnotationRange, type AnnotationRange } from "./annotations-extension";
import { FROM_TEXT, TABBABLE, rememberOpener, returnFocusTarget, type FocusReturn } from "./focus-return";
import { isBlockingSurfaceOpen } from "@/hooks/useKeyboardShortcuts";

interface AnchoredCardProps {
  editor: Editor;
  /** Annotation the card belongs to ("note:12", "fact:7"). */
  annotationId: string;
  /** Accessible name of the card region. */
  label: string;
  onClose: () => void;
  /** Move focus into the card when it opens (opened from a list, not by a click in the text). */
  autoFocus?: boolean;
  /**
   * Where focus goes when the card closes with focus inside it and the
   * control that opened it is gone (a list row that moved to another group).
   * Without it, or when it returns null, focus goes to the control that
   * followed the opener (the next row), else the editor at the highlight.
   */
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}

/** Fallback for the first measurement; the card sets its own width. */
const CARD_WIDTH = 360;
const GAP = 8;

/** Still on the page, shown and enabled. */
function isUsable(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0 && !el.matches(":disabled");
}

/**
 * Floats a card under its highlight inside `.tiptap-editor-container`. The
 * position is written straight to the element's style whenever the editor
 * changes, so typing never re-renders React. When the passage is gone from
 * the text (a stale note), the card docks at the top of the writing column.
 * Closing the card with focus inside it hands focus back to whatever opened
 * it, so keyboard triage never drops to <body>.
 */
export function AnchoredCard({ editor, annotationId, label, onClose, autoFocus, returnFocus, children }: AnchoredCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  /** The control focus came from when the card took it (a list row) and its neighbours. */
  const focusReturn = useRef<FocusReturn<HTMLElement>>(FROM_TEXT);
  /** The highlight's last known range, to put the caret back on it. */
  const lastRange = useRef<AnnotationRange | null>(null);
  /** Focus is in the card (or was, until the focused control went away). */
  const hasFocus = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocus;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const dock = () => {
      el.style.position = "fixed";
      el.style.top = "5rem";
      el.style.left = "auto";
      el.style.right = "calc(20rem + 2rem)";
      el.dataset.docked = "true";
    };

    const place = () => {
      if (editor.isDestroyed) return;
      const container = editor.view.dom.closest(".tiptap-editor-container");
      const range = findAnnotationRange(editor, annotationId);
      if (range) lastRange.current = range;
      if (!container || !range) {
        dock();
        return;
      }
      try {
        const start = editor.view.coordsAtPos(range.from);
        const end = editor.view.coordsAtPos(range.to);
        const rect = container.getBoundingClientRect();
        const width = el.offsetWidth || CARD_WIDTH;
        const left = Math.max(0, Math.min(start.left - rect.left, rect.width - width));
        el.style.position = "absolute";
        el.style.top = `${end.bottom - rect.top + GAP}px`;
        el.style.left = `${left}px`;
        el.style.right = "auto";
        el.dataset.docked = "false";
      } catch {
        dock();
      }
    };

    place();
    el.style.visibility = "visible";
    editor.on("transaction", place);
    window.addEventListener("resize", place);
    return () => {
      editor.off("transaction", place);
      window.removeEventListener("resize", place);
    };
  }, [editor, annotationId]);

  useEffect(() => {
    if (!autoFocus) {
      focusReturn.current = FROM_TEXT;
      return;
    }
    const el = ref.current;
    const active = document.activeElement;
    focusReturn.current =
      active instanceof HTMLElement && active !== document.body && !el?.contains(active)
        ? rememberOpener(Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)), active, (c) => !!el?.contains(c))
        : FROM_TEXT;
    el?.focus({ preventScroll: true });
  }, [autoFocus, annotationId]);

  // Closing (Mark addressed, Dismiss, the X, Esc) unmounts the card. If focus
  // was in it, return it to the control that opened the card, or the one now
  // in its place; else to the editor: at the highlight when opened from a
  // list, where the writer clicked when opened from the text. Whether focus
  // was in the card is read before the card leaves the DOM; the target is
  // chosen after the update, since the row that opened the card may leave in
  // it (Mark addressed moves the note to another group).
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      const active = document.activeElement;
      const focusLost = !active || active === document.body;
      if (!el.contains(active) && !(focusLost && hasFocus.current)) return;

      const saved = focusReturn.current;
      const at = saved.opener ? (lastRange.current?.from ?? null) : null;
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (now && now !== document.body) return;
        const target = returnFocusTarget(saved, isUsable, returnFocusRef.current);
        if (target) target.focus();
        else if (!editor.isDestroyed) editor.commands.focus(at, { scrollIntoView: false });
      });
    };
  }, [editor]);

  // Esc closes this card when it is the topmost thing the writer is working
  // in: focus in the editor column or the card, and no dialog/menu open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isBlockingSurfaceOpen()) return;
      const active = document.activeElement;
      const column = ref.current?.closest(".tiptap-editor-container");
      const inColumn = !active || active === document.body || (column?.contains(active) ?? false);
      if (!inColumn) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className="z-40 outline-none"
      style={{ position: "absolute", top: 0, left: 0, maxWidth: "calc(100vw - 2rem)", visibility: "hidden" }}
      onFocus={() => {
        hasFocus.current = true;
      }}
      onBlur={(e) => {
        // Focus moved to another control. (When the focused control is
        // removed there's no relatedTarget, and focus counts as still here.)
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) hasFocus.current = false;
      }}
    >
      {children}
    </div>
  );
}
