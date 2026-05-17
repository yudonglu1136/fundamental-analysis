import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildGildBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { GILD_BACKEND_DB_PATH, GILD_BACKEND_SCHEMA_PATH, GILD_BACKEND_TABLES } from "./schema.mjs";

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    for table in payload["tablesToClear"]:
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.executescript(payload["schema"])
    for table in payload["tablesToClear"]:
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
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in payload["tablesToClear"]}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts}, indent=2))
finally:
    conn.close()
`;

export async function seedGildBackendDb() {
  mkdirSync(path.dirname(GILD_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildGildBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: GILD_BACKEND_DB_PATH,
      schema: readFileSync(GILD_BACKEND_SCHEMA_PATH, "utf8"),
      tablesToClear: GILD_BACKEND_TABLES,
      tables: {
        reporting_events: payload.reportingEvents,
        source_documents: payload.sourceDocuments,
        financial_periods: payload.financialPeriods,
        product_financials: payload.productFinancials,
        franchise_financials: payload.franchiseFinancials,
        market_snapshots: payload.marketSnapshots,
        peer_snapshots: payload.peerSnapshots,
        guidance_items: payload.guidanceItems,
        transcript_events: payload.transcriptEvents,
        transcript_extractions: payload.transcriptExtractions,
        assumption_sets: payload.assumptionSets,
        model_versions: payload.modelVersions,
        validation_warnings: payload.validationWarnings,
        product_lifecycle_events: payload.productLifecycleEvents,
        patent_exclusivity_events: payload.patentExclusivityEvents,
        pipeline_assets: payload.pipelineAssets,
        pipeline_milestones: payload.pipelineMilestones,
        pipeline_rnpv_components: payload.pipelineRnpvComponents,
        capital_allocation_events: payload.capitalAllocationEvents,
        dividend_buyback_snapshots: payload.dividendBuybackSnapshots,
        cash_debt_snapshots: payload.cashDebtSnapshots,
        acquisition_bd_events: payload.acquisitionBdEvents,
        veklury_normalization_snapshots: payload.vekluryNormalizationSnapshots,
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
