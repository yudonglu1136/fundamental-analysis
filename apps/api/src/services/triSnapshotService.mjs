import { query } from "../db/client.mjs";
import { TRI_BACKEND_DB_PATH } from "../../../../modules/tri/db/schema.mjs";

const TICKER = "TRI";

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

export function getTriReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], TRI_BACKEND_DB_PATH);
}

export function getLatestTriEvent() {
  return getTriReportingEvents()[0] ?? null;
}

export function resolveTriEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], TRI_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      TRI_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestTriEvent();
}

export function getTriSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveTriEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC, periodId ASC",
    params,
    TRI_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    TRI_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    TRI_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    TRI_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    TRI_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    TRI_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    TRI_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    `SELECT *
     FROM source_documents
     WHERE ticker = ?
       AND COALESCE(publishedDate, retrievedAt, '0000-01-01') <= ?
     ORDER BY COALESCE(publishedDate, retrievedAt) DESC, id
     LIMIT 300`,
    [TICKER, effectiveAsOfDate ?? "9999-12-31"],
    TRI_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    TRI_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    TRI_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    TRI_BACKEND_DB_PATH,
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

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rawCapitalReturn(row) {
  const raw = row?.rawJson && typeof row.rawJson === "object" ? row.rawJson : {};
  return raw.capitalReturn ?? raw;
}

function capitalReturnQuality(row) {
  if (row.sourceType === "official_actual") return "official_actual";
  if (row.sourceType === "market_data_proxy") return "market_data_proxy";
  if (row.sourceType === "research_only") return "research_only_proxy";
  return row.sourceType ?? "unknown";
}

function mapTriCapitalReturnRow(row) {
  const raw = rawCapitalReturn(row);
  const dilutedShares = safeNumber(row.dilutedShares);
  const dividendPerShare = safeNumber(raw.dividendPerShare) ??
    (safeNumber(row.dividendsPaid) != null && dilutedShares ? row.dividendsPaid / dilutedShares : null);
  const officialDividendCashCost = row.sourceType === "official_actual" ? safeNumber(row.dividendsPaid) : null;
  const dividendCashCost = officialDividendCashCost ?? (dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null);
  const buybackAmount = safeNumber(row.buybacks);
  const equityFreeCashFlow = safeNumber(row.freeCashFlow);
  const totalCapitalReturn = (dividendCashCost ?? 0) + (buybackAmount ?? 0);
  const fcfCoverage = equityFreeCashFlow != null && totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null;

  return {
    fiscalYear: row.fiscalYear,
    periodId: row.periodId,
    asOfDate: row.asOfDate,
    sourceType: row.sourceType,
    sourceQuality: capitalReturnQuality(row),
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

function buildTriForwardCapitalReturnExpectation(latestActual) {
  const q12026 = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodId = 'q1-26'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER],
    TRI_BACKEND_DB_PATH,
  ))[0] ?? null;
  const fy2025 = latestActual ?? parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear = 2025
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER],
    TRI_BACKEND_DB_PATH,
  ))[0] ?? null;

  const latestDps = safeNumber(fy2025?.dividendPerShare) ?? safeNumber(fy2025?.rawJson?.capitalReturn?.dividendPerShare);
  const dilutedShares = safeNumber(q12026?.dilutedShares) ?? safeNumber(fy2025?.dilutedShares);
  const dividendPerShare = latestDps != null ? Number((latestDps * 1.035).toFixed(3)) : null;
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const equityFreeCashFlow = 2100;
  const buybackAmount = 600;
  const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;

  return {
    fiscalYear: 2026,
    periodId: "fy2026e",
    asOfDate: q12026?.asOfDate ?? "2026-05-05",
    sourceType: "forecast_assumption",
    sourceQuality: "management_guidance_plus_model_assumption",
    isForecast: true,
    revenue: safeNumber(q12026?.revenue) != null ? q12026.revenue * 4 : null,
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow > 0 && dividendCashCost != null ? dividendCashCost / equityFreeCashFlow : null,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "FY2025 DPS plus conservative low-single-digit modeled dividend growth; not official FY2026 guidance.",
      buybackSource: "No explicit FY2026 buyback guidance in local structured TRI sources; conservative model assumption below FY2025 spend.",
      fcfSource: "Q1 2026 management guidance from the local TRI official-actual source layer: FY2026 free cash flow of about USD2.1bn.",
      displayTreatment: "Render as dashed/hatched forecast bar; do not include in 8Y historical cumulative totals.",
    },
  };
}

export function getTriCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const annualRows = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear IS NOT NULL
       AND fiscalYear <= 2025
     ORDER BY fiscalYear DESC
     LIMIT ?`,
    [TICKER, limit],
    TRI_BACKEND_DB_PATH,
  )).slice().sort((left, right) => left.fiscalYear - right.fiscalYear);

  const rows = annualRows.map(mapTriCapitalReturnRow);
  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildTriForwardCapitalReturnExpectation(latest);
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const warnings = [];

  const incompleteYears = rows
    .filter((row) => safeNumber(row.dividendCashCost) == null || safeNumber(row.buybackAmount) == null)
    .map((row) => row.fiscalYear);
  if (incompleteYears.length) {
    warnings.push({
      id: "tri-capital-return-incomplete-years",
      severity: "medium",
      title: "Capital-return fields are incomplete for some annual rows",
      detail: `Missing dividend cash cost or buyback amount for fiscal years: ${incompleteYears.join(", ")}.`,
    });
  }

  const proxyYears = rows.filter((row) => row.sourceQuality !== "official_actual").map((row) => row.fiscalYear);
  if (proxyYears.length) {
    warnings.push({
      id: "tri-capital-return-proxy-years",
      severity: "medium",
      title: "Some historical capital-return rows are proxy data",
      detail: `Fiscal years ${proxyYears.join(", ")} use market-data proxy or research-only rows pending official annual-report cash-flow backfill.`,
    });
  }

  return {
    ticker: TICKER,
    currency: "USD",
    unit: "USDm",
    years: rows.length,
    rows,
    forwardExpectation,
    summary: {
      latestFiscalYear: latest?.fiscalYear ?? null,
      latestDividendPerShare: latest?.dividendPerShare ?? null,
      latestDividendCashCost: latest?.dividendCashCost ?? null,
      latestBuybackAmount: latest?.buybackAmount ?? null,
      latestTotalCapitalReturn: latest?.totalCapitalReturn ?? null,
      latestFcfCoverage: latest?.fcfCoverage ?? null,
      cumulativeDividendCash,
      cumulativeBuybacks,
      cumulativeCapitalReturn: cumulativeDividendCash + cumulativeBuybacks,
      forwardFiscalYear: forwardExpectation?.fiscalYear ?? null,
      forwardDividendPerShare: forwardExpectation?.dividendPerShare ?? null,
      forwardDividendCashCost: forwardExpectation?.dividendCashCost ?? null,
      forwardBuybackAmount: forwardExpectation?.buybackAmount ?? null,
      forwardTotalCapitalReturn: forwardExpectation?.totalCapitalReturn ?? null,
      forwardFcfCoverage: forwardExpectation?.fcfCoverage ?? null,
    },
    warnings,
  };
}
