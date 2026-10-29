import type { Note, NoteStatus } from "@/types/review";
import { getJson, sendJson, qs } from "./http";

/**
 * Notes for a script from its most recent council run (all statuses), so the
 * editor can show them as soon as the script opens.
 */
export function listNotes(scriptId: number) {
  return getJson<Note[]>(`/api/notes${qs({ scriptId })}`);
}

export function setNoteStatus(id: number, status: NoteStatus) {
  return sendJson<Note>(`/api/notes/${id}`, "PATCH", { status });
}
