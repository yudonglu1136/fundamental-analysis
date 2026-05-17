import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildBaBackendSeedPayload } from "../ingestion/importLocalData.mjs";
import { BA_BACKEND_DB_PATH } from "./schema.mjs";

const schemaPath = path.resolve("apps/api/src/db/migrations/001_ba_schema.sql");

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.executescript(payload["schema"])
    tables = [
      "valuation_runs", "backtest_runs", "validation_warnings", "assumption_sets",
      "model_versions", "capital_allocation_events", "pension_snapshots",
      "defense_budget_indicators", "contract_awards", "program_exposures",
      "order_intake_snapshots", "order_backlog_snapshots", "transcript_extractions",
      "transcript_events", "guidance_items", "peer_snapshots", "market_snapshots",
      "segment_financials", "financial_periods", "source_documents", "reporting_events"
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

export function seedBaBackendDb() {
  mkdirSync(path.dirname(BA_BACKEND_DB_PATH), { recursive: true });
  const payload = buildBaBackendSeedPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: BA_BACKEND_DB_PATH,
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
        assumption_sets: payload.assumptionSets,
        model_versions: payload.modelVersions,
        validation_warnings: payload.validationWarnings,
        order_backlog_snapshots: payload.orderBacklogSnapshots,
        order_intake_snapshots: payload.orderIntakeSnapshots,
        program_exposures: payload.programExposures,
        contract_awards: payload.contractAwards,
        defense_budget_indicators: payload.defenseBudgetIndicators,
        pension_snapshots: payload.pensionSnapshots,
        capital_allocation_events: payload.capitalAllocationEvents,
        backtest_runs: payload.backtestRuns,
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
