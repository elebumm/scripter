"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScriptVersion } from "@/types";
import * as api from "@/lib/api";

interface Loaded {
  key: string;
  scriptId: number;
  versions: ScriptVersion[];
  error: string | null;
}

/**
 * A script's immutable versions, newest first. Loads when `scriptId` is set;
 * `reload()` refetches (e.g. after "Save version").
 */
export function useVersions(scriptId: number | null) {
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = scriptId != null ? `${scriptId}:${reloadToken}` : null;

  useEffect(() => {
    if (key === null || scriptId == null) return;
    let cancelled = false;
    api.listVersions(scriptId).then(
      (versions) => {
        if (!cancelled) setLoaded({ key, scriptId, versions, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoaded({ key, scriptId, versions: [], error: err instanceof Error ? err.message : "Couldn't load versions" });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, scriptId]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const current = loaded && loaded.scriptId === scriptId ? loaded : null;
  const versions = useMemo(
    () => (current ? [...current.versions].sort((a, b) => b.version - a.version) : []),
    [current]
  );

  return {
    versions,
    /** First load for this script (nothing to show yet). */
    loading: key !== null && !current,
    /** A reload is in flight; the previous list stays visible. */
    refreshing: key !== null && current?.key !== key,
    error: current?.error ?? null,
    reload,
  };
}
