"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { ScriptSummary } from "@/lib/api";

type ListKey = "active" | "archived";

interface LoadedList {
  scripts: ScriptSummary[];
  error: string | null;
  /** Reload token this result answers; lets a retry show as loading. */
  token: number;
  /** Date.now() when the response arrived; "now" for relative times. */
  loadedAt: number;
}

export type ScriptListStatus = "loading" | "error" | "ready";

/**
 * Scripts for the Drafts grid: the active list or the archive. Both lists are
 * cached so switching filters shows the last result while it refreshes.
 */
export function useScriptList(archived: boolean) {
  const key: ListKey = archived ? "archived" : "active";
  const [token, setToken] = useState(0);
  const [lists, setLists] = useState<Partial<Record<ListKey, LoadedList>>>({});

  useEffect(() => {
    let cancelled = false;
    api.listScripts({ archived: key === "archived" }).then(
      (scripts) => {
        if (cancelled) return;
        setLists((prev) => ({ ...prev, [key]: { scripts, error: null, token, loadedAt: Date.now() } }));
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setLists((prev) => ({
          ...prev,
          [key]: { scripts: prev[key]?.scripts ?? [], error: message, token, loadedAt: Date.now() },
        }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, token]);

  const current = lists[key];
  const retrying = current?.error != null && current.token !== token;
  const status: ScriptListStatus = !current || retrying ? "loading" : current.error ? "error" : "ready";

  const reload = useCallback(() => setToken((t) => t + 1), []);

  /** Optimistically drop a script from a cached list (archive, delete). */
  const removeLocally = useCallback((id: number) => {
    setLists((prev) => {
      const next: Partial<Record<ListKey, LoadedList>> = {};
      for (const k of Object.keys(prev) as ListKey[]) {
        const list = prev[k]!;
        next[k] = { ...list, scripts: list.scripts.filter((s) => s.id !== id) };
      }
      return next;
    });
  }, []);

  return {
    scripts: current?.scripts ?? [],
    status,
    error: current?.error ?? null,
    loadedAt: current?.loadedAt ?? null,
    reload,
    removeLocally,
  };
}
