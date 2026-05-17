import { readFileSync } from "node:fs";
import path from "node:path";

export const isrgSchemaSql = readFileSync(
  path.resolve("apps/api/src/db/migrations/001_isrg_schema.sql"),
  "utf8",
);

