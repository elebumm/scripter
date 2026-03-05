import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDbDir(): string {
  // In Electron production, store data in the user data directory
  // so it persists across app updates
  try {
    const { app } = require("electron");
    if (app && !app.isPackaged === false) {
      return path.join(app.getPath("userData"), "data");
    }
  } catch {
    // Not in Electron main process — fall through
  }

  // Dev mode or Next.js server: use project directory
  return path.join(process.cwd(), "data");
}

export function getDb() {
  if (!_db) {
    const dbDir = getDbDir();
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, "scripter.db");
    const sqlite = new Database(dbPath);

    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

// Keep `db` as a proxy getter for convenience
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
