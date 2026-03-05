import { ipcMain } from "electron";
import {
  getSuggestionsForVersion,
  updateSuggestionStatus,
} from "@/lib/db/queries/suggestions";

export function registerSuggestionsHandlers() {
  ipcMain.handle(
    "suggestions:get",
    (_event, scriptId: number, versionId: number) => {
      const rows = getSuggestionsForVersion(scriptId, versionId);
      return rows.map((row) => ({
        ...row,
        sourceModels: JSON.parse(row.sourceModels) as string[],
      }));
    }
  );

  ipcMain.handle(
    "suggestions:update",
    (_event, id: number, status: "accepted" | "dismissed") => {
      const updated = updateSuggestionStatus(id, status);
      if (!updated) return null;
      return {
        ...updated,
        sourceModels: JSON.parse(updated.sourceModels) as string[],
      };
    }
  );
}
