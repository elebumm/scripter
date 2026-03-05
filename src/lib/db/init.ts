import { runMigrations, seedDefaults } from "./migrate";

let initialized = false;

export function ensureDb() {
  if (!initialized) {
    runMigrations();
    seedDefaults();
    initialized = true;
  }
}
