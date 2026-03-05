"use client";

import { useState, useCallback, useRef } from "react";
import type { FactIssue } from "@/types";
import * as api from "@/lib/api";

interface UseFactIssuesOptions {
  onCorrect?: (id: number, newContent: string) => void;
}

export function useFactIssues({ onCorrect }: UseFactIssuesOptions = {}) {
  const [factIssues, setFactIssues] = useState<FactIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFactIssueId, setActiveFactIssueId] = useState<
    number | null
  >(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const fetchFactIssues = useCallback(
    async (scriptId: number, versionId: number) => {
      setLoading(true);
      try {
        const data = await api.getFactIssues(scriptId, versionId);

        if (data.length === 0) {
          // Retry once after 2s — race condition mitigation
          retryTimeoutRef.current = setTimeout(async () => {
            try {
              const retryData = await api.getFactIssues(
                scriptId,
                versionId
              );
              setFactIssues(retryData);
            } catch {
              // ignore retry failure
            } finally {
              setLoading(false);
            }
          }, 2000);
          return;
        }

        setFactIssues(data);
      } catch {
        setFactIssues([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const acknowledgeIssue = useCallback(
    async (id: number) => {
      try {
        await api.updateFactIssueStatus(id, "acknowledged");
        setFactIssues((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "acknowledged" as const } : i
          )
        );
        if (activeFactIssueId === id) {
          setActiveFactIssueId(null);
        }
      } catch {
        // ignore
      }
    },
    [activeFactIssueId]
  );

  const dismissIssue = useCallback(
    async (id: number) => {
      try {
        await api.updateFactIssueStatus(id, "dismissed");
        setFactIssues((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "dismissed" as const } : i
          )
        );
        if (activeFactIssueId === id) {
          setActiveFactIssueId(null);
        }
      } catch {
        // ignore
      }
    },
    [activeFactIssueId]
  );

  const correctIssue = useCallback(
    async (id: number, currentContent: string) => {
      const issue = factIssues.find((i) => i.id === id);
      if (!issue || !issue.correction) return;

      const newContent = currentContent.replace(
        issue.claimText,
        issue.correction
      );

      try {
        await api.updateFactIssueStatus(id, "corrected");
        setFactIssues((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, status: "corrected" as const } : i
          )
        );
        if (activeFactIssueId === id) {
          setActiveFactIssueId(null);
        }
        onCorrect?.(id, newContent);
      } catch {
        // ignore
      }
    },
    [factIssues, activeFactIssueId, onCorrect]
  );

  const getFactIssuesWithStaleness = useCallback(
    (currentContent: string) => {
      return factIssues.map((i) => ({
        ...i,
        isStale:
          i.status === "pending" && !currentContent.includes(i.claimText),
      }));
    },
    [factIssues]
  );

  const clearFactIssues = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setFactIssues([]);
    setActiveFactIssueId(null);
    setLoading(false);
  }, []);

  return {
    factIssues,
    loading,
    activeFactIssueId,
    setActiveFactIssueId,
    fetchFactIssues,
    acknowledgeIssue,
    dismissIssue,
    correctIssue,
    getFactIssuesWithStaleness,
    clearFactIssues,
  };
}
