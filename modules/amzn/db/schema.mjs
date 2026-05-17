import path from "node:path";

export const AMZN_BACKEND_DB_PATH = path.resolve(process.env.AMZN_DB_PATH ?? "data/local/amzn/backend/amzn_research.sqlite");
export const AMZN_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_amzn_schema.sql");

export const AMZN_BACKEND_TABLES = [
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
  "operating_metric_snapshots",
  "business_unit_financials",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
