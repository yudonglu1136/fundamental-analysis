import { query } from "../db/client.mjs";

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

export function getLsegReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", ["LSEG.L"]);
}

export function getLatestLsegEvent() {
  return getLsegReportingEvents()[0] ?? null;
}

export function resolveLsegEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", ["LSEG.L", eventId])[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      ["LSEG.L", asOfDate],
    )[0] ?? null;
  }
  return getLatestLsegEvent();
}

export function getLsegSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveLsegEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = ["LSEG.L", effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, fiscalYear DESC",
    params,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, segment",
    params,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 100",
    ["LSEG.L", eventFilter],
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 200",
    ["LSEG.L"],
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    ["LSEG.L"],
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    ["LSEG.L"],
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

function capitalReturnQuality(row) {
  if (row.sourceType === "official_actual") return "official_actual";
  if (row.sourceType === "market_data") return "market_data_proxy";
  return row.sourceType ?? "unknown";
}

function buildLsegForwardCapitalReturnExpectation(latestActual) {
  const runRate2026 = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = 2026
       AND periodType = 'reporting_event_run_rate'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    ["LSEG.L"],
  ))[0] ?? null;
  if (!runRate2026) return null;

  const dividendPerShare = safeNumber(runRate2026.dividendPerShare) ?? safeNumber(latestActual?.dividendPerShare);
  const dilutedShares = safeNumber(runRate2026.dilutedShares) ?? safeNumber(latestActual?.dilutedShares);
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const equityFreeCashFlow = Math.max(safeNumber(runRate2026.equityFreeCashFlow) ?? 0, 2700);
  const buybackAmount = 3000;
  const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;

  return {
    fiscalYear: 2026,
    periodId: "fy2026e",
    asOfDate: runRate2026.asOfDate,
    sourceType: "forecast_assumption",
    sourceQuality: "management_guidance_plus_run_rate",
    isForecast: true,
    revenue: safeNumber(runRate2026.revenue),
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendPerSharePence: dividendPerShare == null ? null : dividendPerShare * 100,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow > 0 && dividendCashCost != null ? dividendCashCost / equityFreeCashFlow : null,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "Q1 2026 event-visible run-rate dividend/share count",
      buybackSource: "FY2025 management guidance: GBP3bn buyback planned to be completed by Feb 2027",
      fcfSource: "Management FY2026 equity FCF floor of at least GBP2.7bn, cross-checked against Q1 2026 run-rate row",
      displayTreatment: "Render as dashed/hatched forecast bar; do not include in 8Y historical cumulative totals.",
    },
  };
}

export function getLsegCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const annualRows = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'annual'
       AND fiscalYear IS NOT NULL
     ORDER BY fiscalYear DESC
     LIMIT ?`,
    ["LSEG.L", limit],
  )).slice().sort((left, right) => left.fiscalYear - right.fiscalYear);

  const rows = annualRows.map((row) => {
    const dividendPerShare = safeNumber(row.dividendPerShare);
    const dilutedShares = safeNumber(row.dilutedShares);
    const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
    const buybackAmount = safeNumber(row.buybackAmount);
    const equityFreeCashFlow = safeNumber(row.equityFreeCashFlow);
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
      dividendPerSharePence: dividendPerShare == null ? null : dividendPerShare * 100,
      dividendCashCost,
      buybackAmount,
      totalCapitalReturn,
      fcfCoverage,
      payoutRatioOfFcf: equityFreeCashFlow != null && dividendCashCost != null && equityFreeCashFlow > 0 ? dividendCashCost / equityFreeCashFlow : null,
      rawJson: row.rawJson ?? null,
    };
  });

  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildLsegForwardCapitalReturnExpectation(latest);
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
  const warnings = [];
  const missingDividendYears = rows.filter((row) => row.dividendPerShare == null).map((row) => row.fiscalYear);
  if (missingDividendYears.length) {
    warnings.push({
      id: "lseg-capital-return-dps-missing",
      severity: "medium",
      title: "Dividend per share missing for some annual rows",
      detail: `Missing fiscal years: ${missingDividendYears.join(", ")}. Fill from official annual-report dividend tables or dividend schedule.`,
    });
  }
  const proxyYears = rows.filter((row) => row.sourceQuality !== "official_actual").map((row) => row.fiscalYear);
  if (proxyYears.length) {
    warnings.push({
      id: "lseg-capital-return-proxy-years",
      severity: "low",
      title: "Some capital-return rows use market-data proxy source",
      detail: `Fiscal years ${proxyYears.join(", ")} use local financial-statement/dividend schedule proxy until official table extraction is promoted.`,
    });
  }

  return {
    ticker: "LSEG.L",
    currency: "GBP",
    unit: "GBPm",
    years: rows.length,
    rows,
    forwardExpectation,
    summary: {
      latestFiscalYear: latest?.fiscalYear ?? null,
      latestDividendPerSharePence: latest?.dividendPerSharePence ?? null,
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
      forwardDividendPerSharePence: forwardExpectation?.dividendPerSharePence ?? null,
      forwardDividendCashCost: forwardExpectation?.dividendCashCost ?? null,
      forwardBuybackAmount: forwardExpectation?.buybackAmount ?? null,
      forwardTotalCapitalReturn: forwardExpectation?.totalCapitalReturn ?? null,
      forwardEquityFreeCashFlow: forwardExpectation?.equityFreeCashFlow ?? null,
      forwardFcfCoverage: forwardExpectation?.fcfCoverage ?? null,
    },
    warnings,
  };
}
