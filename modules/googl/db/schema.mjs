import path from "node:path";

export const GOOGL_BACKEND_DB_PATH = path.resolve(process.env.GOOGL_DB_PATH ?? "data/local/googl/backend/googl_research.sqlite");
export const GOOGL_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_googl_schema.sql");

export const GOOGL_BACKEND_TABLES = [
  "valuation_runs",
  "backtest_runs",
  "validation_warnings",
  "assumption_sets",
  "model_versions",
  "transcript_extractions",
  "transcript_events",
  "guidance_items",
  "peer_snapshots",
  "daily_price_bars",
  "market_snapshots",
  "cloud_ai_kpis",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
