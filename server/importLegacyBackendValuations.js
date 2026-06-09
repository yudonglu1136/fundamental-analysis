import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const LEGACY_ROOT = process.env.LEGACY_FA_ROOT || "/tmp/fa-old";
const MIN_BASE_RUNS = Number(process.env.MIN_BASE_RUNS || 8);
const MIN_LATEST_AS_OF_DATE = process.env.MIN_LATEST_AS_OF_DATE || "2024-01-01";

const tickerMap = {
  ba: "BA.L",
  dge: "DGE.L"
};

const partialCoverage = {
  qcom: "Backfill stopped before the 2026 events; imported completed Base runs only."
};

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestByDate(rows) {
  return [...rows].sort((left, right) => String(left.asOfDate || "").localeCompare(String(right.asOfDate || ""))).at(-1) || null;
}

function mapLegacyTicker(legacyTicker) {
  return tickerMap[legacyTicker] || legacyTicker.toUpperCase();
}

function latestPricePoint(points = []) {
  return [...points]
    .filter((point) => point.date && Number.isFinite(Number(point.close)))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function methodCardsFromRun(run) {
  const methodOutputs = parseJson(run.methodOutputsJson, []);
  return Array.isArray(methodOutputs) ? methodOutputs : [];
}

function methodLabel(methodCards) {
  const labels = methodCards.map((item) => item?.label || item?.key).filter(Boolean);
  if (!labels.length) return "Backend valuation";
  return labels.slice(0, 3).join(" / ");
}

function compactWarnings(value) {
  const warnings = parseJson(value, []);
  if (!Array.isArray(warnings)) return [];
  return warnings
    .map((warning) => {
      if (typeof warning === "string") return warning;
      return warning?.title || warning?.detail || warning?.id || null;
    })
    .filter(Boolean);
}

function readLegacyRuns(legacyTicker) {
  const dbPath = path.join(LEGACY_ROOT, "data/local", legacyTicker, "backend", `${legacyTicker}_research.sqlite`);
  if (!fs.existsSync(dbPath)) return { dbPath, runs: [], eventsById: new Map() };

  const db = new DatabaseSync(dbPath);
  try {
    const eventColumns = new Set(db.prepare("PRAGMA table_info(reporting_events)").all().map((row) => row.name));
    const optionalEventColumns = [
      "id",
      "ticker",
      "eventDate",
      "fiscalPeriod",
      "fiscalYear",
      "fiscalQuarter",
      "eventType",
      "label",
      "sourceType",
      "sourceUrl"
    ].filter((column) => eventColumns.has(column));
    const events = optionalEventColumns.length
      ? db.prepare(`SELECT ${optionalEventColumns.join(", ")} FROM reporting_events`).all()
      : [];
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const runs = db.prepare(`
      SELECT *
      FROM valuation_runs
      WHERE scenario = 'Base'
      ORDER BY asOfDate ASC, createdAt ASC
    `).all();
    return { dbPath, runs, eventsById };
  } finally {
    db.close();
  }
}

function buildHistoryRow(run, event) {
  const dataSnapshot = parseJson(run.dataSnapshotJson, {});
  const methodCards = methodCardsFromRun(run);
  const asOfDate = run.asOfDate || event?.eventDate || dataSnapshot?.reportingEventDate;
  const fairValue = finiteNumber(run.fairValue);
  const priceAtDate = finiteNumber(run.currentPrice);
  return {
    periodId: run.reportingEventId || event?.id || `${asOfDate}-base`,
    label: event?.fiscalPeriod || dataSnapshot?.fiscalPeriod || event?.label || run.reportingEventId || asOfDate,
    asOfDate,
    fiscalYear: finiteNumber(event?.fiscalYear ?? dataSnapshot?.latestFinancialPeriod?.fiscalYear),
    fiscalQuarter: event?.fiscalQuarter || dataSnapshot?.latestFinancialPeriod?.fiscalQuarter || null,
    eventType: event?.eventType || null,
    sourceType: event?.sourceType || null,
    sourceUrl: event?.sourceUrl || null,
    currentPrice: priceAtDate,
    fairValue,
    upsideDownside: finiteNumber(run.upsideDownside),
    targetPrice3Y: finiteNumber(run.targetPrice3Y),
    expectedReturn3Y: finiteNumber(run.expectedShareholderCagr),
    method: methodLabel(methodCards),
    methodOutputs: methodCards,
    warnings: compactWarnings(run.warningsJson),
    priceDate: dataSnapshot?.asOfPriceSource?.priceDate || asOfDate,
    priceAtDate,
    dataSnapshot: {
      fiscalPeriod: dataSnapshot?.fiscalPeriod,
      sourceMaxAsOfDate: dataSnapshot?.sourceMaxAsOfDate,
      latestFinancialPeriod: dataSnapshot?.latestFinancialPeriod,
      asOfPriceSource: dataSnapshot?.asOfPriceSource
    }
  };
}

function buildScenarioFromRun(run, scenario = "Base") {
  return {
    scenario,
    currentPrice: finiteNumber(run.currentPrice),
    fairValue: finiteNumber(run.fairValue),
    upsideDownside: finiteNumber(run.upsideDownside),
    targetPrice3Y: finiteNumber(run.targetPrice3Y),
    expectedReturn3Y: finiteNumber(run.expectedShareholderCagr),
    recommendedMethod: methodLabel(methodCardsFromRun(run)),
    modelSummary: "Legacy backend valuation run"
  };
}

function updateTickerSnapshot(snapshot, legacyTicker, runs, eventsById) {
  const history = runs
    .map((run) => buildHistoryRow(run, eventsById.get(run.reportingEventId)))
    .filter((row) => row.asOfDate && Number.isFinite(row.fairValue))
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  if (history.length < MIN_BASE_RUNS) return null;

  const latestRun = latestByDate(runs);
  if (!latestRun) return null;

  const latestPrice = latestPricePoint(snapshot.priceHistory);
  const latestFairValue = finiteNumber(latestRun.fairValue);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const targetPrice3Y = finiteNumber(latestRun.targetPrice3Y);
  const expectedReturn3Y =
    latestMarketPrice && targetPrice3Y
      ? (targetPrice3Y / latestMarketPrice) ** (1 / 3) - 1
      : finiteNumber(latestRun.expectedShareholderCagr);

  const methodCards = methodCardsFromRun(latestRun);
  const sourceNote = "Legacy backend valuation runs: each bar is recomputed from the reporting-event-visible financials/guidance and the as-of market price.";
  const coverageNote = partialCoverage[legacyTicker] || null;

  return {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    latest: {
      ...(snapshot.latest || {}),
      latestPrice: latestMarketPrice ?? snapshot.latest?.latestPrice ?? null,
      latestPriceDate: latestPrice?.date || snapshot.latest?.latestPriceDate || null,
      latestPriceSource: latestPrice?.source || snapshot.latest?.latestPriceSource || snapshot.priceSource || null,
      valuationAnchorPrice: finiteNumber(latestRun.currentPrice),
      valuationAnchorDate: latestRun.asOfDate,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRun.upsideDownside),
      targetPrice3Y,
      expectedReturn3Y
    },
    scenarios: [buildScenarioFromRun(latestRun, "Base")],
    history,
    methodCards: methodCards.length ? methodCards : snapshot.methodCards,
    warnings: [
      "Imported from legacy backend valuation runs.",
      ...(coverageNote ? [coverageNote] : []),
      ...compactWarnings(latestRun.warningsJson)
    ],
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      legacyBackendValuationRows: history.length,
      legacyBackendLatestAsOfDate: latestRun.asOfDate,
      legacyBackendSourcePath: path.join("data/local", legacyTicker, "backend", `${legacyTicker}_research.sqlite`),
      partialLegacyBackendCoverage: Boolean(coverageNote),
      pricePoints: snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0,
      hasLivePriceSeries: Boolean(snapshot.priceHistory?.length),
      hasQuarterlyValuationRuns: true,
      sourceNote,
      coverageNote
    }
  };
}

function compactTicker(snapshot) {
  const { priceHistory, ...compact } = snapshot;
  return {
    ...compact,
    history: (snapshot.history || []).slice(-12),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      fullHistoryRowsAvailable: snapshot.history?.length || 0
    }
  };
}

const currentDb = new DatabaseSync(CURRENT_DB_PATH);
const dashboardRow = currentDb.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest");
if (!dashboardRow) throw new Error(`No valuation dashboard snapshot found at ${CURRENT_DB_PATH}`);

const dashboard = parseJson(dashboardRow.payload_json, {});
const currentTickers = new Map(
  currentDb.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all()
    .map((row) => [row.ticker, parseJson(row.payload_json, {})])
);

const imported = [];
const skipped = [];

for (const legacyTickerDir of fs.readdirSync(path.join(LEGACY_ROOT, "data/local"))) {
  const legacyTicker = legacyTickerDir.toLowerCase();
  const currentTicker = mapLegacyTicker(legacyTicker);
  const existing = currentTickers.get(currentTicker);
  if (!existing) continue;

  const { runs, eventsById } = readLegacyRuns(legacyTicker);
  if (runs.length < MIN_BASE_RUNS) {
    if (runs.length) skipped.push({ legacyTicker, currentTicker, reason: `only ${runs.length} Base runs` });
    continue;
  }
  const latestRunForCoverage = latestByDate(runs);
  const latestFairValue = finiteNumber(latestRunForCoverage?.fairValue);
  if (!latestRunForCoverage?.asOfDate || latestRunForCoverage.asOfDate < MIN_LATEST_AS_OF_DATE) {
    skipped.push({ legacyTicker, currentTicker, reason: `latest run ${latestRunForCoverage?.asOfDate || "-"} is stale` });
    continue;
  }
  if (!(latestFairValue > 0)) {
    skipped.push({ legacyTicker, currentTicker, reason: `latest fair value is invalid (${latestRunForCoverage?.fairValue ?? "-"})` });
    continue;
  }

  const updated = updateTickerSnapshot(existing, legacyTicker, runs, eventsById);
  if (!updated) {
    skipped.push({ legacyTicker, currentTicker, reason: "no valid updated snapshot" });
    continue;
  }

  currentTickers.set(currentTicker, updated);
  currentDb.prepare(`
    INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(currentTicker, updated.generatedAt, JSON.stringify(updated));
  imported.push({
    legacyTicker,
    currentTicker,
    historyRows: updated.history.length,
    latestAsOfDate: updated.dataQuality.legacyBackendLatestAsOfDate,
    baseFairValue: updated.latest?.baseFairValue
  });
}

const tickers = [...currentTickers.values()].map(compactTicker).sort((left, right) => {
  const leftUpside = Number(left.latest?.upsideToBase);
  const rightUpside = Number(right.latest?.upsideToBase);
  if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
  return String(left.ticker || "").localeCompare(String(right.ticker || ""));
});

const summary = {
  ...(dashboard.summary || {}),
  tickerCount: tickers.length,
  historyRows: [...currentTickers.values()].reduce((sum, ticker) => sum + (ticker.history?.length || 0), 0),
  pricePointCount: [...currentTickers.values()].reduce((sum, ticker) => sum + (ticker.priceHistory?.length || 0), 0),
  livePriceTickerCount: [...currentTickers.values()].filter((ticker) => ticker.priceHistory?.length).length,
  latestPriceDate: [...currentTickers.values()]
    .map((ticker) => ticker.latest?.latestPriceDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null,
  quarterlyBackendValuationTickerCount: imported.length,
  positiveUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) > 0).length,
  negativeUpsideCount: tickers.filter((ticker) => Number(ticker.latest?.upsideToBase) < 0).length
};

const updatedDashboard = {
  ...dashboard,
  generatedAt: new Date().toISOString(),
  source: {
    ...(dashboard.source || {}),
    upstreamLabel: "Legacy fundamental-analysis backend valuation runs",
    extraction: "backend valuation_runs import from reporting-event financials/guidance",
    priceSource: "Current local price history plus legacy backend as-of market-price anchors"
  },
  summary,
  tickers
};

currentDb.prepare(`
  INSERT INTO valuation_snapshots (id, generated_at, payload_json)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    generated_at = excluded.generated_at,
    payload_json = excluded.payload_json
`).run("latest", updatedDashboard.generatedAt, JSON.stringify(updatedDashboard));

currentDb.close();

console.log(JSON.stringify({
  currentDbPath: CURRENT_DB_PATH,
  legacyRoot: LEGACY_ROOT,
  minBaseRuns: MIN_BASE_RUNS,
  imported,
  skipped,
  summary
}, null, 2));
