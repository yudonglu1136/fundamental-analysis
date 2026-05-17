import path from "node:path";

export const NVDA_BACKEND_DB_PATH = path.resolve(process.env.NVDA_DB_PATH ?? "data/local/nvda/backend/nvda_research.sqlite");
export const NVDA_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_nvda_schema.sql");

export const NVDA_BACKEND_TABLES = [
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
  "supply_chain_snapshots",
  "customer_end_market_snapshots",
  "product_financials",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
