import path from "node:path";

export const NOC_BACKEND_DB_PATH = path.resolve(
  process.env.NOC_DB_PATH ?? "data/local/noc/backend/noc_research.sqlite",
);

export const NOC_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_noc_schema.sql");

export const NOC_BACKEND_TABLES = [
  "reporting_events",
  "source_documents",
  "financial_periods",
  "segment_financials",
  "market_snapshots",
  "peer_snapshots",
  "guidance_items",
  "transcript_events",
  "transcript_extractions",
  "assumption_sets",
  "model_versions",
  "valuation_runs",
  "validation_warnings",
  "backtest_runs",
  "daily_price_bars",
];
