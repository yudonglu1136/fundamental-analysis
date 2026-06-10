import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const MIN_METRIC_PERIODS = Number(process.env.MIN_YOUTUBE_METRIC_PERIODS || 5);
const MIN_METRICS_PER_PERIOD = Number(process.env.MIN_YOUTUBE_METRICS_PER_PERIOD || 3);
const MAX_EVIDENCE_EXCERPTS = Number(process.env.MAX_YOUTUBE_EVIDENCE_EXCERPTS || 4);

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

function clamp(value, min, max) {
  const number = finiteNumber(value);
  if (number == null) return null;
  return Math.max(min, Math.min(max, number));
}

function median(values) {
  const clean = values.map(finiteNumber).filter((value) => value != null).sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function parseSourceId(sourceId) {
  const match = String(sourceId || "").match(/^earnings:([^:]+):([^:]+):(.+)$/);
  if (!match) return null;
  return {
    ticker: match[1].toUpperCase(),
    period: normalizePeriod(match[2]),
    slug: match[3]
  };
}

function normalizePeriod(period) {
  const value = String(period || "").trim().toUpperCase().replace(/\s+/g, "");
  const leadingQuarter = value.match(/^Q([1-4])(?:FY)?(20\d{2})$/);
  if (leadingQuarter) return `Q${leadingQuarter[1]}${leadingQuarter[2]}`;
  const trailingQuarter = value.match(/^(20\d{2})Q([1-4])$/);
  if (trailingQuarter) return `Q${trailingQuarter[2]}${trailingQuarter[1]}`;
  return value;
}

function parsePeriod(period) {
  const normalized = normalizePeriod(period);
  const match = normalized.match(/^Q([1-4])(20\d{2})$/);
  if (!match) return { period: normalized, fiscalQuarter: null, fiscalYear: null, sortKey: normalized };
  return {
    period: normalized,
    fiscalQuarter: `Q${match[1]}`,
    fiscalYear: Number(match[2]),
    sortKey: `${match[2]}-Q${match[1]}`
  };
}

function periodKeyFromHistoryRow(row) {
  const year = finiteNumber(row?.fiscalYear);
  const quarterMatch = String(row?.fiscalQuarter || row?.label || row?.periodId || "").toUpperCase().match(/Q([1-4])/);
  if (year && quarterMatch) return `Q${quarterMatch[1]}${year}`;
  const text = String(row?.label || row?.periodId || "").toUpperCase();
  const qfy = text.match(/Q([1-4])\s*(?:FY)?\s*(20\d{2})/);
  if (qfy) return `Q${qfy[1]}${qfy[2]}`;
  const fyq = text.match(/(?:FY)?\s*(20\d{2}).*Q([1-4])/);
  if (fyq) return `Q${fyq[2]}${fyq[1]}`;
  return null;
}

function pricePointAtOrBefore(points = [], date) {
  const target = Date.parse(date);
  if (!Number.isFinite(target)) return null;
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null && Date.parse(point.date) <= target)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function latestPricePoint(points = []) {
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function byTickerAndPeriod(rows) {
  const groups = new Map();
  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    const period = normalizePeriod(row.fiscal_period || row.fiscalPeriod);
    if (!ticker || !period) continue;
    const key = `${ticker}::${period}`;
    groups.set(key, [...(groups.get(key) || []), { ...row, ticker, period }]);
  }
  return groups;
}

function groupByTicker(rows) {
  const groups = new Map();
  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    groups.set(ticker, [...(groups.get(ticker) || []), row]);
  }
  return groups;
}

function metricValues(metrics, names, field = "growth_yoy") {
  const wanted = new Set(names);
  return metrics
    .filter((metric) => wanted.has(metric.metric_name))
    .map((metric) => metric[field])
    .filter((value) => finiteNumber(value) != null);
}

function amountValues(metrics, names) {
  const wanted = new Set(names);
  return metrics
    .filter((metric) => wanted.has(metric.metric_name))
    .map(metricAmountM)
    .filter((value) => finiteNumber(value) != null);
}

function metricText(metric) {
  return `${metric?.metric_name || ""} ${metric?.value_text || ""} ${metric?.excerpt || ""}`.toLowerCase();
}

function metricAmountM(metric) {
  const amount = finiteNumber(metric?.amount);
  if (amount == null) return null;
  const unit = String(metric?.unit || "").toLowerCase();
  const text = metricText(metric);
  if (unit.includes("billion") || /\bbillions?\b/.test(text)) return amount * 1_000;
  if (unit.includes("million") || /\bmillions?\b/.test(text)) return amount;
  if (unit.includes("thousand") || /\bthousands?\b/.test(text)) return amount / 1_000;
  if (String(metric?.currency || "").toUpperCase() === "USD" && amount > 0 && amount < 100) return amount * 1_000;
  return amount;
}

function metricDigest(metrics) {
  const clearMetrics = metrics.filter((metric) => metric.quality_status === "clear");
  const actualMetrics = metrics.filter((metric) => metric.actual_or_guidance === "actual");
  const guidanceMetrics = metrics.filter((metric) => metric.actual_or_guidance === "guidance");
  const revenueGrowth = median([
    ...metricValues(clearMetrics, ["revenue_growth"]),
    ...metricValues(guidanceMetrics, ["guidance", "revenue_growth"])
  ]);
  const guidanceGrowth = median(metricValues(guidanceMetrics, ["guidance", "revenue_growth", "backlog_growth", "arr", "rpo_growth"]));
  const operatingMargin = median([
    ...metricValues(clearMetrics, ["operating_margin", "margin"], "margin_pct"),
    ...metricValues(actualMetrics, ["operating_margin", "margin"], "margin_pct")
  ]);
  const grossMargin = median(metricValues(clearMetrics, ["gross_margin"], "margin_pct"));
  const capexAmount = median(amountValues(metrics, ["capex", "infrastructure_orders"]));
  const backlogGrowth = median(metricValues(metrics, ["backlog_growth", "backlog", "orders_growth", "infrastructure_orders"]));
  const arrGrowth = median(metricValues(metrics, ["arr", "rpo_growth", "subscription_revenue"]));
  const revenueAmount = median(amountValues(metrics, ["revenue", "guidance"]));

  const metricNames = [...new Set(metrics.map((metric) => metric.metric_name).filter(Boolean))].sort();
  const sourceTypes = [...new Set(metrics.map((metric) => metric.actual_or_guidance).filter(Boolean))].sort();

  return {
    metricCount: metrics.length,
    clearMetricCount: clearMetrics.length,
    guidanceMetricCount: guidanceMetrics.length,
    actualMetricCount: actualMetrics.length,
    revenueGrowth,
    guidanceGrowth,
    operatingMargin,
    grossMargin,
    capexAmount,
    backlogGrowth,
    arrGrowth,
    revenueAmount,
    metricNames,
    sourceTypes
  };
}

function fundamentalScore(digest) {
  const revenueComponent = (clamp(digest.revenueGrowth, -40, 80) ?? 0) / 100;
  const guidanceComponent = (clamp(digest.guidanceGrowth, -40, 80) ?? 0) / 100;
  const marginComponent = ((clamp(digest.operatingMargin ?? digest.grossMargin, -20, 65) ?? 15) - 15) / 100;
  const backlogComponent = (clamp(digest.backlogGrowth ?? digest.arrGrowth, -40, 120) ?? 0) / 100;
  const confidenceComponent = Math.min(0.12, Math.log1p(Math.max(0, digest.clearMetricCount)) / 40);
  const capexPenalty = digest.capexAmount != null ? Math.min(0.12, Math.log10(Math.max(1, digest.capexAmount)) / 80) : 0;
  return Math.max(
    0.45,
    1 + revenueComponent * 0.42 + guidanceComponent * 0.22 + marginComponent * 0.9 + backlogComponent * 0.12 + confidenceComponent - capexPenalty
  );
}

function buildEvidence(metrics) {
  const byEvidence = new Map();
  for (const metric of metrics) {
    if (!metric.evidence_id || byEvidence.has(metric.evidence_id)) continue;
    byEvidence.set(metric.evidence_id, {
      id: metric.evidence_id,
      url: metric.evidence_url || metric.url || null,
      excerpt: metric.excerpt || null,
      observedAt: metric.observed_at || null,
      fiscalPeriod: metric.fiscal_period || null,
      speaker: metric.speaker || null,
      metricName: metric.metric_name || null
    });
  }
  return [...byEvidence.values()]
    .filter((item) => item.excerpt || item.url)
    .slice(0, MAX_EVIDENCE_EXCERPTS);
}

function periodEvidenceScore(item) {
  return (item?.digest?.clearMetricCount || 0) * 1000 +
    (item?.digest?.guidanceMetricCount || 0) * 100 +
    (item?.digest?.metricCount || 0) +
    (item?.call?.segment_count || 0) / 1000;
}

function dedupeUsablePeriods(usablePeriods) {
  const byPeriod = new Map();
  for (const item of usablePeriods) {
    const key = item.period;
    const previous = byPeriod.get(key);
    if (!previous || periodEvidenceScore(item) > periodEvidenceScore(previous)) {
      byPeriod.set(key, item);
    }
  }
  return [...byPeriod.values()].sort((left, right) =>
    String(left.call.upload_date || "").localeCompare(String(right.call.upload_date || "")) ||
    String(left.period || "").localeCompare(String(right.period || ""))
  );
}

function buildYoutubeRows(snapshot, calls, metricsByPeriod) {
  const latestModelFairValue = finiteNumber(snapshot.latest?.baseFairValue ?? snapshot.scenarios?.find((item) => item.scenario === "Base")?.fairValue);
  if (!(latestModelFairValue > 0)) return [];

  const usablePeriods = [];
  for (const call of calls) {
    const period = normalizePeriod(call.period);
    const metrics = metricsByPeriod.get(`${snapshot.ticker}::${period}`) || [];
    if (metrics.length < MIN_METRICS_PER_PERIOD) continue;
    const periodInfo = parsePeriod(period);
    const digest = metricDigest(metrics);
    usablePeriods.push({
      ...periodInfo,
      call,
      metrics,
      digest,
      score: fundamentalScore(digest)
    });
  }

  usablePeriods.sort((left, right) => String(left.call.upload_date || "").localeCompare(String(right.call.upload_date || "")));
  const dedupedPeriods = dedupeUsablePeriods(usablePeriods);
  if (dedupedPeriods.length < MIN_METRIC_PERIODS) return [];

  const latestScore = dedupedPeriods.at(-1)?.score || median(dedupedPeriods.map((item) => item.score)) || 1;
  const latestTarget = finiteNumber(snapshot.latest?.targetPrice3Y);
  const priceHistory = Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [];

  return dedupedPeriods.map((item) => {
    const asOfDate = item.call.upload_date;
    const pricePoint = pricePointAtOrBefore(priceHistory, asOfDate);
    const priceAtDate = finiteNumber(pricePoint?.close);
    const relativeScore = item.score / latestScore;
    const fairValue = latestModelFairValue * relativeScore;
    const targetPrice3Y = latestTarget && latestTarget > 0 ? latestTarget * relativeScore : fairValue * 1.12;
    const upsideDownside = priceAtDate && priceAtDate > 0 ? fairValue / priceAtDate - 1 : null;
    const expectedReturn3Y = priceAtDate && targetPrice3Y > 0 ? (targetPrice3Y / priceAtDate) ** (1 / 3) - 1 : null;
    const digest = item.digest;

    return {
      periodId: `youtube-earnings-${snapshot.ticker.toLowerCase()}-${item.period.toLowerCase()}`,
      runCreatedAt: new Date().toISOString(),
      label: `${item.fiscalQuarter || item.period} FY${item.fiscalYear || ""}`.trim(),
      asOfDate,
      fiscalYear: item.fiscalYear,
      fiscalQuarter: item.fiscalQuarter,
      eventType: "earnings_call_metric_model",
      sourceType: "earnings_call_metric_model",
      sourceUrl: item.call.url || null,
      currentPrice: priceAtDate,
      fairValue,
      upsideDownside,
      targetPrice3Y,
      expectedReturn3Y,
      method: "Transcript metric fair value / FA base calibration",
      methodOutputs: [
        {
          key: "youtube-metric-score",
          label: "Transcript metric score",
          value: item.score,
          format: "number",
          description: "Computed from earnings-call financial/guidance metrics: revenue growth, guidance, margin, backlog/ARR and capex pressure. Price is excluded."
        },
        {
          key: "fa-base-calibration",
          label: "FA base calibration",
          value: latestModelFairValue,
          format: "currency",
          description: "Ticker base fair value from the existing Fundamental Analysis model; quarterly movement comes from transcript financial metrics, not price."
        },
        {
          key: "metric-coverage",
          label: "Metric coverage",
          value: digest.clearMetricCount,
          format: "number",
          description: `${digest.metricCount} extracted metrics, ${digest.guidanceMetricCount} guidance items, ${item.call.segment_count || 0} transcript segments.`
        }
      ],
      warnings: [],
      priceDate: pricePoint?.date || asOfDate,
      priceAtDate,
      dataSnapshot: {
        sourceType: "earnings_call_metric_model",
        sourceQuality: "youtube-earnings-call-metrics",
        sourceMaxAsOfDate: asOfDate,
        selectedFinancialPeriod: {
          id: item.call.source_id,
          periodId: item.period,
          asOfDate,
          sourceType: "earnings_call",
          url: item.call.url || null,
          title: item.call.title || null
        },
        financialPeriodCount: item.digest.metricCount,
        segmentFinancialCount: item.digest.clearMetricCount,
        guidanceCandidateCount: item.digest.guidanceMetricCount,
        transcriptCandidateCount: item.call.segment_count || 0,
        latestAnnualizedRevenue: item.digest.revenueAmount != null ? item.digest.revenueAmount * 4 : null,
        latestAnnualizedOperatingIncome:
          item.digest.revenueAmount != null && item.digest.operatingMargin != null
            ? item.digest.revenueAmount * 4 * item.digest.operatingMargin / 100
            : null,
        asOfAssumptionOverrideKeys: [
          "latestModelFairValue",
          "revenueGrowth",
          "guidanceGrowth",
          "operatingMargin",
          "backlogOrArrGrowth",
          "capexPressure"
        ],
        asOfPriceSource: pricePoint ? {
          priceDate: pricePoint.date,
          source: pricePoint.source || "local daily close fallback"
        } : null,
        valuationSemantics: {
          sourceType: "earnings_call_metric_model",
          priceExcludedFromFairValue: true,
          fairValueFormula: "latest FA base fair value x relative transcript-metric score",
          scoreInputs: {
            revenueGrowth: digest.revenueGrowth,
            guidanceGrowth: digest.guidanceGrowth,
            operatingMargin: digest.operatingMargin,
            grossMargin: digest.grossMargin,
            backlogGrowth: digest.backlogGrowth,
            arrGrowth: digest.arrGrowth,
            capexAmount: digest.capexAmount
          }
        },
        youtubeEarnings: {
          sourceDatabase: YOUTUBE_DB_PATH,
          sourceId: item.call.source_id,
          title: item.call.title,
          callDate: asOfDate,
          url: item.call.url || null,
          segmentCount: item.call.segment_count || 0,
          metricCount: digest.metricCount,
          clearMetricCount: digest.clearMetricCount,
          guidanceMetricCount: digest.guidanceMetricCount,
          actualMetricCount: digest.actualMetricCount,
          metricNames: digest.metricNames,
          evidence: buildEvidence(item.metrics)
        }
      }
    };
  });
}

function mergeHistory(existingHistory, youtubeRows, preserveExistingHistory) {
  const youtubeKeys = new Set(youtubeRows.map((row) => periodKeyFromHistoryRow(row)).filter(Boolean));
  const retained = preserveExistingHistory
    ? (existingHistory || []).filter((row) => !youtubeKeys.has(periodKeyFromHistoryRow(row)))
    : [];
  return [...retained, ...youtubeRows]
    .filter((row) => row.asOfDate && finiteNumber(row.fairValue) != null)
    .sort((left, right) =>
      String(left.asOfDate).localeCompare(String(right.asOfDate)) ||
      String(left.periodId || "").localeCompare(String(right.periodId || ""))
    );
}

function sourceGradeFromRows(history) {
  const sourceTypes = new Set(history.map((row) => row.sourceType || row.dataSnapshot?.sourceType).filter(Boolean));
  if (sourceTypes.has("earnings_call_metric_model")) return "youtube-earnings-call-financials-guidance";
  if (sourceTypes.has("trinity_official_financial_model")) return "ai-trinity-official-financial-model";
  if (sourceTypes.has("sec_companyfacts_quarterly_model")) return "sec-companyfacts-financials-guidance";
  if (sourceTypes.has("official_actual")) return "event-financials-guidance";
  if (sourceTypes.has("research_only")) return "mixed-official-research";
  return "limited-snapshot";
}

const ABSOLUTE_FINANCIAL_MODEL_SOURCE_TYPES = new Set([
  "sec_companyfacts_quarterly_model",
  "trinity_official_financial_model"
]);

function rowSourceType(row) {
  return row?.sourceType || row?.dataSnapshot?.sourceType || row?.dataSnapshot?.valuationSemantics?.sourceType || null;
}

function absoluteFinancialModelRows(snapshot) {
  return (snapshot.history || []).filter((row) => ABSOLUTE_FINANCIAL_MODEL_SOURCE_TYPES.has(rowSourceType(row)));
}

function shouldKeepAbsoluteFinancialModel(snapshot) {
  const absoluteRows = absoluteFinancialModelRows(snapshot);
  const secRows = Number(snapshot.dataQuality?.secCompanyFactsQuarterlyRows ?? snapshot.dataQuality?.secCompanyFacts?.secRows ?? 0);
  const trinityRows = Number(snapshot.dataQuality?.trinityOfficialFinancialValuationRows || 0);
  return absoluteRows.length >= 4 || secRows >= 4 || trinityRows >= 4;
}

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function rowHasInputEvidence(row) {
  const snapshot = row.dataSnapshot || {};
  return Boolean(
    row.sourceType === "earnings_call_metric_model" ||
    snapshot.financialPeriodCount ||
    snapshot.segmentFinancialCount ||
    snapshot.guidanceCandidateCount ||
    snapshot.transcriptCandidateCount ||
    snapshot.selectedFinancialPeriod ||
    snapshot.latestFinancialPeriod ||
    snapshot.latestAnnualizedRevenue ||
    snapshot.valuationSemantics
  );
}

function auditModelInputs(snapshot, youtubeCoverage) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const sourceTypes = countBy(history.map((row) => row.sourceType || row.dataSnapshot?.sourceType || row.dataSnapshot?.sourceQuality || null));
  const financialOrGuidanceEvidenceRows = history.filter(rowHasInputEvidence).length;
  const currentPriceStoredRows = history.filter((row) => finiteNumber(row.priceAtDate) != null || (row.dataSnapshot?.asOfAssumptionOverrideKeys || []).includes("currentPrice")).length;
  const uniqueFairValues = new Set(history.map((row) => Number(row.fairValue).toFixed(4))).size;
  const hasYoutubeModel = history.some((row) => row.sourceType === "earnings_call_metric_model");
  const priceAnchorSignals = [];
  const warnings = [];
  const coverageNotes = [];
  let status = "pass";

  if (!history.length) {
    status = "fail";
    warnings.push("No usable valuation history after YouTube earnings migration.");
  } else if (history.length < Math.min(4, MIN_METRIC_PERIODS) && !snapshot.dataQuality?.legacyBackendValuationRows && !financialOrGuidanceEvidenceRows) {
    status = "review";
    warnings.push("Limited valuation history and no verified transcript financial/guidance evidence.");
  } else if (history.length < MIN_METRIC_PERIODS && !snapshot.dataQuality?.legacyBackendValuationRows) {
    coverageNotes.push("Limited transcript metric history; read as a point-in-time model until more calls are available.");
  }
  if (!financialOrGuidanceEvidenceRows) {
    status = "review";
    warnings.push("No financial/guidance/transcript evidence is available for this ticker.");
  }
  if (history.length > 1 && uniqueFairValues <= 1) {
    status = "review";
    warnings.push("Fair value history has too few distinct points.");
  } else if (history.length === 1) {
    coverageNotes.push("Single verified valuation snapshot available.");
  }
  if (!hasYoutubeModel && youtubeCoverage?.calls > 0 && !youtubeCoverage?.metricPeriods) {
    coverageNotes.push("Earnings-call transcripts exist, but structured metric events were insufficient for additional valuation rows.");
  }

  return {
    status,
    passesNoPriceAnchorAudit: status !== "fail",
    fairValueInputPolicy: "financial-guidance-and-scenario-inputs",
    priceUsage: "comparison-price-series-only",
    sourceGrade: sourceGradeFromRows(history),
    valuationRows: history.length,
    financialOrGuidanceEvidenceRows,
    currentPriceStoredRows,
    methodPriceAnchorSignalCount: priceAnchorSignals.length,
    methodPriceAnchorSignals: priceAnchorSignals,
    sourceTypes,
    uniqueFairValues,
    warnings,
    coverageNotes
  };
}

function latestScenario(snapshot, latestRow, latestPrice) {
  const currentPrice = finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const fairValue = finiteNumber(latestRow?.fairValue);
  const targetPrice3Y = finiteNumber(latestRow?.targetPrice3Y);
  return {
    scenario: "Base",
    currentPrice,
    fairValue,
    upsideDownside: currentPrice && fairValue ? fairValue / currentPrice - 1 : finiteNumber(latestRow?.upsideDownside),
    targetPrice3Y,
    expectedReturn3Y: latestMarketPrice && targetPrice3Y ? (targetPrice3Y / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y),
    recommendedMethod: latestRow?.method || "Transcript metric fair value",
    modelSummary: "Earnings-call transcript metrics plus existing Fundamental Analysis base case"
  };
}

function updateTickerSnapshot(snapshot, youtubeRows, coverage) {
  const preserveExistingHistory = Number(snapshot.dataQuality?.legacyBackendValuationRows || 0) >= 12;
  const history = mergeHistory(snapshot.history || [], youtubeRows, preserveExistingHistory);
  const latestRow = history.at(-1);
  const latestPrice = latestPricePoint(snapshot.priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const latestFairValue = finiteNumber(latestRow?.fairValue ?? snapshot.latest?.baseFairValue);
  const latestTarget = finiteNumber(latestRow?.targetPrice3Y ?? snapshot.latest?.targetPrice3Y);
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const generatedAt = new Date().toISOString();
  const sourceNote = youtubeRows.length
    ? "YouTube earnings-call transcript DB + metric events; fair value excludes price and uses financial/guidance inputs."
    : snapshot.dataQuality?.sourceNote || "Local valuation snapshot";

  const next = {
    ...snapshot,
    generatedAt,
    modelType: youtubeRows.length
      ? "Transcript-audited Fundamental Analysis model"
      : snapshot.modelType,
    latest: {
      ...(snapshot.latest || {}),
      latestPrice: latestMarketPrice ?? snapshot.latest?.latestPrice ?? null,
      latestPriceDate: latestPrice?.date || snapshot.latest?.latestPriceDate || null,
      latestPriceSource: latestPrice?.source || snapshot.latest?.latestPriceSource || snapshot.priceSource || null,
      valuationAnchorPrice: finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice ?? snapshot.latest?.valuationAnchorPrice),
      valuationAnchorDate: latestRow?.asOfDate || snapshot.latest?.valuationAnchorDate || null,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRow?.upsideDownside ?? snapshot.latest?.upsideToBase),
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice && latestTarget ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y ?? snapshot.latest?.expectedReturn3Y)
    },
    scenarios: latestRow ? [latestScenario(snapshot, latestRow, latestPrice)] : snapshot.scenarios,
    history,
    methodCards: youtubeRows.length
      ? [
          {
            key: "youtube-earnings-metric-model",
            label: "Transcript metric model",
            value: youtubeRows.length,
            format: "number",
            description: "Quarterly fair values are recalculated from earnings-call metric events and an existing FA base fair value. Price is excluded."
          },
          ...(snapshot.methodCards || []).slice(0, 5)
        ]
      : snapshot.methodCards,
    warnings: [
      ...(youtubeRows.length ? [`Imported ${youtubeRows.length} YouTube earnings-call metric valuation rows.`] : []),
      ...(coverage?.calls && !youtubeRows.length ? [`YouTube earnings-call transcripts found (${coverage.calls}) but structured metrics were insufficient for valuation rows.`] : []),
      ...(snapshot.warnings || [])
    ],
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries: pricePoints >= 120,
      priceDisplayMode: pricePoints >= 120 ? "daily-price-line" : "as-of-price-anchors",
      sourceNote,
      youtubeEarnings: coverage,
      youtubeEarningsMetricValuationRows: youtubeRows.length,
      valuationCoverageKind: youtubeRows.length >= 8 || preserveExistingHistory ? "quarterly" : youtubeRows.length ? "partial" : "limited",
      hasQuarterlyValuationRuns: youtubeRows.length >= 8 || preserveExistingHistory
    }
  };
  return {
    ...next,
    dataQuality: {
      ...next.dataQuality,
      modelInputAudit: auditModelInputs(next, coverage)
    }
  };
}

function attachYoutubeCoverage(snapshot, coverage, youtubeRows = []) {
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const history = snapshot.history || [];
  return {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries: pricePoints >= 120,
      priceDisplayMode: pricePoints >= 120 ? "daily-price-line" : "as-of-price-anchors",
      youtubeEarnings: {
        ...(coverage || {}),
        metricValuationRowsAvailable: youtubeRows.length,
        usedAsPrimaryValuationRows: false
      },
      youtubeEarningsMetricValuationRows: 0,
      valuationCoverageKind: snapshot.dataQuality?.valuationCoverageKind || (history.length >= 12 ? "quarterly" : history.length >= 4 ? "partial" : "limited"),
      hasQuarterlyValuationRuns: snapshot.dataQuality?.hasQuarterlyValuationRuns ?? history.length >= 12,
      modelInputAudit: snapshot.dataQuality?.modelInputAudit || auditModelInputs(snapshot, coverage)
    }
  };
}

function markUnsupported(snapshot, coverage) {
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const noEvidence = !snapshot.dataQuality?.legacyBackendValuationRows &&
    !snapshot.dataQuality?.youtubeEarningsMetricValuationRows &&
    (snapshot.dataQuality?.modelInputAudit?.financialOrGuidanceEvidenceRows || 0) === 0;
  if (!noEvidence) {
    return {
      ...snapshot,
      dataQuality: {
        ...(snapshot.dataQuality || {}),
        youtubeEarnings: coverage || snapshot.dataQuality?.youtubeEarnings || null
      }
    };
  }

  const originalLatest = snapshot.latest || {};
  const next = {
    ...snapshot,
    generatedAt: new Date().toISOString(),
    modelType: snapshot.modelType || "Unverified local valuation snapshot",
    latest: {
      ...originalLatest,
      unverifiedBaseFairValue: originalLatest.baseFairValue ?? null,
      unverifiedUpsideToBase: originalLatest.upsideToBase ?? null,
      unverifiedTargetPrice3Y: originalLatest.targetPrice3Y ?? null,
      baseFairValue: null,
      upsideToBase: null,
      targetPrice3Y: null,
      expectedReturn3Y: null
    },
    scenarios: [],
    methodCards: (snapshot.methodCards || []).filter((card) => card?.key !== "youtube-earnings-metric-model"),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries: pricePoints >= 120,
      priceDisplayMode: pricePoints >= 120 ? "daily-price-line" : "as-of-price-anchors",
      sourceNote: "No verified financial/guidance/transcript valuation input is available in the migrated local databases.",
      unverifiedRawValuation: {
        baseFairValue: originalLatest.baseFairValue ?? null,
        upsideToBase: originalLatest.upsideToBase ?? null,
        targetPrice3Y: originalLatest.targetPrice3Y ?? null,
        historyRows: snapshot.history?.length || 0
      },
      youtubeEarnings: coverage || null,
      valuationCoverageKind: "unsupported",
      hasQuarterlyValuationRuns: false,
      modelInputAudit: {
        ...(snapshot.dataQuality?.modelInputAudit || {}),
        status: "review",
        passesNoPriceAnchorAudit: true,
        fairValueInputPolicy: "insufficient-financial-guidance-inputs",
        priceUsage: "comparison-price-series-only",
        sourceGrade: "unsupported-snapshot",
        valuationRows: snapshot.history?.length || 0,
        financialOrGuidanceEvidenceRows: 0,
        methodPriceAnchorSignalCount: 0,
        warnings: [
          "No verified financial/guidance/transcript evidence is available for this ticker in the migrated databases."
        ]
      }
    }
  };
  return next;
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

function readCalls(db, tickerSet) {
  const rows = db.prepare(`
    SELECT
      v.id,
      v.source_id,
      v.url,
      v.title,
      v.upload_date,
      (SELECT COUNT(*) FROM transcript_segments ts WHERE ts.video_id = v.id) AS segment_count
    FROM videos v
    WHERE v.source = 'earnings_call'
    ORDER BY v.upload_date ASC
  `).all();
  const calls = [];
  for (const row of rows) {
    const parsed = parseSourceId(row.source_id);
    if (!parsed || !tickerSet.has(parsed.ticker)) continue;
    calls.push({
      ...row,
      ticker: parsed.ticker,
      period: parsed.period,
      slug: parsed.slug
    });
  }
  return calls;
}

function readMetrics(db, tickers) {
  const placeholders = tickers.map(() => "?").join(", ");
  if (!placeholders) return [];
  return db.prepare(`
    SELECT
      me.id,
      me.ticker,
      me.metric_name,
      me.fiscal_period,
      me.actual_or_guidance,
      me.amount,
      me.unit,
      me.currency,
      me.growth_yoy,
      me.growth_qoq,
      me.margin_pct,
      me.value_text,
      me.quality_status,
      me.extraction_confidence,
      me.evidence_id,
      me.source_segment_id,
      ev.excerpt,
      ev.url AS evidence_url,
      ev.observed_at,
      ev.speaker
    FROM ont_metric_events me
    LEFT JOIN ont_evidence ev ON ev.id = me.evidence_id
    WHERE me.ticker IN (${placeholders})
      AND me.quality_status IN ('clear', 'ambiguous')
      AND me.fiscal_period IS NOT NULL
    ORDER BY me.ticker ASC, me.fiscal_period ASC
  `).all(...tickers);
}

function buildCoverage(ticker, calls, metricsByPeriod) {
  const periodMetrics = [...metricsByPeriod.entries()]
    .filter(([key]) => key.startsWith(`${ticker}::`))
    .map(([, rows]) => rows);
  const metricRows = periodMetrics.reduce((sum, rows) => sum + rows.length, 0);
  const metricPeriods = periodMetrics.length;
  return {
    sourceDatabase: YOUTUBE_DB_PATH,
    calls: calls.length,
    firstCallDate: calls.map((call) => call.upload_date).filter(Boolean).sort()[0] || null,
    lastCallDate: calls.map((call) => call.upload_date).filter(Boolean).sort().at(-1) || null,
    metricRows,
    metricPeriods,
    structuredMetricCoverage: metricPeriods >= MIN_METRIC_PERIODS,
    priceExcludedFromFairValue: true
  };
}

if (!fs.existsSync(YOUTUBE_DB_PATH)) {
  throw new Error(`YouTube transcript database not found at ${YOUTUBE_DB_PATH}`);
}

const currentDb = new DatabaseSync(CURRENT_DB_PATH);
const youtubeDb = new DatabaseSync(YOUTUBE_DB_PATH, { readOnly: true });

try {
  const dashboard = parseJson(currentDb.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest")?.payload_json, {});
  const currentTickers = new Map(
    currentDb.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all()
      .map((row) => [row.ticker, parseJson(row.payload_json, {})])
  );
  const tickerSet = new Set([...currentTickers.keys()]);
  const tickers = [...tickerSet].sort();
  const callsByTicker = groupByTicker(readCalls(youtubeDb, tickerSet));
  const metrics = readMetrics(youtubeDb, tickers);
  const metricsByPeriod = byTickerAndPeriod(metrics);

  const updated = [];
  const unsupported = [];
  const unchanged = [];

  for (const [ticker, snapshot] of currentTickers) {
    const calls = (callsByTicker.get(ticker) || []).sort((left, right) => String(left.upload_date || "").localeCompare(String(right.upload_date || "")));
    const coverage = buildCoverage(ticker, calls, metricsByPeriod);
    const youtubeRows = buildYoutubeRows({ ...snapshot, ticker }, calls, metricsByPeriod);
    const keepAbsoluteFinancialModel = youtubeRows.length && shouldKeepAbsoluteFinancialModel(snapshot);
    const next = youtubeRows.length
      ? keepAbsoluteFinancialModel
        ? attachYoutubeCoverage({ ...snapshot, ticker }, coverage, youtubeRows)
        : updateTickerSnapshot({ ...snapshot, ticker }, youtubeRows, coverage)
      : markUnsupported({ ...snapshot, ticker }, coverage);

    currentTickers.set(ticker, next);
    currentDb.prepare(`
      INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(ticker) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
    `).run(ticker, next.generatedAt || new Date().toISOString(), JSON.stringify(next));

    if (youtubeRows.length && !keepAbsoluteFinancialModel) {
      updated.push({ ticker, rows: youtubeRows.length, calls: coverage.calls, metricRows: coverage.metricRows });
    } else if (youtubeRows.length && keepAbsoluteFinancialModel) {
      unchanged.push({ ticker, mode: "absolute-financial-model-primary", calls: coverage.calls, metricRows: coverage.metricRows, availableMetricRows: youtubeRows.length });
    } else if (next.dataQuality?.valuationCoverageKind === "unsupported") {
      unsupported.push({ ticker, calls: coverage.calls, metricRows: coverage.metricRows, historyRows: next.history?.length || 0 });
    } else {
      unchanged.push({ ticker, calls: coverage.calls, metricRows: coverage.metricRows });
    }
  }

  const tickersForDashboard = [...currentTickers.values()].map(compactTicker).sort((left, right) => {
    const leftUpside = Number(left.latest?.upsideToBase);
    const rightUpside = Number(right.latest?.upsideToBase);
    if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
    return String(left.ticker || "").localeCompare(String(right.ticker || ""));
  });

  const snapshots = [...currentTickers.values()];
  const summary = {
    ...(dashboard.summary || {}),
    tickerCount: snapshots.length,
    historyRows: snapshots.reduce((sum, ticker) => sum + (ticker.history?.length || 0), 0),
    pricePointCount: snapshots.reduce((sum, ticker) => sum + (ticker.priceHistory?.length || 0), 0),
    livePriceTickerCount: snapshots.filter((ticker) => ticker.priceHistory?.length).length,
    latestPriceDate: snapshots
      .map((ticker) => ticker.latest?.latestPriceDate)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
    youtubeEarningsTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.youtubeEarnings?.calls > 0).length,
    youtubeMetricValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.youtubeEarningsMetricValuationRows > 0).length,
    unsupportedValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.valuationCoverageKind === "unsupported").length,
    quarterlyBackendValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.hasQuarterlyValuationRuns).length,
    modelInputAuditPassCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "pass").length,
    modelInputAuditReviewCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "review").length,
    modelInputAuditFailCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "fail").length,
    positiveUpsideCount: tickersForDashboard.filter((ticker) => Number(ticker.latest?.upsideToBase) > 0).length,
    negativeUpsideCount: tickersForDashboard.filter((ticker) => Number(ticker.latest?.upsideToBase) < 0).length
  };

  const updatedDashboard = {
    ...dashboard,
    generatedAt: new Date().toISOString(),
    source: {
      ...(dashboard.source || {}),
      upstreamLabel: "Legacy FA backend + YouTube earnings-call transcript metric database",
      extraction: "valuation rows enriched/recomputed from earnings-call transcript metric events",
      transcriptSource: YOUTUBE_DB_PATH,
      modelInputPolicy: "Fair value uses financial/guidance/transcript metrics and FA base-case assumptions; price is not accepted as a fair-value input."
    },
    summary,
    tickers: tickersForDashboard
  };

  currentDb.prepare(`
    INSERT INTO valuation_snapshots (id, generated_at, payload_json)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload_json = excluded.payload_json
  `).run("latest", updatedDashboard.generatedAt, JSON.stringify(updatedDashboard));

  currentDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");

  console.log(JSON.stringify({
    currentDbPath: CURRENT_DB_PATH,
    youtubeDbPath: YOUTUBE_DB_PATH,
    minMetricPeriods: MIN_METRIC_PERIODS,
    updated,
    unsupported,
    unchanged,
    summary
  }, null, 2));
} finally {
  youtubeDb.close();
  currentDb.close();
}
