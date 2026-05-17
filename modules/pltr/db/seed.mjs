import { mkdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PLTR_BACKEND_DB_PATH, PLTR_BACKEND_SCHEMA_PATH } from "./schema.mjs";
import { PLTR_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "PLTR";
const manifestPath = path.resolve("data/local/pltr/transcripts/transcript_manifest.json");

const seedPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    conn.executescript(payload["schema"])
    tables = [
      "valuation_runs", "backtest_runs", "validation_warnings", "assumption_sets",
      "model_versions", "market_snapshots", "source_documents", "reporting_events"
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
    counts = {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables + ["daily_price_bars"]}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts}, indent=2))
finally:
    conn.close()
`;

function transcriptId(record) {
  return `pltr-q${record.fiscalQuarter}-${record.fiscalYear}-earnings-${record.callDate}`;
}

function eventType(quarter) {
  return `q${quarter}_results`;
}

async function buildPayload() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const records = (manifest.records ?? [])
    .filter((record) => record.ticker === TICKER && record.callDate && record.fiscalYear && record.fiscalQuarter)
    .slice()
    .sort((left, right) => left.callDate.localeCompare(right.callDate));
  const createdAt = new Date().toISOString();
  const reportingEvents = records.map((record) => ({
    id: transcriptId(record),
    ticker: TICKER,
    eventDate: record.callDate,
    fiscalPeriod: `Q${record.fiscalQuarter} ${record.fiscalYear}`,
    fiscalYear: record.fiscalYear,
    fiscalQuarter: record.fiscalQuarter,
    eventType: eventType(record.fiscalQuarter),
    label: `PLTR Q${record.fiscalQuarter} ${record.fiscalYear} earnings`,
    title: `Palantir Q${record.fiscalQuarter} ${record.fiscalYear} earnings call`,
    sourceType: record.sourceName === "Motley Fool" ? "transcript_commentary" : "research_only",
    sourceUrl: record.transcriptUrl,
    rawJson: JSON.stringify(record),
  }));
  const sourceDocuments = records.flatMap((record) => [
    record.earningsReleaseUrl
      ? {
          id: `${transcriptId(record)}-release`,
          ticker: TICKER,
          sourceType: "official_actual",
          sourceUrl: record.earningsReleaseUrl,
          title: `PLTR Q${record.fiscalQuarter} ${record.fiscalYear} earnings release`,
          retrievedAt: createdAt,
          metadataJson: JSON.stringify({ eventId: transcriptId(record), sourceName: "Palantir Investor Relations" }),
        }
      : null,
    record.businessUpdatePdfUrl
      ? {
          id: `${transcriptId(record)}-business-update`,
          ticker: TICKER,
          sourceType: "official_actual",
          sourceUrl: record.businessUpdatePdfUrl,
          title: `PLTR Q${record.fiscalQuarter} ${record.fiscalYear} business update`,
          retrievedAt: createdAt,
          metadataJson: JSON.stringify({ eventId: transcriptId(record), sourceName: "Palantir Investor Relations" }),
        }
      : null,
  ].filter(Boolean));
  const latestEventDate = reportingEvents.at(-1)?.eventDate ?? "2026-05-04";
  return {
    reportingEvents,
    sourceDocuments,
    marketSnapshots: [
      {
        id: "pltr-market-placeholder",
        ticker: TICKER,
        asOfDate: latestEventDate,
        priceDate: null,
        currentPrice: null,
        sharesOutstanding: 2570.924,
        marketCap: null,
        source: "daily_price_bars",
        sourceType: "market_data",
        rawJson: JSON.stringify({ note: "Use daily_price_bars nearest prior trading day for event as-of price." }),
      },
    ],
    modelVersions: [
      {
        id: PLTR_BACKEND_MODEL_VERSION.version,
        ticker: TICKER,
        version: PLTR_BACKEND_MODEL_VERSION.version,
        name: PLTR_BACKEND_MODEL_VERSION.name,
        description: PLTR_BACKEND_MODEL_VERSION.description,
        valuationMethodsJson: JSON.stringify(PLTR_BACKEND_MODEL_VERSION.valuationMethods),
        assumptionSchemaJson: JSON.stringify(PLTR_BACKEND_MODEL_VERSION.assumptionSchema),
        createdAt,
      },
    ],
    assumptionSets: [
      {
        id: "pltr-base-assumptions-v1",
        ticker: TICKER,
        scenario: "Base",
        modelVersion: PLTR_BACKEND_MODEL_VERSION.version,
        asOfDate: reportingEvents[0]?.eventDate ?? "2024-08-05",
        assumptionsJson: JSON.stringify({ source: "frontend_pltr_default_assumptions" }),
        sourceType: "forecast_assumption",
        notes: "Placeholder assumption set; fair values are still calculated by the PLTR frontend valuation engine.",
      },
    ],
    validationWarnings: [
      {
        id: "pltr-backend-price-anchor-only",
        ticker: TICKER,
        severity: "medium",
        title: "PLTR backend currently supplies price anchors only",
        detail: "Historical as-of prices come from SQLite daily_price_bars. Full backend-persisted PLTR fair value runs are a future step.",
        createdAt,
      },
    ],
  };
}

export async function seedPltrBackendDb() {
  mkdirSync(path.dirname(PLTR_BACKEND_DB_PATH), { recursive: true });
  const payload = await buildPayload();
  const result = spawnSync("python3", ["-c", seedPython], {
    input: JSON.stringify({
      dbPath: PLTR_BACKEND_DB_PATH,
      schema: readFileSync(PLTR_BACKEND_SCHEMA_PATH, "utf8"),
      tables: {
        reporting_events: payload.reportingEvents,
        source_documents: payload.sourceDocuments,
        market_snapshots: payload.marketSnapshots,
        model_versions: payload.modelVersions,
        assumption_sets: payload.assumptionSets,
        validation_warnings: payload.validationWarnings,
      },
    }),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}
