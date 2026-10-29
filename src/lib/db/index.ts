import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

interface DbHandle {
  db: Db;
  sqlite: Database.Database;
  path: string;
}

// One handle per process. Next dev re-evaluates modules on HMR, so a
// module-level variable would leak a new connection (and never close the old
// one) on every edit; globalThis survives those reloads.
const store = globalThis as typeof globalThis & { __scripterDb?: DbHandle };

/** The SQLite file in use: SCRIPTER_DB_PATH, else ./data/scripter.db. */
export function getDbPath(): string {
  const override = process.env.SCRIPTER_DB_PATH?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "scripter.db");
}

/** Folder holding the DB; exports and backups live beside it by default. */
export function getDataDir(): string {
  return path.dirname(getDbPath());
}

/** <data>/backups: the backups root when no override is set. */
export function getLocalBackupsRoot(): string {
  return path.join(getDataDir(), "backups");
}

/**
 * Folder name that keeps one database's backups apart from another's in a
 * shared SCRIPTER_BACKUP_DIR, e.g. "scripter-1a2b3c4d".
 */
export function backupScopeName(dbPath: string = getDbPath()): string {
  const resolved = path.resolve(dbPath);
  // Windows paths are case-insensitive: C:\ and c:\ are the same database.
  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  const base = path.basename(key, path.extname(key)).replace(/[^\w.-]+/g, "-") || "db";
  return `${base}-${hash}`;
}

/**
 * Backups root: <SCRIPTER_BACKUP_DIR>/<db name>-<hash of the db path>, else
 * <data>/backups. The override may be shared by several databases (a
 * worktree's copy and the main one), so each gets its own subfolder; the
 * daily "today's exists" check and pruning then only see its own snapshots.
 */
export function getBackupsRoot(): string {
  const override = process.env.SCRIPTER_BACKUP_DIR?.trim();
  return override ? path.join(path.resolve(override), backupScopeName()) : getLocalBackupsRoot();
}

/** Where the daily snapshots go. */
export function getAutoBackupsDir(): string {
  return path.join(getBackupsRoot(), "auto");
}

export function getExportsDir(): string {
  return path.join(getDataDir(), "exports");
}

/** Merge the WAL into the main file so a copy of scripter.db is complete. */
export function checkpoint(sqlite: Database.Database): void {
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
}

function open(dbPath: string): DbHandle {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { db: drizzle(sqlite, { schema }), sqlite, path: dbPath };
}

function getHandle(): DbHandle {
  const wanted = getDbPath();
  const current = store.__scripterDb;
  if (current && current.path === wanted && current.sqlite.open) return current;
  if (current) closeDb();

  const handle = open(wanted);
  store.__scripterDb = handle;
  // Dev servers on Windows end in process.exit or a hard kill. The exit hook
  // covers the first; ensureDb() checkpoints at startup to cover the second.
  process.once("exit", () => {
    if (store.__scripterDb === handle) closeDb();
  });
  return handle;
}

export function getDb(): Db {
  return getHandle().db;
}

/** The raw better-sqlite3 connection (pragmas, VACUUM INTO, checkpoints). */
export function getSqlite(): Database.Database {
  return getHandle().sqlite;
}

/** Checkpoint and close the cached connection. Safe to call more than once. */
export function closeDb(): void {
  const handle = store.__scripterDb;
  store.__scripterDb = undefined;
  if (!handle || !handle.sqlite.open) return;
  try {
    checkpoint(handle.sqlite);
  } catch (err) {
    console.error("[db] checkpoint on close failed:", err);
  }
  try {
    handle.sqlite.close();
  } catch (err) {
    console.error("[db] close failed:", err);
  }
}

// Keep `db` as a proxy getter for convenience
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
