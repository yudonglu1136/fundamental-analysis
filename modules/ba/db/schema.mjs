import { readFileSync } from "node:fs";
import path from "node:path";

export const BA_BACKEND_DB_PATH = path.resolve(process.env.BA_DB_PATH ?? "data/local/ba/backend/ba_research.sqlite");
export const BA_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_ba_schema.sql");

export const baSchemaSql = readFileSync(
  BA_BACKEND_SCHEMA_PATH,
  "utf8",
);
