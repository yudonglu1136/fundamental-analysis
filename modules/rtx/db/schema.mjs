import path from "node:path";

export const RTX_BACKEND_DB_PATH = path.resolve(
  process.env.RTX_DB_PATH ?? "data/local/rtx/backend/rtx_research.sqlite",
);

export const RTX_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_rtx_schema.sql");

export const RTX_BACKEND_TABLES = [
  "valuation_runs",
  "backtest_runs",
  "daily_price_bars",
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
