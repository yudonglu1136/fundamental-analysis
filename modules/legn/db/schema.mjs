import { readFileSync } from "node:fs";
import path from "node:path";

export const LEGN_BACKEND_DB_PATH = path.resolve(process.env.LEGN_DB_PATH ?? "data/local/legn/backend/legn_research.sqlite");
export const LEGN_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_legn_schema.sql");

export const legnSchemaSql = readFileSync(
  LEGN_BACKEND_SCHEMA_PATH,
  "utf8",
);
