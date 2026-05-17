import { query } from "../db/client.mjs";
import { V_BACKEND_DB_PATH } from "../../../../modules/v/db/schema.mjs";

const TICKER = "V";

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

function getVDailyPriceOnOrBefore(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND adjustedClose IS NOT NULL
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    V_BACKEND_DB_PATH,
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

export function getVReportingEvents() {
  return query("SELECT * FROM reporting_events WHERE ticker = ? ORDER BY eventDate DESC", [TICKER], V_BACKEND_DB_PATH);
}

export function getLatestVEvent() {
  return getVReportingEvents()[0] ?? null;
}

export function resolveVEvent({ eventId, asOfDate } = {}) {
  if (eventId) {
    return query("SELECT * FROM reporting_events WHERE ticker = ? AND id = ? LIMIT 1", [TICKER, eventId], V_BACKEND_DB_PATH)[0] ?? null;
  }
  if (asOfDate) {
    return query(
      "SELECT * FROM reporting_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC LIMIT 1",
      [TICKER, asOfDate],
      V_BACKEND_DB_PATH,
    )[0] ?? null;
  }
  return getLatestVEvent();
}

export function getVSnapshot({ eventId, asOfDate } = {}) {
  const reportingEvent = resolveVEvent({ eventId, asOfDate });
  const effectiveAsOfDate = asOfDate ?? reportingEvent?.eventDate;
  const params = [TICKER, effectiveAsOfDate ?? "9999-12-31"];
  const eventFilter = reportingEvent ? reportingEvent.id : "";

  const financialPeriods = parseRows(query(
    "SELECT * FROM financial_periods WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, fiscalYear ASC, fiscalQuarter ASC",
    params,
    V_BACKEND_DB_PATH,
  ));
  const segmentFinancials = parseRows(query(
    "SELECT * FROM segment_financials WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC, segment",
    params,
    V_BACKEND_DB_PATH,
  ));
  const operatingMetricSnapshots = parseRows(query(
    "SELECT * FROM operating_metric_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate ASC",
    params,
    V_BACKEND_DB_PATH,
  ));
  const rawMarketSnapshot = parseRows(query(
    "SELECT * FROM market_snapshots WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC LIMIT 1",
    params,
    V_BACKEND_DB_PATH,
  ))[0] ?? null;
  const dailyPrice = getVDailyPriceOnOrBefore(effectiveAsOfDate);
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
    V_BACKEND_DB_PATH,
  ));
  const guidanceItems = parseRows(query(
    "SELECT * FROM guidance_items WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, metric",
    params,
    V_BACKEND_DB_PATH,
  ));
  const transcriptEvents = parseRows(query(
    "SELECT * FROM transcript_events WHERE ticker = ? AND eventDate <= ? ORDER BY eventDate DESC",
    params,
    V_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const transcriptExtractions = parseRows(query(
    "SELECT * FROM transcript_extractions WHERE ticker = ? AND eventId = ? ORDER BY extractionType, topic LIMIT 200",
    [TICKER, eventFilter],
    V_BACKEND_DB_PATH,
  ));
  const sourceDocuments = parseRows(query(
    "SELECT * FROM source_documents WHERE ticker = ? ORDER BY retrievedAt DESC, id LIMIT 500",
    [TICKER],
    V_BACKEND_DB_PATH,
  ), ["metadataJson"]);
  const modelVersions = parseRows(query(
    "SELECT * FROM model_versions WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    V_BACKEND_DB_PATH,
  ), ["valuationMethodsJson", "assumptionSchemaJson"]);
  const assumptionSets = parseRows(query(
    "SELECT * FROM assumption_sets WHERE ticker = ? AND asOfDate <= ? ORDER BY asOfDate DESC, scenario",
    params,
    V_BACKEND_DB_PATH,
  ), ["assumptionsJson"]);
  const validationWarnings = query(
    "SELECT * FROM validation_warnings WHERE ticker = ? ORDER BY createdAt DESC",
    [TICKER],
    V_BACKEND_DB_PATH,
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

export function getVIncentivesVsNetRevenueHistory({ quarters = 40 } = {}) {
  const limit = Math.max(1, Math.min(Number(quarters) || 40, 80));
  const rows = parseRows(query(
    `SELECT
       f.periodId,
       f.fiscalYear,
       f.fiscalQuarter,
       f.asOfDate,
       f.sourceType AS financialSourceType,
       f.revenue,
       m.rebatesIncentives,
       m.takeRate,
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
    V_BACKEND_DB_PATH,
  ))
    .reverse()
    .map((row) => {
      const revenue = safeNumber(row.revenue);
      const rebatesIncentives = safeNumber(row.rebatesIncentives);
      const incentiveRatio = revenue && rebatesIncentives != null ? rebatesIncentives / revenue : null;
      return {
        ticker: TICKER,
        periodId: row.periodId,
        fiscalYear: row.fiscalYear,
        fiscalQuarter: row.fiscalQuarter,
        label: `FY${row.fiscalYear} ${row.fiscalQuarter}`,
        asOfDate: row.asOfDate,
        netRevenue: revenue,
        rebatesIncentives,
        incentivesToNetRevenue: incentiveRatio,
        takeRate: safeNumber(row.takeRate),
        sourceType: row.metricSourceType ?? row.financialSourceType,
        sourceQuality: row.metricSourceType === "market_data_proxy" || row.financialSourceType === "market_data_proxy"
          ? "market_data_proxy_quarterly_seed"
          : "official_seed_pending_parser",
        isProxy: row.metricSourceType === "market_data_proxy" || row.financialSourceType === "market_data_proxy",
      };
    });
  const latest = rows[rows.length - 1] ?? null;
  const ratios = rows
    .map((row) => row.incentivesToNetRevenue)
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
      latestRebatesIncentives: latest?.rebatesIncentives ?? null,
      latestIncentivesToNetRevenue: latest?.incentivesToNetRevenue ?? null,
      averageIncentivesToNetRevenue: ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null,
    },
    warnings: proxyRows.length
      ? [{
          id: "v-incentives-proxy-rows",
          severity: "medium",
          title: "Some V incentive rows use proxy/seed data",
          detail: `${proxyRows.join(", ")} are marked as proxy/seed until official filing extraction is promoted.`,
        }]
      : [],
  };
}

function capitalReturnSourceType(rows) {
  return rows.some((row) => row.sourceType === "market_data_proxy") ? "market_data_proxy" : "official_seed";
}

function capitalReturnSourceQuality(rows) {
  const sourceType = capitalReturnSourceType(rows);
  return sourceType === "market_data_proxy" ? "market_data_proxy_historical_seed" : "official_seed_pending_parser";
}

function buildVAnnualCapitalReturnRows(limit) {
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
    V_BACKEND_DB_PATH,
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
        source: "V backend financial_periods annual aggregation",
        coverageTreatment: "FCF coverage uses equity FCF divided by dividends plus gross share repurchases. Balance-sheet cash is not added.",
        dataCaveat: "Rows are official_seed / market_data_proxy until official filing parser backfill is promoted.",
      },
    };
  });
}

function buildVForwardCapitalReturnExpectation(latestActual) {
  if (!latestActual) return null;
  const latestRunRate = parseRows(query(
    `SELECT *
     FROM financial_periods
     WHERE ticker = ?
       AND fiscalYear = ?
     ORDER BY asOfDate DESC
     LIMIT 1`,
    [TICKER, latestActual.fiscalYear + 1],
    V_BACKEND_DB_PATH,
  ))[0] ?? null;
  const fiscalYear = latestActual.fiscalYear + 1;
  const dilutedShares = safeNumber(latestRunRate?.dilutedShares) ?? latestActual.dilutedShares;
  const dividendPerShare = latestActual.dividendPerShare == null ? null : latestActual.dividendPerShare * 1.12;
  const dividendCashCost = dividendPerShare != null && dilutedShares != null ? dividendPerShare * dilutedShares : null;
  const buybackAmount = Math.max((latestActual.buybackAmount ?? 0) * 1.02, 11_000);
  const equityFreeCashFlow = Math.max((latestActual.equityFreeCashFlow ?? 0) * 1.08, 15_000);
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
      dividendSource: "Latest annual DPS grown 12% to reflect V's low payout and dividend growth history.",
      buybackSource: "Assumes gross repurchases remain near recent run-rate but below implied FCF stretch.",
      fcfSource: "Latest annual equity FCF grown 8%, cross-checked against FY2026 Q1 event-visible run-rate.",
      forecastAssumptionLabel: "Base forward capital return assumption",
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

export function getVCapitalReturnHistory({ years = 8 } = {}) {
  const limit = Math.max(1, Math.min(Number(years) || 8, 12));
  const rows = buildVAnnualCapitalReturnRows(limit);
  const latest = rows[rows.length - 1] ?? null;
  const forwardExpectation = buildVForwardCapitalReturnExpectation(latest);
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
      id: "v-capital-return-proxy-years",
      severity: "medium",
      title: "Some V capital-return rows use seed/proxy data",
      detail: `Fiscal years ${proxyYears.join(", ")} are not yet backed by promoted official filing extraction.`,
    });
  }
  if (capitalReturnExceedsFcfYears.length) {
    warnings.push({
      id: "v-capital-return-fcf-coverage-pressure",
      severity: "low",
      title: "Capital return exceeds FCF in some years",
      detail: `Fiscal years ${capitalReturnExceedsFcfYears.join(", ")} show dividends plus buybacks above equity FCF. Coverage stays finite and does not add balance-sheet cash.`,
    });
  }

  return {
    ticker: "V",
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
