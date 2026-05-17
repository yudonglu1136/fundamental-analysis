import { readFileSync } from "node:fs";
import path from "node:path";

export const TSM_BACKEND_DB_PATH = path.resolve(process.env.TSM_DB_PATH ?? "data/local/tsm/backend/tsm_research.sqlite");
export const TSM_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_tsm_schema.sql");

export const TSM_BACKEND_TABLES = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "technology_mix",
  "platform_mix",
  "market_snapshots",
  "daily_price_bars",
  "model_versions",
  "assumption_sets",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
];

export const tsmSchemaSql = readFileSync(TSM_BACKEND_SCHEMA_PATH, "utf8");
