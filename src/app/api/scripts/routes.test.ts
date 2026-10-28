import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real migrations on a temp DB; the persona/template seed is owned elsewhere.
vi.mock("@/lib/db/migrate", async () => {
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { getDb } = await import("@/lib/db/index");
  const nodePath = await import("path");
  return {
    runMigrations: () => migrate(getDb(), { migrationsFolder: nodePath.join(process.cwd(), "drizzle") }),
    seedDefaults: () => {},
  };
});

import { backupScopeName, closeDb, getSqlite } from "@/lib/db/index";
import { ensureDb } from "@/lib/db/init";
import { createScript } from "@/lib/db/queries/scripts";
import * as scriptsRoute from "./route";
import * as scriptRoute from "./[id]/route";
import * as versionsRoute from "./[id]/versions/route";
import * as templatesRoute from "../templates/route";
import * as exportAllRoute from "../export-all/route";
import * as statusRoute from "../settings/status/route";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-routes-test-"));

beforeAll(() => {
  process.env.SCRIPTER_DB_PATH = path.join(tmp, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(tmp, "backups");
  ensureDb();
});

afterAll(() => {
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function json(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("/api/scripts", () => {
  it("creates an untitled, empty script with the brief as context", async () => {
    const res = await scriptsRoute.POST(json("POST", "/api/scripts", { context: "Concept: SQLite" }));
    expect(res.status).toBe(200);
    const script = await res.json();
    expect(script).toMatchObject({ title: "", context: "Concept: SQLite", currentVersion: 0 });
    expect(script).not.toHaveProperty("draftContent");

    const list = await (await scriptsRoute.GET(new Request("http://localhost:3000/api/scripts"))).json();
    expect(list.find((s: { id: number }) => s.id === script.id)).toMatchObject({ spokenWords: 0, lastScore: null });
  });

  it("rejects a malformed body", async () => {
    const res = await scriptsRoute.POST(json("POST", "/api/scripts", { title: 42 }));
    expect(res.status).toBe(400);
  });
});

describe("/api/scripts/[id]", () => {
  it("returns ScriptDetail with the draft as content", async () => {
    const { id } = createScript("Detail", "Saved text.");
    await scriptRoute.PATCH(json("PATCH", `/api/scripts/${id}`, { draftContent: "Draft text." }), params(id));
    const detail = await (await scriptRoute.GET(json("GET", `/api/scripts/${id}`), params(id))).json();
    expect(detail.content).toBe("Draft text.");
    expect(detail.latestVersion.content).toBe("Saved text.");
    expect(detail.script).not.toHaveProperty("draftContent");
  });

  it("validates PATCH strictly and never writes versions", async () => {
    const { id } = createScript("Patch", "Original.");
    const bad = await scriptRoute.PATCH(json("PATCH", `/api/scripts/${id}`, { content: "overwrite" }), params(id));
    expect(bad.status).toBe(400);
    const ok = await scriptRoute.PATCH(
      json("PATCH", `/api/scripts/${id}`, { title: "New", targetLength: 1600, icon: null, draftContent: "Changed." }),
      params(id)
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ title: "New", targetLength: 1600 });
    expect(getSqlite().prepare("SELECT content FROM script_versions WHERE script_id = ?").all(id)).toEqual([{ content: "Original." }]);
  });

  it("404s on unknown or malformed ids", async () => {
    expect((await scriptRoute.GET(json("GET", "/api/scripts/999999"), params(999999))).status).toBe(404);
    expect((await scriptRoute.GET(json("GET", "/api/scripts/abc"), params("abc"))).status).toBe(404);
    expect((await scriptRoute.PATCH(json("PATCH", "/api/scripts/999999", { title: "x" }), params(999999))).status).toBe(404);
  });

  it("only deletes archived (or empty) scripts, after writing a safety copy", async () => {
    const { id } = createScript("Precious", "Words worth keeping.");
    const refused = await scriptRoute.DELETE(json("DELETE", `/api/scripts/${id}`), params(id));
    expect(refused.status).toBe(409);
    expect(getSqlite().prepare("SELECT count(*) AS n FROM scripts WHERE id = ?").get(id)).toEqual({ n: 1 });

    await scriptRoute.PATCH(json("PATCH", `/api/scripts/${id}`, { archived: true }), params(id));
    const res = await scriptRoute.DELETE(json("DELETE", `/api/scripts/${id}`), params(id));
    expect(res.status).toBe(200);
    const { savedTo } = await res.json();
    expect(fs.readFileSync(path.join(savedTo, "script.md"), "utf8")).toContain("Words worth keeping.");
    expect(savedTo.startsWith(path.join(tmp, "backups", backupScopeName(), "deleted"))).toBe(true);
    expect(getSqlite().prepare("SELECT count(*) AS n FROM script_versions WHERE script_id = ?").get(id)).toEqual({ n: 0 });

    const empty = createScript("");
    expect((await scriptRoute.DELETE(json("DELETE", `/api/scripts/${empty.id}`), params(empty.id))).status).toBe(200);
    expect((await scriptRoute.DELETE(json("DELETE", `/api/scripts/${empty.id}`), params(empty.id))).status).toBe(404);
  });
});

describe("/api/scripts/[id]/versions", () => {
  it("creates a version only when content changes", async () => {
    const { id } = createScript("");
    const empty = await versionsRoute.POST(json("POST", `/api/scripts/${id}/versions`, { content: "  " }), params(id));
    expect(empty.status).toBe(400);

    const first = await (await versionsRoute.POST(json("POST", `/api/scripts/${id}/versions`, { content: "Take one." }), params(id))).json();
    expect(first).toMatchObject({ created: true, version: { version: 1, content: "Take one.", wordCount: 2 } });
    const same = await (await versionsRoute.POST(json("POST", `/api/scripts/${id}/versions`, { content: "Take one." }), params(id))).json();
    expect(same).toMatchObject({ created: false, version: { id: first.version.id } });
    const second = await (await versionsRoute.POST(json("POST", `/api/scripts/${id}/versions`, { content: "Take two." }), params(id))).json();
    expect(second).toMatchObject({ created: true, version: { version: 2 } });

    const list = await (await versionsRoute.GET(json("GET", `/api/scripts/${id}/versions`), params(id))).json();
    expect(list.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect((await versionsRoute.POST(json("POST", "/api/scripts/999999/versions", { content: "x" }), params(999999))).status).toBe(404);
  });
});

describe("/api/templates", () => {
  it("creates exactly one script from a template", async () => {
    const template = createScript("Short", "# [Title]\n\nHook.", { isTemplate: true, templateDescription: "60s" });
    const listed = await (await templatesRoute.GET()).json();
    expect(listed.map((t: { id: number }) => t.id)).toContain(template.id);

    const before = (getSqlite().prepare("SELECT count(*) AS n FROM scripts").get() as { n: number }).n;
    const res = await templatesRoute.POST(json("POST", "/api/templates", { templateId: template.id, title: "Mine" }));
    const created = await res.json();
    const after = (getSqlite().prepare("SELECT count(*) AS n FROM scripts").get() as { n: number }).n;
    expect(after - before).toBe(1);
    expect(created).toMatchObject({ title: "Mine", isTemplate: false });

    expect((await templatesRoute.POST(json("POST", "/api/templates", {}))).status).toBe(400);
    expect((await templatesRoute.POST(json("POST", "/api/templates", { templateId: 999999 }))).status).toBe(404);
  });
});

describe("/api/export-all and /api/settings/status", () => {
  it("exports every script, archived included", async () => {
    const { id } = createScript("Archived export", "Kept in the archive.");
    getSqlite().prepare("UPDATE scripts SET archived = 1 WHERE id = ?").run(id);
    const body = await (await exportAllRoute.POST()).json();
    expect(body.scripts).toBeGreaterThan(0);
    expect(body.folder).toBe(body.path);
    expect(body.folder.startsWith(path.join(tmp, "data", "exports"))).toBe(true);
    const dir = fs.readdirSync(body.folder).find((d) => d.startsWith(`${id}-`))!;
    expect(fs.readFileSync(path.join(body.folder, dir, "versions", "v001.md"), "utf8")).toContain("Kept in the archive.");
  });

  it("replaces the day's folder: no stale folder after a rename or a delete", async () => {
    const renamed = createScript("Morning title", "Morning draft.");
    const doomed = createScript("Doomed", "Gone soon.");
    const first = await (await exportAllRoute.POST()).json();
    const before = fs.readdirSync(first.folder);
    expect(before).toEqual(expect.arrayContaining([`${renamed.id}-morning-title`, `${doomed.id}-doomed`]));

    await scriptRoute.PATCH(json("PATCH", `/api/scripts/${renamed.id}`, { title: "Evening title" }), params(renamed.id));
    await scriptRoute.PATCH(json("PATCH", `/api/scripts/${doomed.id}`, { archived: true }), params(doomed.id));
    expect((await scriptRoute.DELETE(json("DELETE", `/api/scripts/${doomed.id}`), params(doomed.id))).status).toBe(200);

    const second = await (await exportAllRoute.POST()).json();
    expect(second.folder).toBe(first.folder);
    const after = fs.readdirSync(second.folder);
    expect(after).toContain(`${renamed.id}-evening-title`);
    expect(after).not.toContain(`${renamed.id}-morning-title`);
    expect(after.some((d) => d.startsWith(`${doomed.id}-`))).toBe(false);
    expect(after).toHaveLength(second.scripts);
    // No temp or set-aside folders are left next to the day's folder.
    expect(fs.readdirSync(path.dirname(second.folder)).filter((d) => d !== path.basename(second.folder))).toEqual([]);
  });

  it("reports key presence without the key", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-test-value";
    try {
      const body = await (await statusRoute.GET()).json();
      expect(body).toEqual({
        hasApiKey: true,
        dbPath: path.join(tmp, "data", "scripter.db"),
        backupsDir: path.join(tmp, "backups", backupScopeName(), "auto"),
      });
      expect(JSON.stringify(body)).not.toContain("sk-or-test-value");
    } finally {
      if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previous;
    }
  });
});
