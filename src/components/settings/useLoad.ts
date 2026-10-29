"use client";

import { useCallback, useEffect, useState } from "react";

interface Loaded<T> {
  token: number;
  data: T | null;
  error: string | null;
}

/**
 * Load one resource on mount with retry and local updates. `load` must be a
 * stable function (e.g. an `api.*` export).
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [token, setToken] = useState(0);
  const [state, setState] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ token, data, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err.message : "Unknown error";
        setState((prev) => ({ token, data: prev?.data ?? null, error }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [load, token]);

  const reload = useCallback(() => setToken((t) => t + 1), []);

  /** Update the loaded data in place (after a successful save). */
  const update = useCallback((fn: (data: T) => T) => {
    setState((prev) => (prev && prev.data !== null ? { ...prev, data: fn(prev.data) } : prev));
  }, []);

  const retrying = state !== null && state.error !== null && state.token !== token;
  return {
    data: state?.data ?? null,
    error: retrying ? null : state?.error ?? null,
    loading: state === null || retrying,
    reload,
    update,
  };
}
