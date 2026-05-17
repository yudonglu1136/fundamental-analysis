import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildLegnBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { LEGN_BACKEND_DB_PATH } from "./schema.mjs";

const schemaPath = path.resolve("apps/api/src/db/migrations/001_legn_schema.sql");

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.executescript(payload["schema"])
    tables = [
      "valuation_runs", "backtest_runs", "validation_warnings", "assumption_sets",
      "model_versions", "transcript_extractions", "transcript_events", "guidance_items",
      "peer_snapshots", "market_snapshots", "competitive_landscape_snapshots",
      "manufacturing_capacity_events", "clinical_trial_events", "regulatory_events",
      "pipeline_milestones", "pipeline_assets", "dilution_snapshots",
      "operating_expense_snapshots", "cash_runway_snapshots",
      "collaboration_economics_snapshots", "carvykti_commercial_snapshots",
      "product_revenue_snapshots", "financial_periods", "source_documents", "reporting_events"
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
    def insert(table, row):
        keys = list(row.keys())
        placeholders = ",".join(["?"] * len(keys))
        sql = f"INSERT INTO {table} ({','.join(keys)}) VALUES ({placeholders})"
        conn.execute(sql, [row.get(key) for key in keys])
    for table, rows in payload["tables"].items():
        for row in rows:
            insert(table, row)
    conn.commit()
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts}, indent=2))
finally:
    conn.close()
`;

export async function seedLegnBackendDb() {
  mkdirSync(path.dirname(LEGN_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildLegnBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: LEGN_BACKEND_DB_PATH,
      schema: readFileSync(schemaPath, "utf8"),
      tables: {
        reporting_events: payload.reportingEvents,
        source_documents: payload.sourceDocuments,
        financial_periods: payload.financialPeriods,
        market_snapshots: payload.marketSnapshots,
        peer_snapshots: payload.peerSnapshots,
        guidance_items: payload.guidanceItems,
        transcript_events: payload.transcriptEvents,
        transcript_extractions: payload.transcriptExtractions,
        assumption_sets: payload.assumptionSets,
        model_versions: payload.modelVersions,
        validation_warnings: payload.validationWarnings,
        product_revenue_snapshots: payload.productRevenueSnapshots,
        carvykti_commercial_snapshots: payload.carvyktiCommercialSnapshots,
        collaboration_economics_snapshots: payload.collaborationEconomicsSnapshots,
        cash_runway_snapshots: payload.cashRunwaySnapshots,
        operating_expense_snapshots: payload.operatingExpenseSnapshots,
        dilution_snapshots: payload.dilutionSnapshots,
        pipeline_assets: payload.pipelineAssets,
        pipeline_milestones: payload.pipelineMilestones,
        regulatory_events: payload.regulatoryEvents,
        clinical_trial_events: payload.clinicalTrialEvents,
        manufacturing_capacity_events: payload.manufacturingCapacityEvents,
        competitive_landscape_snapshots: payload.competitiveLandscapeSnapshots,
      },
    }),
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}
