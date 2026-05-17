import { query } from "../db/client.mjs";
import { BA_BACKEND_DB_PATH } from "../../../../modules/ba/db/schema.mjs";

const TICKER = "BA.L";

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson", "methodOutputsJson", "sensitivityTablesJson", "warningsJson", "dataSnapshotJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

function safeNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildBaCapitalReturnChartSeries(rows, forwardExpectation) {
  return [
    ...rows.map((row) => ({
      year: `FY${row.fiscalYear}`,
      dividendCashCost: row.dividendCashCost ?? 0,
      buybackAmount: row.buybackAmount ?? 0,
      equityFreeCashFlow: row.equityFreeCashFlow ?? 0,
      dividendCashForecast: null,
      buybackForecast: null,
      equityFreeCashFlowForecast: null,
      totalCapitalReturn: row.totalCapitalReturn ?? 0,
      dps: row.dividendPerSharePence,
      fcfCoverage: row.fcfCoverage,
      sourceQuality: row.sourceQuality,
      isForecast: false,
    })),
    ...(forwardExpectation
      ? [{
          year: `FY${forwardExpectation.fiscalYear}E`,
          dividendCashCost: null,
          buybackAmount: null,
          equityFreeCashFlow: null,
          dividendCashForecast: forwardExpectation.dividendCashCost ?? 0,
          buybackForecast: forwardExpectation.buybackAmount ?? 0,
          equityFreeCashFlowForecast: forwardExpectation.equityFreeCashFlow ?? 0,
          totalCapitalReturn: forwardExpectation.totalCapitalReturn ?? 0,
          dps: forwardExpectation.dividendPerSharePence,
          fcfCoverage: forwardExpectation.fcfCoverage,
          sourceQuality: forwardExpectation.sourceQuality,
          isForecast: true,
        }]
      : []),
  ];
}

function buildBaForwardCapitalReturnExpectation(latestActual) {
  if (!latestActual) return null;
  const nextFiscalYear = Number(latestActual.fiscalYear) + 1;
  const managementFcf = parseRows(query(
    `SELECT *
     FROM guidance_items
     WHERE ticker = ?
       AND metric = 'fcfFloor'
       AND asOfDate >= ?
       AND sourceType = 'management_guidance'
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, latestActual.asOfDate],
    BA_BACKEND_DB_PATH,
  ))[0] ?? null;
  const fallbackFcf = Math.max((latestActual.equityFreeCashFlow ?? 0) * 0.65, latestActual.equityFreeCashFlow ?? 0);
  const equityFreeCashFlow = safeNumber(managementFcf?.value) ?? fallbackFcf;
  const dividendPerSharePence = latestActual.latestDividendPerSharePence
    ? latestActual.latestDividendPerSharePence * 1.05
    : latestActual.dividendPerSharePence != null
      ? latestActual.dividendPerSharePence * 1.05
      : null;
  const dilutedShares = latestActual.dilutedShares;
  const dividendPerShare = dividendPerSharePence == null ? null : dividendPerSharePence / 100;
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const buybackAmount = Math.max(latestActual.buybackAmount ?? 0, 500);
  const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;

  return {
    fiscalYear: nextFiscalYear,
    periodId: `fy${nextFiscalYear}e`,
    asOfDate: managementFcf?.asOfDate ?? latestActual.asOfDate,
    sourceType: "forecast_assumption",
    sourceQuality: "forecast_assumption",
    isForecast: true,
    revenue: null,
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendPerSharePence,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow > 0 && dividendCashCost != null ? dividendCashCost / equityFreeCashFlow : null,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "Latest annual DPS grown by 5% as a forward dividend assumption.",
      buybackSource: "Uses a GBP500m forward buyback assumption, anchored near FY2025 repurchase activity.",
      fcfSource: managementFcf
        ? `Uses management guidance fcfFloor from ${managementFcf.eventId}.`
        : "Uses latest annual FCF as a fallback forecast assumption.",
      displayTreatment: "Render as dashed/hatched forecast bars; exclude from 8Y cumulative totals.",
    },
  };
}

export function getBaReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], BA_BACKEND_DB_PATH).map((row) => parseJsonField(row, "rawJson"));
}

export function getLatestBaEvent() {
  return getBaReportingEvents()[0] ?? null;
}

export function resolveBaEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return parseRows(query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], BA_BACKEND_DB_PATH))[0] ?? null;
  }
  if (asOfDate) {
    return parseRows(query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      BA_BACKEND_DB_PATH,
    ))[0] ?? null;
  }
  return getLatestBaEvent();
}

export function getBaSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveBaEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent?.id ?? "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const marketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    BA_BACKEND_DB_PATH,
  ))[0] ?? null;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    BA_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic",
    [TICKER, eventFilter],
    BA_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY publishedDate DESC, id",
    [TICKER],
    BA_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    BA_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    BA_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    BA_BACKEND_DB_PATH,
  );
  const orderBacklogSnapshots = parseRows(query(
    "SELECT * FROM order_backlog_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const orderIntakeSnapshots = parseRows(query(
    "SELECT * FROM order_intake_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const programExposures = parseRows(query(
    "SELECT * FROM program_exposures WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, segment, programName",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const contractAwards = parseRows(query(
    "SELECT * FROM contract_awards WHERE ticker = ? AND announcementDate <= ? ORDER BY announcementDate DESC",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const defenseBudgetIndicators = parseRows(query(
    "SELECT * FROM defense_budget_indicators WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, geography",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const pensionSnapshots = parseRows(query(
    "SELECT * FROM pension_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC",
    params,
    BA_BACKEND_DB_PATH,
  ));
  const capitalAllocationEvents = parseRows(query(
    "SELECT * FROM capital_allocation_events WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC",
    params,
    BA_BACKEND_DB_PATH,
  ));

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
    orderBacklogSnapshots,
    orderIntakeSnapshots,
    programExposures,
    contractAwards,
    defenseBudgetIndicators,
    pensionSnapshots,
    capitalAllocationEvents,
  };
}

export function getBaCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const annualRows = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'FY'
       AND fiscalYear IS NOT NULL
     ORDER BY fiscalYear DESC, asOfDate DESC
     LIMIT ?`,
    [TICKER, limit],
    BA_BACKEND_DB_PATH,
  )).slice().sort((left, right) => left.fiscalYear - right.fiscalYear);

  const allocationRows = parseRows(query(
    `SELECT *
     FROM capital_allocation_events
     WHERE ticker = ?
       AND sourceType IN ('official_actual', 'official_seed')
     ORDER BY asOfDate DESC`,
    [TICKER],
    BA_BACKEND_DB_PATH,
  ));
  const allocationByEvent = new Map(allocationRows.map((row) => [row.eventId, row]));

  const rows = annualRows.map((financial) => {
    const allocation = allocationByEvent.get(financial.eventId) ?? null;
    const dividendPerSharePence = safeNumber(allocation?.dividendPerSharePence) ?? safeNumber(financial.dividendPerSharePence);
    const dilutedShares = safeNumber(financial.dilutedShares);
    const dividendPerShare = dividendPerSharePence == null ? null : dividendPerSharePence / 100;
    const calculatedDividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
    const dividendCashCost = safeNumber(allocation?.amount) ?? calculatedDividendCashCost;
    const explicitBuyback = safeNumber(allocation?.buybackAmount);
    const buybackAmount = explicitBuyback ?? 0;
    const equityFreeCashFlow = safeNumber(financial.freeCashFlow);
    const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;
    const sourceQuality = explicitBuyback == null && buybackAmount === 0 ? "official_seed" : financial.sourceType;
    return {
      fiscalYear: financial.fiscalYear,
      periodId: financial.periodId,
      asOfDate: financial.asOfDate,
      sourceType: sourceQuality,
      sourceQuality,
      revenue: safeNumber(financial.revenue) ?? safeNumber(financial.sales),
      equityFreeCashFlow,
      dilutedShares,
      dividendPerShare,
      dividendPerSharePence,
      dividendCashCost,
      buybackAmount,
      totalCapitalReturn,
      fcfCoverage: equityFreeCashFlow != null && totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
      payoutRatioOfFcf: equityFreeCashFlow != null && dividendCashCost != null && equityFreeCashFlow > 0 ? dividendCashCost / equityFreeCashFlow : null,
      isForecast: false,
      rawJson: {
        financialPeriodId: financial.id,
        allocationEventId: allocation?.id ?? null,
        buybackTreatment: explicitBuyback == null ? "No explicit backend buyback amount; seeded as zero pending official extraction." : "Explicit backend buyback amount.",
      },
    };
  });

  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildBaForwardCapitalReturnExpectation(latest);
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
  const warnings = [];
  if (rows.length < limit) {
    warnings.push({
      id: "ba-capital-return-history-short",
      severity: "medium",
      title: "Capital-return history has fewer annual rows than requested",
      detail: `Requested ${limit} fiscal years; backend currently returned ${rows.length}.`,
    });
  }
  const proxyYears = rows.filter((row) => row.sourceQuality !== "official_actual").map((row) => row.fiscalYear);
  if (proxyYears.length) {
    warnings.push({
      id: "ba-capital-return-proxy-years",
      severity: "medium",
      title: "Some buyback rows use seeded zero amounts",
      detail: `Fiscal years ${proxyYears.join(", ")} do not yet have explicit backend buyback cash amounts. Buybacks are shown as GBP0m and sourceQuality=official_seed until official extraction is promoted.`,
    });
  }
  const missingFields = rows
    .filter((row) => [row.dividendPerSharePence, row.dividendCashCost, row.buybackAmount, row.equityFreeCashFlow, row.totalCapitalReturn].some((value) => !Number.isFinite(Number(value))))
    .map((row) => row.fiscalYear);
  if (missingFields.length) {
    warnings.push({
      id: "ba-capital-return-missing-fields",
      severity: "high",
      title: "Capital-return rows have missing numeric fields",
      detail: `Fiscal years ${missingFields.join(", ")} need DPS, dividend cash, buyback, FCF, and total capital return.`,
    });
  }

  return {
    ticker: TICKER,
    currency: "GBP",
    unit: "GBPm",
    years: rows.length,
    rows,
    forwardExpectation,
    chartSeries: buildBaCapitalReturnChartSeries(rows, forwardExpectation),
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
      excludesForwardFromCumulativeTotals: true,
    },
    warnings,
  };
}
