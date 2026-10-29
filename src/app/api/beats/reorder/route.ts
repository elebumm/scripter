import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { reorderBeats } from "@/lib/db/queries/beats";
import { jsonError } from "@/lib/stream/ndjson";

const schema = z.object({
  scriptId: z.number().int().positive(),
  orderedIds: z.array(z.number().int().positive()).max(500),
});

/**
 * POST /api/beats/reorder {scriptId, orderedIds} → Beat[]
 * Positions become 0..n-1 in the given order; ids from other scripts are
 * ignored and beats missing from the list keep their relative order at the end.
 */
export async function POST(req: NextRequest) {
  ensureDb();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid reorder request");
  return NextResponse.json(reorderBeats(parsed.data.scriptId, parsed.data.orderedIds));
}
