import path from "node:path";

export const AAPL_BACKEND_DB_PATH = path.resolve(process.env.AAPL_DB_PATH ?? "data/local/aapl/backend/aapl_research.sqlite");
export const AAPL_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_aapl_schema.sql");

export const AAPL_BACKEND_TABLES = [
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
  "geographic_financials",
  "product_financials",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
