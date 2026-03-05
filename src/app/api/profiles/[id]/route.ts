import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  getProfile,
  updateProfile,
  deleteProfile,
} from "@/lib/db/queries/profiles";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const profile = getProfile(Number(id));
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  const body = await req.json();
  const updated = updateProfile(Number(id), body);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  ensureDb();
  deleteProfile(Number(id));
  return NextResponse.json({ ok: true });
}
