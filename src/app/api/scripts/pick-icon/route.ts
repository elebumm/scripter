import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { db } from "@/lib/db";
import { scripts, scriptVersions } from "@/lib/db/schema";
import { eq, desc, isNull } from "drizzle-orm";
import { pickIconForScript } from "@/lib/llm/pick-icon";

/**
 * POST /api/scripts/pick-icon
 * Body: { scriptId: number } — picks icon for one script
 * Body: { backfill: true } — picks icons for all scripts missing one
 */
export async function POST(req: NextRequest) {
  await ensureDb();

  const body = await req.json();

  if (body.backfill) {
    // Backfill all scripts without an icon
    const scriptsWithoutIcon = db
      .select({ id: scripts.id, title: scripts.title })
      .from(scripts)
      .where(isNull(scripts.icon))
      .all();

    const results: { id: number; icon: string | null }[] = [];

    for (const s of scriptsWithoutIcon) {
      // Get content preview
      const ver = db
        .select({ content: scriptVersions.content })
        .from(scriptVersions)
        .where(eq(scriptVersions.scriptId, s.id))
        .orderBy(desc(scriptVersions.version))
        .limit(1)
        .get();

      const preview = ver?.content?.slice(0, 500) ?? "";
      const icon = await pickIconForScript(s.title, preview);

      if (icon) {
        db.update(scripts).set({ icon }).where(eq(scripts.id, s.id)).run();
      }

      results.push({ id: s.id, icon });
    }

    return NextResponse.json({ updated: results.length, results });
  }

  // Single script
  const { scriptId } = body;
  if (!scriptId) {
    return NextResponse.json({ error: "scriptId required" }, { status: 400 });
  }

  const script = db
    .select({ id: scripts.id, title: scripts.title })
    .from(scripts)
    .where(eq(scripts.id, scriptId))
    .get();

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const ver = db
    .select({ content: scriptVersions.content })
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, scriptId))
    .orderBy(desc(scriptVersions.version))
    .limit(1)
    .get();

  const preview = ver?.content?.slice(0, 500) ?? "";
  const icon = await pickIconForScript(script.title, preview);

  if (icon) {
    db.update(scripts).set({ icon }).where(eq(scripts.id, scriptId)).run();
  }

  return NextResponse.json({ scriptId, icon });
}
