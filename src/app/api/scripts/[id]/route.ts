import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  getScript,
  updateScript,
  deleteScript,
} from "@/lib/db/queries/scripts";
import { getLatestVersion } from "@/lib/db/queries/scripts";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const script = getScript(Number(id));
  if (!script) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const latestVersion = getLatestVersion(Number(id));
  return NextResponse.json({ script, latestVersion });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const body = await req.json();

  // If content is provided, update the latest version content directly
  if (body.content !== undefined) {
    const { db } = await import("@/lib/db/index");
    const { scriptVersions } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const script = getScript(Number(id));
    if (script) {
      const wordCount = body.content.trim()
        ? body.content.trim().split(/\s+/).length
        : 0;
      db.update(scriptVersions)
        .set({ content: body.content, wordCount })
        .where(
          and(
            eq(scriptVersions.scriptId, Number(id)),
            eq(scriptVersions.version, script.currentVersion)
          )
        )
        .run();
    }
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.context !== undefined) data.context = body.context;
  if (body.targetLength !== undefined) data.targetLength = body.targetLength;
  if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length > 0) {
    const updated = updateScript(Number(id), data as { title?: string; context?: string; targetLength?: number | null; status?: string });
    return NextResponse.json(updated);
  }

  const script = getScript(Number(id));
  return NextResponse.json(script);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  deleteScript(Number(id));
  return NextResponse.json({ ok: true });
}
