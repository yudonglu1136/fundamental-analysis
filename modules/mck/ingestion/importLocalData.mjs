import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { MCK_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "MCK";

function json(value) {
  return JSON.stringify(value ?? null);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseFiscalYear(fiscalPeriod = "") {
  const match = String(fiscalPeriod).match(/FY(\d{4})/i);
  return match ? Number(match[1]) : null;
}

function parseFiscalQuarter(fiscalPeriod = "") {
  const match = String(fiscalPeriod).match(/\bQ([1-4])\b/i);
  return match ? `Q${match[1]}` : null;
}

function eventTypeFromPeriod(fiscalPeriod = "") {
  const quarter = parseFiscalQuarter(fiscalPeriod);
  if (quarter === "Q1") return "q1_earnings_release";
  if (quarter === "Q2") return "q2_earnings_release_10q";
  if (quarter === "Q3") return "q3_earnings_release_10q";
  if (quarter === "Q4") return "fy_earnings_release_10k";
  return "investor_presentation";
}

function sourceLayer(sourceType, fallback = "research_only") {
  if (sourceType === "actual") return "official_actual";
  if (sourceType === "guidance") return "management_guidance";
  if (sourceType === "market") return "market_data";
  if (sourceType === "transcript") return "transcript_commentary";
  if (sourceType === "research") return "research_only";
  if (sourceType === "placeholder") return "forecast_assumption";
  if (sourceType === "derived" || sourceType === "assumption") return "forecast_assumption";
  return fallback;
}

function periodIdFromEvent(event) {
  const fiscalYear = parseFiscalYear(event.fiscalPeriod);
  const quarter = parseFiscalQuarter(event.fiscalPeriod);
  if (!fiscalYear) return slugify(event.fiscalPeriod);
  if (quarter === "Q4") return `fy${fiscalYear}`;
  return `fy${fiscalYear}_${String(quarter).toLowerCase()}_snapshot`;
}

function officialReleasePathForEvent(event) {
  const fiscalYear = parseFiscalYear(event.fiscalPeriod);
  const quarter = parseFiscalQuarter(event.fiscalPeriod);
  const fileName = fiscalYear && quarter ? `mck-fy${fiscalYear}-${quarter.toLowerCase()}-release.html` : `mck-${periodIdFromEvent(event).replace(/_/g, "-").replace("-snapshot", "")}-release.html`;
  const candidate = path.resolve("data/local/mck/official/raw", fileName);
  return fs.existsSync(candidate) ? path.relative(process.cwd(), candidate) : null;
}

function readJsonFile(relativePath, fallback) {
  const filePath = path.resolve(relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function latestOnOrBefore(rows, eventDate) {
  return rows
    .filter((row) => row.asOfDate <= eventDate)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] ?? null;
}

function proxyMarketPrice(eventDate, currentPrice) {
  const prices = [
    ["2018-05-24", 143],
    ["2019-05-08", 124],
    ["2020-05-20", 148],
    ["2021-05-20", 193],
    ["2022-05-05", 318],
    ["2023-05-08", 380],
    ["2024-05-08", 535],
    ["2024-08-07", 555],
    ["2024-11-06", 610],
    ["2025-02-05", 585],
    ["2025-05-08", 695],
    ["2025-08-06", 722],
    ["2025-11-05", 736],
    ["2026-02-04", 684],
    ["2026-05-07", currentPrice],
    ["2026-05-08", currentPrice],
  ];
  return prices
    .filter(([date]) => date <= eventDate)
    .sort((left, right) => right[0].localeCompare(left[0]))[0]?.[1] ?? currentPrice;
}

function historicalTag({ fiscalYear, source = "historical backend seed from public annual financial history" }) {
  return {
    sourceType: "derived",
    source,
    sourceUrl: "https://stockanalysis.com/stocks/mck/revenue/",
    asOfDate: `${fiscalYear}-05-31`,
    confidence: "medium",
    isPlaceholder: true,
    notes: "Eight-year backend expansion seed. Revenue is public annual history; EPS, FCF, shares, net debt, and segment split are historical modeling seeds pending full official 10-K parser backfill.",
  };
}

const historicalMckAnnualRows = [
  { fiscalYear: 2018, eventDate: "2018-05-24", revenue: 208357, revenueGrowth: 0.0495, adjustedDilutedEps: 12.62, adjustedEpsGrowth: 0.02, freeCashFlow: 3100, dilutedShares: 214, netDebt: 8600, shareRepurchases: 1600, dividendsPaid: 285 },
  { fiscalYear: 2019, eventDate: "2019-05-08", revenue: 214319, revenueGrowth: 0.0286, adjustedDilutedEps: 13.57, adjustedEpsGrowth: 0.08, freeCashFlow: 3200, dilutedShares: 192, netDebt: 7600, shareRepurchases: 2700, dividendsPaid: 290 },
  { fiscalYear: 2020, eventDate: "2020-05-20", revenue: 231051, revenueGrowth: 0.0781, adjustedDilutedEps: 14.95, adjustedEpsGrowth: 0.10, freeCashFlow: 3900, dilutedShares: 172, netDebt: 6900, shareRepurchases: 1900, dividendsPaid: 283 },
  { fiscalYear: 2021, eventDate: "2021-05-20", revenue: 238228, revenueGrowth: 0.0311, adjustedDilutedEps: 17.21, adjustedEpsGrowth: 0.15, freeCashFlow: 4700, dilutedShares: 160, netDebt: 6500, shareRepurchases: 1800, dividendsPaid: 270 },
  { fiscalYear: 2022, eventDate: "2022-05-05", revenue: 263966, revenueGrowth: 0.1080, adjustedDilutedEps: 23.69, adjustedEpsGrowth: 0.38, freeCashFlow: 4300, dilutedShares: 150, netDebt: 6300, shareRepurchases: 3400, dividendsPaid: 280 },
  { fiscalYear: 2023, eventDate: "2023-05-08", revenue: 276711, revenueGrowth: 0.0483, adjustedDilutedEps: 25.94, adjustedEpsGrowth: 0.09, freeCashFlow: 4600, dilutedShares: 141, netDebt: 6200, shareRepurchases: 3100, dividendsPaid: 305 },
  { fiscalYear: 2024, eventDate: "2024-05-08", revenue: 308951, revenueGrowth: 0.1165, adjustedDilutedEps: 27.45, adjustedEpsGrowth: 0.06, freeCashFlow: 4800, dilutedShares: 136, netDebt: 6100, shareRepurchases: 3000, dividendsPaid: 325 },
];

const historicalMckReportedFinancials = historicalMckAnnualRows.map((row) => ({
  periodId: `fy${row.fiscalYear}`,
  label: `FY${row.fiscalYear}A`,
  fiscalYear: row.fiscalYear,
  revenue: row.revenue,
  revenueGrowth: row.revenueGrowth,
  gaapDilutedEps: row.adjustedDilutedEps * 0.88,
  adjustedDilutedEps: row.adjustedDilutedEps,
  adjustedEpsGrowth: row.adjustedEpsGrowth,
  operatingCashFlow: row.freeCashFlow + row.revenue * 0.002,
  capex: Math.round(row.revenue * 0.002),
  freeCashFlow: row.freeCashFlow,
  shareRepurchases: row.shareRepurchases,
  dividendsPaid: row.dividendsPaid,
  dilutedShares: row.dilutedShares,
  dilutedSharesTag: historicalTag({ fiscalYear: row.fiscalYear, source: "historical backend seed diluted share estimate" }),
  netDebt: row.netDebt,
  netDebtTag: historicalTag({ fiscalYear: row.fiscalYear, source: "historical backend seed net debt estimate" }),
  adjustedTaxRate: 0.18,
  tag: historicalTag({ fiscalYear: row.fiscalYear }),
}));

const historicalMckTranscriptEvents = historicalMckAnnualRows.map((row) => ({
  id: `fy${row.fiscalYear}-q4`,
  fiscalPeriod: `FY${row.fiscalYear} Q4`,
  eventDate: row.eventDate,
  title: `FY${row.fiscalYear} Q4 earnings release / historical backend seed`,
  source: "Historical backend seed pending official transcript import",
  sourceUrl: "https://stockanalysis.com/stocks/mck/revenue/",
  managementTone: row.adjustedEpsGrowth >= 0.1 ? "positive" : "mixed",
  summary: `Historical annual seed for FY${row.fiscalYear}; expands MCK backend valuation history beyond the latest eight quarters.`,
  topics: ["distribution", "working capital", "capital allocation", "generic deflation", "customer contracts"],
  metrics: {
    revenue: row.revenue / 4,
    revenueGrowth: row.revenueGrowth,
    adjustedEps: row.adjustedDilutedEps / 4,
    adjustedEpsGrowth: row.adjustedEpsGrowth,
    freeCashFlow: row.freeCashFlow,
  },
  marketFocus: "Historical annual read-through; full Q&A topic extraction pending official transcript backfill.",
  thesisRead: "Used to show the multi-year compounding and margin sensitivity history, not as a fresh transcript-derived valuation input.",
  quarterHighlights: [
    `FY${row.fiscalYear} revenue was ${row.revenue.toLocaleString()} million.`,
    `Historical adjusted EPS seed is $${row.adjustedDilutedEps.toFixed(2)}.`,
    "Transcript/Q&A details remain research-only until imported from official or licensed transcript sources.",
  ],
  sourceCoverage: "historical_annual_seed",
  guidanceChange: null,
  analystConcerns: ["Distribution margin durability.", "Working-capital normalization.", "Buyback discipline."],
  tag: historicalTag({ fiscalYear: row.fiscalYear }),
}));

const historicalMckSegmentFinancials = historicalMckAnnualRows.flatMap((row) => {
  const napRevenue = row.revenue * 0.9;
  const ptsRevenue = row.revenue * 0.018;
  const medSurgRevenue = row.revenue * 0.045;
  const otherRevenue = row.revenue - napRevenue - ptsRevenue - medSurgRevenue;
  const adjustedOperatingProfit = row.adjustedDilutedEps * row.dilutedShares / (1 - 0.18);
  const tag = historicalTag({ fiscalYear: row.fiscalYear, source: "historical backend segment-mix seed" });
  return [
    {
      periodId: `fy${row.fiscalYear}`,
      segment: "North American Pharmaceutical",
      revenue: napRevenue,
      revenueGrowth: row.revenueGrowth,
      operatingProfit: adjustedOperatingProfit * 0.72,
      adjustedOperatingProfit: adjustedOperatingProfit * 0.72,
      adjustedOperatingProfitGrowth: row.adjustedEpsGrowth,
      margin: (adjustedOperatingProfit * 0.72) / napRevenue,
      marginBps: ((adjustedOperatingProfit * 0.72) / napRevenue) * 10000,
      moatScore: 82,
      riskLevel: "Medium",
      multipleAssumption: 9,
      tag,
    },
    {
      periodId: `fy${row.fiscalYear}`,
      segment: "Oncology & Multispecialty",
      revenue: 0,
      revenueGrowth: 0,
      operatingProfit: 0,
      adjustedOperatingProfit: 0,
      adjustedOperatingProfitGrowth: 0,
      margin: 0,
      marginBps: 0,
      moatScore: 85,
      riskLevel: "Medium",
      multipleAssumption: 14,
      tag,
    },
    {
      periodId: `fy${row.fiscalYear}`,
      segment: "Prescription Technology Solutions",
      revenue: ptsRevenue,
      revenueGrowth: row.revenueGrowth,
      operatingProfit: adjustedOperatingProfit * 0.16,
      adjustedOperatingProfit: adjustedOperatingProfit * 0.16,
      adjustedOperatingProfitGrowth: row.adjustedEpsGrowth,
      margin: (adjustedOperatingProfit * 0.16) / ptsRevenue,
      marginBps: ((adjustedOperatingProfit * 0.16) / ptsRevenue) * 10000,
      moatScore: 74,
      riskLevel: "Medium",
      multipleAssumption: 14,
      tag,
    },
    {
      periodId: `fy${row.fiscalYear}`,
      segment: "Medical-Surgical Solutions",
      revenue: medSurgRevenue,
      revenueGrowth: row.revenueGrowth * 0.4,
      operatingProfit: adjustedOperatingProfit * 0.1,
      adjustedOperatingProfit: adjustedOperatingProfit * 0.1,
      adjustedOperatingProfitGrowth: row.adjustedEpsGrowth * 0.5,
      margin: (adjustedOperatingProfit * 0.1) / medSurgRevenue,
      marginBps: ((adjustedOperatingProfit * 0.1) / medSurgRevenue) * 10000,
      moatScore: 66,
      riskLevel: "Medium",
      multipleAssumption: 8,
      tag,
    },
    {
      periodId: `fy${row.fiscalYear}`,
      segment: "International / Other",
      revenue: otherRevenue,
      revenueGrowth: row.revenueGrowth,
      operatingProfit: adjustedOperatingProfit * 0.02,
      adjustedOperatingProfit: adjustedOperatingProfit * 0.02,
      adjustedOperatingProfitGrowth: row.adjustedEpsGrowth,
      margin: (adjustedOperatingProfit * 0.02) / Math.max(otherRevenue, 1),
      marginBps: ((adjustedOperatingProfit * 0.02) / Math.max(otherRevenue, 1)) * 10000,
      moatScore: 45,
      riskLevel: "High",
      multipleAssumption: 5,
      tag,
    },
  ];
});

function mckSegmentNameForDb(segment) {
  return segment === "North American Pharmaceutical" ? "U.S. Pharmaceutical" : segment;
}

function mckSegmentNameForFrontend(segment) {
  return segment === "U.S. Pharmaceutical" ? "North American Pharmaceutical" : segment;
}

function guidanceMidpoint(eventId) {
  const guide = {
    "fy2025-q1": 32.15,
    "fy2025-q2": 32.35,
    "fy2025-q3": 32.75,
    "fy2025-q4": 33.05,
    "fy2026-q1": 37.5,
    "fy2026-q2": 38.6,
    "fy2026-q3": 39,
    "fy2026-q4": 39.11,
  };
  return guide[eventId] ?? null;
}

function normalizedFcfForEvent(eventId) {
  const fcf = {
    "fy2025-q1": 4300,
    "fy2025-q2": 4550,
    "fy2025-q3": 4850,
    "fy2025-q4": 5200,
    "fy2026-q1": 5000,
    "fy2026-q2": 5250,
    "fy2026-q3": 5350,
    "fy2026-q4": 5400,
  };
  return fcf[eventId] ?? null;
}

function shareCountForEvent(eventId) {
  const shares = {
    "fy2025-q1": 133.7,
    "fy2025-q2": 132.9,
    "fy2025-q3": 132.5,
    "fy2025-q4": 132.3,
    "fy2026-q1": 128.8,
    "fy2026-q2": 126.8,
    "fy2026-q3": 124.5,
    "fy2026-q4": 122.5,
  };
  return shares[eventId] ?? 122.5;
}

function buildEventFinancialRows({ events, reportedFinancials, market }) {
  const annualByYear = new Map(reportedFinancials.map((row) => [row.fiscalYear, row]));
  return events.map((event) => {
    const periodId = periodIdFromEvent(event);
    const fiscalYear = parseFiscalYear(event.fiscalPeriod);
    const quarter = parseFiscalQuarter(event.fiscalPeriod);
    const annual = annualByYear.get(fiscalYear);
    const isOfficialAnnual = quarter === "Q4" && annual;
    const priorAnnual = reportedFinancials
      .filter((row) => row.tag.asOfDate <= event.eventDate)
      .sort((left, right) => right.tag.asOfDate.localeCompare(left.tag.asOfDate))[0] ?? annual ?? reportedFinancials[0];
    const guideEps = guidanceMidpoint(event.id);
    const reportedQuarterFcf = event.metrics?.freeCashFlow ?? null;
    const normalizedFreeCashFlow = isOfficialAnnual ? annual.freeCashFlow : normalizedFcfForEvent(event.id) ?? priorAnnual.freeCashFlow;
    const dilutedShares = isOfficialAnnual ? annual.dilutedShares : shareCountForEvent(event.id);
    const revenue = isOfficialAnnual ? annual.revenue : Math.round((event.metrics?.revenue ?? priorAnnual.revenue / 4) * 4);
    const adjustedDilutedEps = isOfficialAnnual ? annual.adjustedDilutedEps : guideEps ?? (event.metrics?.adjustedEps ?? priorAnnual.adjustedDilutedEps / 4) * 4;
    const adjustedNetIncome = adjustedDilutedEps * dilutedShares;
    const adjustedTaxRate = annual?.adjustedTaxRate ?? priorAnnual.adjustedTaxRate;
    const adjustedOperatingProfit = adjustedNetIncome / Math.max(1 - adjustedTaxRate, 0.65);
    const sourceType = isOfficialAnnual ? sourceLayer(annual.tag?.sourceType, "official_actual") : "forecast_assumption";
    return {
      id: `mck-${periodId}`,
      ticker: TICKER,
      periodId,
      fiscalYear,
      fiscalQuarter: quarter,
      periodType: isOfficialAnnual ? "annual" : "reporting_event_run_rate",
      eventId: event.id,
      asOfDate: event.eventDate,
      sourceType,
      revenue,
      revenueGrowth: event.metrics?.revenueGrowth ?? annual?.revenueGrowth ?? priorAnnual.revenueGrowth,
      gaapDilutedEps: isOfficialAnnual ? annual.gaapDilutedEps : null,
      adjustedDilutedEps,
      adjustedEpsGrowth: event.metrics?.adjustedEpsGrowth ?? annual?.adjustedEpsGrowth ?? priorAnnual.adjustedEpsGrowth,
      adjustedOperatingProfit,
      adjustedNetIncome,
      operatingCashFlow: isOfficialAnnual ? annual.operatingCashFlow : null,
      capex: isOfficialAnnual ? annual.capex : Math.round(revenue * 0.002),
      freeCashFlow: isOfficialAnnual ? annual.freeCashFlow : normalizedFreeCashFlow,
      normalizedFreeCashFlow,
      fcfConversion: normalizedFreeCashFlow / Math.max(adjustedNetIncome, 1),
      workingCapitalSwing: reportedQuarterFcf == null ? null : reportedQuarterFcf - normalizedFreeCashFlow / 4,
      inventoryDays: quarter === "Q1" || quarter === "Q2" ? 28 : 26,
      receivableDays: 32,
      payableDays: 49,
      shareRepurchases: isOfficialAnnual ? annual.shareRepurchases : Math.round((market.buybackYield * market.marketCap) / 4),
      dividendsPaid: isOfficialAnnual ? annual.dividendsPaid : Math.round((market.dividendYield * market.marketCap) / 4),
      dilutedShares,
      netDebt: annual?.netDebt ?? priorAnnual.netDebt,
      adjustedTaxRate,
      opioidLegalLiabilities: 1200,
      currentPrice: proxyMarketPrice(event.eventDate, market.currentPrice),
      rawJson: json({
        source: isOfficialAnnual ? annual.tag?.source ?? "official_full_year_release" : "event_visible_guidance_run_rate_snapshot",
        sourceUrl: annual?.tag?.sourceUrl ?? null,
        dataLayer: sourceType,
        eventMetrics: event.metrics ?? null,
        reportedQuarterFreeCashFlow: reportedQuarterFcf,
        freeCashFlowPolicy: isOfficialAnnual
          ? "reported_full_year_fcf"
          : "normalized visible run-rate FCF used for valuation; reported quarter FCF retained in rawJson to avoid mechanical annualization",
        guidanceChange: event.guidanceChange ?? null,
        placeholderFields: isOfficialAnnual && sourceType === "official_actual" ? ["dilutedShares", "netDebt"] : ["runRateRevenue", "normalizedFreeCashFlow", "dilutedShares", "netDebt"],
      }),
    };
  });
}

function buildSegmentRows({ financialPeriods, staticSegments }) {
  const annualRowsByPeriod = new Map();
  for (const segment of staticSegments) {
    const mapped = {
      ...segment,
      segment: mckSegmentNameForDb(segment.segment),
      sourceType: sourceLayer(segment.tag.sourceType, "forecast_assumption"),
    };
    if (!annualRowsByPeriod.has(segment.periodId)) annualRowsByPeriod.set(segment.periodId, []);
    annualRowsByPeriod.get(segment.periodId).push(mapped);
  }
  const latestOfficialMix = annualRowsByPeriod.get("fy2026") ?? [];
  const priorOfficialMix = annualRowsByPeriod.get("fy2025") ?? latestOfficialMix;
  const rows = [];

  for (const period of financialPeriods) {
    const baseMix = annualRowsByPeriod.get(period.periodId) ?? (period.fiscalYear >= 2026 ? latestOfficialMix : priorOfficialMix);
    const mixRevenue = baseMix.reduce((sum, segment) => sum + (segment.revenue ?? 0), 0) || 1;
    const mixProfit = baseMix.reduce((sum, segment) => sum + (segment.adjustedOperatingProfit ?? 0), 0) || 1;
    const scaledRows = baseMix.map((segment) => {
      const isAnnualOfficial = period.periodType === "annual" && annualRowsByPeriod.has(period.periodId);
      const revenue = isAnnualOfficial ? segment.revenue : period.revenue * (segment.revenue / mixRevenue);
      const adjustedOperatingProfit = isAnnualOfficial
        ? segment.adjustedOperatingProfit
        : period.adjustedOperatingProfit * (segment.adjustedOperatingProfit / mixProfit);
      return {
        id: `${period.periodId}-${slugify(segment.segment)}`,
        ticker: TICKER,
        periodId: period.periodId,
        eventId: period.eventId,
        asOfDate: period.asOfDate,
        segment: segment.segment,
        taxonomy: segment.segment === "Oncology & Multispecialty" ? "mck_growth_platform" : "mck_reported_segment",
        revenueDefinition: "segment_revenue",
        revenue,
        revenueGrowth: isAnnualOfficial ? segment.revenueGrowth : segment.revenueGrowth,
        operatingProfit: isAnnualOfficial ? segment.operatingProfit : adjustedOperatingProfit,
        adjustedOperatingProfit,
        adjustedOperatingProfitGrowth: isAnnualOfficial ? segment.adjustedOperatingProfitGrowth : segment.adjustedOperatingProfitGrowth,
        margin: adjustedOperatingProfit / Math.max(revenue, 1),
        marginBps: (adjustedOperatingProfit / Math.max(revenue, 1)) * 10000,
        moatScore: segment.moatScore,
        riskLevel: segment.riskLevel,
        multipleAssumption: segment.multipleAssumption,
        sourceType: isAnnualOfficial ? segment.sourceType : "forecast_assumption",
        splitSource: isAnnualOfficial ? "official_release_segment_table" : "event_visible_segment_mix_run_rate",
        parentReportedSegment: segment.segment,
        glp1VolumeImpact: segment.segment === "U.S. Pharmaceutical" ? "Volume tailwind with potential mix dilution; tracked in distribution economics." : null,
        specialtyDrugMix: segment.segment === "Oncology & Multispecialty" ? "Core specialty/oncology profit pool and stickiness indicator." : null,
        genericDeflationRisk: segment.segment === "U.S. Pharmaceutical" ? "Monitor generic sell-side deflation and sourcing economics." : null,
        customerConcentration: segment.segment === "U.S. Pharmaceutical" ? "Large retail/health-system contracts can change volume and working-capital intensity." : null,
        notes: isAnnualOfficial
          ? "Official release segment row, mapped to MCK backend taxonomy."
          : "Forecast-assumption event-visible segment snapshot scaled from disclosed annual mix; not an official segment actual.",
        rawJson: json({
          originalSegment: mckSegmentNameForFrontend(segment.segment),
          dataLayer: isAnnualOfficial ? "official_actual" : "forecast_assumption",
          sourceTag: segment.tag,
        }),
      };
    });
    const revenueGap = period.revenue - scaledRows.reduce((sum, row) => sum + row.revenue, 0);
    if (Math.abs(revenueGap) > Math.max(period.revenue * 0.005, 100)) {
      scaledRows.push({
        id: `${period.periodId}-international-other-residual`,
        ticker: TICKER,
        periodId: period.periodId,
        eventId: period.eventId,
        asOfDate: period.asOfDate,
        segment: "International / Other",
        taxonomy: "mck_residual",
        revenueDefinition: "segment_revenue",
        revenue: revenueGap,
        revenueGrowth: 0,
        operatingProfit: 0,
        adjustedOperatingProfit: 0,
        adjustedOperatingProfitGrowth: 0,
        margin: 0,
        marginBps: 0,
        moatScore: 35,
        riskLevel: "High",
        multipleAssumption: 4,
        sourceType: "forecast_assumption",
        splitSource: "residual_reconciliation",
        parentReportedSegment: "International / Other",
        glp1VolumeImpact: null,
        specialtyDrugMix: null,
        genericDeflationRisk: null,
        customerConcentration: null,
        notes: "Residual row added only to keep segment revenue close to group revenue.",
        rawJson: json({ dataLayer: "forecast_assumption", residualRevenue: revenueGap }),
      });
    }
    rows.push(...scaledRows);
  }
  return rows;
}

function buildMarketRows({ events, financialPeriods, market }) {
  return events.map((event) => {
    const period = financialPeriods.find((row) => row.eventId === event.id) ?? latestOnOrBefore(financialPeriods, event.eventDate);
    const currentPrice = proxyMarketPrice(event.eventDate, market.currentPrice);
    const shares = period?.dilutedShares ?? market.sharesOut;
    const marketCap = currentPrice * shares;
    return {
      id: `mck-market-${event.eventDate}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      currentPrice,
      currency: "USD",
      marketCap,
      enterpriseValue: marketCap + (period?.netDebt ?? 0),
      sharesOutstanding: shares,
      previousClose: null,
      fiftyTwoWeekHigh: event.eventDate >= "2026-05-07" ? market.fiftyTwoWeekHigh : null,
      fiftyTwoWeekLow: event.eventDate >= "2026-05-07" ? market.fiftyTwoWeekLow : null,
      forwardPe: period?.adjustedDilutedEps ? currentPrice / period.adjustedDilutedEps : market.forwardPe,
      fcfYield: period?.freeCashFlow ? period.freeCashFlow / Math.max(marketCap, 1) : market.fcfYield,
      dividendYield: market.dividendYield,
      buybackYield: market.buybackYield,
      netDebtToEbitda: market.netDebtToEbitda,
      beta: null,
      source: event.eventDate === market.priceDate ? market.tag.source : "manual_historical_price_seed_pending_yfinance_backfill",
      fetchedAt: market.tag.asOfDate,
      rawJson: json({
        dataLayer: event.eventDate === market.priceDate ? "market_data" : "market_data_proxy",
        sourceQuality: event.eventDate === market.priceDate ? "market_snapshot" : "research_only_proxy_backfill",
        eventId: event.id,
      }),
    };
  });
}

function buildPeerRows({ peers, marketDate }) {
  return peers.map((peer) => ({
    id: `mck-peer-${peer.ticker}-${marketDate}`.toLowerCase(),
    ticker: TICKER,
    asOfDate: marketDate,
    peerTicker: peer.ticker,
    peerName: peer.ticker,
    companyName: peer.name,
    category: peer.category,
    peerGroup: peer.category === "core_peer" ? "drug_distribution_core_peer" : "adjacent_reference_only",
    marketCap: null,
    enterpriseValue: null,
    revenueGrowth: peer.revenueGrowth,
    operatingMargin: peer.operatingMargin,
    adjustedEpsGrowth: peer.adjustedEpsGrowth,
    fcfConversion: peer.fcfConversion,
    fcfYield: peer.fcfYield,
    trailingPe: null,
    forwardPe: peer.forwardPe,
    forwardEvEbitda: null,
    buybackYield: peer.buybackYield,
    roic: peer.roic,
    leverage: peer.leverage,
    specialtyExposure: peer.specialtyExposure,
    moatScore: peer.moatScore,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: peer.tag.source,
    fetchedAt: peer.tag.asOfDate,
    confidenceLevel: peer.tag.confidence,
    absoluteValueUse: "metadata_only_peer_metrics_not_cross_currency_valuation_input",
    rawJson: json({ ...peer, dataLayer: sourceLayer(peer.tag.sourceType, "research_only") }),
  }));
}

function buildTranscriptExtractions({ transcriptEvents, managementQuotes, qaPairs }) {
  const themeRows = transcriptEvents.flatMap((event) =>
    event.topics.map((topic) => ({
      id: `mck-theme-${event.id}-${slugify(topic)}`,
      ticker: TICKER,
      transcriptId: event.id,
      eventId: event.id,
      extractionType: "theme",
      topic,
      segment: topic === "oncology" ? "Oncology & Multispecialty" : topic === "GLP-1" ? "U.S. Pharmaceutical" : null,
      speaker: null,
      section: "management_commentary",
      supportingQuoteShort: event.marketFocus,
      confidence: event.tag.confidence,
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({
        summary: event.summary,
        thesisRead: event.thesisRead,
        analystConcerns: event.analystConcerns,
        dataLayer: "transcript_derived_research_only",
      }),
    })),
  );
  const quoteRows = managementQuotes.map((quote) => ({
    id: `mck-quote-${quote.id}`,
    ticker: TICKER,
    transcriptId: quote.eventId,
    eventId: quote.eventId,
    extractionType: "management_quote",
    topic: quote.topic,
    segment: quote.topic === "oncology" ? "Oncology & Multispecialty" : null,
    speaker: quote.speaker,
    section: "prepared_remarks",
    supportingQuoteShort: quote.quote,
    confidence: quote.tag.confidence,
    needsHumanReview: 1,
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: json({ ...quote, dataLayer: "transcript_derived_research_only" }),
  }));
  const qaRows = qaPairs.map((qa) => ({
    id: `mck-qa-${qa.id}`,
    ticker: TICKER,
    transcriptId: qa.eventId,
    eventId: qa.eventId,
    extractionType: "qa_pair",
    topic: qa.topic,
    segment: qa.topic === "oncology" ? "Oncology & Multispecialty" : null,
    speaker: qa.analyst,
    section: "qa",
    supportingQuoteShort: qa.answer,
    confidence: qa.tag.confidence,
    needsHumanReview: 1,
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: json({ ...qa, dataLayer: "transcript_derived_research_only" }),
  }));
  return [...themeRows, ...quoteRows, ...qaRows];
}

export async function buildMckBackendSeedPayload() {
  const now = new Date().toISOString();
  const officialSourceIndex = readJsonFile("data/local/mck/official/official_source_index.json", { documents: [] });
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const realDataModule = await server.ssrLoadModule("/src/stocks/mck/realData.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/mck/assumptions.ts");
    const dataset = realDataModule.mckDataset;
    const enrichedTranscriptEvents = [...historicalMckTranscriptEvents, ...dataset.transcriptEvents]
      .filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index)
      .sort((left, right) => left.eventDate.localeCompare(right.eventDate));
    const enrichedReportedFinancials = [...historicalMckReportedFinancials, ...dataset.reportedFinancials]
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.periodId === row.periodId) === index)
      .sort((left, right) => left.fiscalYear - right.fiscalYear);
    const enrichedSegmentFinancials = [...historicalMckSegmentFinancials, ...dataset.segmentFinancials]
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.periodId === row.periodId && candidate.segment === row.segment) === index);
    const reportingEvents = enrichedTranscriptEvents.map((event) => ({
      id: event.id,
      ticker: TICKER,
      eventDate: event.eventDate,
      fiscalPeriod: event.fiscalPeriod,
      fiscalYear: parseFiscalYear(event.fiscalPeriod),
      fiscalQuarter: parseFiscalQuarter(event.fiscalPeriod),
      eventType: eventTypeFromPeriod(event.fiscalPeriod),
      label: event.title,
      sourceType: sourceLayer(event.tag.sourceType, "official_actual"),
      sourcePath: officialReleasePathForEvent(event) ?? event.rawLocalPath ?? null,
      createdAt: now,
    })).sort((left, right) => left.eventDate.localeCompare(right.eventDate));

    const sourceDocuments = [
      ...enrichedTranscriptEvents.map((event) => ({
        id: `mck-source-${event.id}`,
        ticker: TICKER,
        sourceType: "official_actual",
        sourceName: event.title,
        sourcePath: officialReleasePathForEvent(event) ?? event.rawLocalPath ?? null,
        sourceUrl: event.sourceUrl ?? null,
        retrievedAt: event.tag.asOfDate,
        publishedDate: event.eventDate,
        provenance: event.sourceCoverage,
        confidence: event.tag.confidence,
        checksum: null,
        metadataJson: json({ event, cacheStatus: officialReleasePathForEvent(event) ? "cached_raw_html" : "url_only" }),
      })),
      ...(officialSourceIndex.documents ?? []).map((doc, index) => ({
        id: `mck-official-cache-${index + 1}-${slugify(doc.localPath ?? doc.url ?? doc.id ?? "document").slice(0, 80)}`,
        ticker: TICKER,
        sourceType: doc.sourceType ?? "official_actual",
        sourceName: doc.title ?? doc.id ?? "McKesson official document",
        sourcePath: doc.localPath ?? null,
        sourceUrl: doc.url ?? null,
        retrievedAt: officialSourceIndex.generatedAt ?? now,
        publishedDate: doc.eventDate ?? null,
        provenance: doc.provenance ?? "mck_official_cache",
        confidence: doc.confidence ?? "medium",
        checksum: null,
        metadataJson: json(doc),
      })),
      {
        id: "mck-market-snapshot-static",
        ticker: TICKER,
        sourceType: "market_data",
        sourceName: "MCK market snapshot",
        sourcePath: "src/stocks/mck/data/market/yfinance.ts",
        sourceUrl: dataset.market.tag.sourceUrl ?? null,
        retrievedAt: dataset.market.tag.asOfDate,
        publishedDate: dataset.market.priceDate,
        provenance: dataset.market.tag.source,
        confidence: dataset.market.tag.confidence,
        checksum: null,
        metadataJson: json(dataset.market),
      },
    ];

    const financialPeriods = buildEventFinancialRows({
      events: reportingEvents.map((event) => enrichedTranscriptEvents.find((item) => item.id === event.id)).filter(Boolean),
      reportedFinancials: enrichedReportedFinancials,
      market: dataset.market,
    });
    const segmentFinancials = buildSegmentRows({
      financialPeriods,
      staticSegments: enrichedSegmentFinancials,
    });
    const marketSnapshots = buildMarketRows({
      events: reportingEvents,
      financialPeriods,
      market: dataset.market,
    });
    const peerSnapshots = buildPeerRows({ peers: dataset.peers, marketDate: dataset.market.priceDate });

    const guidanceItems = [
      ...dataset.guidance.map((item, index) => ({
        id: `mck-official-guidance-${index + 1}-${slugify(item.metric)}`,
        ticker: TICKER,
        eventId: reportingEvents.filter((event) => event.eventDate <= item.asOfDate).sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0]?.id ?? null,
        asOfDate: item.asOfDate,
        fiscalPeriodTarget: `FY${item.fiscalYear}`,
        metric: item.metric,
        guidanceType: "official_management_guidance",
        lowValue: item.low,
        highValue: item.high,
        midpointValue: item.midpoint,
        unit: item.metric.toLowerCase().includes("eps") ? "usd_per_share" : item.metric.toLowerCase().includes("growth") ? "percent" : null,
        quote: item.notes,
        speaker: null,
        sourcePath: "src/stocks/mck/data/official/guidance.ts",
        confidence: "high",
        humanReviewStatus: "official_curated",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ ...item, dataLayer: "management_guidance", valuationPolicy: "visible_as_of_but_not_auto_promoted" }),
      })),
      ...enrichedTranscriptEvents.filter((event) => event.guidanceChange).map((event) => ({
        id: `mck-guidance-candidate-${event.id}`,
        ticker: TICKER,
        eventId: event.id,
        asOfDate: event.eventDate,
        fiscalPeriodTarget: event.fiscalPeriod,
        metric: "adjusted_eps_guidance_change",
        guidanceType: "candidate",
        lowValue: null,
        highValue: null,
        midpointValue: guidanceMidpoint(event.id),
        unit: "usd_per_share",
        quote: event.guidanceChange,
        speaker: null,
        sourcePath: officialReleasePathForEvent(event) ?? null,
        confidence: event.tag.confidence,
        humanReviewStatus: "needs_review",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ eventId: event.id, dataLayer: "management_guidance_candidate", valuationPolicy: "not_valuation_impacting_until_promoted" }),
      })),
    ];

    const transcriptEvents = enrichedTranscriptEvents.map((event) => ({
      id: `mck-transcript-event-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      eventDate: event.eventDate,
      fiscalPeriod: event.fiscalPeriod,
      eventType: eventTypeFromPeriod(event.fiscalPeriod),
      transcriptId: event.id,
      hasQa: dataset.qaPairs.some((qa) => qa.eventId === event.id) ? 1 : 0,
      sourcePath: event.rawLocalPath ?? officialReleasePathForEvent(event) ?? null,
      provenance: event.sourceCoverage,
      confidence: event.tag.confidence,
      metadataJson: json(event),
    }));
    const transcriptExtractions = buildTranscriptExtractions({
      transcriptEvents: enrichedTranscriptEvents,
      managementQuotes: dataset.managementQuotes,
      qaPairs: dataset.qaPairs,
    });

    const modelVersions = [
      {
        id: MCK_BACKEND_MODEL_VERSION.version,
        ticker: TICKER,
        version: MCK_BACKEND_MODEL_VERSION.version,
        name: MCK_BACKEND_MODEL_VERSION.name,
        description: MCK_BACKEND_MODEL_VERSION.description,
        codeCommitSha: null,
        valuationMethodsJson: json(["P/E", "FCF yield", "Owner earnings DCF", "MCK segment SOTP", "TSR scenario lab"]),
        assumptionSchemaJson: json({ source: "src/stocks/mck/assumptions.ts", scenarios: ["Bear", "Base", "Bull"] }),
        createdAt: now,
      },
    ];
    const scenarioPresets = assumptionsModule.mckScenarioPresets ?? {};
    const assumptionSets = ["Bear", "Base", "Bull"].map((scenario) => ({
      id: `mck-v1-${scenario.toLowerCase()}-default`,
      ticker: TICKER,
      name: `${scenario} default MCK backend assumptions`,
      scenario,
      modelVersion: MCK_BACKEND_MODEL_VERSION.version,
      asOfDate: reportingEvents[0]?.eventDate ?? dataset.market.priceDate,
      assumptionsJson: json(scenarioPresets[scenario] ?? {}),
      sourceType: "forecast_assumption",
      createdAt: now,
    }));
    const validationWarnings = [
      {
        id: "mck-backend-market-price-proxies",
        ticker: TICKER,
        scope: "market_data",
        severity: "medium",
        title: "Historical prices need vendor backfill",
        detail: "Event-dated prices before the latest market snapshot are manual research-only proxies until yfinance/vendor history is imported.",
        relatedTable: "market_snapshots",
        relatedRecordId: null,
        createdAt: now,
      },
      {
        id: "mck-backend-eight-year-history-seed",
        ticker: TICKER,
        scope: "historical_backfill",
        severity: "medium",
        title: "Eight-year annual history includes historical seed fields",
        detail: "FY2018-FY2024 rows expand backend history using public annual revenue history plus modeled EPS, FCF, shares, net debt and segment mix seeds pending official 10-K parser backfill.",
        relatedTable: "financial_periods",
        relatedRecordId: null,
        createdAt: now,
      },
      {
        id: "mck-backend-quarterly-run-rate",
        ticker: TICKER,
        scope: "financial_periods",
        severity: "low",
        title: "Quarterly events use visible run-rate snapshots",
        detail: "Q1/Q2/Q3 valuation rows use event-visible guidance/run-rate fields and do not mechanically annualize single-quarter FCF.",
        relatedTable: "financial_periods",
        relatedRecordId: null,
        createdAt: now,
      },
    ];

    return {
      reportingEvents,
      sourceDocuments,
      financialPeriods,
      segmentFinancials,
      marketSnapshots,
      peerSnapshots,
      guidanceItems,
      transcriptEvents,
      transcriptExtractions,
      modelVersions,
      assumptionSets,
      validationWarnings,
    };
  } finally {
    await server.close();
  }
}
