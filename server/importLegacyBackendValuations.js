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

function sourceTypeFromSnapshot(dataSnapshot, event) {
  return event?.sourceType ||
    dataSnapshot?.reportingEvent?.sourceType ||
    dataSnapshot?.valuationSemantics?.sourceType ||
    dataSnapshot?.sourceType ||
    dataSnapshot?.reportingEvent?.metadataJson?.lineage?.sourceType ||
    null;
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
  const sourceType = sourceTypeFromSnapshot(dataSnapshot, event);
  return {
    periodId: run.reportingEventId || event?.id || `${asOfDate}-base`,
    runCreatedAt: run.createdAt || null,
    label: event?.fiscalPeriod || dataSnapshot?.fiscalPeriod || event?.label || run.reportingEventId || asOfDate,
    asOfDate,
    fiscalYear: finiteNumber(event?.fiscalYear ?? dataSnapshot?.latestFinancialPeriod?.fiscalYear),
    fiscalQuarter: event?.fiscalQuarter || dataSnapshot?.latestFinancialPeriod?.fiscalQuarter || null,
    eventType: event?.eventType || null,
    sourceType,
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
      sourceType,
      sourceQuality: dataSnapshot?.sourceQuality || dataSnapshot?.reportingEvent?.metadataJson?.lineage?.sourceType || null,
      sourceMaxAsOfDate: dataSnapshot?.sourceMaxAsOfDate,
      latestFinancialPeriod: dataSnapshot?.latestFinancialPeriod,
      selectedFinancialPeriod: dataSnapshot?.selectedFinancialPeriod,
      financialPeriodCount: dataSnapshot?.financialPeriodCount,
      segmentFinancialCount: dataSnapshot?.segmentFinancialCount,
      guidanceCandidateCount: dataSnapshot?.guidanceCandidateCount ?? dataSnapshot?.guidanceItemCount,
      transcriptCandidateCount: dataSnapshot?.transcriptCandidateCount ?? dataSnapshot?.transcriptExtractionCount,
      valuationSemantics: dataSnapshot?.valuationSemantics,
      latestAnnualizedRevenue: dataSnapshot?.latestAnnualizedRevenue,
      latestAnnualizedOperatingIncome: dataSnapshot?.latestAnnualizedOperatingIncome,
      latestAnnualizedFcf: dataSnapshot?.latestAnnualizedFcf,
      latestAnnualizedNetIncome: dataSnapshot?.latestAnnualizedNetIncome,
      dilutedShares: dataSnapshot?.dilutedShares,
      asOfAssumptionOverrideKeys: dataSnapshot?.asOfAssumptionOverrides ? Object.keys(dataSnapshot.asOfAssumptionOverrides) : [],
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
  const text = `${id} ${label}`;
  let score = 0;
  if (/q[1-4]/.test(id) || /q[1-4]/.test(label)) score += 30;
  if (/fy\d{2,4}/.test(id) || /fy\d{2,4}/.test(label)) score += 10;
  if (id.includes("annual-report") || label.includes("annual report")) score += 4;
  if (id.includes("preliminary") || label.includes("preliminary")) score -= 3;
  if (id.startsWith("period-")) score -= 8;
  if (label.includes("market snapshot") || id.includes("market-snapshot")) score -= 20;
  if (/(q[1-4]|fy\d{2,4})e\b/.test(text) || /estimate|estimated|consensus|forecast/.test(text)) score -= 8;
  const yearMatch = text.match(/(?:fy)?(20\d{2}|\d{2})/);
  if (yearMatch) {
    const year = Number(yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1]);
    if (Number.isFinite(year)) score += (year - 2000) / 100;
  }
  const quarterMatch = text.match(/q([1-4])/);
  if (quarterMatch) score += Number(quarterMatch[1]) / 10;
  if (row.runCreatedAt) score += Math.min(Date.parse(row.runCreatedAt) || 0, 4102444800000) / 4102444800000;
  return score;
}

function chooseRepresentativeRow(rows) {
  return [...rows].sort((left, right) =>
    periodPriority(right) - periodPriority(left) ||
    String(right.runCreatedAt || "").localeCompare(String(left.runCreatedAt || ""))
  )[0];
}

function periodIdentity(row) {
  const label = String(row.label || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!label) return null;
  return label;
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

  const dateDeduped = [];
  for (const [asOfDate, dateRows] of byDate) {
    const chosen = chooseRepresentativeRow(dateRows);
    dateDeduped.push(chosen);
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

  const byPeriod = new Map();
  for (const row of dateDeduped) {
    const key = periodIdentity(row);
    if (!key) {
      byPeriod.set(`date:${row.asOfDate}:${row.periodId}`, [row]);
      continue;
    }
    byPeriod.set(key, [...(byPeriod.get(key) || []), row]);
  }

  const deduped = [];
  for (const [period, periodRows] of byPeriod) {
    const chosen = chooseRepresentativeRow(periodRows);
    deduped.push(chosen);
    for (const row of periodRows) {
      if (row !== chosen) {
        exclusions.push({
          periodId: row.periodId,
          asOfDate: row.asOfDate,
          label: row.label,
          fairValue: row.fairValue,
          priceAtDate: row.priceAtDate,
          reason: `same-period duplicate ${period}; kept ${chosen.periodId || chosen.label || chosen.asOfDate}`
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

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function methodText(method) {
  return [
    method?.key,
    method?.label,
    method?.description,
    method?.valuationBase
  ].filter(Boolean).join(" ").toLowerCase();
}

function isNegatedPriceReference(text) {
  return /no current trading multiple|no (?:current )?(?:market )?price|not (?:derived|anchored|based|built|using|used).{0,50}(?:price|market|trading multiple)|not allowed.{0,50}(?:price|market)|diagnostic only|audit only|comparison only|upside|downside|expected return|margin of safety/.test(text);
}

function priceAnchoredMethodSignals(methods = []) {
  return methods
    .filter((method) => {
      const text = methodText(method);
      if (!text || isNegatedPriceReference(text)) return false;
      return /price anchor|anchored to (?:current )?(?:market )?price|derived from (?:current )?(?:market )?price|based on (?:current )?(?:market )?price|current trading multiple|current market multiple|market price multiple/.test(text);
    })
    .map((method) => ({
      key: method?.key || null,
      label: method?.label || null,
      description: method?.description || null,
      valuationBase: method?.valuationBase || null
    }));
}

function rowHasFinancialOrGuidanceEvidence(row) {
  const snapshot = row?.dataSnapshot || {};
  const sourceText = JSON.stringify({
    sourceType: row?.sourceType,
    fiscalQuarter: row?.fiscalQuarter,
    label: row?.label,
    method: row?.method,
    snapshot
  }).toLowerCase();
  return Boolean(
    snapshot.financialPeriodCount ||
    snapshot.segmentFinancialCount ||
    snapshot.selectedFinancialPeriod ||
    snapshot.latestFinancialPeriod ||
    snapshot.latestAnnualizedRevenue ||
    snapshot.latestAnnualizedOperatingIncome ||
    snapshot.latestAnnualizedFcf ||
    snapshot.guidanceCandidateCount ||
    snapshot.valuationSemantics ||
    /financial|guidance|forecast|run-rate|run rate|revenue|fcf|eps|ebit|income|margin|actual/.test(sourceText)
  );
}

function valuePriceCorrelation(rows) {
  const points = rows
    .filter((row) => Number.isFinite(row.fairValue) && Number.isFinite(row.priceAtDate))
    .map((row) => [row.fairValue, row.priceAtDate]);
  if (points.length < 3) return null;
  const fairMean = points.reduce((sum, [fair]) => sum + fair, 0) / points.length;
  const priceMean = points.reduce((sum, [, price]) => sum + price, 0) / points.length;
  let covariance = 0;
  let fairVariance = 0;
  let priceVariance = 0;
  for (const [fair, price] of points) {
    const fairDelta = fair - fairMean;
    const priceDelta = price - priceMean;
    covariance += fairDelta * priceDelta;
    fairVariance += fairDelta * fairDelta;
    priceVariance += priceDelta * priceDelta;
  }
  return fairVariance && priceVariance ? covariance / Math.sqrt(fairVariance * priceVariance) : null;
}

function ratioStdDev(rows) {
  const ratios = rows
    .filter((row) => row.priceAtDate > 0 && row.fairValue > 0)
    .map((row) => row.fairValue / row.priceAtDate);
  if (ratios.length < 2) return 0;
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  return Math.sqrt(ratios.reduce((sum, ratio) => sum + (ratio - mean) ** 2, 0) / (ratios.length - 1));
}

function auditModelInputs(snapshot) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const methodCards = Array.isArray(snapshot.methodCards) ? snapshot.methodCards : [];
  const historyMethods = history.flatMap((row) => Array.isArray(row.methodOutputs) ? row.methodOutputs : []);
  const methods = [...methodCards, ...historyMethods];
  const priceSignals = priceAnchoredMethodSignals(methods);
  const sourceTypes = countBy(history.map((row) => row.sourceType || row.dataSnapshot?.sourceType || row.dataSnapshot?.sourceQuality || null));
  const financialEvidenceRows = history.filter(rowHasFinancialOrGuidanceEvidence).length;
  const currentPriceStoredRows = history.filter((row) => (row.dataSnapshot?.asOfAssumptionOverrideKeys || []).includes("currentPrice")).length;
  const uniqueFairValues = new Set(history.map((row) => Number(row.fairValue).toFixed(4))).size;
  const correlation = valuePriceCorrelation(history);
  const ratioVolatility = ratioStdDev(history);
  const warnings = [];
  let status = "pass";
  let sourceGrade = "event-financials-guidance";

  if (priceSignals.length) {
    status = "fail";
    warnings.push("Potential price-anchored valuation method detected.");
  }
  if (!financialEvidenceRows) {
    status = status === "fail" ? status : "review";
    warnings.push("No financial or guidance input evidence found in the local valuation snapshot.");
  }
  if (history.length < MIN_CLEAN_RUNS || uniqueFairValues <= 1) {
    status = status === "fail" ? status : "review";
    warnings.push("Limited valuation history; cannot verify a full event-driven model path.");
    sourceGrade = "limited-snapshot";
  }
  if (Object.keys(sourceTypes).some((source) => /research_proxy|market_data_proxy/.test(source))) {
    sourceGrade = "research-proxy-financials";
  } else if (Object.keys(sourceTypes).some((source) => /research_only/.test(source))) {
    sourceGrade = "mixed-official-research";
  }
  if (correlation != null && correlation > 0.96 && ratioVolatility < 0.12 && history.length >= 8) {
    status = status === "fail" ? status : "review";
    warnings.push("Fair value is statistically very close to the price path; review model drivers before treating it as independent.");
  }

  return {
    status,
    passesNoPriceAnchorAudit: status !== "fail",
    fairValueInputPolicy: priceSignals.length ? "price-anchor-risk" : "financial-guidance-and-scenario-inputs",
    priceUsage: currentPriceStoredRows ? "stored-for-comparison-upside-and-returns" : "comparison-price-series-only",
    sourceGrade,
    valuationRows: history.length,
    financialOrGuidanceEvidenceRows: financialEvidenceRows,
    currentPriceStoredRows,
    methodPriceAnchorSignalCount: priceSignals.length,
    methodPriceAnchorSignals: priceSignals.slice(0, 8),
    sourceTypes,
    fairValuePriceCorrelation: correlation,
    fairToPriceRatioStdDev: ratioVolatility,
    uniqueFairValues,
    warnings
  };
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

function buildScenarioFromHistoryRow(row, run, scenario = "Base") {
  const currentPrice = finiteNumber(row?.priceAtDate ?? row?.currentPrice ?? run?.currentPrice);
  const fairValue = finiteNumber(row?.fairValue ?? run?.fairValue);
  return {
    scenario,
    currentPrice,
    fairValue,
    upsideDownside: currentPrice && fairValue ? fairValue / currentPrice - 1 : finiteNumber(row?.upsideDownside ?? run?.upsideDownside),
    targetPrice3Y: finiteNumber(row?.targetPrice3Y ?? run?.targetPrice3Y),
    expectedReturn3Y: finiteNumber(row?.expectedReturn3Y ?? run?.expectedShareholderCagr),
    recommendedMethod: row?.method || methodLabel(methodCardsFromRun(run)),
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
  const latestFairValue = finiteNumber(latestHistoryRow?.fairValue ?? latestRun.fairValue);
  const latestAnchorPrice = finiteNumber(latestHistoryRow?.priceAtDate ?? latestHistoryRow?.currentPrice ?? latestRun.currentPrice);
  const latestAnchorDate = latestHistoryRow?.asOfDate || latestRun.asOfDate;
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const targetPrice3Y = finiteNumber(latestHistoryRow?.targetPrice3Y ?? latestRun.targetPrice3Y);
  const expectedReturn3Y =
    latestMarketPrice && targetPrice3Y
      ? (targetPrice3Y / latestMarketPrice) ** (1 / 3) - 1
      : finiteNumber(latestHistoryRow?.expectedReturn3Y ?? latestRun.expectedShareholderCagr);

  const methodCards = methodCardsFromRun(latestRun);
  const sourceNote = "Legacy Fundamental Analysis backend valuation runs: each fair-value bar is recomputed from event-visible financials/guidance and scenario assumptions; market price is used only for comparison, upside/downside, and return math.";
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
      valuationAnchorPrice: latestAnchorPrice,
      valuationAnchorDate: latestAnchorDate,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRun.upsideDownside),
      targetPrice3Y,
      expectedReturn3Y
    },
    scenarios: [buildScenarioFromHistoryRow(latestHistoryRow, latestRun, "Base")],
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
      legacyValuationRows: history.length,
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
      fairValueSource: "Legacy Fundamental Analysis financial/guidance model",
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

function normalizeHistoryRow(row, snapshot) {
  const asOfDate = row.asOfDate || row.valuationDate || row.priceDate || row.date;
  const pricePoint = pricePointAtOrBefore(snapshot.priceHistory, asOfDate);
  const fairValue = finiteNumber(row.fairValue ?? row.close);
  const priceAtDate = finiteNumber(pricePoint?.close ?? row.priceAtDate ?? row.currentPrice);
  return {
    ...row,
    asOfDate,
    currentPrice: priceAtDate,
    priceAtDate,
    priceDate: pricePoint?.date || row.priceDate || asOfDate,
    fairValue,
    upsideDownside: Number.isFinite(fairValue) && Number.isFinite(priceAtDate) && priceAtDate > 0
      ? fairValue / priceAtDate - 1
      : finiteNumber(row.upsideDownside),
    dataSnapshot: {
      ...(row.dataSnapshot || {}),
      asOfPriceSource: pricePoint ? {
        ...(row.dataSnapshot?.asOfPriceSource || {}),
        priceDate: pricePoint.date,
        source: pricePoint.source || "local daily close fallback"
      } : row.dataSnapshot?.asOfPriceSource
    }
  };
}

function sanitizeTickerSnapshot(snapshot) {
  const rawHistory = Array.isArray(snapshot.history) ? snapshot.history : [];
  if (!rawHistory.length) return snapshot;

  const normalizedRows = rawHistory
    .map((row) => normalizeHistoryRow(row, snapshot))
    .filter((row) => row.asOfDate && Number.isFinite(row.fairValue));
  const { history, exclusions } = sanitizeHistoryRows(normalizedRows);
  if (!history.length) return snapshot;

  const latestHistoryRow = history.at(-1);
  const latestPrice = latestPricePoint(snapshot.priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const latestFairValue = finiteNumber(latestHistoryRow.fairValue);
  const latestAnchorPrice = finiteNumber(latestHistoryRow.priceAtDate ?? latestHistoryRow.currentPrice);
  const targetPrice3Y = finiteNumber(latestHistoryRow.targetPrice3Y ?? snapshot.latest?.targetPrice3Y);
  const expectedReturn3Y =
    latestMarketPrice && targetPrice3Y
      ? (targetPrice3Y / latestMarketPrice) ** (1 / 3) - 1
      : finiteNumber(latestHistoryRow.expectedReturn3Y ?? snapshot.latest?.expectedReturn3Y);
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const hasLivePriceSeries = pricePoints >= 120;
  const inferredCoverageKind = coverageKind(history);
  const existingCoverageKind = snapshot.dataQuality?.valuationCoverageKind;
  const valuationCoverageKind = existingCoverageKind === "quarterly" && inferredCoverageKind !== "quarterly"
    ? inferredCoverageKind
    : existingCoverageKind || inferredCoverageKind;
  const scenario = snapshot.scenarios?.[0] || {};
  const nextSnapshot = {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    latest: {
      ...(snapshot.latest || {}),
      latestPrice: latestMarketPrice ?? snapshot.latest?.latestPrice ?? null,
      latestPriceDate: latestPrice?.date || snapshot.latest?.latestPriceDate || null,
      latestPriceSource: latestPrice?.source || snapshot.latest?.latestPriceSource || snapshot.priceSource || null,
      valuationAnchorPrice: latestAnchorPrice,
      valuationAnchorDate: latestHistoryRow.asOfDate,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : latestHistoryRow.upsideDownside,
      targetPrice3Y,
      expectedReturn3Y
    },
    scenarios: [{
      ...scenario,
      scenario: scenario.scenario || "Base",
      currentPrice: latestAnchorPrice,
      fairValue: latestFairValue,
      upsideDownside: Number.isFinite(latestAnchorPrice) && latestAnchorPrice > 0 ? latestFairValue / latestAnchorPrice - 1 : latestHistoryRow.upsideDownside,
      targetPrice3Y,
      expectedReturn3Y
    }],
    history
  };
  const modelInputAudit = auditModelInputs(nextSnapshot);

  return {
    ...nextSnapshot,
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries,
      priceDisplayMode: hasLivePriceSeries ? "daily-price-line" : "as-of-price-anchors",
      valuationCoverageKind,
      hasQuarterlyValuationRuns: valuationCoverageKind === "quarterly",
      snapshotRawValuationRows: rawHistory.length,
      excludedSnapshotRows: exclusions.length,
      excludedSnapshotRowDetails: exclusions.slice(0, 12),
      modelInputAudit
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

const sanitized = [];
for (const [ticker, snapshot] of currentTickers) {
  const updated = sanitizeTickerSnapshot(snapshot);
  currentTickers.set(ticker, updated);
  currentDb.prepare(`
    INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run(ticker, updated.generatedAt || new Date().toISOString(), JSON.stringify(updated));
  const excludedRows = Number(updated.dataQuality?.excludedSnapshotRows || 0);
  if (excludedRows > 0) {
    sanitized.push({
      ticker,
      excludedRows,
      historyRows: updated.history?.length || 0,
      coverageKind: updated.dataQuality?.valuationCoverageKind
    });
  }
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
  modelInputAuditPassCount: [...currentTickers.values()].filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "pass").length,
  modelInputAuditReviewCount: [...currentTickers.values()].filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "review").length,
  modelInputAuditFailCount: [...currentTickers.values()].filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "fail").length,
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
    priceSource: "Current local price history for comparison and return math only",
    modelInputPolicy: "Fair value must be driven by event-visible financials, guidance, and scenario assumptions; price is not accepted as a fair-value input."
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
  sanitized,
  skipped,
  summary
}, null, 2));
