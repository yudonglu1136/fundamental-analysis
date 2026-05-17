import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildIsrgBackendSeedPayload } from "../ingestion/importLocalData.mjs";

export const defaultIsrgDbPath = path.resolve(process.env.ISRG_DB_PATH ?? "data/local/isrg/backend/isrg_research.sqlite");
const schemaPath = path.resolve("apps/api/src/db/migrations/001_isrg_schema.sql");

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.executescript(payload["schema"])
    tables = [
      "valuation_runs", "backtest_runs", "validation_warnings", "assumption_sets",
      "model_versions", "transcript_extractions", "transcript_events", "guidance_items",
      "peer_snapshots", "market_snapshots", "segment_financials", "financial_periods",
      "source_documents", "reporting_events"
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

export function seedIsrgBackendDb() {
  mkdirSync(path.dirname(defaultIsrgDbPath), { recursive: true });
  const payload = buildIsrgBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: defaultIsrgDbPath,
      schema: readFileSync(schemaPath, "utf8"),
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

