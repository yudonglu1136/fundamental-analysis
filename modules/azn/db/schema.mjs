import { readFileSync } from "node:fs";
import path from "node:path";

export const AZN_BACKEND_DB_PATH = path.resolve(process.env.AZN_DB_PATH ?? "data/local/azn/backend/azn_research.sqlite");

export const aznSchemaSql = readFileSync(
  path.resolve("apps/api/src/db/migrations/001_azn_schema.sql"),
  "utf8",
);
