import path from "node:path";

export const BMY_BACKEND_DB_PATH = path.resolve(process.env.BMY_DB_PATH ?? "data/local/bmy/backend/bmy_research.sqlite");
export const BMY_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_bmy_schema.sql");

export const BMY_BACKEND_TABLES = [
  "valuation_runs",
  "backtest_runs",
  "validation_warnings",
  "daily_price_bars",
  "assumption_sets",
  "model_versions",
  "transcript_extractions",
  "transcript_events",
  "guidance_items",
  "peer_snapshots",
  "market_snapshots",
  "patent_exclusivity_events",
  "clinical_readouts",
  "pipeline_events",
  "product_financials",
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
