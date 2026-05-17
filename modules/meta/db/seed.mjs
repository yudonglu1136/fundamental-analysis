import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildMetaBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { META_BACKEND_DB_PATH, META_BACKEND_SCHEMA_PATH, META_BACKEND_TABLES } from "./schema.mjs";

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    for table in payload["tablesToClear"]:
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.execute("DROP TABLE IF EXISTS daily_price_bars")
    conn.executescript(payload["schema"])
    def insert(table, row):
        keys = list(row.keys())
        placeholders = ",".join(["?"] * len(keys))
        sql = f"INSERT INTO {table} ({','.join(keys)}) VALUES ({placeholders})"
        conn.execute(sql, [row.get(key) for key in keys])
    for table, rows in payload["tables"].items():
        for row in rows:
            insert(table, row)
    conn.commit()
    count_tables = payload["tablesToClear"] + ["daily_price_bars"]
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in count_tables}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts}, indent=2))
finally:
    conn.close()
`;

export async function seedMetaBackendDb() {
  mkdirSync(path.dirname(META_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildMetaBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: META_BACKEND_DB_PATH,
      schema: readFileSync(META_BACKEND_SCHEMA_PATH, "utf8"),
      tablesToClear: META_BACKEND_TABLES,
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
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}
