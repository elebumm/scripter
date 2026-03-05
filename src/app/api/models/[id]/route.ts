import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  updateCustomModel,
  deleteCustomModel,
} from "@/lib/db/queries/models";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const body = await req.json();
  const updated = updateCustomModel(Number(id), body);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  deleteCustomModel(Number(id));
  return NextResponse.json({ ok: true });
}
