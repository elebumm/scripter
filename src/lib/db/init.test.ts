import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it, vi } from "vitest";

// Isolate the infra from the seed/migration content (owned elsewhere).
const migrateMock = vi.hoisted(() => ({ runMigrations: vi.fn(), seedDefaults: vi.fn() }));
vi.mock("./migrate", () => migrateMock);

import {
  DAILY_SNAPSHOTS_KEPT,
  PRE_MIGRATION_SNAPSHOTS_KEPT,
  dailySnapshotName,
  ensureDb,
  localDayStamp,
  pendingMigrationCount,
  preMigrationDirs,
  pruneSnapshots,
  snapshotBeforeMigrations,
  takeDailySnapshot,
} from "./init";
import { backupScopeName, closeDb, getAutoBackupsDir, getBackupsRoot, getLocalBackupsRoot, getSqlite } from "./index";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-init-test-"));
let n = 0;
function freshDir(): string {
  const dir = path.join(tmp, `case-${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dbWithRows(file: string): Database.Database {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec("CREATE TABLE scripts (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO scripts (title) VALUES ('a'), ('b');");
  return sqlite;
}

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("snapshot naming", () => {
  it("uses the local calendar day", () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(localDayStamp(d)).toBe("2026-01-05");
    expect(dailySnapshotName(d)).toBe("scripter-2026-01-05.db");
  });
});

describe("takeDailySnapshot", () => {
  it("writes a self-contained copy once per day", () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    const backups = path.join(dir, "auto");
    const day = new Date(2026, 9, 27, 9, 0);

    const first = takeDailySnapshot(sqlite, backups, day);
    expect(first).toBe(path.join(backups, "scripter-2026-10-27.db"));
    const copy = new Database(first!, { readonly: true });
    expect((copy.prepare("SELECT count(*) AS n FROM scripts").get() as { n: number }).n).toBe(2);
    copy.close();
    expect(fs.existsSync(`${first}-wal`)).toBe(false);

    expect(takeDailySnapshot(sqlite, backups, new Date(2026, 9, 27, 18, 0))).toBeNull();
    expect(fs.readdirSync(backups)).toEqual(["scripter-2026-10-27.db"]);
    sqlite.close();
  });

  it(`keeps the newest ${DAILY_SNAPSHOTS_KEPT} and ignores other files`, () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    const backups = path.join(dir, "auto");
    fs.mkdirSync(backups, { recursive: true });
    for (let day = 1; day <= 20; day++) {
      fs.writeFileSync(path.join(backups, `scripter-2026-09-${String(day).padStart(2, "0")}.db`), "old");
    }
    fs.writeFileSync(path.join(backups, "manual-keep.db"), "x");

    takeDailySnapshot(sqlite, backups, new Date(2026, 9, 1, 12, 0));
    const snapshots = fs.readdirSync(backups).filter((f) => f.startsWith("scripter-")).sort();
    expect(snapshots).toHaveLength(DAILY_SNAPSHOTS_KEPT);
    expect(snapshots.at(-1)).toBe("scripter-2026-10-01.db");
    expect(snapshots[0]).toBe("scripter-2026-09-08.db");
    expect(fs.existsSync(path.join(backups, "manual-keep.db"))).toBe(true);
    sqlite.close();
  });

  it("never throws", () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    sqlite.close();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(takeDailySnapshot(sqlite, path.join(dir, "auto"))).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("pruneSnapshots", () => {
  it("is a no-op for a missing folder", () => {
    expect(pruneSnapshots(path.join(tmp, "nope"), /x/, 1)).toEqual([]);
  });
});

describe("snapshotBeforeMigrations", () => {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  it("skips a brand-new database", () => {
    const dir = freshDir();
    const sqlite = new Database(path.join(dir, "new.db"));
    expect(snapshotBeforeMigrations(sqlite, migrationsFolder, path.join(dir, "pre"))).toEqual({ needed: false, path: null });
    sqlite.close();
  });

  it("copies a database with data before pending migrations run", () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    expect(pendingMigrationCount(sqlite, migrationsFolder)).toBeGreaterThan(0);
    const out = snapshotBeforeMigrations(sqlite, migrationsFolder, path.join(dir, "pre"), new Date(2026, 9, 27, 8, 5, 9));
    expect(out).toEqual({ needed: true, path: path.join(dir, "pre", "scripter-2026-10-27-080509.db") });
    expect(fs.existsSync(out.path!)).toBe(true);
    sqlite.close();
  });

  it("falls back to the next folder when the first can't be written, and reports a total failure", () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    const blocked = path.join(dir, "not-a-folder");
    fs.writeFileSync(blocked, "x");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fallback = path.join(dir, "fallback");
      const out = snapshotBeforeMigrations(sqlite, migrationsFolder, [path.join(blocked, "pre"), fallback]);
      expect(out.needed).toBe(true);
      expect(path.dirname(out.path!)).toBe(fallback);
      expect(snapshotBeforeMigrations(sqlite, migrationsFolder, [path.join(blocked, "pre")])).toEqual({ needed: true, path: null });
    } finally {
      spy.mockRestore();
      sqlite.close();
    }
  });

  it("counts the copy as written when only pruning an old one fails", () => {
    // Otherwise an old snapshot left open in another program would make
    // ensureDb refuse to migrate on every request.
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    const pre = path.join(dir, "pre");
    fs.mkdirSync(pre, { recursive: true });
    // The oldest "snapshot" can't be removed: rmSync refuses a folder.
    fs.mkdirSync(path.join(pre, "scripter-2026-01-01-000000.db"));
    for (let day = 2; day <= PRE_MIGRATION_SNAPSHOTS_KEPT; day++) {
      fs.writeFileSync(path.join(pre, `scripter-2026-01-${String(day).padStart(2, "0")}-000000.db`), "old");
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const out = snapshotBeforeMigrations(sqlite, migrationsFolder, [pre, path.join(dir, "fallback")], new Date(2026, 9, 27, 8, 5, 9));
      expect(out).toEqual({ needed: true, path: path.join(pre, "scripter-2026-10-27-080509.db") });
      expect(fs.existsSync(out.path!)).toBe(true);
      expect(fs.existsSync(path.join(dir, "fallback"))).toBe(false);
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/couldn't prune/), expect.anything());

      const auto = path.join(dir, "auto");
      fs.mkdirSync(path.join(auto, "scripter-2026-01-01.db"), { recursive: true });
      expect(takeDailySnapshot(sqlite, auto, new Date(2026, 9, 27, 9, 0), 1)).toBe(path.join(auto, "scripter-2026-10-27.db"));
    } finally {
      spy.mockRestore();
      sqlite.close();
    }
  });

  it("skips when every migration is already recorded", () => {
    const dir = freshDir();
    const sqlite = dbWithRows(path.join(dir, "live.db"));
    const entries = (JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as { entries: unknown[] }).entries;
    sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC)");
    const insert = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('h', 0)");
    for (let i = 0; i < entries.length; i++) insert.run();
    expect(pendingMigrationCount(sqlite, migrationsFolder)).toBe(0);
    expect(snapshotBeforeMigrations(sqlite, migrationsFolder, path.join(dir, "pre"))).toEqual({ needed: false, path: null });
    sqlite.close();
  });
});

describe("backup folders", () => {
  it("default to <data>/backups and scope a shared SCRIPTER_BACKUP_DIR per database", () => {
    const dir = freshDir();
    const dbFile = path.join(dir, "data", "scripter.db");
    process.env.SCRIPTER_DB_PATH = dbFile;
    try {
      delete process.env.SCRIPTER_BACKUP_DIR;
      expect(getBackupsRoot()).toBe(path.join(dir, "data", "backups"));
      expect(preMigrationDirs()).toEqual([path.join(dir, "data", "backups", "pre-migration")]);

      process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "shared");
      expect(backupScopeName()).toMatch(/^scripter-[0-9a-f]{8}$/);
      expect(getBackupsRoot()).toBe(path.join(dir, "shared", backupScopeName()));
      expect(getLocalBackupsRoot()).toBe(path.join(dir, "data", "backups"));
      // The data folder's own backups are the fallback for a pre-migration copy.
      expect(preMigrationDirs()).toEqual([
        path.join(dir, "shared", backupScopeName(), "pre-migration"),
        path.join(dir, "data", "backups", "pre-migration"),
      ]);
      expect(backupScopeName(path.join(dir, "other", "scripter.db"))).not.toBe(backupScopeName());
      if (process.platform === "win32") {
        expect(backupScopeName(dbFile.toUpperCase())).toBe(backupScopeName());
      }
    } finally {
      delete process.env.SCRIPTER_DB_PATH;
      delete process.env.SCRIPTER_BACKUP_DIR;
    }
  });
});

describe("ensureDb", () => {
  it("migrates once, merges the WAL into the main file and takes today's snapshot", () => {
    const dir = freshDir();
    const dbFile = path.join(dir, "data", "scripter.db");
    process.env.SCRIPTER_DB_PATH = dbFile;
    process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "backups");
    try {
      const sqlite = getSqlite();
      sqlite.exec("CREATE TABLE scripts (id INTEGER PRIMARY KEY, title TEXT)");
      const insert = sqlite.prepare("INSERT INTO scripts (title) VALUES (?)");
      for (let i = 0; i < 50; i++) insert.run(`t${i}`);
      expect(fs.statSync(`${dbFile}-wal`).size).toBeGreaterThan(0);

      ensureDb();
      ensureDb();

      expect(migrateMock.runMigrations).toHaveBeenCalledTimes(1);
      expect(migrateMock.seedDefaults).toHaveBeenCalledTimes(1);
      expect(fs.statSync(`${dbFile}-wal`).size).toBe(0);
      const root = path.join(dir, "backups", backupScopeName());
      expect(fs.existsSync(path.join(root, "auto", dailySnapshotName()))).toBe(true);
      // The pre-migration copy was taken because the DB had data and no migrations table.
      expect(fs.readdirSync(path.join(root, "pre-migration"))).toHaveLength(1);
    } finally {
      closeDb();
      delete process.env.SCRIPTER_DB_PATH;
      delete process.env.SCRIPTER_BACKUP_DIR;
    }
  });

  it("refuses to migrate when no pre-migration copy can be written, and retries on the next call", () => {
    const dir = freshDir();
    const dbFile = path.join(dir, "data", "scripter.db");
    // Both the backup override and the data folder's own backups are files, not folders.
    const blockedOverride = path.join(dir, "offline-drive");
    fs.writeFileSync(blockedOverride, "x");
    process.env.SCRIPTER_DB_PATH = dbFile;
    process.env.SCRIPTER_BACKUP_DIR = blockedOverride;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    migrateMock.runMigrations.mockClear();
    try {
      const sqlite = getSqlite();
      sqlite.exec("CREATE TABLE scripts (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO scripts (title) VALUES ('keep');");
      const localBackups = path.join(dir, "data", "backups");
      fs.writeFileSync(localBackups, "x");

      expect(() => ensureDb()).toThrow(/Couldn't back up .* so none were applied/);
      expect(migrateMock.runMigrations).not.toHaveBeenCalled();
      expect(() => ensureDb()).toThrow();
      expect(migrateMock.runMigrations).not.toHaveBeenCalled();

      // Once the data folder can take a copy again, the next request migrates.
      fs.rmSync(localBackups);
      ensureDb();
      expect(migrateMock.runMigrations).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync(path.join(localBackups, "pre-migration"))).toHaveLength(1);
    } finally {
      spy.mockRestore();
      closeDb();
      delete process.env.SCRIPTER_DB_PATH;
      delete process.env.SCRIPTER_BACKUP_DIR;
    }
  });

  it("gives two databases sharing SCRIPTER_BACKUP_DIR their own daily snapshot", () => {
    const dir = freshDir();
    process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "shared");
    const names = ["worktree", "main"];
    const snapshots: string[] = [];
    try {
      for (const name of names) {
        process.env.SCRIPTER_DB_PATH = path.join(dir, name, "scripter.db");
        getSqlite().exec(`CREATE TABLE scripts (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO scripts (title) VALUES ('${name}');`);
        ensureDb();
        snapshots.push(path.join(getAutoBackupsDir(), dailySnapshotName()));
      }
      expect(new Set(snapshots).size).toBe(2);
      names.forEach((name, i) => {
        const copy = new Database(snapshots[i], { readonly: true });
        expect(copy.prepare("SELECT title FROM scripts").get()).toEqual({ title: name });
        copy.close();
      });
    } finally {
      closeDb();
      delete process.env.SCRIPTER_DB_PATH;
      delete process.env.SCRIPTER_BACKUP_DIR;
    }
  });
});
