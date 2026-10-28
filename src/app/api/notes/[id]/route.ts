import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { NOTE_STATUSES, updateNoteStatus } from "@/lib/db/queries/notes";
import { parseId } from "@/lib/llm/council";
import { jsonError } from "@/lib/stream/ndjson";

const bodySchema = z.object({ status: z.enum(NOTE_STATUSES) });

/** Mark a note open / addressed / dismissed. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureDb();
  const id = parseId((await params).id);
  if (!id) return jsonError("Invalid note id");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(`Invalid request: ${z.prettifyError(parsed.error)}`);
  const note = updateNoteStatus(id, parsed.data.status);
  if (!note) return jsonError("Note not found", 404);
  return Response.json(note);
}
