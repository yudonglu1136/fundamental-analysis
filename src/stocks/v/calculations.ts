import type { Scenario, SummaryMetric, ValuationResult } from "../types";
import {
  buildPriceAnchorWarnings,
  buildSourceGapWarnings,
  buildValidationWarning,
  deriveValuationReliability,
  mapSourceStatusToDataQualityTag,
  mergeValidationWarnings,
} from "../../utils/validation";
import { vScenarioPresets, defaultVValuationAssumptions } from "./assumptions";
import { vDataset } from "./data";
import type { VDataset, VFinancialPeriod, ValuationAssumptions } from "./model";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function latestPeriod(data: VDataset) {
  return [...data.periods].sort((left, right) => {
    const leftDate = left.asOfDate ?? left.periodEndDate ?? String(left.fiscalYear);
    const rightDate = right.asOfDate ?? right.periodEndDate ?? String(right.fiscalYear);
    return leftDate.localeCompare(rightDate);
  })[data.periods.length - 1];
}

function annualizePeriod(period: VFinancialPeriod) {
  const multiplier = period.periodType === "quarter" ? 4 : 1;
  return {
    revenue: period.revenue * multiplier,
    operatingIncome: period.operatingIncome * multiplier,
    netIncome: (period.netIncome ?? period.operatingIncome * 0.79) * multiplier,
    freeCashFlow: (period.freeCashFlow ?? period.revenue * 0.49) * multiplier,
    dividendsPaid: (period.dividendsPaid ?? period.revenue * 0.08) * multiplier,
    buybacks: (period.buybacks ?? period.revenue * 0.34) * multiplier,
  };
}

function latestMetric(data: VDataset) {
  const sorted = [...data.operatingMetrics].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1];
}

function methodCard(key: string, label: string, value: number, description: string) {
  return { key, label, value, format: "currency" as const, description };
}

function dcfValue(fcf: number, growth: number, terminalGrowth: number, discountRate: number, shares: number) {
  let pv = 0;
  let yearFcf = fcf;
  for (let year = 1; year <= 5; year += 1) {
    yearFcf *= 1 + Math.max(growth * (1 - (year - 1) * 0.08), terminalGrowth);
    pv += yearFcf / (1 + discountRate) ** year;
  }
  const terminal = (yearFcf * (1 + terminalGrowth)) / Math.max(discountRate - terminalGrowth, 0.025);
  return (pv + terminal / (1 + discountRate) ** 5) / shares;
}

export function getVPeriods() {
  return vDataset.periods.map((period) => ({ value: period.id, label: period.label }));
}

export function getDefaultVPeriod() {
  return vDataset.periods[vDataset.periods.length - 1]?.id ?? "fy2026-q2";
}

export function calculateVSummary(data: unknown): SummaryMetric[] {
  const dataset = (data as VDataset) ?? vDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(dataset);
  return [
    {
      key: "revenue",
      label: "Annualized Net Revenue",
      value: annualized.revenue,
      format: "currency",
      description: "Latest reported period annualized for valuation context.",
      badge: mapSourceStatusToDataQualityTag(period.sourceStatus),
    },
    {
      key: "crossBorderGrowth",
      label: "Cross-Border Growth",
      value: metric?.crossBorderVolumeGrowth ?? 0,
      format: "percent",
      description: "Travel-sensitive cross-border volume growth.",
      badge: "Derived",
    },
    {
      key: "switchedTransactions",
      label: "Switched Transactions",
      value: metric?.switchedTransactions ?? 0,
      format: "number",
      description: "Network transaction volume in millions.",
      badge: "Derived",
    },
    {
      key: "takeRate",
      label: "Net Revenue Yield",
      value: metric?.takeRate ?? 0,
      format: "percent",
      description: "Net revenue divided by gross dollar volume.",
      badge: "Derived",
    },
    {
      key: "fcfMargin",
      label: "FCF Margin",
      value: annualized.freeCashFlow / annualized.revenue,
      format: "percent",
      description: "Free cash flow conversion after capex.",
      badge: "Derived",
    },
  ];
}

export function calculateVValuation(
  data: unknown,
  assumptionOverrides: Partial<ValuationAssumptions> = {},
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = (data as VDataset) ?? vDataset;
  const period = latestPeriod(dataset);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(dataset);
  const preset = vScenarioPresets[scenario] ?? vScenarioPresets.Base;
  const assumptions: ValuationAssumptions = {
    ...defaultVValuationAssumptions,
    ...preset,
    ...assumptionOverrides,
  };
  function computePoint(name: Scenario, driverSet: ValuationAssumptions) {
    const currentPrice = driverSet.currentPrice || dataset.marketData.currentPrice;
    const shares = driverSet.dilutedShares || period.dilutedShares || dataset.marketData.sharesForMarketCap;
    const crossBorderGrowth = metric?.crossBorderVolumeGrowth ?? driverSet.crossBorderGrowth;
    const switchedGrowth = metric?.switchedTransactionsGrowth ?? driverSet.switchedTransactionGrowth;
    const revenueGrowth = clamp(
      driverSet.revenueGrowth * 0.55 + crossBorderGrowth * 0.2 + switchedGrowth * 0.15 + driverSet.valueAddedServicesGrowth * 0.1,
      -0.02,
      0.18,
    );
    const operatingMargin = clamp(
      driverSet.operatingMargin + (switchedGrowth - 0.10) * 0.1 - driverSet.regulatoryHaircut * 0.08,
      0.48,
      0.64,
    );
    const fcfMargin = clamp(driverSet.normalizedFcfMargin + (operatingMargin - 0.58) * 0.35, 0.40, 0.56);
    const nextRevenue = annualized.revenue * (1 + revenueGrowth);
    const nextOperatingIncome = nextRevenue * operatingMargin;
    const nextFcf = nextRevenue * fcfMargin;
    const nextNetIncome = nextOperatingIncome * 0.79;
    const nextShares = shares * (1 - driverSet.buybackYield);
    const eps = nextNetIncome / nextShares;
    const fcfPerShare = nextFcf / nextShares;
    const dcf = dcfValue(annualized.freeCashFlow, revenueGrowth, driverSet.terminalGrowth, driverSet.discountRate, nextShares);
    const fcfYield = fcfPerShare / driverSet.targetFcfYield;
    const pe = eps * driverSet.targetPe;
    const evEbit = (nextOperatingIncome * driverSet.targetEvEbit) / nextShares;
    const peerPremium = name === "Bull" ? 0.14 : name === "Bear" ? -0.02 : 0.08;
    const peer = eps * 32 * (1 + peerPremium);
    const riskHaircut = 1 - driverSet.regulatoryHaircut - driverSet.alternativeRailsHaircut;
    const fairValue = (dcf * 0.35 + fcfYield * 0.25 + pe * 0.20 + evEbit * 0.10 + peer * 0.10) * riskHaircut;
    const targetPrice3Y = fairValue * (1 + revenueGrowth) ** 2.2;
    const cumulativeDividends = currentPrice * driverSet.dividendYield * 3;
    const expectedReturn3Y = ((targetPrice3Y + cumulativeDividends) / currentPrice) ** (1 / 3) - 1;
    return {
      scenario: name,
      fairValue,
      upsideDownside: fairValue / currentPrice - 1,
      expectedReturn3Y,
      targetPrice3Y,
      cumulativeDividends,
      currentPrice,
      revenueGrowth,
      operatingMargin,
      fcfMargin,
      dcf,
      fcfYield,
      pe,
      evEbit,
      peer,
    };
  }
  const selected = computePoint(scenario, assumptions);
  const fairValues = (["Bear", "Base", "Bull"] as Scenario[]).map((name) =>
    computePoint(name, { ...defaultVValuationAssumptions, ...vScenarioPresets[name] }),
  );
  const selectedFairValues = fairValues.map(({ scenario, fairValue, upsideDownside, expectedReturn3Y, targetPrice3Y, cumulativeDividends }) => ({
    scenario,
    fairValue,
    upsideDownside,
    expectedReturn3Y,
    targetPrice3Y,
    cumulativeDividends,
  }));
  const {
    currentPrice,
    revenueGrowth,
    operatingMargin,
    fcfMargin,
    dcf,
    fcfYield,
    pe,
    evEbit,
    peer,
    fairValue,
    targetPrice3Y,
    expectedReturn3Y,
  } = selected;
  const validationWarnings = mergeValidationWarnings(
    [
      buildValidationWarning(
        "v-static-fallback",
        "Static fallback",
        "Interactive valuation uses local fallback until backend saved runs are inspected.",
      ),
    ],
    buildSourceGapWarnings("V", [
      { key: "revenue", label: "latest net revenue", value: period.revenue },
      { key: "diluted-shares", label: "diluted shares", value: period.dilutedShares },
      { key: "free-cash-flow", label: "free cash flow", value: period.freeCashFlow },
      { key: "cross-border-growth", label: "cross-border growth", value: metric?.crossBorderVolumeGrowth },
      { key: "switched-transaction-growth", label: "switched transaction growth", value: metric?.switchedTransactionsGrowth },
    ]),
    buildPriceAnchorWarnings({
      ticker: "V",
      currentPrice,
      marketReference: dataset.marketData.currentPrice,
      priceDate: dataset.marketData.priceDate,
      currency: "USD",
    }),
  );
  const reliability = deriveValuationReliability({
    warnings: validationWarnings,
    sourceStatuses: [period.sourceStatus, metric?.sourceStatus, dataset.marketData.sourceStatus],
  });

  return {
    currentPrice,
    priceDate: dataset.marketData.priceDate,
    fairValues: selectedFairValues,
    methodCards: [
      methodCard("dcf", "DCF / FCFF", dcf, "FCFF fade using payments volume growth and FCF conversion."),
      methodCard("fcf-yield", "FCF Yield", fcfYield, "Normalized FCF per share capitalized at a target yield."),
      methodCard("pe", "P/E", pe, "Next-year EPS multiple with buyback-funded share reduction."),
      methodCard("ev-ebit", "EV/EBIT", evEbit, "Operating income multiple for a capital-light network."),
      methodCard("peer-premium", "Payments Peer Premium", peer, "Mastercard/Amex/processor guardrail with explicit premium or discount."),
    ],
    expectedReturnBridge: [
      { key: "revenue-growth", label: "Revenue Growth", value: revenueGrowth, format: "percent", description: "Cross-border, switched transaction and VAS mix weighted growth." },
      { key: "operating-margin", label: "Operating Margin", value: operatingMargin, format: "percent", description: "Incremental margin after regulation and scale." },
      { key: "fcf-margin", label: "FCF Margin", value: fcfMargin, format: "percent", description: "Normalized cash conversion." },
      { key: "regulatory-haircut", label: "Regulatory Haircut", value: assumptions.regulatoryHaircut, format: "percent", description: "Network fee and routing/interchange risk." },
    ],
    sensitivityTables: [
      {
        title: "Cross-Border vs Regulatory Risk",
        table: [
          ["Driver", "Bear", "Base", "Bull"],
          ["Cross-border growth", "6%", "13%", "16%"],
          ["Regulatory haircut", "9%", "3.5%", "2%"],
          ["Fair value", fairValues[0].fairValue, fairValues[1].fairValue, fairValues[2].fairValue],
        ],
      },
    ],
    recommendedFairValue: fairValue,
    blendedFairValue: fairValue,
    probabilityWeightedFairValue: selectedFairValues[0].fairValue * 0.25 + selectedFairValues[1].fairValue * 0.5 + selectedFairValues[2].fairValue * 0.25,
    targetPrice3Y,
    expectedReturn3Y,
    upsideDownside: fairValue / currentPrice - 1,
    fcfFairValue: fcfYield,
    peFairValue: pe,
    dcfValue: dcf,
    validationWarnings,
    dataQualityScore: reliability.score,
    recommendedValuationConfidence: reliability.score / 100,
    overallIntegrityScore: reliability.score,
  };
}

export function buildVDashboardData(
  data: VDataset,
  scenario: Scenario,
  assumptions: Partial<ValuationAssumptions>,
) {
  const period = latestPeriod(data);
  const annualized = annualizePeriod(period);
  const metric = latestMetric(data);
  const valuation = calculateVValuation(data, assumptions, scenario);
  const volumeRows = data.operatingMetrics.map((row) => ({
    label: row.periodId?.replace("fy", "FY").replace("-", " ") ?? row.asOfDate,
    gpv: row.grossDollarVolume ?? 0,
    purchaseVolume: row.purchaseVolume ?? 0,
    switchedTransactions: row.switchedTransactions ?? 0,
    crossBorderGrowth: (row.crossBorderVolumeGrowth ?? 0) * 100,
    takeRate: (row.takeRate ?? 0) * 100,
  }));
  const marginRows = data.periods.map((row) => ({
    label: row.label,
    operatingMargin: ((row.operatingMargin ?? row.operatingIncome / Math.max(row.revenue, 1)) * 100),
    fcfMargin: ((row.freeCashFlow ?? 0) / Math.max(row.revenue, 1)) * 100,
    buybacks: row.buybacks ?? 0,
    dilutedShares: row.dilutedShares ?? 0,
  }));
  return {
    period,
    annualized,
    metric,
    valuation,
    volumeRows,
    marginRows,
    segmentRows: data.segmentFinancials,
  };
}

export function resolveVDataset(data: unknown): VDataset {
  return (data as VDataset) ?? vDataset;
}
