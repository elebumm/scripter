"use client";

import { useState, useCallback, useRef } from "react";
import type { Suggestion } from "@/types";
import * as api from "@/lib/api";

interface UseSuggestionsOptions {
  onAccept?: (id: number, newContent: string) => void;
}

export function useSuggestions({ onAccept }: UseSuggestionsOptions = {}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSuggestionId, setActiveSuggestionId] = useState<number | null>(
    null
  );
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(
    async (scriptId: number, versionId: number) => {
      setLoading(true);
      try {
        const data = await api.getSuggestions(scriptId, versionId);

        if (data.length === 0) {
          // Retry once after 2s — race condition mitigation (web mode only;
          // in Electron the main process resolves synchronously)
          retryTimeoutRef.current = setTimeout(async () => {
            try {
              const retryData = await api.getSuggestions(scriptId, versionId);
              setSuggestions(retryData);
            } catch {
              // ignore retry failure
            } finally {
              setLoading(false);
            }
          }, 2000);
          return;
        }

        setSuggestions(data);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const acceptSuggestion = useCallback(
    async (id: number, currentContent: string) => {
      const suggestion = suggestions.find((s) => s.id === id);
      if (!suggestion) return;

      const newContent = currentContent.replace(
        suggestion.originalText,
        suggestion.suggestedText
      );

      try {
        await api.updateSuggestionStatus(id, "accepted");

        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "accepted" } : s))
        );

        if (activeSuggestionId === id) {
          setActiveSuggestionId(null);
        }

        onAccept?.(id, newContent);
      } catch {
        // ignore
      }
    },
    [suggestions, activeSuggestionId, onAccept]
  );

  const dismissSuggestion = useCallback(
    async (id: number) => {
      try {
        await api.updateSuggestionStatus(id, "dismissed");

        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "dismissed" } : s))
        );

        if (activeSuggestionId === id) {
          setActiveSuggestionId(null);
        }
      } catch {
        // ignore
      }
    },
    [activeSuggestionId]
  );

  const getSuggestionsWithStaleness = useCallback(
    (currentContent: string) => {
      return suggestions.map((s) => ({
        ...s,
        isStale:
          s.status === "pending" && !currentContent.includes(s.originalText),
      }));
    },
    [suggestions]
  );

  const clearSuggestions = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setSuggestions([]);
    setActiveSuggestionId(null);
    setLoading(false);
  }, []);

  return {
    suggestions,
    loading,
    activeSuggestionId,
    setActiveSuggestionId,
    fetchSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    getSuggestionsWithStaleness,
    clearSuggestions,
  };
}
