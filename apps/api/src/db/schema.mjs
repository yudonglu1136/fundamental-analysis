import { readFileSync } from "node:fs";
import path from "node:path";

export const lsegSchemaSql = readFileSync(
  path.resolve("apps/api/src/db/migrations/001_lseg_schema.sql"),
  "utf8",
);
