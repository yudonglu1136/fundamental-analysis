import path from "node:path";

export const ANET_BACKEND_DB_PATH = path.resolve(process.env.ANET_DB_PATH ?? "data/local/anet/backend/anet_research.sqlite");
export const ANET_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_anet_schema.sql");

export const ANET_BACKEND_TABLES = [
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
  "daily_price_bars",
  "operating_metric_snapshots",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
