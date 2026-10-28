"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { findAnchorInText, markdownToPlain } from "@/lib/text/anchor";
import type { Note, NoteStatus, NoteWithAnchor } from "@/types";

export interface NoteGroups {
  /** Open, and the passage is still in the text. */
  open: NoteWithAnchor[];
  /** Open but the passage changed (auto-resolved), or marked addressed. */
  addressed: NoteWithAnchor[];
  dismissed: NoteWithAnchor[];
}

export interface NotesController {
  notes: NoteWithAnchor[];
  groups: NoteGroups;
  loading: boolean;
  error: string | null;
  setStatus: (id: number, status: NoteStatus) => Promise<void>;
  refresh: () => Promise<void>;
}

const PRIORITY_ORDER: Record<Note["priority"], number> = { high: 0, medium: 1, low: 2 };

/** Is a quoted passage gone from the (plain-text projection of the) script? */
export function isAnchorStale(plainScript: string, anchorText: string): boolean {
  return findAnchorInText(plainScript, markdownToPlain(anchorText)) === null;
}

export function withStaleness(notes: Note[], markdown: string): NoteWithAnchor[] {
  const plain = markdownToPlain(markdown);
  return notes.map((n) => ({ ...n, isStale: isAnchorStale(plain, n.anchorText) }));
}

export function groupNotes(notes: NoteWithAnchor[]): NoteGroups {
  const sorted = [...notes].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return {
    open: sorted.filter((n) => n.status === "open" && !n.isStale),
    addressed: sorted.filter((n) => n.status === "addressed" || (n.status === "open" && n.isStale)),
    dismissed: sorted.filter((n) => n.status === "dismissed"),
  };
}

/**
 * Notes from the script's latest council run, checked against the current
 * text. A note whose passage is gone counts as "addressed since last pass"
 * client-side; the next synthesis marks it addressed on the server.
 */
export function useNotes(scriptId: number, content: string): NotesController {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.listNotes(scriptId);
      setNotes(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    let cancelled = false;
    api
      .listNotes(scriptId)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  // Staleness trails typing slightly; anchors are checked off the input path.
  const deferredContent = useDeferredValue(content);
  const withAnchor = useMemo(() => withStaleness(notes, deferredContent), [notes, deferredContent]);
  const groups = useMemo(() => groupNotes(withAnchor), [withAnchor]);

  const setStatus = useCallback(
    async (id: number, status: NoteStatus) => {
      const previous = notes.find((n) => n.id === id);
      if (!previous || previous.status === status) return;
      setNotes((list) => list.map((n) => (n.id === id ? { ...n, status } : n)));
      try {
        const saved = await api.setNoteStatus(id, status);
        setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...saved } : n)));
      } catch (err) {
        setNotes((list) => list.map((n) => (n.id === id ? { ...n, status: previous.status } : n)));
        toast.error(`Couldn't update the note: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    },
    [notes]
  );

  return { notes: withAnchor, groups, loading, error, setStatus, refresh: load };
}
