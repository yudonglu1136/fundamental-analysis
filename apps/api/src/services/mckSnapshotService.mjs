import { query } from "../db/client.mjs";
import { MCK_BACKEND_DB_PATH } from "../../../../modules/mck/db/schema.mjs";

const TICKER = "MCK";
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

function rawJsonSourceText(row) {
  const rawJson = typeof row?.rawJson === "string" ? parseJsonField(row, "rawJson").rawJson : row?.rawJson;
  return String(rawJson?.source ?? rawJson?.sourceUrl ?? "").toLowerCase();
}

function capitalReturnSourceType(row) {
  if (row.sourceType === "official_actual") return "official_actual";
  const sourceText = rawJsonSourceText(row);
  if (sourceText.includes("historical backend seed") || sourceText.includes("stockanalysis")) return "market_data_proxy";
  if (row.sourceType === "market_data" || row.sourceType === "market_data_proxy") return "market_data_proxy";
  return row.sourceType ?? "market_data_proxy";
}

function capitalReturnSourceQuality(row) {
  const sourceType = capitalReturnSourceType(row);
  if (sourceType === "official_actual") return "official_actual";
  if (sourceType === "market_data_proxy") return "market_data_proxy_historical_seed";
  return sourceType;
}

function buildCapitalReturnRow(row) {
  const equityFreeCashFlow = safeNumber(row.freeCashFlow ?? row.normalizedFreeCashFlow);
  const dilutedShares = positiveOrNull(row.dilutedShares);
  const officialDividendCashCost = positiveOrNull(row.dividendsPaid);
  const calculatedDividendPerShare = officialDividendCashCost != null && dilutedShares != null ? officialDividendCashCost / dilutedShares : null;
  const dividendPerShare = safeNumber(row.dividendPerShare) ?? calculatedDividendPerShare;
  const calculatedDividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const dividendCashCost = officialDividendCashCost ?? calculatedDividendCashCost;
  const buybackAmount = safeNumber(row.shareRepurchases);
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
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage,
    payoutRatioOfFcf: equityFreeCashFlow != null && dividendCashCost != null && equityFreeCashFlow > 0 ? dividendCashCost / equityFreeCashFlow : null,
    isForecast: false,
    rawJson: row.rawJson ?? null,
  };
}

function latestBaseMckAssumptions() {
  const row = query(
    `SELECT assumptionsJson
     FROM assumption_sets
     WHERE ticker = ?
       AND scenario = 'Base'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER],
    MCK_BACKEND_DB_PATH,
  )[0] ?? null;
  if (!row) return {};
  return parseJsonField(row, "assumptionsJson").assumptionsJson ?? {};
}

function buildMckForwardCapitalReturnExpectation() {
  const assumptions = latestBaseMckAssumptions();
  const latestFy2026Row = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
       AND periodType = 'annual'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR],
    MCK_BACKEND_DB_PATH,
  ))[0] ?? null;
  const latestRunRate = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
       AND periodType = 'reporting_event_run_rate'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR],
    MCK_BACKEND_DB_PATH,
  ))[0] ?? null;

  const dilutedShares = positiveOrNull(assumptions.dilutedShares) ?? positiveOrNull(latestFy2026Row?.dilutedShares) ?? positiveOrNull(latestRunRate?.dilutedShares);
  const equityFreeCashFlow = safeNumber(assumptions.annualFcf) ?? safeNumber(assumptions.normalizedFcf) ?? safeNumber(latestFy2026Row?.freeCashFlow) ?? safeNumber(latestRunRate?.freeCashFlow);
  const buybackAmount = safeNumber(assumptions.buybackAmount) ?? safeNumber(latestFy2026Row?.shareRepurchases) ?? safeNumber(latestRunRate?.shareRepurchases);
  const dividendCashCost = safeNumber(assumptions.dividendPayout) ?? safeNumber(latestFy2026Row?.dividendsPaid) ?? safeNumber(latestRunRate?.dividendsPaid);
  const dividendPerShare = dividendCashCost != null && dilutedShares != null ? dividendCashCost / dilutedShares : null;
  const totalCapitalReturn = (dividendCashCost ?? 0) + (buybackAmount ?? 0);

  return {
    fiscalYear: FORWARD_CAPITAL_RETURN_FISCAL_YEAR,
    periodId: "fy2026e",
    asOfDate: latestFy2026Row?.asOfDate ?? latestRunRate?.asOfDate ?? new Date().toISOString().slice(0, 10),
    sourceType: "forecast_assumption",
    sourceQuality: "management_guidance_plus_model_assumption",
    isForecast: true,
    revenue: safeNumber(latestFy2026Row?.revenue ?? latestRunRate?.revenue),
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: equityFreeCashFlow != null && totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow != null && dividendCashCost != null && equityFreeCashFlow > 0 ? dividendCashCost / equityFreeCashFlow : null,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "Base MCK assumption set dividendPayout divided by dilutedShares; falls back to FY2026 annual cash dividends if missing.",
      buybackSource: "Base MCK assumption set buybackAmount; falls back to FY2026 annual shareRepurchases if missing.",
      fcfSource: "Base MCK assumption set annualFcf / normalizedFcf; falls back to FY2026 annual freeCashFlow if missing.",
      displayTreatment: "Render as dashed/hatched forecast bars; do not include in 8Y historical cumulative totals.",
      assumptionSet: "Base",
    },
  };
}

function buildMckCapitalReturnChartSeries(rows, forwardExpectation) {
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

export function getMckReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], MCK_BACKEND_DB_PATH);
}

export function getLatestMckEvent() {
  return getMckReportingEvents()[0] ?? null;
}

export function resolveMckEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], MCK_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      MCK_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestMckEvent();
}

export function getMckSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveMckEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, fiscalYear DESC, fiscalQuarter DESC",
    params,
    MCK_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, segment",
    params,
    MCK_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    MCK_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    MCK_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    MCK_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    MCK_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    MCK_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 240",
    [TICKER],
    MCK_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    MCK_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    MCK_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    MCK_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
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

export function getMckCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const annualRows = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear IS NOT NULL
       AND fiscalYear < ?
     ORDER BY fiscalYear DESC
     LIMIT ?`,
    [TICKER, FORWARD_CAPITAL_RETURN_FISCAL_YEAR, limit],
    MCK_BACKEND_DB_PATH,
  )).slice().sort((left, right) => left.fiscalYear - right.fiscalYear);

  const rows = annualRows.map(buildCapitalReturnRow);
  const forwardExpectation = buildMckForwardCapitalReturnExpectation();
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
  const latest = rows[rows.length - 1] ?? null;
  const warnings = [];

  const missingFcfYears = rows.filter((row) => row.equityFreeCashFlow == null).map((row) => row.fiscalYear);
  if (missingFcfYears.length) {
    warnings.push({
      id: "mck-capital-return-fcf-missing",
      severity: "high",
      title: "FCF missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingFcfYears.join(", ")}. Backfill annual free cash flow from official filings or vetted financial history.`,
    });
  }
  const missingDividendYears = rows.filter((row) => row.dividendCashCost == null).map((row) => row.fiscalYear);
  if (missingDividendYears.length) {
    warnings.push({
      id: "mck-capital-return-dividend-missing",
      severity: "medium",
      title: "Dividend cash cost missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingDividendYears.join(", ")}. Backfill cash dividends paid or dividend per share and diluted shares.`,
    });
  }
  const missingBuybackYears = rows.filter((row) => row.buybackAmount == null).map((row) => row.fiscalYear);
  if (missingBuybackYears.length) {
    warnings.push({
      id: "mck-capital-return-buyback-missing",
      severity: "medium",
      title: "Buyback amount missing for annual capital-return rows",
      detail: `Missing fiscal years: ${missingBuybackYears.join(", ")}. Backfill share repurchases from cash-flow statements.`,
    });
  }
  const proxyYears = rows.filter((row) => row.sourceType !== "official_actual").map((row) => row.fiscalYear);
  if (proxyYears.length) {
    warnings.push({
      id: "mck-capital-return-proxy-years",
      severity: "medium",
      title: "Some capital-return rows use proxy history",
      detail: `Fiscal years ${proxyYears.join(", ")} are not labeled official actual; they use historical backend seed / public financial-history proxy data pending full 10-K parser backfill.`,
    });
  }

  return {
    ticker: TICKER,
    currency: "USD",
    unit: "USDm",
    years: rows.length,
    rows,
    forwardExpectation,
    chartSeries: buildMckCapitalReturnChartSeries(rows, forwardExpectation),
    summary: {
      latestFiscalYear: latest?.fiscalYear ?? null,
      latestDividendPerShare: latest?.dividendPerShare ?? null,
      latestDividendCashCost: latest?.dividendCashCost ?? null,
      latestBuybackAmount: latest?.buybackAmount ?? null,
      latestEquityFreeCashFlow: latest?.equityFreeCashFlow ?? null,
      latestTotalCapitalReturn: latest?.totalCapitalReturn ?? null,
      latestFcfCoverage: latest?.fcfCoverage ?? null,
      cumulativeDividendCash,
      cumulativeBuybacks,
      cumulativeCapitalReturn: cumulativeDividendCash + cumulativeBuybacks,
      cumulativeFcf,
      forwardFiscalYear: forwardExpectation?.fiscalYear ?? null,
      forwardDividendPerShare: forwardExpectation?.dividendPerShare ?? null,
      forwardDividendCashCost: forwardExpectation?.dividendCashCost ?? null,
      forwardBuybackAmount: forwardExpectation?.buybackAmount ?? null,
      forwardEquityFreeCashFlow: forwardExpectation?.equityFreeCashFlow ?? null,
      forwardTotalCapitalReturn: forwardExpectation?.totalCapitalReturn ?? null,
      forwardFcfCoverage: forwardExpectation?.fcfCoverage ?? null,
      excludesForwardFromCumulativeTotals: true,
    },
    warnings,
  };
}
