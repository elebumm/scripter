import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUILT_IN_MODELS } from "@/types";

const CURRENT_DEFAULT_IDS = BUILT_IN_MODELS.filter((m) => m.isActive).map((m) => m.id);
const ALL_KNOWN_IDS = new Set(BUILT_IN_MODELS.map((m) => m.id));

interface AppState {
  // Active script
  currentScriptId: number | null;
  setCurrentScriptId: (id: number | null) => void;

  // Editor mode
  editorMode: "wysiwyg" | "markdown";
  setEditorMode: (mode: "wysiwyg" | "markdown") => void;

  // Active models (built-in IDs)
  activeModelIds: string[];
  toggleModel: (id: string) => void;
  setActiveModelIds: (ids: string[]) => void;

  // Selected profile
  selectedProfileId: number | null;
  setSelectedProfileId: (id: number | null) => void;

  // Selected section for section-level eval
  selectedSection: string | null;
  setSelectedSection: (section: string | null) => void;

  // Script list sidebar
  scriptListOpen: boolean;
  setScriptListOpen: (open: boolean) => void;

  // Evaluation drawer
  evalDrawerOpen: boolean;
  setEvalDrawerOpen: (open: boolean) => void;

  // Fact check
  factCheckDrawerView: "eval" | "factcheck";
  setFactCheckDrawerView: (view: "eval" | "factcheck") => void;

  // Script search & filter (non-persisted)
  scriptSearchQuery: string;
  setScriptSearchQuery: (query: string) => void;
  scriptFilterTagIds: number[];
  toggleScriptFilterTag: (id: number) => void;
  scriptSortBy: "updatedAt" | "title" | "status";
  setScriptSort: (sort: "updatedAt" | "title" | "status") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentScriptId: null,
      setCurrentScriptId: (id) => set({ currentScriptId: id }),

      editorMode: "wysiwyg",
      setEditorMode: (mode) => set({ editorMode: mode }),

      activeModelIds: ["claude-sonnet", "gpt-5", "gemini-3", "grok-4", "deepseek-v3"],
      toggleModel: (id) =>
        set((state) => ({
          activeModelIds: state.activeModelIds.includes(id)
            ? state.activeModelIds.filter((m) => m !== id)
            : [...state.activeModelIds, id],
        })),
      setActiveModelIds: (ids) => set({ activeModelIds: ids }),

      selectedProfileId: null,
      setSelectedProfileId: (id) => set({ selectedProfileId: id }),

      selectedSection: null,
      setSelectedSection: (section) => set({ selectedSection: section }),

      scriptListOpen: false,
      setScriptListOpen: (open) => set({ scriptListOpen: open }),

      evalDrawerOpen: false,
      setEvalDrawerOpen: (open) => set({ evalDrawerOpen: open }),

      factCheckDrawerView: "eval",
      setFactCheckDrawerView: (view) => set({ factCheckDrawerView: view }),

      scriptSearchQuery: "",
      setScriptSearchQuery: (query) => set({ scriptSearchQuery: query }),
      scriptFilterTagIds: [],
      toggleScriptFilterTag: (id) =>
        set((state) => ({
          scriptFilterTagIds: state.scriptFilterTagIds.includes(id)
            ? state.scriptFilterTagIds.filter((t) => t !== id)
            : [...state.scriptFilterTagIds, id],
        })),
      scriptSortBy: "updatedAt",
      setScriptSort: (sort) => set({ scriptSortBy: sort }),
    }),
    {
      name: "scripter-store",
      version: 2,
      partialize: (state) => ({
        currentScriptId: state.currentScriptId,
        editorMode: state.editorMode,
        activeModelIds: state.activeModelIds,
        selectedProfileId: state.selectedProfileId,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          // v0 → v1: model IDs changed. Reset any stale IDs to new defaults.
          const old = state.activeModelIds as string[] | undefined;
          if (!old || old.some((id) => !ALL_KNOWN_IDS.has(id))) {
            state.activeModelIds = CURRENT_DEFAULT_IDS;
          }
        }
        if (version < 2) {
          // v1 → v2: editor mode changed from edit/split/preview to wysiwyg/markdown
          state.editorMode = "wysiwyg";
        }
        return state;
      },
    }
  )
);
