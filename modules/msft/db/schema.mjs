import path from "node:path";

export const MSFT_BACKEND_DB_PATH = path.resolve(process.env.MSFT_DB_PATH ?? "data/local/msft/backend/msft_research.sqlite");
export const MSFT_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_msft_schema.sql");

export const MSFT_BACKEND_TABLES = [
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
  "cloud_ai_kpis",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
