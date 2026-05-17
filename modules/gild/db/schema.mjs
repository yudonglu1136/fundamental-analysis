import path from "node:path";

export const GILD_BACKEND_DB_PATH = path.resolve(process.env.GILD_DB_PATH ?? "data/local/gild/backend/gild_research.sqlite");
export const GILD_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_gild_schema.sql");

export const GILD_BACKEND_TABLES = [
  "valuation_runs",
  "backtest_runs",
  "validation_warnings",
  "pipeline_rnpv_components",
  "veklury_normalization_snapshots",
  "acquisition_bd_events",
  "cash_debt_snapshots",
  "dividend_buyback_snapshots",
  "capital_allocation_events",
  "pipeline_milestones",
  "pipeline_assets",
  "patent_exclusivity_events",
  "product_lifecycle_events",
  "assumption_sets",
  "model_versions",
  "transcript_extractions",
  "transcript_events",
  "guidance_items",
  "peer_snapshots",
  "market_snapshots",
  "franchise_financials",
  "product_financials",
  "financial_periods",
  "source_documents",
  "reporting_events",
];
