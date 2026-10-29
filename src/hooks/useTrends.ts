"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { TrendPoint } from "@/lib/api";

interface Options {
  /** Fetch only while true (e.g. the Trends tab is visible). Default true. */
  enabled?: boolean;
  /** Changing this refetches (pass the latest synthesis id). */
  refreshKey?: string | number | null;
}

interface Loaded {
  key: string;
  scriptId: number;
  points: TrendPoint[];
  error: string | null;
}

/** Score trend points across versions (whole-script runs only; api.getTrends). */
export function useTrends(scriptId: number | null, options: Options = {}) {
  const enabled = options.enabled ?? true;
  const refreshKey = options.refreshKey ?? "";
  const [reloadToken, setReloadToken] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = scriptId != null && enabled ? `${scriptId}:${refreshKey}:${reloadToken}` : null;

  useEffect(() => {
    if (key === null || scriptId == null) return;
    let cancelled = false;
    api.getTrends(scriptId).then(
      (points) => {
        if (!cancelled) setLoaded({ key, scriptId, points, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoaded({
            key,
            scriptId,
            points: [],
            error: err instanceof Error && err.message ? err.message : "Couldn't load score trends",
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, scriptId]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const current = loaded && loaded.scriptId === scriptId ? loaded : null;

  return {
    points: current?.points ?? [],
    /** First load for this script (nothing to show yet). */
    loading: key !== null && !current,
    error: current?.error ?? null,
    reload,
  };
}
