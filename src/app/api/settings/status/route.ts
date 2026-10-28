import { NextResponse } from "next/server";
import { getAutoBackupsDir, getDbPath } from "@/lib/db";

// Read the environment per request, never at build time.
export const dynamic = "force-dynamic";

/** Whether the OpenRouter key is configured (never the key itself) and where data lives. */
export async function GET() {
  return NextResponse.json({
    hasApiKey: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    dbPath: getDbPath(),
    backupsDir: getAutoBackupsDir(),
  });
}
