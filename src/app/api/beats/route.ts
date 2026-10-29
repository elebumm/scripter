import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { getLatestVersion, getScript } from "@/lib/db/queries/scripts";
import { createBeat, listBeats, replaceAiBeats } from "@/lib/db/queries/beats";
import { guardAiBeat, writerBeatMaterial, writerMaterialKey } from "@/lib/llm/beats";
import { jsonError } from "@/lib/stream/ndjson";

const id = z.coerce.number().int().positive();
const title = z.string().trim().min(1, "title is required").max(200);
const purpose = z.string().max(2000);
const targetSeconds = z.number().int().min(1).max(7200).nullable();

const createSchema = z.object({
  scriptId: id,
  title,
  purpose: purpose.optional(),
  targetSeconds: targetSeconds.optional(),
  position: z.number().int().min(0).optional(),
  source: z.enum(["ai", "writer"]).optional(),
});

const replaceSchema = z.object({
  scriptId: id,
  beats: z
    .array(z.object({ title, purpose: purpose.optional().default(""), targetSeconds: targetSeconds.optional() }))
    .max(40),
});

type ScriptRow = NonNullable<ReturnType<typeof getScript>>;

/** What AI beats may quote: the title, brief, draft, latest version and the writer's beats. */
function writerKeyFor(script: ScriptRow): string {
  return writerMaterialKey([
    script.title,
    script.context,
    script.draftContent,
    getLatestVersion(script.id)?.content,
    ...writerBeatMaterial(listBeats(script.id)),
  ]);
}

/** GET /api/beats?scriptId= → Beat[] in sheet order. */
export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = id.safeParse(req.nextUrl.searchParams.get("scriptId"));
  if (!scriptId.success) return jsonError("scriptId is required");
  return NextResponse.json(listBeats(scriptId.data));
}

/**
 * POST /api/beats {scriptId, title, purpose?, targetSeconds?, position?, source?} → Beat
 * An AI beat (source "ai") passes the wording guard again before it is saved.
 */
export async function POST(req: NextRequest) {
  ensureDb();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid beat");
  const { scriptId, ...data } = parsed.data;
  const script = getScript(scriptId);
  if (!script) return jsonError("Script not found", 404);
  if (data.source !== "ai") return NextResponse.json(createBeat(scriptId, data), { status: 201 });

  const guarded = guardAiBeat(data, writerKeyFor(script));
  if (!guarded) return jsonError("Nothing is left of this suggested beat once wording for the script is removed.", 422);
  return NextResponse.json(createBeat(scriptId, { ...data, ...guarded }), { status: 201 });
}

/**
 * PUT /api/beats {scriptId, beats} → Beat[]
 * "Use these beats": replaces the AI beats that are still planned; writer
 * beats (and AI beats already drafted or cut) are kept, new ones appended.
 * The new beats pass the wording guard again; ones left empty are skipped.
 */
export async function PUT(req: NextRequest) {
  ensureDb();
  const parsed = replaceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid beats");
  const { scriptId, beats } = parsed.data;
  const script = getScript(scriptId);
  if (!script) return jsonError("Script not found", 404);

  const writerKey = writerKeyFor(script);
  const kept = beats.flatMap((beat) => {
    const guarded = guardAiBeat(beat, writerKey);
    return guarded ? [{ ...beat, ...guarded }] : [];
  });
  if (beats.length > 0 && kept.length === 0) {
    return jsonError("Nothing is left of these suggested beats once wording for the script is removed.", 422);
  }
  return NextResponse.json(replaceAiBeats(scriptId, kept));
}
