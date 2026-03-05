import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  getScriptVersions,
  createVersion,
  getScript,
} from "@/lib/db/queries/scripts";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const versions = getScriptVersions(Number(id));
  return NextResponse.json(versions);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const body = await req.json();
  const script = getScript(Number(id));
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
  const nextVersion = script.currentVersion + 1;
  const version = createVersion(Number(id), body.content, nextVersion);
  return NextResponse.json(version);
}
