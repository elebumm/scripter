import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { listScripts, createScript } from "@/lib/db/queries/scripts";
import { getTagsForScripts } from "@/lib/db/queries/tags";

export async function GET() {
  ensureDb();
  const scripts = listScripts();
  const scriptIds = scripts.map((s) => s.id);
  const tagsByScript = getTagsForScripts(scriptIds);
  const enriched = scripts.map((s) => ({
    ...s,
    tags: tagsByScript[s.id] ?? [],
  }));
  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const script = createScript(body.title ?? "Untitled Script", body.content ?? "", {
    context: body.context,
    targetLength: body.targetLength,
  });
  return NextResponse.json(script);
}
