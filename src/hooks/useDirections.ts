"use client";

import { useState, useCallback, useRef } from "react";
import type { ProductionDirection, DirectionType } from "@/types";
import * as api from "@/lib/api";

interface UseDirectionsOptions {
  onModify?: (id: number) => void;
}

export function useDirections({ onModify }: UseDirectionsOptions = {}) {
  const [directions, setDirections] = useState<ProductionDirection[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDirectionId, setActiveDirectionId] = useState<number | null>(
    null
  );
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDirections = useCallback(
    async (scriptId: number, versionId: number) => {
      setLoading(true);
      try {
        const data = await api.getDirections(scriptId, versionId);

        if (data.length === 0) {
          // Retry once after 2s — race condition mitigation
          retryTimeoutRef.current = setTimeout(async () => {
            try {
              const retryData = await api.getDirections(scriptId, versionId);
              setDirections(retryData);
            } catch {
              // ignore retry failure
            } finally {
              setLoading(false);
            }
          }, 2000);
          return;
        }

        setDirections(data);
      } catch {
        setDirections([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const acceptDirection = useCallback(
    async (id: number) => {
      try {
        await api.updateDirectionStatus(id, "accepted");
        setDirections((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "accepted" as const } : d
          )
        );
        if (activeDirectionId === id) {
          setActiveDirectionId(null);
        }
      } catch {
        // ignore
      }
    },
    [activeDirectionId]
  );

  const dismissDirection = useCallback(
    async (id: number) => {
      try {
        await api.updateDirectionStatus(id, "dismissed");
        setDirections((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, status: "dismissed" as const } : d
          )
        );
        if (activeDirectionId === id) {
          setActiveDirectionId(null);
        }
      } catch {
        // ignore
      }
    },
    [activeDirectionId]
  );

  const modifyDirection = useCallback(
    async (id: number, newType: DirectionType) => {
      try {
        await api.updateDirectionStatus(id, "modified", newType);
        setDirections((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: "modified" as const,
                  userOverrideType: newType,
                }
              : d
          )
        );
        if (activeDirectionId === id) {
          setActiveDirectionId(null);
        }
        onModify?.(id);
      } catch {
        // ignore
      }
    },
    [activeDirectionId, onModify]
  );

  const getDirectionsWithStaleness = useCallback(
    (currentContent: string) => {
      return directions.map((d) => ({
        ...d,
        isStale:
          d.status === "pending" &&
          !currentContent.includes(d.originalText),
      }));
    },
    [directions]
  );

  const clearDirections = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setDirections([]);
    setActiveDirectionId(null);
    setLoading(false);
  }, []);

  return {
    directions,
    loading,
    activeDirectionId,
    setActiveDirectionId,
    fetchDirections,
    acceptDirection,
    dismissDirection,
    modifyDirection,
    getDirectionsWithStaleness,
    clearDirections,
  };
}
