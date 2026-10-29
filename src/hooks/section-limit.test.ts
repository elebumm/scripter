// The client's section limit must match the critique route's: a section the
// Consult menu and useCouncil.start allow is never rejected as an invalid
// request, and one they refuse would have been. Runs the real route against a
// fresh temp SQLite file (an unknown script, so it stops before any model call).

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_SECTION_CHARS } from "./useCouncil";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-section-limit-"));
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.SCRIPTER_DB_PATH = path.join(dir, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "backups");
  const { getDbPath } = await import("@/lib/db/index");
  if (getDbPath() !== path.resolve(dir, "data", "scripter.db")) throw new Error("DB path override not honoured");
  ({ POST } = await import("@/app/api/council/critique/route"));
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/index");
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function critique(sectionOnly: string): Promise<{ status: number; error: string }> {
  const res = await POST(
    new Request("http://localhost/api/council/critique", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scriptId: 999_999, versionId: 999_999, personaId: 1, runId: "section-limit-run", sectionOnly }),
    })
  );
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { status: res.status, error: body.error ?? "" };
}

describe("section review limit", () => {
  it("matches the critique route's sectionOnly limit", async () => {
    const atLimit = await critique("x".repeat(MAX_SECTION_CHARS));
    expect(atLimit.error).not.toMatch(/Invalid request/);
    expect(atLimit.status).toBe(404); // got past validation to the (unknown) script

    const over = await critique("x".repeat(MAX_SECTION_CHARS + 1));
    expect(over.status).toBe(400);
    expect(over.error).toMatch(/Invalid request/);
  });
});
