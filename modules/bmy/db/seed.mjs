import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildBmyBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { BMY_BACKEND_DB_PATH, BMY_BACKEND_SCHEMA_PATH, BMY_BACKEND_TABLES } from "./schema.mjs";

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

export async function seedBmyBackendDb() {
  mkdirSync(path.dirname(BMY_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildBmyBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: BMY_BACKEND_DB_PATH,
      schema: readFileSync(BMY_BACKEND_SCHEMA_PATH, "utf8"),
      tablesToClear: BMY_BACKEND_TABLES,
      tables: {
        reporting_events: payload.reportingEvents,
        source_documents: payload.sourceDocuments,
        financial_periods: payload.financialPeriods,
        segment_financials: payload.segmentFinancials,
        product_financials: payload.productFinancials,
        pipeline_events: payload.pipelineEvents,
        clinical_readouts: payload.clinicalReadouts,
        patent_exclusivity_events: payload.patentExclusivityEvents,
        market_snapshots: payload.marketSnapshots,
        peer_snapshots: payload.peerSnapshots,
        guidance_items: payload.guidanceItems,
        transcript_events: payload.transcriptEvents,
        transcript_extractions: payload.transcriptExtractions,
        assumption_sets: payload.assumptionSets,
        model_versions: payload.modelVersions,
        validation_warnings: payload.validationWarnings,
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
