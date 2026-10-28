import { defineConfig } from "drizzle-kit";

// Same resolution as src/lib/db/index.ts getDbPath().
const dbPath = process.env.SCRIPTER_DB_PATH?.trim() || "./data/scripter.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
