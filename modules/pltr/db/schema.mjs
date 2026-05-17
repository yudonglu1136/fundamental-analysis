import { readFileSync } from "node:fs";
import path from "node:path";

export const PLTR_BACKEND_DB_PATH = path.resolve(process.env.PLTR_DB_PATH ?? "data/local/pltr/backend/pltr_research.sqlite");
export const PLTR_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_pltr_schema.sql");

export const PLTR_BACKEND_TABLES = [
  "reporting_events",
  "source_documents",
  "market_snapshots",
  "daily_price_bars",
  "model_versions",
  "assumption_sets",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
];

export const pltrSchemaSql = readFileSync(PLTR_BACKEND_SCHEMA_PATH, "utf8");
