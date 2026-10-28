// The persona editor's client limits must match PATCH /api/profiles/:id:
// whatever validatePersonaDraft accepts the server saves, and whatever the
// server rejects the editor catches first (so the writer never sees raw zod
// output). Runs the real route against a fresh temp SQLite file.

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERSONA_LIMITS, validatePersonaDraft, type PersonaDraft } from "./settings-utils";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-persona-limits-"));
let personaId = 0;
let modelSlug = "";
let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

beforeAll(async () => {
  process.env.SCRIPTER_DB_PATH = path.join(dir, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "backups");
  const { getDbPath } = await import("@/lib/db/index");
  if (getDbPath() !== path.resolve(dir, "data", "scripter.db")) throw new Error("DB path override not honoured");
  const { ensureDb } = await import("@/lib/db/init");
  ensureDb();
  const { listPersonas } = await import("@/lib/db/queries/profiles");
  const first = listPersonas()[0];
  personaId = first.id;
  modelSlug = first.modelSlug;
  ({ PATCH } = await import("@/app/api/profiles/[id]/route"));
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/index");
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function save(draft: PersonaDraft): Promise<number> {
  const res = await PATCH(
    new Request(`http://localhost/api/profiles/${personaId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, name: draft.name.trim(), description: draft.description.trim(), systemPrompt: draft.systemPrompt.trim() }),
    }),
    { params: Promise.resolve({ id: String(personaId) }) }
  );
  return res.status;
}

describe("persona limits", () => {
  it("accepts exactly what the server accepts", async () => {
    const ok: PersonaDraft = { name: "Story Architect", description: "", systemPrompt: "x".repeat(40), modelSlug };
    const drafts: PersonaDraft[] = [
      ok,
      { ...ok, name: "n".repeat(PERSONA_LIMITS.nameMax) },
      { ...ok, name: "n".repeat(PERSONA_LIMITS.nameMax + 1) },
      { ...ok, description: "d".repeat(PERSONA_LIMITS.descriptionMax) },
      { ...ok, description: "d".repeat(PERSONA_LIMITS.descriptionMax + 1) },
      { ...ok, systemPrompt: "p".repeat(PERSONA_LIMITS.promptMin) },
      { ...ok, systemPrompt: "Be blunt." },
      { ...ok, systemPrompt: `   ${"p".repeat(PERSONA_LIMITS.promptMin - 1)}   ` },
      { ...ok, systemPrompt: "p".repeat(PERSONA_LIMITS.promptMax) },
      { ...ok, systemPrompt: "p".repeat(PERSONA_LIMITS.promptMax + 1) },
    ];
    for (const draft of drafts) {
      const clientOk = validatePersonaDraft(draft, [modelSlug]) === null;
      const status = await save(draft);
      expect({ clientOk, serverOk: status === 200 }, JSON.stringify({ ...draft, systemPrompt: draft.systemPrompt.length })).toEqual({
        clientOk,
        serverOk: clientOk,
      });
    }
  });
});
