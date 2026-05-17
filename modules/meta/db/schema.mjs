import path from "node:path";

export const META_BACKEND_DB_PATH = path.resolve(process.env.META_DB_PATH ?? "data/local/meta/backend/meta_research.sqlite");
export const META_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_meta_schema.sql");

export const META_BACKEND_TABLES = [
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
  "segment_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
