import path from "node:path";
import { getDeepResearchBackendProfile } from "../config.mjs";

export const DEEP_RESEARCH_BACKEND_SCHEMA_PATH = path.resolve("apps/api/src/db/migrations/001_ceg_schema.sql");

export const DEEP_RESEARCH_BACKEND_TABLES = [
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

export function deepResearchBackendDbPath(slugOrTicker) {
  const profile = getDeepResearchBackendProfile(slugOrTicker);
  if (!profile) throw new Error(`Unknown deep research backend ticker: ${slugOrTicker}`);
  return profile.dbPath;
}
