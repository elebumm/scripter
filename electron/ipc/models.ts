import { ipcMain } from "electron";
import {
  listCustomModels,
  createCustomModel,
  updateCustomModel,
  deleteCustomModel,
} from "@/lib/db/queries/models";

export function registerModelsHandlers() {
  ipcMain.handle("models:list", () => {
    return listCustomModels();
  });

  ipcMain.handle(
    "models:create",
    (
      _event,
      data: {
        name: string;
        provider: "openrouter" | "ollama";
        modelId: string;
        baseUrl?: string | null;
        isActive?: boolean;
      }
    ) => {
      return createCustomModel(data);
    }
  );

  ipcMain.handle(
    "models:update",
    (
      _event,
      id: number,
      data: {
        name?: string;
        provider?: "openrouter" | "ollama";
        modelId?: string;
        baseUrl?: string | null;
        isActive?: boolean;
      }
    ) => {
      return updateCustomModel(id, data);
    }
  );

  ipcMain.handle("models:delete", (_event, id: number) => {
    deleteCustomModel(id);
    return { ok: true };
  });
}
