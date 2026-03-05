import { ipcMain, safeStorage } from "electron";
import Store from "electron-store";

const store = new Store<{ encryptedApiKey?: string }>({
  name: "scripter-config",
});

export function registerConfigHandlers() {
  // Get API key (decrypted)
  ipcMain.handle("config:getApiKey", () => {
    const encrypted = store.get("encryptedApiKey");
    if (!encrypted) return process.env.OPENROUTER_API_KEY ?? "";

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = Buffer.from(encrypted, "base64");
        return safeStorage.decryptString(buf);
      } catch {
        return "";
      }
    }
    return "";
  });

  // Set API key (encrypted)
  ipcMain.handle("config:setApiKey", (_event, apiKey: string) => {
    if (!apiKey) {
      store.delete("encryptedApiKey");
      delete process.env.OPENROUTER_API_KEY;
      return;
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(apiKey);
      store.set("encryptedApiKey", encrypted.toString("base64"));
    }

    // Also set as env var so the LLM provider picks it up
    process.env.OPENROUTER_API_KEY = apiKey;
  });

  // Check if API key is configured
  ipcMain.handle("config:hasApiKey", () => {
    return !!(
      process.env.OPENROUTER_API_KEY || store.get("encryptedApiKey")
    );
  });
}

// Call this at startup to load the saved API key into env
export function loadApiKeyFromStore() {
  const encrypted = store.get("encryptedApiKey");
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      const buf = Buffer.from(encrypted, "base64");
      const key = safeStorage.decryptString(buf);
      if (key && !process.env.OPENROUTER_API_KEY) {
        process.env.OPENROUTER_API_KEY = key;
      }
    } catch {
      // Failed to decrypt — user will need to re-enter
    }
  }
}
