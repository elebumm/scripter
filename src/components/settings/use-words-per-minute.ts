"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_WORDS_PER_MINUTE, useAppStore } from "@/stores/app-store";

const getServerSnapshot = () => DEFAULT_WORDS_PER_MINUTE;
const getSnapshot = () => useAppStore.getState().wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;

/**
 * The writer's speaking rate from the persisted store. The server render and
 * the hydration pass use the default, then the stored value takes over, so a
 * customised rate never causes a hydration mismatch.
 */
export function useWordsPerMinute(): number {
  return useSyncExternalStore(useAppStore.subscribe, getSnapshot, getServerSnapshot);
}
