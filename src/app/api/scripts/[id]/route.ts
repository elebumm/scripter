import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBackupsRoot } from "@/lib/db";
import { ensureDb } from "@/lib/db/init";
import {
  MAX_CONTENT_LENGTH,
  buildScriptExport,
  deleteScript,
  getScript,
  getScriptDetail,
  isScriptEmpty,
  updateScript,
  withoutDraft,
  writeScriptExport,
} from "@/lib/db/queries/scripts";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function notFound() {
  return NextResponse.json({ error: "Script not found" }, { status: 404 });
}

const patchSchema = z
  .object({
    title: z.string().max(300),
    context: z.string().max(50_000),
    targetLength: z.number().int().min(0).max(100_000).nullable(),
    draftContent: z.string().max(MAX_CONTENT_LENGTH),
    archived: z.boolean(),
    icon: z.string().max(64).nullable(),
  })
  .partial()
  .strict();

/** ScriptDetail: the script, its latest version, and the text to edit. */
export async function GET(_req: Request, { params }: Params) {
  const id = parseId((await params).id);
  if (id === null) return notFound();
  ensureDb();
  const detail = getScriptDetail(id);
  return detail ? NextResponse.json(detail) : notFound();
}

/** Partial update; `draftContent` is the autosave target (versions are never edited). */
export async function PATCH(req: Request, { params }: Params) {
  const id = parseId((await params).id);
  if (id === null) return notFound();
  ensureDb();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return NextResponse.json({ error: `Invalid update: ${where}${issue?.message ?? "bad body"}` }, { status: 400 });
  }
  if (!getScript(id)) return notFound();
  const updated = updateScript(id, parsed.data);
  return updated ? NextResponse.json(withoutDraft(updated)) : notFound();
}

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Permanent delete of the script and all its data. Only archived (or empty)
 * scripts can be deleted, and a Markdown copy is written to
 * <backups>/deleted/ first; if that copy fails, nothing is deleted.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const id = parseId((await params).id);
  if (id === null) return notFound();
  ensureDb();
  const script = getScript(id);
  if (!script) return notFound();
  if (!script.archived && !isScriptEmpty(id)) {
    return NextResponse.json(
      { error: "Archive this script before deleting it permanently." },
      { status: 409 }
    );
  }

  let savedTo: string | null = null;
  try {
    const exp = buildScriptExport(id);
    if (exp) {
      const now = new Date();
      savedTo = writeScriptExport(path.join(getBackupsRoot(), "deleted"), {
        ...exp,
        dirName: `${stamp(now)}-${exp.dirName}`,
      });
    }
  } catch (err) {
    console.error(`[scripts] safety copy before deleting script ${id} failed:`, err);
    return NextResponse.json(
      { error: "Couldn't save a safety copy of this script, so it was not deleted." },
      { status: 500 }
    );
  }

  deleteScript(id);
  return NextResponse.json({ ok: true, savedTo });
}
