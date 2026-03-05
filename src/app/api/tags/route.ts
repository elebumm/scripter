import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { listTags, createTag } from "@/lib/db/queries/tags";

export async function GET() {
  ensureDb();
  return NextResponse.json(listTags());
}

export async function POST(req: Request) {
  ensureDb();
  const { name, color } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const tag = createTag(name.trim(), color);
  return NextResponse.json(tag);
}
