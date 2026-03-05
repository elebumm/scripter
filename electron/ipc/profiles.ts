import { ipcMain } from "electron";
import {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
} from "@/lib/db/queries/profiles";

export function registerProfilesHandlers() {
  ipcMain.handle("profiles:list", () => {
    return listProfiles();
  });

  ipcMain.handle("profiles:get", (_event, id: number) => {
    return getProfile(id);
  });

  ipcMain.handle(
    "profiles:create",
    (
      _event,
      data: {
        name: string;
        systemPrompt: string;
        criteriaWeights?: string;
        isDefault?: boolean;
      }
    ) => {
      return createProfile(data);
    }
  );

  ipcMain.handle(
    "profiles:update",
    (
      _event,
      id: number,
      data: {
        name?: string;
        systemPrompt?: string;
        criteriaWeights?: string;
        isDefault?: boolean;
      }
    ) => {
      return updateProfile(id, data);
    }
  );

  ipcMain.handle("profiles:delete", (_event, id: number) => {
    deleteProfile(id);
    return { ok: true };
  });
}
