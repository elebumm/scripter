import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { updateTag, deleteTag } from "@/lib/db/queries/tags";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const data = await req.json();
  const tag = updateTag(Number(id), data);
  return NextResponse.json(tag);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  deleteTag(Number(id));
  return NextResponse.json({ ok: true });
}
