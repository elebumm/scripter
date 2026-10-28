import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { FACT_NOTE_STATUSES, setFactNoteStatus } from "@/lib/db/queries/fact-issues";
import { jsonError } from "@/lib/stream/ndjson";

const schema = z.object({ status: z.enum(FACT_NOTE_STATUSES) });

/** PATCH /api/fact-issues/:id {status: "pending" | "acknowledged" | "dismissed"} → FactNote */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureDb();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return jsonError("Invalid fact note id");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("status must be pending, acknowledged or dismissed");
  const note = setFactNoteStatus(id, parsed.data.status);
  if (!note) return jsonError("Fact note not found", 404);
  return NextResponse.json(note);
}
