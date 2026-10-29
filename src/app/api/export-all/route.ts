import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getExportsDir } from "@/lib/db";
import { ensureDb, localDayStamp } from "@/lib/db/init";
import { buildScriptExport, listExportableScriptIds, writeScriptExport } from "@/lib/db/queries/scripts";

/**
 * Write every script (archived included) as Markdown to
 * data/exports/YYYY-MM-DD/<id>-<slug>/{script.md, versions/v001.md…, notes.md, beats.md}.
 * Re-running on the same day replaces that day's folder, so a renamed or
 * deleted script leaves no stale folder behind. The export is built in a
 * sibling temp folder and swapped in only once every script is written; a
 * failed run leaves the previous folder as it was.
 */
export async function POST() {
  ensureDb();
  const folder = path.join(getExportsDir(), localDayStamp());
  const stamp = `${process.pid}-${Date.now()}`;
  const tmp = `${folder}.tmp-${stamp}`;
  const now = new Date();
  let scripts = 0;
  try {
    fs.mkdirSync(tmp, { recursive: true });
    for (const id of listExportableScriptIds()) {
      const exp = buildScriptExport(id, now);
      if (!exp) continue;
      writeScriptExport(tmp, exp);
      scripts++;
    }
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error("[export-all] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Export failed after ${scripts} scripts: ${message}` }, { status: 500 });
  }

  try {
    replaceFolder(folder, tmp, `${folder}.old-${stamp}`);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error("[export-all] couldn't replace the day's folder:", err);
    return NextResponse.json(
      { error: `Couldn't replace ${folder}. Close any window or program using it and export again.` },
      { status: 500 }
    );
  }
  return NextResponse.json({ folder, path: folder, scripts });
}

/** Move `next` to `folder`, keeping the old folder until the move succeeded. */
function replaceFolder(folder: string, next: string, aside: string): void {
  const hadFolder = fs.existsSync(folder);
  if (hadFolder) fs.renameSync(folder, aside);
  try {
    fs.renameSync(next, folder);
  } catch (err) {
    if (hadFolder) fs.renameSync(aside, folder);
    throw err;
  }
  if (hadFolder) {
    try {
      fs.rmSync(aside, { recursive: true, force: true });
    } catch (err) {
      console.error(`[export-all] couldn't remove the previous export at ${aside}:`, err);
    }
  }
}
