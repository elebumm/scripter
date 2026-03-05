// Electron IPC API exposed via contextBridge in preload.ts

import type {
  Script,
  ScriptVersion,
  EvaluationProfile,
  CustomModel,
  Suggestion,
} from "./index";

export interface ScripterAPI {
  isElectron: true;

  scripts: {
    list: () => Promise<Script[]>;
    get: (id: number) => Promise<{ script: Script | null; latestVersion: ScriptVersion | null }>;
    create: (title: string, content: string, options?: { context?: string; targetLength?: number }) => Promise<Script>;
    update: (
      id: number,
      data: {
        title?: string;
        context?: string;
        targetLength?: number | null;
        content?: string;
        status?: string;
      }
    ) => Promise<Script>;
    delete: (id: number) => Promise<{ ok: true }>;
    getVersions: (scriptId: number) => Promise<ScriptVersion[]>;
    createVersion: (scriptId: number, content: string) => Promise<ScriptVersion>;
  };

  profiles: {
    list: () => Promise<EvaluationProfile[]>;
    get: (id: number) => Promise<EvaluationProfile | undefined>;
    create: (data: {
      name: string;
      systemPrompt: string;
      criteriaWeights?: string;
      isDefault?: boolean;
    }) => Promise<EvaluationProfile>;
    update: (
      id: number,
      data: {
        name?: string;
        systemPrompt?: string;
        criteriaWeights?: string;
        isDefault?: boolean;
      }
    ) => Promise<EvaluationProfile>;
    delete: (id: number) => Promise<{ ok: true }>;
  };

  models: {
    list: () => Promise<CustomModel[]>;
    create: (data: {
      name: string;
      provider: "openrouter" | "ollama";
      modelId: string;
      baseUrl?: string | null;
      isActive?: boolean;
    }) => Promise<CustomModel>;
    update: (
      id: number,
      data: {
        name?: string;
        provider?: "openrouter" | "ollama";
        modelId?: string;
        baseUrl?: string | null;
        isActive?: boolean;
      }
    ) => Promise<CustomModel>;
    delete: (id: number) => Promise<{ ok: true }>;
  };

  suggestions: {
    get: (scriptId: number, versionId: number) => Promise<Suggestion[]>;
    update: (id: number, status: "accepted" | "dismissed") => Promise<Suggestion | null>;
  };

  config: {
    getApiKey: () => Promise<string>;
    setApiKey: (key: string) => Promise<void>;
    hasApiKey: () => Promise<boolean>;
  };

  // Streaming IPC (Phase 3)
  evaluate?: {
    run: (
      params: {
        scriptContent: string;
        scriptContext?: string;
        sectionOnly?: string;
        scriptStatus?: string;
        modelId: string;
        modelProvider: string;
        modelBaseUrl?: string;
        profilePrompt?: string;
        scriptId: number;
        versionId: number;
        profileId?: number | null;
      },
      onChunk: (chunk: string) => void
    ) => Promise<{ text: string }>;
    abort: () => Promise<void>;
  };

  kickoff?: {
    run: (
      params: {
        concept: string;
        themes?: string;
        targetLength: number;
        tone?: string;
      },
      onChunk: (chunk: string) => void
    ) => Promise<{ text: string }>;
    abort: () => Promise<void>;
  };

  summarize?: {
    run: (
      params: {
        scriptContent: string;
        evaluations: Array<{ modelName: string; result: string }>;
        scriptId: number;
        versionId: number;
        scriptStatus?: string;
      },
      onChunk: (chunk: string) => void
    ) => Promise<{ text: string }>;
  };

  // Menu action listener (Phase 4)
  onMenuAction: (callback: (action: string) => void) => () => void;

  // File system (Phase 5)
  files?: {
    open: () => Promise<{ scriptId: number; filePath: string } | null>;
    openPath: (path: string) => Promise<{ scriptId: number; filePath: string } | null>;
    save: (scriptId: number) => Promise<boolean>;
    saveAs: (scriptId: number) => Promise<string | null>;
    getRecent: () => Promise<string[]>;
  };

  onFileExternalChange?: (
    callback: (scriptId: number, newContent: string) => void
  ) => () => void;
}

declare global {
  interface Window {
    scripterAPI?: ScripterAPI;
  }
}
