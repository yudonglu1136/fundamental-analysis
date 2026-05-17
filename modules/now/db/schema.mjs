import path from "node:path";

export const NOW_BACKEND_DB_PATH = path.resolve(process.env.NOW_DB_PATH ?? "data/local/now/backend/now_research.sqlite");
export const NOW_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_now_schema.sql");

export const NOW_BACKEND_TABLES = [
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
