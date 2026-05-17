import { query } from "../db/client.mjs";
import { MSFT_BACKEND_DB_PATH } from "../../../../modules/msft/db/schema.mjs";

const TICKER = "MSFT";
const FORWARD_CAPITAL_RETURN_FISCAL_YEAR = 2026;

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveOrNull(value) {
  const number = safeNumber(value);
  return number != null && number > 0 ? number : null;
}

function capitalReturnSourceType(row) {
  if (row.sourceType === "official_actual") return "official_actual";
  if (row.sourceType === "official_seed") return "official_seed";
  if (row.sourceType === "market_data" || row.sourceType === "market_data_proxy") return "market_data_proxy";
  if (row.sourceType === "forecast_assumption") return "forecast_assumption";
  return row.sourceType ?? "research_only";
}

function capitalReturnSourceQuality(row) {
  const sourceType = capitalReturnSourceType(row);
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "official_seed") return "official_seed";
  if (sourceType === "market_data_proxy") return "market_data_proxy";
  if (sourceType === "forecast_assumption") return "forecast_assumption";
  return sourceType;
}

function buildMsftCapitalReturnRow(row) {
  const equityFreeCashFlow = safeNumber(row.freeCashFlow ?? row.normalizedFreeCashFlow);
  const dilutedShares = positiveOrNull(row.dilutedShares);
  const officialDividendCashCost = positiveOrNull(row.dividendsPaid);
  const calculatedDividendPerShare = officialDividendCashCost != null && dilutedShares != null ? officialDividendCashCost / dilutedShares : null;
  const dividendPerShare = safeNumber(row.dividendPerShare) ?? calculatedDividendPerShare;
  const calculatedDividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const dividendCashCost = officialDividendCashCost ?? calculatedDividendCashCost;
  const buybackAmount = safeNumber(row.buybacks ?? row.shareRepurchases);
  const totalCapitalReturn = (dividendCashCost ?? 0) + (buybackAmount ?? 0);
  const fcfCoverage = equityFreeCashFlow != null && totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null;

  return {
    fiscalYear: row.fiscalYear,
    periodId: row.periodId,
    asOfDate: row.asOfDate,
    sourceType: capitalReturnSourceType(row),
    sourceQuality: capitalReturnSourceQuality(row),
    revenue: safeNumber(row.revenue),
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendPerShareCents: dividendPerShare != null ? dividendPerShare * 100 : null,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage,
    payoutRatioOfFcf: equityFreeCashFlow != null && equityFreeCashFlow > 0 ? totalCapitalReturn / equityFreeCashFlow : null,
    isForecast: false,
    rawJson: row.rawJson ?? null,
  };
}

function latestBaseMsftAssumptions() {
  const row = query(
    `SELECT assumptionsJson
     FROM assumption_sets
     WHERE ticker = ?
       AND scenario = 'Base'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row) return {};
  return parseJsonField(row, "assumptionsJson").assumptionsJson ?? {};
}

function buildMsftForwardCapitalReturnExpectation(latestActual) {
  const assumptions = latestBaseMsftAssumptions();
  const fy26Forecast = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
       AND periodType = 'forecast'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR],
    MSFT_BACKEND_DB_PATH,
  ))[0] ?? null;
  const ytdQ3 = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
       AND periodType = 'ytd'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR],
    MSFT_BACKEND_DB_PATH,
  ))[0] ?? null;
  const q3 = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
       AND periodType = 'quarter'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR],
    MSFT_BACKEND_DB_PATH,
  ))[0] ?? null;

  const dilutedShares = positiveOrNull(assumptions.sharesDiluted != null ? assumptions.sharesDiluted * 1000 : null)
    ?? positiveOrNull(fy26Forecast?.dilutedShares)
    ?? positiveOrNull(ytdQ3?.dilutedShares)
    ?? positiveOrNull(q3?.dilutedShares)
    ?? positiveOrNull(latestActual?.dilutedShares);
  const dividendPerShare = safeNumber(assumptions.dividendPerShare) ?? (latestActual?.dividendPerShare != null ? latestActual.dividendPerShare * 1.03 : 3.32);
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const buybackAmount = safeNumber(assumptions.forwardBuybackAmount)
    ?? safeNumber(latestActual?.buybackAmount)
    ?? safeNumber(ytdQ3?.buybacks != null ? ytdQ3.buybacks * 4 / 3 : null)
    ?? 18_000;
  const ytdFcfRunRate = safeNumber(ytdQ3?.freeCashFlow) != null ? safeNumber(ytdQ3.freeCashFlow) * 4 / 3 : null;
  const equityFreeCashFlow = safeNumber(assumptions.forwardEquityFreeCashFlow)
    ?? safeNumber(fy26Forecast?.freeCashFlow)
    ?? ytdFcfRunRate
    ?? (latestActual?.equityFreeCashFlow != null ? latestActual.equityFreeCashFlow * 0.9 : null);
  const totalCapitalReturn = (dividendCashCost ?? 0) + (buybackAmount ?? 0);

  return {
    fiscalYear: FORWARD_CAPITAL_RETURN_FISCAL_YEAR,
    periodId: "fy2026e",
    asOfDate: fy26Forecast?.asOfDate ?? ytdQ3?.asOfDate ?? q3?.asOfDate ?? latestActual?.asOfDate ?? "2026-04-29",
    sourceType: "forecast_assumption",
    sourceQuality: "forecast_assumption",
    revenue: safeNumber(fy26Forecast?.revenue) ?? (safeNumber(ytdQ3?.revenue) != null ? safeNumber(ytdQ3.revenue) * 4 / 3 : null),
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendPerShareCents: dividendPerShare != null ? dividendPerShare * 100 : null,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: equityFreeCashFlow != null && totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow != null && equityFreeCashFlow > 0 ? totalCapitalReturn / equityFreeCashFlow : null,
    isForecast: true,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "Base MSFT assumption dividendPerShare when available; otherwise latest actual DPS grown modestly.",
      buybackSource: "Base MSFT assumption when available; otherwise latest annual buyback / YTD run-rate fallback.",
      fcfSource: "FY2026 forecast row when available; otherwise FY2026 Q3 YTD FCF run-rate fallback.",
      displayTreatment: "Render as dashed/hatched forecast bars; exclude from 8Y historical cumulative totals.",
    },
  };
}

function buildMsftCapitalReturnChartSeries(rows, forwardExpectation) {
  return [
    ...rows.map((row) => ({
      fiscalYear: row.fiscalYear,
      label: `FY${row.fiscalYear}`,
      sourceType: row.sourceType,
      sourceQuality: row.sourceQuality,
      isForecast: false,
      dividends: row.dividendCashCost ?? null,
      buybacks: row.buybackAmount ?? null,
      fcf: row.equityFreeCashFlow ?? null,
      forecastDividends: null,
      forecastBuybacks: null,
      forecastFcf: null,
      totalCapitalReturn: row.totalCapitalReturn ?? null,
      fcfCoverage: row.fcfCoverage ?? null,
    })),
    ...(forwardExpectation
      ? [{
          fiscalYear: forwardExpectation.fiscalYear,
          label: `FY${forwardExpectation.fiscalYear}E`,
          sourceType: forwardExpectation.sourceType,
          sourceQuality: forwardExpectation.sourceQuality,
          isForecast: true,
          dividends: null,
          buybacks: null,
          fcf: null,
          forecastDividends: forwardExpectation.dividendCashCost ?? null,
          forecastBuybacks: forwardExpectation.buybackAmount ?? null,
          forecastFcf: forwardExpectation.equityFreeCashFlow ?? null,
          totalCapitalReturn: forwardExpectation.totalCapitalReturn ?? null,
          fcfCoverage: forwardExpectation.fcfCoverage ?? null,
        }]
      : []),
  ];
}

export function getMsftReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], MSFT_BACKEND_DB_PATH);
}

export function getLatestMsftEvent() {
  return getMsftReportingEvents()[0] ?? null;
}

export function resolveMsftEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], MSFT_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      MSFT_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestMsftEvent();
}

export function getMsftSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveMsftEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC",
    params,
    MSFT_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    MSFT_BACKEND_DB_PATH,
  ));
  const cloudAiKpis = parseRows(query(
    "SELECT * FROM cloud_ai_kpis WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, periodId",
    params,
    MSFT_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    MSFT_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    MSFT_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    MSFT_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    MSFT_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    MSFT_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 300",
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    MSFT_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    MSFT_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
    cloudAiKpis,
    marketSnapshot,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    sourceDocuments,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}

export function getMsftCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const annualRowsRaw = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear IS NOT NULL
       AND fiscalYear < ?
     ORDER BY fiscalYear DESC, asOfDate DESC, periodId DESC
     LIMIT ?`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR, limit * 3],
    MSFT_BACKEND_DB_PATH,
  ));
  const seenFiscalYears = new Set();
  const annualRows = [];
  for (const row of annualRowsRaw) {
    if (seenFiscalYears.has(row.fiscalYear)) continue;
    seenFiscalYears.add(row.fiscalYear);
    annualRows.push(row);
    if (annualRows.length >= limit) break;
  }
  annualRows.sort((left, right) => left.fiscalYear - right.fiscalYear);

  const rows = annualRows.map(buildMsftCapitalReturnRow);
  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildMsftForwardCapitalReturnExpectation(latest);
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
  const warnings = [];

  if (rows.length < limit) {
    warnings.push({
      id: "msft-capital-return-history-short",
      severity: "medium",
      title: "Capital-return history has fewer annual rows than requested",
      detail: `Requested ${limit} fiscal years; backend currently returned ${rows.length}.`,
    });
  }
  const missingDividendYears = rows.filter((row) => row.dividendCashCost == null || row.dividendPerShare == null).map((row) => row.fiscalYear);
  if (missingDividendYears.length) {
    warnings.push({
      id: "msft-capital-return-dividend-missing",
      severity: "medium",
      title: "Dividend data missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingDividendYears.join(", ")}. Backfill cash dividends paid plus diluted shares or DPS.`,
    });
  }
  const missingBuybackYears = rows.filter((row) => row.buybackAmount == null).map((row) => row.fiscalYear);
  if (missingBuybackYears.length) {
    warnings.push({
      id: "msft-capital-return-buyback-missing",
      severity: "medium",
      title: "Buyback data missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingBuybackYears.join(", ")}. Backfill annual share repurchases from cash-flow statements.`,
    });
  }
  const missingFcfYears = rows.filter((row) => row.equityFreeCashFlow == null).map((row) => row.fiscalYear);
  if (missingFcfYears.length) {
    warnings.push({
      id: "msft-capital-return-fcf-missing",
      severity: "high",
      title: "FCF missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingFcfYears.join(", ")}. Backfill annual equity free cash flow from official filings or vetted backend history.`,
    });
  }
  const proxyYears = rows.filter((row) => row.sourceType !== "official_actual").map((row) => row.fiscalYear);
  if (proxyYears.length) {
    warnings.push({
      id: "msft-capital-return-proxy-years",
      severity: "medium",
      title: "Some capital-return rows use proxy data",
      detail: `Fiscal years ${proxyYears.join(", ")} are not labeled official actual. Treat those rows as seed/proxy history until promoted from filings.`,
    });
  }

  return {
    ticker: TICKER,
    currency: "USD",
    unit: "USDm",
    years: rows.length,
    rows,
    forwardExpectation,
    chartSeries: buildMsftCapitalReturnChartSeries(rows, forwardExpectation),
    summary: {
      latestFiscalYear: latest?.fiscalYear ?? null,
      latestDividendPerShare: latest?.dividendPerShare ?? null,
      latestDividendPerShareCents: latest?.dividendPerShareCents ?? null,
      latestDividendCashCost: latest?.dividendCashCost ?? null,
      latestBuybackAmount: latest?.buybackAmount ?? null,
      latestTotalCapitalReturn: latest?.totalCapitalReturn ?? null,
      latestEquityFreeCashFlow: latest?.equityFreeCashFlow ?? null,
      latestFcfCoverage: latest?.fcfCoverage ?? null,
      cumulativeDividendCash,
      cumulativeBuybacks,
      cumulativeFcf,
      cumulativeCapitalReturn: cumulativeDividendCash + cumulativeBuybacks,
      forwardFiscalYear: forwardExpectation?.fiscalYear ?? null,
      forwardDividendPerShare: forwardExpectation?.dividendPerShare ?? null,
      forwardDividendPerShareCents: forwardExpectation?.dividendPerShareCents ?? null,
      forwardDividendCashCost: forwardExpectation?.dividendCashCost ?? null,
      forwardBuybackAmount: forwardExpectation?.buybackAmount ?? null,
      forwardTotalCapitalReturn: forwardExpectation?.totalCapitalReturn ?? null,
      forwardEquityFreeCashFlow: forwardExpectation?.equityFreeCashFlow ?? null,
      forwardFcfCoverage: forwardExpectation?.fcfCoverage ?? null,
      excludesForwardFromCumulativeTotals: true,
    },
    warnings,
  };
}
