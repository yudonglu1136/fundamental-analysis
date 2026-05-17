import path from "node:path";

export const MCK_BACKEND_DB_PATH = path.resolve(process.env.MCK_DB_PATH ?? "data/local/mck/backend/mck_research.sqlite");
export const MCK_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_mck_schema.sql");

export const MCK_BACKEND_TABLES = [
  "valuation_runs",
  "backtest_runs",
  "validation_warnings",
  "assumption_sets",
  "model_versions",
  "transcript_extractions",
  "transcript_events",
  "guidance_items",
  "peer_snapshots",
  "market_snapshots",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
