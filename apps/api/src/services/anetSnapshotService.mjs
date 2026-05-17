import { query } from "../db/client.mjs";
import { ANET_BACKEND_DB_PATH } from "../../../../modules/anet/db/schema.mjs";

const TICKER = "ANET";

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAnetDailyPriceOnOrBefore(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    ANET_BACKEND_DB_PATH,
  )[0] ?? null;
  const adjustedClose = safeNumber(row?.adjustedClose);
  if (!row || adjustedClose == null) return null;
  return {
    priceDate: row.priceDate,
    currentPrice: adjustedClose,
    previousClose: safeNumber(row.close) ?? adjustedClose,
    source: row.source,
    sourceType: row.sourceType,
  };
}

function sumNumbers(rows, field) {
  return rows.reduce((sum, row) => sum + Math.abs(safeNumber(row[field]) ?? 0), 0);
}

export function getAnetReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], ANET_BACKEND_DB_PATH);
}

export function getLatestAnetEvent() {
  return getAnetReportingEvents()[0] ?? null;
}

export function resolveAnetEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], ANET_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      ANET_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestAnetEvent();
}

export function getAnetSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveAnetEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC",
    params,
    ANET_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    ANET_BACKEND_DB_PATH,
  ));
  const operatingMetricSnapshots = parseRows(query(
    "SELECT * FROM operating_metric_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    ANET_BACKEND_DB_PATH,
  ));
  const rawMarketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    ANET_BACKEND_DB_PATH,
  ))[0] ?? null;
  const dailyPrice = getAnetDailyPriceOnOrBefore(effectiveAsOfDate);
  const marketSnapshot = dailyPrice
    ? {
        ...(rawMarketSnapshot ?? {}),
        ticker: TICKER,
        asOfDate: effectiveAsOfDate,
        priceDate: dailyPrice.priceDate,
        currentPrice: dailyPrice.currentPrice,
        previousClose: dailyPrice.previousClose,
        source: dailyPrice.source,
        rawJson: {
          ...((rawMarketSnapshot?.rawJson && typeof rawMarketSnapshot.rawJson === "object") ? rawMarketSnapshot.rawJson : {}),
          dailyPriceOverride: dailyPrice,
          noFutureLeakage: "Snapshot market price uses nearest daily_price_bars row on or before the requested as-of date.",
        },
      }
    : rawMarketSnapshot;
  const peerSnapshots = parseRows(query(
    "SELECT * FROM peer_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, peerTicker",
    params,
    ANET_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    ANET_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    ANET_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    ANET_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 500",
    [TICKER],
    ANET_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    ANET_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    ANET_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    ANET_BACKEND_DB_PATH,
  );

  return {
    reportingEvent,
    asOfDate: effectiveAsOfDate,
    financialPeriods,
    segmentFinancials,
    operatingMetricSnapshots,
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

function addSequentialGrowth(rows, valueKey, growthKey, lag = 1) {
  return rows.map((row, index) => {
    const previous = rows[index - lag];
    const currentValue = safeNumber(row[valueKey]);
    const previousValue = safeNumber(previous?.[valueKey]);
    return {
      ...row,
      [growthKey]: currentValue != null && previousValue ? currentValue / previousValue - 1 : null,
    };
  });
}

export function getAnetSubscriptionAgentHistory({ quarters = 40 } = {}) {
  const limit = Math.max(1, Math.min(Number(quarters) || 40, 80));
  let rows = parseRows(query(
    `SELECT
       f.periodId,
       f.fiscalYear,
       f.fiscalQuarter,
       f.asOfDate,
       f.sourceType AS financialSourceType,
       f.revenue,
       f.operatingIncome,
       f.operatingMargin,
       f.freeCashFlow,
       f.stockBasedCompensation,
       m.subscriptionRevenue,
       m.subscriptionRevenueGrowth,
       m.currentRpo,
       m.currentRpoGrowth,
       m.remainingPerformanceObligations,
       m.remainingPerformanceObligationsGrowth,
       m.netRetentionRate,
       m.largeCustomerCount,
       m.largeCustomerGrowth,
       m.agenticAiArr,
       m.agenticAiCustomers,
       m.agenticAiWorkflowCount,
       m.proPlusAdoptionRate,
       m.cloudTitanRevenue,
       m.cloudTitanGrowth,
       m.aiNetworkingRevenue,
       m.aiNetworkingGrowth,
       m.campusRevenue,
       m.campusGrowth,
       m.highSpeedPortShipments,
       m.highSpeedPortGrowth,
       m.cloudCustomerConcentration,
       m.backlog,
       m.inventoryDays,
       m.grossMarginCommentary,
       m.cloudTitanCommentary,
       m.aiNetworkingCommentary,
       m.campusCommentary,
       m.supplyChainCommentary,
       m.aiAgentCommentary,
       m.subscriptionCommentary,
       m.workflowExpansionCommentary,
       m.renewalCommentary,
       m.sbcDilutionCommentary,
       m.sourceType AS metricSourceType
     FROM financial_periods f
     LEFT JOIN operating_metric_snapshots m
       ON m.ticker = f.ticker
      AND m.periodId = f.periodId
      AND m.eventId = f.eventId
     WHERE f.ticker = ?
       AND f.periodType = 'quarter'
     ORDER BY f.asOfDate DESC
     LIMIT ?`,
    [TICKER, limit],
    ANET_BACKEND_DB_PATH,
  ))
    .reverse()
    .map((row) => {
      const revenue = safeNumber(row.revenue);
      const subscriptionRevenue = safeNumber(row.subscriptionRevenue);
      const currentRpo = safeNumber(row.currentRpo);
      const agenticAiArr = safeNumber(row.agenticAiArr);
      const cloudTitanRevenue = safeNumber(row.cloudTitanRevenue) ?? subscriptionRevenue;
      const aiNetworkingRevenue = safeNumber(row.aiNetworkingRevenue) ?? agenticAiArr;
      const backlog = safeNumber(row.backlog) ?? currentRpo;
      const freeCashFlow = safeNumber(row.freeCashFlow);
      return {
        ticker: TICKER,
        periodId: row.periodId,
        fiscalYear: row.fiscalYear,
        fiscalQuarter: row.fiscalQuarter,
        label: `FY${row.fiscalYear} ${row.fiscalQuarter}`,
        asOfDate: row.asOfDate,
        netRevenue: revenue,
        subscriptionRevenue,
        subscriptionRevenueGrowth: safeNumber(row.subscriptionRevenueGrowth),
        subscriptionRevenueMix: revenue && subscriptionRevenue != null ? subscriptionRevenue / revenue : null,
        currentRpo,
        currentRpoGrowth: safeNumber(row.currentRpoGrowth),
        remainingPerformanceObligations: safeNumber(row.remainingPerformanceObligations),
        remainingPerformanceObligationsGrowth: safeNumber(row.remainingPerformanceObligationsGrowth),
        netRetentionRate: safeNumber(row.netRetentionRate),
        largeCustomerCount: safeNumber(row.largeCustomerCount),
        largeCustomerGrowth: safeNumber(row.largeCustomerGrowth),
        agenticAiArr,
        agenticAiCustomers: safeNumber(row.agenticAiCustomers),
        agenticAiWorkflowCount: safeNumber(row.agenticAiWorkflowCount),
        proPlusAdoptionRate: safeNumber(row.proPlusAdoptionRate),
        cloudTitanRevenue,
        cloudTitanGrowth: safeNumber(row.cloudTitanGrowth) ?? safeNumber(row.subscriptionRevenueGrowth),
        cloudTitanRevenueMix: revenue && cloudTitanRevenue != null ? cloudTitanRevenue / revenue : null,
        aiNetworkingRevenue,
        aiNetworkingGrowth: safeNumber(row.aiNetworkingGrowth),
        aiNetworkingRevenueMix: revenue && aiNetworkingRevenue != null ? aiNetworkingRevenue / revenue : null,
        campusRevenue: safeNumber(row.campusRevenue),
        campusGrowth: safeNumber(row.campusGrowth),
        highSpeedPortShipments: safeNumber(row.highSpeedPortShipments),
        highSpeedPortGrowth: safeNumber(row.highSpeedPortGrowth),
        cloudCustomerConcentration: safeNumber(row.cloudCustomerConcentration),
        backlog,
        backlogGrowth: safeNumber(row.currentRpoGrowth),
        inventoryDays: safeNumber(row.inventoryDays),
        operatingIncome: safeNumber(row.operatingIncome),
        operatingMargin: safeNumber(row.operatingMargin),
        freeCashFlow,
        freeCashFlowMargin: revenue && freeCashFlow != null ? freeCashFlow / revenue : null,
        stockBasedCompensation: safeNumber(row.stockBasedCompensation),
        sbcToRevenue: revenue && row.stockBasedCompensation != null ? safeNumber(row.stockBasedCompensation) / revenue : null,
        aiAgentCommentary: row.aiAgentCommentary,
        subscriptionCommentary: row.subscriptionCommentary,
        grossMarginCommentary: row.grossMarginCommentary,
        cloudTitanCommentary: row.cloudTitanCommentary,
        aiNetworkingCommentary: row.aiNetworkingCommentary,
        campusCommentary: row.campusCommentary,
        supplyChainCommentary: row.supplyChainCommentary,
        workflowExpansionCommentary: row.workflowExpansionCommentary,
        renewalCommentary: row.renewalCommentary,
        sbcDilutionCommentary: row.sbcDilutionCommentary,
        sourceType: row.metricSourceType ?? row.financialSourceType,
        sourceQuality: row.metricSourceType === "market_data_proxy" || row.financialSourceType === "market_data_proxy"
          ? "market_data_proxy_quarterly_seed"
          : "official_seed_pending_parser",
        isProxy: row.metricSourceType === "market_data_proxy" || row.financialSourceType === "market_data_proxy",
      };
    });
  rows = addSequentialGrowth(addSequentialGrowth(addSequentialGrowth(rows, "subscriptionRevenue", "subscriptionRevenueQoqGrowth"), "currentRpo", "currentRpoQoqGrowth"), "agenticAiArr", "agenticAiArrQoqGrowth");
  rows = addSequentialGrowth(addSequentialGrowth(addSequentialGrowth(rows, "subscriptionRevenue", "subscriptionRevenueYoyGrowth", 4), "currentRpo", "currentRpoYoyGrowth", 4), "agenticAiArr", "agenticAiArrYoyGrowth", 4);
  rows = addSequentialGrowth(addSequentialGrowth(addSequentialGrowth(rows, "cloudTitanRevenue", "cloudTitanRevenueQoqGrowth"), "backlog", "backlogQoqGrowth"), "aiNetworkingRevenue", "aiNetworkingRevenueQoqGrowth");
  rows = addSequentialGrowth(addSequentialGrowth(addSequentialGrowth(rows, "cloudTitanRevenue", "cloudTitanRevenueYoyGrowth", 4), "backlog", "backlogYoyGrowth", 4), "aiNetworkingRevenue", "aiNetworkingRevenueYoyGrowth", 4);
  const latest = rows[rows.length - 1] ?? null;
  const subscriptionMixes = rows
    .map((row) => row.subscriptionRevenueMix)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const proxyRows = rows.filter((row) => row.isProxy).map((row) => row.label);
  return {
    ticker: TICKER,
    currency: "USD",
    unit: "USDm",
    quarters: limit,
    rows,
    summary: {
      rowCount: rows.length,
      latestPeriod: latest?.label ?? null,
      latestNetRevenue: latest?.netRevenue ?? null,
      latestSubscriptionRevenue: latest?.subscriptionRevenue ?? null,
      latestSubscriptionRevenueGrowth: latest?.subscriptionRevenueGrowth ?? null,
      latestCurrentRpo: latest?.currentRpo ?? null,
      latestCurrentRpoGrowth: latest?.currentRpoGrowth ?? null,
      latestAgenticAiArr: latest?.agenticAiArr ?? null,
      latestAgenticAiCustomers: latest?.agenticAiCustomers ?? null,
      latestProPlusAdoptionRate: latest?.proPlusAdoptionRate ?? null,
      latestCloudTitanRevenue: latest?.cloudTitanRevenue ?? null,
      latestCloudTitanGrowth: latest?.cloudTitanGrowth ?? null,
      latestBacklog: latest?.backlog ?? null,
      latestBacklogGrowth: latest?.backlogGrowth ?? null,
      latestAiNetworkingRevenue: latest?.aiNetworkingRevenue ?? null,
      latestHighSpeedPortShipments: latest?.highSpeedPortShipments ?? null,
      latestCloudCustomerConcentration: latest?.cloudCustomerConcentration ?? null,
      latestFreeCashFlowMargin: latest?.freeCashFlowMargin ?? null,
      averageSubscriptionRevenueMix: subscriptionMixes.length ? subscriptionMixes.reduce((sum, value) => sum + value, 0) / subscriptionMixes.length : null,
    },
    warnings: proxyRows.length
      ? [{
          id: "anet-subscription-agent-proxy-rows",
          severity: "medium",
          title: "Some ANET cloud / AI networking rows use proxy/seed data",
          detail: `${proxyRows.join(", ")} are marked as proxy/seed until official filing extraction is promoted.`,
        }]
      : [],
  };
}

export const getAnetCloudAiHistory = getAnetSubscriptionAgentHistory;

function capitalReturnSourceType(rows) {
  return rows.some((row) => row.sourceType === "market_data_proxy") ? "market_data_proxy" : "official_seed";
}

function capitalReturnSourceQuality(rows) {
  const sourceType = capitalReturnSourceType(rows);
  return sourceType === "market_data_proxy" ? "market_data_proxy_historical_seed" : "official_seed_pending_parser";
}

function buildAnetAnnualCapitalReturnRows(limit) {
  const annualCandidates = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND periodType = 'quarter'
       AND fiscalYear IS NOT NULL
       AND fiscalYear <= (
         SELECT MAX(fiscalYear)
         FROM financial_periods
         WHERE ticker = ?
           AND periodType = 'quarter'
           AND fiscalQuarter = 'Q4'
       )
     ORDER BY fiscalYear DESC, fiscalQuarter DESC`,
    [TICKER, TICKER],
    ANET_BACKEND_DB_PATH,
  ));

  const fiscalYears = [...new Set(annualCandidates.map((row) => row.fiscalYear).filter(Number.isFinite))]
    .sort((left, right) => right - left)
    .slice(0, limit)
    .sort((left, right) => left - right);

  return fiscalYears.map((fiscalYear) => {
    const rows = annualCandidates
      .filter((row) => row.fiscalYear === fiscalYear)
      .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
    const latest = [...rows].reverse().find((row) => safeNumber(row.dilutedShares) != null) ?? rows[rows.length - 1] ?? null;
    const q4 = rows.find((row) => row.fiscalQuarter === "Q4") ?? latest;
    const revenue = sumNumbers(rows, "revenue");
    const equityFreeCashFlow = sumNumbers(rows, "freeCashFlow");
    const dividendCashPaid = sumNumbers(rows, "dividendsPaid");
    const buybackAmount = sumNumbers(rows, "buybacks");
    const dilutedShares = safeNumber(latest?.dilutedShares);
    const dividendPerShare = dilutedShares ? dividendCashPaid / dilutedShares : null;
    const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
    const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;
    return {
      fiscalYear,
      periodId: `fy${String(fiscalYear).slice(2)}`,
      asOfDate: q4?.asOfDate ?? latest?.asOfDate ?? null,
      sourceType: capitalReturnSourceType(rows),
      sourceQuality: capitalReturnSourceQuality(rows),
      revenue,
      equityFreeCashFlow,
      dilutedShares,
      dividendPerShare,
      dividendPerShareCents: dividendPerShare == null ? null : dividendPerShare * 100,
      dividendCashCost,
      buybackAmount,
      totalCapitalReturn,
      fcfCoverage: totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
      payoutRatioOfFcf: equityFreeCashFlow > 0 ? totalCapitalReturn / equityFreeCashFlow : null,
      isForecast: false,
      rawJson: {
        source: "ANET backend financial_periods annual aggregation",
        coverageTreatment: "FCF coverage uses equity FCF divided by gross share repurchases. Dividends are zero unless Arista starts paying one.",
        dataCaveat: "Rows are official_seed / market_data_proxy until official filing parser backfill is promoted.",
      },
    };
  });
}

function buildAnetForwardCapitalReturnExpectation(latestActual) {
  if (!latestActual) return null;
  const latestRunRate = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, latestActual.fiscalYear + 1],
    ANET_BACKEND_DB_PATH,
  ))[0] ?? null;
  const fiscalYear = latestActual.fiscalYear + 1;
  const dilutedShares = safeNumber(latestRunRate?.dilutedShares) ?? latestActual.dilutedShares;
  const dividendPerShare = 0;
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const buybackAmount = Math.max((latestActual.buybackAmount ?? 0) * 1.05, 2_000);
  const equityFreeCashFlow = Math.max((latestActual.equityFreeCashFlow ?? 0) * 1.10, 4_800);
  const totalCapitalReturn = (dividendCashCost ?? 0) + buybackAmount;

  return {
    fiscalYear,
    periodId: `fy${fiscalYear}e`,
    asOfDate: latestRunRate?.asOfDate ?? latestActual.asOfDate,
    sourceType: "forecast_assumption",
    sourceQuality: "forecast_assumption",
    revenue: latestRunRate?.revenue != null ? safeNumber(latestRunRate.revenue) * 4 : null,
    equityFreeCashFlow,
    dilutedShares,
    dividendPerShare,
    dividendPerShareCents: dividendPerShare == null ? null : dividendPerShare * 100,
    dividendCashCost,
    buybackAmount,
    totalCapitalReturn,
    fcfCoverage: totalCapitalReturn > 0 ? equityFreeCashFlow / totalCapitalReturn : null,
    payoutRatioOfFcf: equityFreeCashFlow > 0 ? totalCapitalReturn / equityFreeCashFlow : null,
    isForecast: true,
    rawJson: {
      source: "forecast_assumption",
      dividendSource: "ANET has no dividend in this seed framework; DPS remains zero.",
      buybackSource: "Assumes gross repurchases continue as SBC/dilution offset rather than a dividend substitute.",
      fcfSource: "Latest annual equity FCF grown 10%, cross-checked against FY2026 Q1 event-visible run-rate.",
      forecastAssumptionLabel: "Base forward buyback / FCF assumption",
      displayTreatment: "Render as dashed/hatched forecast bar and exclude from 8Y cumulative totals.",
    },
  };
}

function buildChartSeries(rows, forwardExpectation) {
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

export function getAnetCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const rows = buildAnetAnnualCapitalReturnRows(limit);
  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildAnetForwardCapitalReturnExpectation(latest);
  const cumulativeDividendCash = rows.reduce((sum, row) => sum + (row.dividendCashCost ?? 0), 0);
  const cumulativeBuybacks = rows.reduce((sum, row) => sum + (row.buybackAmount ?? 0), 0);
  const cumulativeFcf = rows.reduce((sum, row) => sum + (row.equityFreeCashFlow ?? 0), 0);
  const proxyYears = rows
    .filter((row) => ["market_data_proxy", "official_seed"].includes(row.sourceType) || String(row.sourceQuality).includes("proxy") || String(row.sourceQuality).includes("seed"))
    .map((row) => row.fiscalYear);
  const capitalReturnExceedsFcfYears = rows
    .filter((row) => (row.totalCapitalReturn ?? 0) > (row.equityFreeCashFlow ?? Infinity))
    .map((row) => row.fiscalYear);
  const warnings = [];

  if (proxyYears.length) {
    warnings.push({
      id: "anet-capital-return-proxy-years",
      severity: "medium",
      title: "Some ANET capital-return rows use seed/proxy data",
      detail: `Fiscal years ${proxyYears.join(", ")} are not yet backed by promoted official filing extraction.`,
    });
  }
  if (capitalReturnExceedsFcfYears.length) {
    warnings.push({
      id: "anet-capital-return-fcf-coverage-pressure",
      severity: "low",
      title: "Capital return exceeds FCF in some years",
      detail: `Fiscal years ${capitalReturnExceedsFcfYears.join(", ")} show dividends plus buybacks above equity FCF. Coverage stays finite and does not add balance-sheet cash.`,
    });
  }

  return {
    ticker: "ANET",
    currency: "USD",
    unit: "USDm",
    years: limit,
    rows,
    forwardExpectation,
    chartSeries: buildChartSeries(rows, forwardExpectation),
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
      capitalReturnExceedsFcfYears,
      forwardFiscalYear: forwardExpectation?.fiscalYear ?? null,
      forwardDividendCashCost: forwardExpectation?.dividendCashCost ?? null,
      forwardBuybackAmount: forwardExpectation?.buybackAmount ?? null,
      forwardTotalCapitalReturn: forwardExpectation?.totalCapitalReturn ?? null,
      forwardEquityFreeCashFlow: forwardExpectation?.equityFreeCashFlow ?? null,
      forwardFcfCoverage: forwardExpectation?.fcfCoverage ?? null,
    },
    warnings,
  };
}
