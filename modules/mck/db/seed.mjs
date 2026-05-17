import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildMckBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { MCK_BACKEND_DB_PATH, MCK_BACKEND_SCHEMA_PATH, MCK_BACKEND_TABLES } from "./schema.mjs";

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
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

export async function seedMckBackendDb() {
  mkdirSync(path.dirname(MCK_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildMckBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: MCK_BACKEND_DB_PATH,
      schema: readFileSync(MCK_BACKEND_SCHEMA_PATH, "utf8"),
      tablesToClear: MCK_BACKEND_TABLES,
      tables: {
        reporting_events: payload.reportingEvents,
        source_documents: payload.sourceDocuments,
        financial_periods: payload.financialPeriods,
        segment_financials: payload.segmentFinancials,
        market_snapshots: payload.marketSnapshots,
        peer_snapshots: payload.peerSnapshots,
        guidance_items: payload.guidanceItems,
        transcript_events: payload.transcriptEvents,
        transcript_extractions: payload.transcriptExtractions,
        model_versions: payload.modelVersions,
        assumption_sets: payload.assumptionSets,
        validation_warnings: payload.validationWarnings,
      },
    }),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}
