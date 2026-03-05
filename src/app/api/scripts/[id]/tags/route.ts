import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  getTagsForScript,
  setTagsForScript,
  addTagToScript,
} from "@/lib/db/queries/tags";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  return NextResponse.json(getTagsForScript(Number(id)));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const { tagIds } = await req.json();
  setTagsForScript(Number(id), tagIds);
  return NextResponse.json({ ok: true });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const { tagId } = await req.json();
  addTagToScript(Number(id), tagId);
  return NextResponse.json({ ok: true });
}
