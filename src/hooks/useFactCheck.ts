"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { FactCheckMeta } from "@/lib/api";
import type { FactNote } from "@/types/review";

export type FactCheckRunStatus = "idle" | "running" | "complete" | "error";

export interface FactCheckController {
  /** Fact notes from the latest grounded fact-check (all statuses). */
  notes: FactNote[];
  /** The saved notes haven't loaded yet (`notes` is not known to be empty). */
  loading: boolean;
  /** Why loading the saved notes failed; `refresh()` retries. */
  loadError: string | null;
  status: FactCheckRunStatus;
  /** Why the last run failed (status "error"). */
  error: string | null;
  /** Meta of the last run in this session (null until one finishes). */
  lastRun: FactCheckMeta | null;
  /** Claims seen so far in the streaming result while running. */
  claimsFound: number;
  /** Resolves with the run's meta when it completes, else null (failed or stopped). */
  run: (versionId: number) => Promise<FactCheckMeta | null>;
  abort: () => void;
  setStatus: (id: number, status: FactNote["status"]) => Promise<void>;
  refresh: () => Promise<void>;
}

interface State {
  scriptId: number | null;
  notes: FactNote[];
  loaded: boolean;
  loadError: string | null;
  status: FactCheckRunStatus;
  error: string | null;
  lastRun: FactCheckMeta | null;
  claimsFound: number;
}

function initialState(scriptId: number | null): State {
  return {
    scriptId,
    notes: [],
    loaded: false,
    loadError: null,
    status: "idle",
    error: null,
    lastRun: null,
    claimsFound: 0,
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

/**
 * One grounded fact-check per run (POST /api/fact-check, NDJSON) plus the
 * saved fact notes for the script. Fact notes report what sources say; there
 * is no correction to apply.
 */
export function useFactCheck(scriptId: number | null): FactCheckController {
  const [state, setState] = useState<State>(() => initialState(scriptId));
  const abortRef = useRef<AbortController | null>(null);
  // The script whose results may still land (late responses for a previous
  // script are dropped). Written in an effect, read only in callbacks.
  const activeScriptRef = useRef<number | null>(scriptId);

  // State belongs to one script; a different id starts from scratch.
  const current = state.scriptId === scriptId ? state : initialState(scriptId);

  const update = useCallback((sid: number, fn: (s: State) => State) => {
    if (activeScriptRef.current !== sid) return;
    setState((prev) => fn(prev.scriptId === sid ? prev : initialState(sid)));
  }, []);

  useEffect(() => {
    activeScriptRef.current = scriptId;
    if (scriptId == null) return;
    let cancelled = false;
    // A run that finished first already holds the latest notes (loaded).
    api.listFactNotes(scriptId).then(
      (notes) => {
        if (!cancelled) update(scriptId, (s) => (s.loaded ? s : { ...s, notes, loaded: true, loadError: null }));
      },
      (err: unknown) => {
        if (!cancelled) update(scriptId, (s) => (s.loaded ? s : { ...s, loaded: true, loadError: errorText(err) }));
      }
    );
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [scriptId, update]);

  const run = useCallback(
    async (versionId: number): Promise<FactCheckMeta | null> => {
      if (scriptId == null) return null;
      const sid = scriptId;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      update(sid, (s) => ({ ...s, status: "running", error: null, claimsFound: 0 }));

      try {
        const { notes, meta } = await api.runFactCheck(
          sid,
          versionId,
          (event) => {
            if (event.t !== "partial") return;
            const found = event.data.claims?.length ?? 0;
            update(sid, (s) => (s.claimsFound === found ? s : { ...s, claimsFound: found }));
          },
          controller.signal
        );
        if (controller.signal.aborted) return null;
        // These are now the latest grounded run's notes, so an earlier load failure is moot.
        update(sid, (s) => ({
          ...s,
          notes,
          lastRun: meta ?? null,
          status: "complete",
          error: null,
          loaded: true,
          loadError: null,
        }));
        return meta ?? null;
      } catch (err) {
        // abort() (or a newer run) already settled the status.
        if (controller.signal.aborted) return null;
        update(sid, (s) => ({ ...s, status: "error", error: errorText(err) }));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [scriptId, update]
  );

  const abort = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    if (scriptId != null) {
      update(scriptId, (s) => (s.status === "running" ? { ...s, status: "idle", claimsFound: 0 } : s));
    }
  }, [scriptId, update]);

  const notes = current.notes;

  const setStatus = useCallback(
    async (id: number, status: FactNote["status"]) => {
      if (scriptId == null) return;
      const sid = scriptId;
      const previous = notes.find((n) => n.id === id)?.status;
      if (previous === undefined || previous === status) return;
      const apply = (value: FactNote["status"]) =>
        update(sid, (s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, status: value } : n)) }));

      apply(status);
      try {
        await api.setFactNoteStatus(id, status);
      } catch (err) {
        apply(previous);
        toast.error(`Couldn't update the fact note: ${errorText(err)}`);
      }
    },
    [scriptId, notes, update]
  );

  const refresh = useCallback(async () => {
    if (scriptId == null) return;
    const sid = scriptId;
    update(sid, (s) => (s.loadError ? { ...s, loaded: false, loadError: null } : s));
    try {
      const fresh = await api.listFactNotes(sid);
      update(sid, (s) => ({ ...s, notes: fresh, loaded: true, loadError: null }));
    } catch (err) {
      update(sid, (s) => ({ ...s, loaded: true, loadError: errorText(err) }));
    }
  }, [scriptId, update]);

  return {
    notes,
    loading: scriptId != null && !current.loaded,
    loadError: current.loadError,
    status: current.status,
    error: current.error,
    lastRun: current.lastRun,
    claimsFound: current.claimsFound,
    run,
    abort,
    setStatus,
    refresh,
  };
}
