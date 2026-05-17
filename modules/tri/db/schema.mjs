import path from "node:path";

export const TRI_BACKEND_DB_PATH = path.resolve(process.env.TRI_DB_PATH ?? "data/local/tri/backend/tri_research.sqlite");
export const TRI_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_tri_schema.sql");

export const TRI_BACKEND_TABLES = [
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
  "daily_price_bars",
];
