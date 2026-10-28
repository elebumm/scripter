"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { RunSummary } from "@/lib/api";
import type { Synthesis } from "@/types";

interface Options {
  /** Fetch only while true (e.g. the History tab is visible). Default true. */
  enabled?: boolean;
  /** Changing this refetches the list (pass the latest synthesis id). */
  refreshKey?: string | number | null;
}

interface LoadedRuns {
  key: string;
  scriptId: number;
  runs: RunSummary[];
  error: string | null;
}

interface LoadedRun {
  scriptId: number;
  runId: string;
  synthesis: Synthesis | null;
  error: string | null;
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Council runs for a script, newest first (api.listRuns), plus one selected
 * run's full synthesis (api.getRun) for the read-only history view.
 */
export function useRuns(scriptId: number | null, options: Options = {}) {
  const enabled = options.enabled ?? true;
  const refreshKey = options.refreshKey ?? "";
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<LoadedRuns | null>(null);
  const key = scriptId != null && enabled ? `${scriptId}:${refreshKey}:${reloadToken}` : null;

  useEffect(() => {
    if (key === null || scriptId == null) return;
    let cancelled = false;
    api.listRuns(scriptId).then(
      (runs) => {
        if (!cancelled) setLoaded({ key, scriptId, runs, error: null });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, scriptId, runs: [], error: message(err, "Couldn't load past runs") });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, scriptId]);

  // Selection is tied to the script it was made for, so switching scripts
  // clears it without an effect.
  const [selection, setSelection] = useState<{ scriptId: number; runId: string } | null>(null);
  const selectedRunId = selection && selection.scriptId === scriptId ? selection.runId : null;
  const [loadedRun, setLoadedRun] = useState<LoadedRun | null>(null);

  useEffect(() => {
    if (scriptId == null || selectedRunId == null) return;
    let cancelled = false;
    api.getRun(scriptId, selectedRunId).then(
      (synthesis) => {
        if (!cancelled) setLoadedRun({ scriptId, runId: selectedRunId, synthesis, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadedRun({ scriptId, runId: selectedRunId, synthesis: null, error: message(err, "Couldn't load this run") });
        }
      }
    );
    return () => {
      cancelled = true;
    };
    // refreshKey: a new synthesis (e.g. one made for this run from History) reloads it.
  }, [scriptId, selectedRunId, refreshKey]);

  const selectRun = useCallback(
    (runId: string | null) => setSelection(runId != null && scriptId != null ? { scriptId, runId } : null),
    [scriptId]
  );
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const current = loaded && loaded.scriptId === scriptId ? loaded : null;
  const run =
    loadedRun && selectedRunId != null && loadedRun.scriptId === scriptId && loadedRun.runId === selectedRunId
      ? loadedRun
      : null;

  return {
    runs: current?.runs ?? [],
    /** First load for this script (nothing to show yet). */
    loading: key !== null && !current,
    error: current?.error ?? null,
    reload,
    selectedRunId,
    selectRun,
    selectedRun: run?.synthesis ?? null,
    runLoading: selectedRunId != null && !run,
    runError: run?.error ?? null,
  };
}
