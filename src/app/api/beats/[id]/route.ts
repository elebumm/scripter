import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { BEAT_STATUSES, deleteBeat, updateBeat } from "@/lib/db/queries/beats";
import { jsonError } from "@/lib/stream/ndjson";

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "title can't be empty").max(200),
    purpose: z.string().max(2000),
    writerNotes: z.string().max(10_000),
    status: z.enum(BEAT_STATUSES),
    targetSeconds: z.number().int().min(1).max(7200).nullable(),
  })
  .partial();

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH /api/beats/:id {title?, purpose?, writerNotes?, status?, targetSeconds?} → Beat */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureDb();
  const id = parseId((await params).id);
  if (!id) return jsonError("Invalid beat id");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid beat");
  const beat = updateBeat(id, parsed.data);
  if (!beat) return jsonError("Beat not found", 404);
  return NextResponse.json(beat);
}

/** DELETE /api/beats/:id → 204 (remaining beats are renumbered). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  ensureDb();
  const id = parseId((await params).id);
  if (!id) return jsonError("Invalid beat id");
  if (!deleteBeat(id)) return jsonError("Beat not found", 404);
  return new Response(null, { status: 204 });
}
