import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EditorMode = "wysiwyg" | "markdown";

/** Default speaking rate for runtime estimates (words per minute). */
export const DEFAULT_WORDS_PER_MINUTE = 155;
export const MIN_WORDS_PER_MINUTE = 60;
export const MAX_WORDS_PER_MINUTE = 300;

/** Clamp to a sane speaking rate; non-numbers fall back to the default. */
export function clampWordsPerMinute(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_WORDS_PER_MINUTE;
  return Math.min(MAX_WORDS_PER_MINUTE, Math.max(MIN_WORDS_PER_MINUTE, Math.round(n)));
}

interface AppState {
  /** WYSIWYG (Tiptap) or raw markdown textarea. */
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;

  /** The writer's speaking rate, used for every runtime estimate. */
  wordsPerMinute: number;
  setWordsPerMinute: (n: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      editorMode: "wysiwyg",
      setEditorMode: (mode) => set({ editorMode: mode }),

      wordsPerMinute: DEFAULT_WORDS_PER_MINUTE,
      setWordsPerMinute: (n) => set({ wordsPerMinute: clampWordsPerMinute(n) }),
    }),
    {
      name: "scripter-store",
      version: 6,
      partialize: (state) => ({
        editorMode: state.editorMode,
        wordsPerMinute: state.wordsPerMinute,
      }),
      // v6 drops everything the council/persona refresh replaced (active model
      // ids, selected profile, drawer and mode state); only the editor mode
      // carries over.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        const editorMode: EditorMode = old.editorMode === "markdown" ? "markdown" : "wysiwyg";
        return {
          editorMode,
          wordsPerMinute: clampWordsPerMinute(old.wordsPerMinute),
        };
      },
    }
  )
);
