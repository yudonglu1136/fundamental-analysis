import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const LEGACY_ROOT = process.env.LEGACY_FA_ROOT || "/tmp/fa-old";
const MIN_BASE_RUNS = Number(process.env.MIN_BASE_RUNS || 8);
const MIN_CLEAN_RUNS = Number(process.env.MIN_CLEAN_RUNS || 5);
const MIN_LATEST_AS_OF_DATE = process.env.MIN_LATEST_AS_OF_DATE || "2024-01-01";
const MIN_FAIR_TO_PRICE_RATIO = Number(process.env.MIN_FAIR_TO_PRICE_RATIO || 0.2);
const MAX_FAIR_TO_PRICE_RATIO = Number(process.env.MAX_FAIR_TO_PRICE_RATIO || 6);

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
  return [...rows]
    .sort((left, right) =>
      String(left.asOfDate || "").localeCompare(String(right.asOfDate || "")) ||
      String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    )
    .at(-1) || null;
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

function pricePointAtOrBefore(points = [], date) {
  const target = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(target)) return null;
  return [...points]
    .filter((point) => point.date && Number.isFinite(Number(point.close)) && new Date(point.date).getTime() <= target)
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
    runCreatedAt: run.createdAt || null,
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

function fairPriceRatio(row) {
  if (!Number.isFinite(row.fairValue) || !Number.isFinite(row.priceAtDate) || row.priceAtDate <= 0) return null;
  return row.fairValue / row.priceAtDate;
}

function invalidRatioReason(row) {
  const ratio = fairPriceRatio(row);
  if (!Number.isFinite(ratio)) return null;
  if (ratio < MIN_FAIR_TO_PRICE_RATIO) {
    return `fair/price ${ratio.toFixed(3)} below ${MIN_FAIR_TO_PRICE_RATIO}`;
  }
  if (ratio > MAX_FAIR_TO_PRICE_RATIO) {
    return `fair/price ${ratio.toFixed(3)} above ${MAX_FAIR_TO_PRICE_RATIO}`;
  }
  return null;
}

function periodPriority(row) {
  const id = String(row.periodId || "").toLowerCase();
  const label = String(row.label || "").toLowerCase();
  let score = 0;
  if (/q[1-4]/.test(id) || /q[1-4]/.test(label)) score += 30;
  if (/fy\d{2,4}/.test(id) || /fy\d{2,4}/.test(label)) score += 10;
  if (id.startsWith("period-")) score -= 8;
  if (label.includes("market snapshot") || id.includes("market-snapshot")) score -= 12;
  if (row.runCreatedAt) score += Math.min(Date.parse(row.runCreatedAt) || 0, 4102444800000) / 4102444800000;
  return score;
}

function chooseRepresentativeRow(rows) {
  return [...rows].sort((left, right) =>
    periodPriority(right) - periodPriority(left) ||
    String(right.runCreatedAt || "").localeCompare(String(left.runCreatedAt || ""))
  )[0];
}

function sanitizeHistoryRows(rows) {
  const exclusions = [];
  const validRows = [];

  for (const row of rows) {
    const reason = invalidRatioReason(row);
    if (reason) {
      exclusions.push({
        periodId: row.periodId,
        asOfDate: row.asOfDate,
        label: row.label,
        fairValue: row.fairValue,
        priceAtDate: row.priceAtDate,
        reason
      });
      continue;
    }
    validRows.push(row);
  }

  const byDate = new Map();
  for (const row of validRows) {
    const key = row.asOfDate;
    byDate.set(key, [...(byDate.get(key) || []), row]);
  }

  const deduped = [];
  for (const [asOfDate, dateRows] of byDate) {
    const chosen = chooseRepresentativeRow(dateRows);
    deduped.push(chosen);
    for (const row of dateRows) {
      if (row !== chosen) {
        exclusions.push({
          periodId: row.periodId,
          asOfDate,
          label: row.label,
          fairValue: row.fairValue,
          priceAtDate: row.priceAtDate,
          reason: `same-date duplicate; kept ${chosen.periodId || chosen.label || asOfDate}`
        });
      }
    }
  }

  return {
    history: deduped.sort((left, right) =>
      String(left.asOfDate).localeCompare(String(right.asOfDate)) ||
      String(left.runCreatedAt || "").localeCompare(String(right.runCreatedAt || ""))
    ),
    exclusions
  };
}

function fillPriceAnchorsFromLocalHistory(rows, snapshot) {
  return rows.map((row) => {
    const pricePoint = pricePointAtOrBefore(snapshot.priceHistory, row.asOfDate);
    if (!pricePoint) return row;
    const priceAtDate = Number(pricePoint.close);
    return {
      ...row,
      currentPrice: priceAtDate,
      priceAtDate,
      priceDate: pricePoint.date,
      upsideDownside: Number.isFinite(row.fairValue) && priceAtDate > 0 ? row.fairValue / priceAtDate - 1 : row.upsideDownside,
      dataSnapshot: {
        ...(row.dataSnapshot || {}),
        asOfPriceSource: {
          ...(row.dataSnapshot?.asOfPriceSource || {}),
          priceDate: pricePoint.date,
          source: pricePoint.source || "local daily close fallback"
        }
      }
    };
  });
}

function coverageKind(history) {
  if (history.length >= 28 && history.filter((row) => row.fiscalQuarter || /q[1-4]/i.test(String(row.label || ""))).length / history.length >= 0.72) {
    return "quarterly";
  }
  if (history.length >= 12) return "partial";
  return "limited";
}

function findRunForHistoryRow(runs, row) {
  if (!row) return null;
  return runs.find((run) =>
    (run.reportingEventId || "") === row.periodId &&
    (run.asOfDate || "") === row.asOfDate &&
    finiteNumber(run.fairValue) === row.fairValue &&
    String(run.createdAt || "") === String(row.runCreatedAt || "")
  ) || runs.find((run) =>
    (run.reportingEventId || "") === row.periodId &&
    (run.asOfDate || "") === row.asOfDate
  ) || null;
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
  const rawHistory = runs
    .map((run) => buildHistoryRow(run, eventsById.get(run.reportingEventId)))
    .filter((row) => row.asOfDate && Number.isFinite(row.fairValue))
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const pricedHistory = fillPriceAnchorsFromLocalHistory(rawHistory, snapshot);
  const { history, exclusions } = sanitizeHistoryRows(pricedHistory);
  if (history.length < MIN_CLEAN_RUNS) return null;

  const latestHistoryRow = history.at(-1);
  const latestRun = findRunForHistoryRow(runs, latestHistoryRow) || latestByDate(runs);
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
  const historyCoverageKind = coverageKind(history);
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const hasLivePriceSeries = pricePoints >= 120;
  const displayMode = hasLivePriceSeries ? "daily-price-line" : "as-of-price-anchors";

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
      ...(exclusions.length ? [`Excluded ${exclusions.length} invalid or duplicate legacy valuation rows before charting.`] : []),
      ...(coverageNote ? [coverageNote] : []),
      ...compactWarnings(latestRun.warningsJson)
    ],
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      legacyBackendValuationRows: history.length,
      legacyBackendRawValuationRows: rawHistory.length,
      excludedLegacyBackendRows: exclusions.length,
      excludedLegacyBackendRowDetails: exclusions.slice(0, 12),
      legacyBackendLatestAsOfDate: latestRun.asOfDate,
      legacyBackendSourcePath: path.join("data/local", legacyTicker, "backend", `${legacyTicker}_research.sqlite`),
      partialLegacyBackendCoverage: Boolean(coverageNote),
      pricePoints,
      hasLivePriceSeries,
      priceDisplayMode: displayMode,
      valuationCoverageKind: historyCoverageKind,
      hasQuarterlyValuationRuns: historyCoverageKind === "quarterly",
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
  quarterlyBackendValuationTickerCount: [...currentTickers.values()].filter((ticker) => ticker.dataQuality?.hasQuarterlyValuationRuns).length,
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
  minCleanRuns: MIN_CLEAN_RUNS,
  imported,
  skipped,
  summary
}, null, 2));
