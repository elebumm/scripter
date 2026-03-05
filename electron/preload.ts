import { contextBridge, ipcRenderer } from "electron";

let streamCounter = 0;

function nextChannelId() {
  return `stream-${++streamCounter}-${Date.now()}`;
}

contextBridge.exposeInMainWorld("scripterAPI", {
  isElectron: true,

  scripts: {
    list: () => ipcRenderer.invoke("scripts:list"),
    get: (id: number) => ipcRenderer.invoke("scripts:get", id),
    create: (title: string, content: string, options?: { context?: string; targetLength?: number }) =>
      ipcRenderer.invoke("scripts:create", title, content, options),
    update: (
      id: number,
      data: {
        title?: string;
        context?: string;
        targetLength?: number | null;
        content?: string;
      }
    ) => ipcRenderer.invoke("scripts:update", id, data),
    delete: (id: number) => ipcRenderer.invoke("scripts:delete", id),
    getVersions: (scriptId: number) =>
      ipcRenderer.invoke("scripts:getVersions", scriptId),
    createVersion: (scriptId: number, content: string) =>
      ipcRenderer.invoke("scripts:createVersion", scriptId, content),
  },

  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    get: (id: number) => ipcRenderer.invoke("profiles:get", id),
    create: (data: {
      name: string;
      systemPrompt: string;
      criteriaWeights?: string;
      isDefault?: boolean;
    }) => ipcRenderer.invoke("profiles:create", data),
    update: (
      id: number,
      data: {
        name?: string;
        systemPrompt?: string;
        criteriaWeights?: string;
        isDefault?: boolean;
      }
    ) => ipcRenderer.invoke("profiles:update", id, data),
    delete: (id: number) => ipcRenderer.invoke("profiles:delete", id),
  },

  models: {
    list: () => ipcRenderer.invoke("models:list"),
    create: (data: {
      name: string;
      provider: "openrouter" | "ollama";
      modelId: string;
      baseUrl?: string | null;
      isActive?: boolean;
    }) => ipcRenderer.invoke("models:create", data),
    update: (
      id: number,
      data: {
        name?: string;
        provider?: "openrouter" | "ollama";
        modelId?: string;
        baseUrl?: string | null;
        isActive?: boolean;
      }
    ) => ipcRenderer.invoke("models:update", id, data),
    delete: (id: number) => ipcRenderer.invoke("models:delete", id),
  },

  suggestions: {
    get: (scriptId: number, versionId: number) =>
      ipcRenderer.invoke("suggestions:get", scriptId, versionId),
    update: (id: number, status: "accepted" | "dismissed") =>
      ipcRenderer.invoke("suggestions:update", id, status),
  },

  config: {
    getApiKey: () => ipcRenderer.invoke("config:getApiKey"),
    setApiKey: (key: string) => ipcRenderer.invoke("config:setApiKey", key),
    hasApiKey: () => ipcRenderer.invoke("config:hasApiKey"),
  },

  evaluate: {
    run: (
      params: {
        scriptContent: string;
        scriptContext?: string;
        sectionOnly?: string;
        modelId: string;
        modelProvider: string;
        modelBaseUrl?: string;
        profilePrompt?: string;
        scriptId: number;
        versionId: number;
        profileId?: number | null;
      },
      onChunk: (chunk: string) => void
    ) => {
      const channelId = nextChannelId();

      // Listen for chunks on the unique channel
      const handler = (_event: unknown, chunk: string | null) => {
        if (chunk === null) {
          ipcRenderer.removeListener(channelId, handler);
        } else {
          onChunk(chunk);
        }
      };
      ipcRenderer.on(channelId, handler);

      return ipcRenderer.invoke("evaluate:run", params, channelId);
    },
    abort: () => ipcRenderer.invoke("evaluate:abort"),
  },

  summarize: {
    run: (
      params: {
        scriptContent: string;
        evaluations: Array<{ modelName: string; result: string }>;
        scriptId: number;
        versionId: number;
      },
      onChunk: (chunk: string) => void
    ) => {
      const channelId = nextChannelId();

      const handler = (_event: unknown, chunk: string | null) => {
        if (chunk === null) {
          ipcRenderer.removeListener(channelId, handler);
        } else {
          onChunk(chunk);
        }
      };
      ipcRenderer.on(channelId, handler);

      return ipcRenderer.invoke("summarize:run", params, channelId);
    },
  },

  kickoff: {
    run: (
      params: {
        concept: string;
        themes?: string;
        targetLength: number;
        tone?: string;
      },
      onChunk: (chunk: string) => void
    ) => {
      const channelId = nextChannelId();

      const handler = (_event: unknown, chunk: string | null) => {
        if (chunk === null) {
          ipcRenderer.removeListener(channelId, handler);
        } else {
          onChunk(chunk);
        }
      };
      ipcRenderer.on(channelId, handler);

      return ipcRenderer.invoke("kickoff:run", params, channelId);
    },
    abort: () => ipcRenderer.invoke("kickoff:abort"),
  },

  files: {
    open: () => ipcRenderer.invoke("files:open"),
    openPath: (path: string) => ipcRenderer.invoke("files:openPath", path),
    save: (scriptId: number) => ipcRenderer.invoke("files:save", scriptId),
    saveAs: (scriptId: number) => ipcRenderer.invoke("files:saveAs", scriptId),
    getRecent: () => ipcRenderer.invoke("files:getRecent"),
  },

  // Menu action listener for keyboard shortcuts
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on("menu-action", handler);
    return () => ipcRenderer.removeListener("menu-action", handler);
  },

  // External file change listener
  onFileExternalChange: (
    callback: (scriptId: number, newContent: string) => void
  ) => {
    const handler = (
      _event: unknown,
      scriptId: number,
      newContent: string
    ) => callback(scriptId, newContent);
    ipcRenderer.on("file:external-change", handler);
    return () =>
      ipcRenderer.removeListener("file:external-change", handler);
  },
});
