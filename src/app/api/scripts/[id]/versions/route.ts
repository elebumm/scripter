import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import {
  MAX_CONTENT_LENGTH,
  getLatestVersion,
  getScript,
  getScriptVersions,
  saveVersion,
} from "@/lib/db/queries/scripts";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function notFound() {
  return NextResponse.json({ error: "Script not found" }, { status: 404 });
}

const saveSchema = z.object({ content: z.string().max(MAX_CONTENT_LENGTH) });

/** All versions, newest first. */
export async function GET(_req: Request, { params }: Params) {
  const id = parseId((await params).id);
  if (id === null) return notFound();
  ensureDb();
  if (!getScript(id)) return notFound();
  return NextResponse.json(getScriptVersions(id));
}

/**
 * Snapshot the writer's text as a new immutable version, unless it is
 * identical to the latest version (then that one is returned, created=false).
 */
export async function POST(req: Request, { params }: Params) {
  const id = parseId((await params).id);
  if (id === null) return notFound();
  ensureDb();
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { content: string }" }, { status: 400 });
  }
  const { content } = parsed.data;
  if (!getScript(id)) return notFound();
  if (content.trim() === "" && !getLatestVersion(id)) {
    return NextResponse.json({ error: "Nothing to save yet: the script is empty." }, { status: 400 });
  }
  const result = saveVersion(id, content);
  return result ? NextResponse.json(result) : notFound();
}
