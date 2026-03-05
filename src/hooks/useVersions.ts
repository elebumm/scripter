"use client";

import { useState, useCallback } from "react";
import type { ScriptVersion } from "@/types";
import * as api from "@/lib/api";

export function useVersions(scriptId: number | null) {
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!scriptId) return;
    setLoading(true);
    try {
      const data = await api.getScriptVersions(scriptId);
      setVersions(data);
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  return { versions, loading, loadVersions };
}
