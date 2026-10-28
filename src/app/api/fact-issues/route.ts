import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { getLatestGroundedFactCheck } from "@/lib/db/queries/fact-checks";
import { listFactNotesForCheck } from "@/lib/db/queries/fact-issues";
import { jsonError } from "@/lib/stream/ndjson";

/**
 * GET /api/fact-issues?scriptId= → FactNote[]
 * Notes from the script's latest completed grounded fact-check (any version;
 * the client marks stale ones). Legacy notes written without search are
 * never returned.
 */
export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = z.coerce.number().int().positive().safeParse(req.nextUrl.searchParams.get("scriptId"));
  if (!scriptId.success) return jsonError("scriptId is required");
  const latest = getLatestGroundedFactCheck(scriptId.data);
  return NextResponse.json(latest ? listFactNotesForCheck(latest.id) : []);
}
