import fs from "node:fs";
import path from "node:path";
import { AMZN_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "AMZN";
const CIK = "0001018724";
const SEC_DIR = path.resolve("data/local/amzn/sec");
const COMPANYFACTS_PATH = path.join(SEC_DIR, `companyfacts_CIK${CIK}.json`);
const SUBMISSIONS_PATH = path.join(SEC_DIR, `submissions_CIK${CIK}.json`);
const CURRENT_DATE = new Date().toISOString().slice(0, 10);
const AMZN_SPLIT_EFFECTIVE_DATE = "2022-06-06";
const AMZN_SPLIT_FACTOR = 20;

function json(value) {
  return JSON.stringify(value ?? null);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function secUnit(facts, tag, unit = "USD") {
  return facts?.["us-gaap"]?.[tag]?.units?.[unit] ?? [];
}

function quarterConfig(fiscalYear, quarterNumber) {
  const quarter = `Q${quarterNumber}`;
  const ranges = {
    Q1: { start: `${fiscalYear}-01-01`, end: `${fiscalYear}-03-31`, filedFallback: `${fiscalYear}-04-30` },
    Q2: { start: `${fiscalYear}-04-01`, end: `${fiscalYear}-06-30`, filedFallback: `${fiscalYear}-07-31` },
    Q3: { start: `${fiscalYear}-07-01`, end: `${fiscalYear}-09-30`, filedFallback: `${fiscalYear}-10-31` },
    Q4: { start: `${fiscalYear}-10-01`, end: `${fiscalYear}-12-31`, filedFallback: `${fiscalYear + 1}-02-01` },
  }[quarter];
  return {
    id: `q${quarterNumber}-fy${String(fiscalYear).slice(2)}`,
    label: `FY${fiscalYear} ${quarter}`,
    fiscalYear,
    fiscalQuarter: quarter,
    quarterNumber,
    ...ranges,
  };
}

function buildQuarterConfigs(startYear = 2018) {
  const currentYear = Number(CURRENT_DATE.slice(0, 4));
  const quarters = [];
  for (let year = startYear; year <= currentYear; year += 1) {
    for (let quarterNumber = 1; quarterNumber <= 4; quarterNumber += 1) {
      const quarter = quarterConfig(year, quarterNumber);
      if (quarter.filedFallback <= CURRENT_DATE) quarters.push(quarter);
    }
  }
  return quarters;
}

function sortFacts(rows) {
  return [...rows].sort((left, right) => {
    const filedOrder = String(left.filed ?? "").localeCompare(String(right.filed ?? ""));
    if (filedOrder !== 0) return filedOrder;
    return String(left.end ?? "").localeCompare(String(right.end ?? ""));
  });
}

function exactDurationFact(facts, tags, start, end, unit = "USD") {
  const candidates = [];
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit).filter((row) => row.start === start && row.end === end && row.filed <= CURRENT_DATE);
    candidates.push(...rows.map((row) => ({ tag, ...row })));
  }
  return sortFacts(candidates)[0] ?? null;
}

function ytdDurationFact(facts, tags, fiscalYear, quarterNumber, unit = "USD") {
  const endByQuarter = {
    1: `${fiscalYear}-03-31`,
    2: `${fiscalYear}-06-30`,
    3: `${fiscalYear}-09-30`,
    4: `${fiscalYear}-12-31`,
  };
  return exactDurationFact(facts, tags, `${fiscalYear}-01-01`, endByQuarter[quarterNumber], unit);
}

function annualFact(facts, tags, fiscalYear, unit = "USD") {
  return exactDurationFact(facts, tags, `${fiscalYear}-01-01`, `${fiscalYear}-12-31`, unit);
}

function instantFact(facts, tags, end, unit = "USD") {
  for (const tag of tags) {
    const rows = sortFacts(secUnit(facts, tag, unit).filter((row) => !row.start && row.end === end && row.filed <= CURRENT_DATE));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function valueOf(fact) {
  return typeof fact?.val === "number" ? fact.val : null;
}

function usdToMillions(fact) {
  return typeof fact?.val === "number" ? fact.val / 1_000_000 : null;
}

function splitAdjustedSharesToMillions(fact, periodEnd) {
  if (typeof fact?.val !== "number") return null;
  const splitFactor = periodEnd < AMZN_SPLIT_EFFECTIVE_DATE ? AMZN_SPLIT_FACTOR : 1;
  return (fact.val * splitFactor) / 1_000_000;
}

function splitAdjustedDilutedEps(fact, periodEnd) {
  if (typeof fact?.val !== "number") return null;
  const splitFactor = periodEnd < AMZN_SPLIT_EFFECTIVE_DATE ? AMZN_SPLIT_FACTOR : 1;
  return fact.val / splitFactor;
}

function quarterFlowFact(facts, tags, quarter, unit = "USD") {
  const direct = exactDurationFact(facts, tags, quarter.start, quarter.end, unit);
  if (direct) return direct;
  const ytd = ytdDurationFact(facts, tags, quarter.fiscalYear, quarter.quarterNumber, unit);
  if (quarter.quarterNumber === 1) return ytd;
  if (quarter.quarterNumber <= 3 && ytd) {
    const previousYtd = ytdDurationFact(facts, tags, quarter.fiscalYear, quarter.quarterNumber - 1, unit);
    const ytdValue = valueOf(ytd);
    const previousValue = valueOf(previousYtd);
    if (typeof ytdValue === "number" && typeof previousValue === "number") {
      return { ...ytd, val: ytdValue - previousValue, derivedFromYtd: true };
    }
  }
  if (quarter.quarterNumber === 4) {
    const annual = annualFact(facts, tags, quarter.fiscalYear, unit);
    const q1 = quarterFlowFact(facts, tags, quarterConfig(quarter.fiscalYear, 1), unit);
    const q2 = quarterFlowFact(facts, tags, quarterConfig(quarter.fiscalYear, 2), unit);
    const q3 = quarterFlowFact(facts, tags, quarterConfig(quarter.fiscalYear, 3), unit);
    const values = [q1, q2, q3].map(valueOf);
    const annualValue = valueOf(annual);
    if (typeof annualValue === "number" && values.every((value) => typeof value === "number")) {
      return { ...annual, val: annualValue - values.reduce((sum, value) => sum + value, 0), derivedFromAnnual: true };
    }
  }
  return null;
}

function quarterPointOrAverageFact(facts, tags, quarter, unit = "USD") {
  const direct = exactDurationFact(facts, tags, quarter.start, quarter.end, unit);
  if (direct) return direct;
  const ytd = ytdDurationFact(facts, tags, quarter.fiscalYear, quarter.quarterNumber, unit);
  if (ytd) return ytd;
  if (quarter.quarterNumber === 4) return annualFact(facts, tags, quarter.fiscalYear, unit);
  return null;
}

function sourceLayer(value, fallback = "research_only") {
  if (value === "official_actual") return "official_actual";
  if (value === "management_guidance") return "management_guidance";
  if (value === "forecast_assumption") return "forecast_assumption";
  if (value === "transcript_commentary") return "transcript_commentary";
  if (value === "market_data") return "market_data";
  return fallback;
}

function maturityForYear(year) {
  return Math.max(0, Math.min(1, (year - 2018) / 8));
}

function quarterRank(period) {
  const match = /^Q([1-4])$/.exec(period?.fiscalQuarter ?? "");
  return match ? Number(match[1]) : 4;
}

function periodSortValue(period) {
  return (period?.fiscalYear ?? 0) * 10 + quarterRank(period);
}

function sumNullable(rows, key) {
  let total = 0;
  let hasValue = false;
  for (const row of rows) {
    if (typeof row?.[key] === "number") {
      total += row[key];
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function trailingFinancialBaseForPeriod(period, financialPeriods = []) {
  const trailingRows = [...financialPeriods]
    .filter((row) => row.periodType === "quarter" && periodSortValue(row) <= periodSortValue(period))
    .sort((left, right) => periodSortValue(left) - periodSortValue(right))
    .slice(-4);
  if (trailingRows.length < 4) return period;
  return {
    ...period,
    revenue: sumNullable(trailingRows, "revenue") ?? period.revenue,
    operatingIncome: sumNullable(trailingRows, "operatingIncome") ?? period.operatingIncome,
    operatingCashFlow: sumNullable(trailingRows, "operatingCashFlow") ?? period.operatingCashFlow,
    capex: sumNullable(trailingRows, "capex") ?? period.capex,
    freeCashFlow: sumNullable(trailingRows, "freeCashFlow") ?? period.freeCashFlow,
  };
}

function baseAssumptionsForPeriod(period, scenario = "Base", valuationBase = period) {
  const maturity = maturityForYear(period.fiscalYear);
  const capexIntensity = valuationBase.revenue && valuationBase.capex ? Math.max(0.035, Math.min(0.22, valuationBase.capex / valuationBase.revenue)) : 0.08 + maturity * 0.04;
  const preAi = period.asOfDate < "2023-01-01";
  const kuiperKnown = period.asOfDate >= "2019-04-01";
  const base = {
    currentPrice: period.currentPrice ?? 120,
    dilutedShares: period.dilutedShares ?? 10_500,
    netDebt: period.netDebt ?? -20_000,
    awsGrowth: Math.max(0.13, 0.34 - maturity * 0.17),
    awsOperatingMargin: 0.255 + maturity * 0.065,
    northAmericaGrowth: Math.max(0.06, 0.18 - maturity * 0.08),
    northAmericaOperatingMargin: 0.025 + maturity * 0.035,
    internationalGrowth: Math.max(0.05, 0.17 - maturity * 0.06),
    internationalOperatingMargin: -0.04 + maturity * 0.065,
    advertisingGrowth: Math.max(0.17, 0.36 - maturity * 0.15),
    advertisingContributionMargin: 0.34 + maturity * 0.10,
    subscriptionGrowth: Math.max(0.08, 0.18 - maturity * 0.08),
    normalizedFcfMargin: Math.max(0.035, (valuationBase.freeCashFlow ?? valuationBase.revenue * 0.05) / Math.max(valuationBase.revenue, 1) + Math.max(capexIntensity - (0.055 + maturity * 0.01), 0) * 0.55),
    maintenanceCapexIntensity: 0.052 + maturity * 0.012,
    aiCapexDrag: preAi ? 0 : 0.006 + maturity * 0.012,
    kuiperOptionValue: kuiperKnown ? 3_000 + maturity * 17_000 : 0,
    discountRate: 0.092 - maturity * 0.006,
    terminalGrowth: 0.03 + maturity * 0.005,
    targetFcfYield: 0.048 - maturity * 0.013,
    evEbitMultiple: 20 + maturity * 8,
    awsRevenueMultiple: 4.4 + maturity * 2.8,
    advertisingRevenueMultiple: 3.8 + maturity * 2.7,
    retailEbitMultiple: 12 + maturity * 6,
    subscriptionRevenueMultiple: 2.0 + maturity * 1.0,
  };
  if (scenario === "Bear") {
    return {
      ...base,
      awsGrowth: base.awsGrowth - 0.06,
      awsOperatingMargin: base.awsOperatingMargin - 0.04,
      northAmericaOperatingMargin: base.northAmericaOperatingMargin - 0.025,
      internationalOperatingMargin: base.internationalOperatingMargin - 0.025,
      advertisingGrowth: base.advertisingGrowth - 0.07,
      advertisingContributionMargin: base.advertisingContributionMargin - 0.06,
      normalizedFcfMargin: base.normalizedFcfMargin - 0.025,
      aiCapexDrag: base.aiCapexDrag + 0.012,
      kuiperOptionValue: 0,
      discountRate: base.discountRate + 0.008,
      targetFcfYield: base.targetFcfYield + 0.010,
      evEbitMultiple: base.evEbitMultiple - 5,
      awsRevenueMultiple: base.awsRevenueMultiple - 1.5,
      advertisingRevenueMultiple: base.advertisingRevenueMultiple - 1.2,
      retailEbitMultiple: base.retailEbitMultiple - 4,
    };
  }
  if (scenario === "Bull") {
    return {
      ...base,
      awsGrowth: base.awsGrowth + 0.05,
      awsOperatingMargin: base.awsOperatingMargin + 0.03,
      northAmericaOperatingMargin: base.northAmericaOperatingMargin + 0.018,
      internationalOperatingMargin: base.internationalOperatingMargin + 0.020,
      advertisingGrowth: base.advertisingGrowth + 0.05,
      advertisingContributionMargin: base.advertisingContributionMargin + 0.05,
      normalizedFcfMargin: base.normalizedFcfMargin + 0.025,
      aiCapexDrag: Math.max(0, base.aiCapexDrag - 0.006),
      kuiperOptionValue: base.kuiperOptionValue * 1.75,
      discountRate: base.discountRate - 0.005,
      targetFcfYield: Math.max(0.025, base.targetFcfYield - 0.006),
      evEbitMultiple: base.evEbitMultiple + 5,
      awsRevenueMultiple: base.awsRevenueMultiple + 1.5,
      advertisingRevenueMultiple: base.advertisingRevenueMultiple + 1.2,
      retailEbitMultiple: base.retailEbitMultiple + 4,
    };
  }
  return base;
}

function estimateSegmentRows(period) {
  const maturity = maturityForYear(period.fiscalYear);
  const awsMix = 0.105 + maturity * 0.065;
  const internationalMix = 0.30 - maturity * 0.075;
  const northAmericaMix = Math.max(0.52, 1 - awsMix - internationalMix);
  const assumptions = baseAssumptionsForPeriod(period, "Base");
  const rows = [
    ["North America", northAmericaMix, assumptions.northAmericaOperatingMargin, assumptions.northAmericaGrowth],
    ["International", internationalMix, assumptions.internationalOperatingMargin, assumptions.internationalGrowth],
    ["AWS", awsMix, assumptions.awsOperatingMargin, assumptions.awsGrowth],
  ];
  return rows.map(([segment, mix, margin, growth]) => ({
    id: `amzn-segment-${period.periodId}-${String(segment).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    periodId: period.periodId,
    eventId: period.eventId,
    asOfDate: period.asOfDate,
    segment,
    taxonomy: "reported_segment_research_only_allocation",
    revenue: period.revenue * mix,
    operatingIncome: period.revenue * mix * margin,
    operatingMargin: margin,
    revenueGrowth: growth,
    sourceType: "research_only",
    notes: "Research-only as-of segment allocation scaffold. Do not treat as official segment actual until AMZN segment tables are imported.",
    rawJson: json({ researchOnly: true, mix, margin, growth, periodId: period.periodId }),
  }));
}

function estimateBusinessUnitRows(period) {
  const maturity = maturityForYear(period.fiscalYear);
  const assumptions = baseAssumptionsForPeriod(period, "Base");
  const units = [
    ["Online stores", 0.49 - maturity * 0.11, 0.02 + maturity * 0.015, 0.05],
    ["Third-party seller services", 0.18 + maturity * 0.015, 0.18 + maturity * 0.035, 0.10],
    ["Advertising", 0.045 + maturity * 0.055, assumptions.advertisingContributionMargin, assumptions.advertisingGrowth],
    ["Subscription services", 0.065 + maturity * 0.010, 0.16 + maturity * 0.04, assumptions.subscriptionGrowth],
    ["AWS", 0.105 + maturity * 0.065, assumptions.awsOperatingMargin, assumptions.awsGrowth],
    ["Physical stores", Math.max(0.025, 0.05 - maturity * 0.015), 0.02, 0.02],
    ["Other", 0.035, 0.05, 0.04],
  ];
  return units.map(([businessUnit, mix, margin, growth]) => ({
    id: `amzn-business-${period.periodId}-${String(businessUnit).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    periodId: period.periodId,
    eventId: period.eventId,
    asOfDate: period.asOfDate,
    businessUnit,
    taxonomy: "reported_revenue_line_research_only_allocation",
    revenue: period.revenue * mix,
    operatingIncome: period.revenue * mix * margin,
    contributionMargin: margin,
    revenueGrowth: growth,
    sourceType: "research_only",
    notes: "Research-only business-unit revenue allocation for AMZN insight framework. Official actuals are not fabricated.",
    rawJson: json({ researchOnly: true, mix, margin, growth, periodId: period.periodId }),
  }));
}

function buildQuarterFinancials() {
  const companyfacts = readJson(COMPANYFACTS_PATH);
  const facts = companyfacts?.facts;
  if (!facts) return [];
  return buildQuarterConfigs(2018).map((quarter) => {
    const revenue = quarterFlowFact(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], quarter);
    const costOfRevenue = quarterFlowFact(facts, ["CostOfRevenue", "CostOfGoodsAndServicesSold"], quarter);
    const grossProfit = quarterFlowFact(facts, ["GrossProfit"], quarter);
    const operatingIncome = quarterFlowFact(facts, ["OperatingIncomeLoss"], quarter);
    const netIncome = quarterFlowFact(facts, ["NetIncomeLoss"], quarter);
    const operatingCashFlow = quarterFlowFact(facts, ["NetCashProvidedByUsedInOperatingActivities"], quarter);
    const capex = quarterFlowFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], quarter);
    const equipmentFinanceLeases = quarterFlowFact(facts, ["PropertyAndEquipmentAcquiredUnderFinanceLeases", "FinanceLeaseRightOfUseAssetObtainedInExchangeForFinanceLeaseLiability"], quarter);
    const depreciation = quarterFlowFact(facts, ["DepreciationDepletionAndAmortization", "Depreciation"], quarter);
    const stockBasedCompensation = quarterFlowFact(facts, ["ShareBasedCompensation"], quarter);
    const fulfillmentCost = quarterFlowFact(facts, ["FulfillmentExpense", "FulfillmentCosts"], quarter);
    const shippingCost = quarterFlowFact(facts, ["ShippingAndHandlingExpense", "ShippingCosts"], quarter);
    const technologyAndContentExpense = quarterFlowFact(facts, ["TechnologyAndContentExpense"], quarter);
    const dilutedEps = quarterPointOrAverageFact(facts, ["EarningsPerShareDiluted"], quarter, "USD/shares");
    const dilutedShares = quarterPointOrAverageFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], quarter, "shares");
    const cash = instantFact(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], quarter.end);
    const marketableSecurities = instantFact(facts, ["MarketableSecuritiesCurrent"], quarter.end);
    const currentDebt = instantFact(facts, ["LongTermDebtCurrent", "ShortTermBorrowings"], quarter.end);
    const longTermDebt = instantFact(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], quarter.end);
    const operatingLeaseLiabilities = instantFact(facts, ["OperatingLeaseLiability", "OperatingLeaseLiabilities"], quarter.end);
    const ppeNet = instantFact(facts, ["PropertyPlantAndEquipmentNet"], quarter.end);
    const eventDate = revenue?.filed ?? operatingIncome?.filed ?? quarter.filedFallback;
    if (eventDate > CURRENT_DATE) return null;
    const revenueValue = usdToMillions(revenue);
    const operatingIncomeValue = usdToMillions(operatingIncome);
    if (revenueValue == null || operatingIncomeValue == null) return null;
    const costValue = usdToMillions(costOfRevenue);
    const grossValue = usdToMillions(grossProfit) ?? (costValue != null ? revenueValue - costValue : null);
    const ocfValue = usdToMillions(operatingCashFlow);
    const capexValue = usdToMillions(capex);
    const cashAndMarketableSecurities = (usdToMillions(cash) ?? 0) + (usdToMillions(marketableSecurities) ?? 0);
    const debt = (usdToMillions(currentDebt) ?? 0) + (usdToMillions(longTermDebt) ?? 0);
    return {
      id: `amzn-sec-${quarter.id}`,
      periodId: quarter.id,
      label: quarter.label,
      fiscalYear: quarter.fiscalYear,
      fiscalQuarter: quarter.fiscalQuarter,
      periodType: "quarter",
      eventId: `sec-${quarter.id}`,
      asOfDate: eventDate,
      sourceType: "official_actual",
      sourceId: `amzn-sec-companyfacts-${quarter.id}`,
      revenue: revenueValue,
      costOfRevenue: costValue,
      grossProfit: grossValue,
      grossMargin: grossValue != null ? grossValue / revenueValue : null,
      operatingIncome: operatingIncomeValue,
      operatingMargin: operatingIncomeValue / revenueValue,
      netIncome: usdToMillions(netIncome),
      dilutedEps: splitAdjustedDilutedEps(dilutedEps, quarter.end),
      dilutedShares: splitAdjustedSharesToMillions(dilutedShares, quarter.end),
      operatingCashFlow: ocfValue,
      capex: capexValue,
      equipmentFinanceLeases: usdToMillions(equipmentFinanceLeases),
      freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
      depreciationAmortization: usdToMillions(depreciation),
      stockBasedCompensation: usdToMillions(stockBasedCompensation),
      fulfillmentCost: usdToMillions(fulfillmentCost),
      shippingCost: usdToMillions(shippingCost),
      technologyAndContentExpense: usdToMillions(technologyAndContentExpense),
      cashAndMarketableSecurities,
      debt,
      netDebt: debt - cashAndMarketableSecurities,
      operatingLeaseLiabilities: usdToMillions(operatingLeaseLiabilities),
      ppeNet: usdToMillions(ppeNet),
      currentPrice: null,
      rawJson: {
        quarter,
        facts: {
          revenue,
          costOfRevenue,
          grossProfit,
          operatingIncome,
          netIncome,
          operatingCashFlow,
          capex,
          equipmentFinanceLeases,
          dilutedEps,
          dilutedShares,
          splitAdjustment: quarter.end < AMZN_SPLIT_EFFECTIVE_DATE
            ? { factor: AMZN_SPLIT_FACTOR, effectiveDate: AMZN_SPLIT_EFFECTIVE_DATE, reason: "Align pre-split shares and EPS with split-adjusted daily_price_bars." }
            : null,
        },
        sourceDiscipline: "Consolidated rows are official SEC Companyfacts. Segment and business unit rows are separate research-only allocations unless official segment tables are imported.",
      },
    };
  }).filter(Boolean);
}

export async function buildAmznBackendSeedPayload() {
  const now = new Date().toISOString();
  const quarterFinancials = buildQuarterFinancials();
  const reportingEvents = quarterFinancials.map((period) => ({
    id: period.eventId,
    ticker: TICKER,
    eventDate: period.asOfDate,
    fiscalPeriod: period.label,
    fiscalYear: period.fiscalYear,
    fiscalQuarter: period.fiscalQuarter,
    eventType: `q${period.fiscalQuarter.slice(1)}_results`,
    label: `${period.label} SEC quarterly reporting event`,
    sourceType: "official_actual",
    sourcePath: COMPANYFACTS_PATH,
    sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`,
    createdAt: now,
  })).sort((left, right) => left.eventDate.localeCompare(right.eventDate));

  const financialPeriods = quarterFinancials.map((period) => ({
    id: period.id,
    ticker: TICKER,
    periodId: period.periodId,
    fiscalYear: period.fiscalYear,
    fiscalQuarter: period.fiscalQuarter,
    periodType: period.periodType,
    eventId: period.eventId,
    asOfDate: period.asOfDate,
    sourceType: period.sourceType,
    revenue: period.revenue,
    costOfRevenue: period.costOfRevenue,
    grossProfit: period.grossProfit,
    grossMargin: period.grossMargin,
    operatingIncome: period.operatingIncome,
    operatingMargin: period.operatingMargin,
    netIncome: period.netIncome,
    dilutedEps: period.dilutedEps,
    dilutedShares: period.dilutedShares,
    operatingCashFlow: period.operatingCashFlow,
    capex: period.capex,
    equipmentFinanceLeases: period.equipmentFinanceLeases,
    freeCashFlow: period.freeCashFlow,
    depreciationAmortization: period.depreciationAmortization,
    stockBasedCompensation: period.stockBasedCompensation,
    fulfillmentCost: period.fulfillmentCost,
    shippingCost: period.shippingCost,
    technologyAndContentExpense: period.technologyAndContentExpense,
    cashAndMarketableSecurities: period.cashAndMarketableSecurities,
    debt: period.debt,
    netDebt: period.netDebt,
    operatingLeaseLiabilities: period.operatingLeaseLiabilities,
    ppeNet: period.ppeNet,
    currentPrice: null,
    rawJson: json(period.rawJson),
  }));

  const segmentFinancials = financialPeriods.flatMap(estimateSegmentRows);
  const businessUnitFinancials = financialPeriods.flatMap(estimateBusinessUnitRows);
  const businessByPeriod = new Map();
  for (const row of businessUnitFinancials) {
    const bucket = businessByPeriod.get(row.periodId) ?? {};
    bucket[row.businessUnit] = row;
    businessByPeriod.set(row.periodId, bucket);
  }
  const segmentByPeriod = new Map();
  for (const row of segmentFinancials) {
    const bucket = segmentByPeriod.get(row.periodId) ?? {};
    bucket[row.segment] = row;
    segmentByPeriod.set(row.periodId, bucket);
  }
  const operatingMetricSnapshots = financialPeriods.map((period) => {
    const units = businessByPeriod.get(period.periodId) ?? {};
    const segments = segmentByPeriod.get(period.periodId) ?? {};
    const reportedFcf = period.freeCashFlow;
    const capexIntensity = period.capex && period.revenue ? period.capex / period.revenue : null;
    const valuationBase = trailingFinancialBaseForPeriod(period, financialPeriods);
    const assumptions = baseAssumptionsForPeriod(period, "Base", valuationBase);
    const normalizedFcf = period.revenue * assumptions.normalizedFcfMargin;
    return {
      id: `amzn-operating-${period.periodId}`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      sourceType: "research_only",
      awsRevenue: segments.AWS?.revenue ?? null,
      awsOperatingIncome: segments.AWS?.operatingIncome ?? null,
      awsOperatingMargin: segments.AWS?.operatingMargin ?? null,
      awsGrowth: segments.AWS?.revenueGrowth ?? null,
      advertisingRevenue: units.Advertising?.revenue ?? null,
      advertisingGrowth: units.Advertising?.revenueGrowth ?? null,
      subscriptionServicesRevenue: units["Subscription services"]?.revenue ?? null,
      thirdPartySellerServicesRevenue: units["Third-party seller services"]?.revenue ?? null,
      onlineStoresRevenue: units["Online stores"]?.revenue ?? null,
      physicalStoresRevenue: units["Physical stores"]?.revenue ?? null,
      otherRevenue: units.Other?.revenue ?? null,
      northAmericaRevenue: segments["North America"]?.revenue ?? null,
      northAmericaOperatingIncome: segments["North America"]?.operatingIncome ?? null,
      northAmericaOperatingMargin: segments["North America"]?.operatingMargin ?? null,
      internationalRevenue: segments.International?.revenue ?? null,
      internationalOperatingIncome: segments.International?.operatingIncome ?? null,
      internationalOperatingMargin: segments.International?.operatingMargin ?? null,
      fulfillmentCost: period.fulfillmentCost,
      shippingCost: period.shippingCost,
      technologyAndContentExpense: period.technologyAndContentExpense,
      stockBasedCompensation: period.stockBasedCompensation,
      capexIntensity,
      reportedFcf,
      normalizedFcf,
      fcfConversion: normalizedFcf && period.revenue ? normalizedFcf / period.revenue : null,
      paidUnitsGrowth: null,
      primeSubscriptionIndicator: null,
      awsBacklog: null,
      retailMarginBridge: "Research-only retail margin bridge generated from event-dated assumptions until official segment tables are imported.",
      aiCommentary: period.asOfDate < "2023-01-01"
        ? "Pre-generative-AI period: no current AI infrastructure uplift is applied."
        : "AI infrastructure capex is reflected through event-dated AWS margin and normalized FCF assumptions.",
      projectKuiperCommentary: period.asOfDate < "2019-04-01"
        ? "Pre-Kuiper-public-option period: no Kuiper option value is applied."
        : "Kuiper is treated as explicit optionality with capex and ROIC dilution risk.",
      notes: "Operating metric snapshot combines SEC consolidated actuals with research-only AMZN-specific allocation scaffolds.",
      rawJson: json({ sourceDiscipline: "research_only_allocation", periodId: period.periodId }),
    };
  });

  const marketSnapshots = reportingEvents.map((event) => ({
    id: `amzn-market-${event.id}`,
    ticker: TICKER,
    asOfDate: event.eventDate,
    priceDate: null,
    currentPrice: null,
    currency: "USD",
    marketCap: null,
    enterpriseValue: null,
    sharesOutstanding: null,
    previousClose: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: null,
    beta: null,
    source: "daily_price_bars required for valuation price anchor",
    sourceType: "market_data_pending_import",
    fetchedAt: now,
    rawJson: json({ eventId: event.id, note: "Valuation service overrides price from nearest prior daily_price_bars row." }),
  }));

  const sourceDocuments = [
    {
      id: "amzn-sec-companyfacts",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Amazon SEC Companyfacts API",
      sourcePath: COMPANYFACTS_PATH,
      sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`,
      retrievedAt: now,
      publishedDate: null,
      provenance: "SEC Companyfacts API cached locally by scripts/amzn_fetch_official_data.mjs.",
      confidence: fs.existsSync(COMPANYFACTS_PATH) ? "high" : "missing",
      checksum: null,
      metadataJson: json({ cik: CIK, localPath: COMPANYFACTS_PATH }),
    },
    {
      id: "amzn-sec-submissions",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Amazon SEC Submissions API",
      sourcePath: SUBMISSIONS_PATH,
      sourceUrl: `https://data.sec.gov/submissions/CIK${CIK}.json`,
      retrievedAt: now,
      publishedDate: null,
      provenance: "SEC Submissions API cached locally by scripts/amzn_fetch_official_data.mjs.",
      confidence: fs.existsSync(SUBMISSIONS_PATH) ? "high" : "missing",
      checksum: null,
      metadataJson: json({ cik: CIK, localPath: SUBMISSIONS_PATH }),
    },
  ];

  const peerSnapshots = ["MSFT", "GOOGL", "META", "WMT", "BABA"].map((peerTicker) => ({
    id: `amzn-peer-${peerTicker}`,
    ticker: TICKER,
    asOfDate: reportingEvents[reportingEvents.length - 1]?.eventDate ?? CURRENT_DATE,
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: "platform_peer",
    peerGroup: "Cloud / ads / retail platform peer context",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: null,
    forwardPe: null,
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: "research_only peer metadata placeholder",
    fetchedAt: now,
    confidenceLevel: "low",
    absoluteValueUse: "metadata_only_not_aggregated",
    rawJson: json({ note: "Peer absolute market cap / EV intentionally not seeded to avoid mixed-source aggregation." }),
  }));

  const modelVersions = [{
    id: AMZN_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: AMZN_BACKEND_MODEL_VERSION.version,
    name: AMZN_BACKEND_MODEL_VERSION.name,
    description: AMZN_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(AMZN_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(AMZN_BACKEND_MODEL_VERSION.assumptionSchema),
    createdAt: now,
  }];

  const assumptionSets = reportingEvents.flatMap((event) => {
    const period = financialPeriods.find((row) => row.eventId === event.id);
    const valuationBase = period ? trailingFinancialBaseForPeriod(period, financialPeriods) : period;
    const fallbackPeriod = period ?? { fiscalYear: event.fiscalYear, asOfDate: event.eventDate, revenue: 1 };
    return ["Bear", "Base", "Bull"].map((scenario) => ({
      id: `amzn-${scenario.toLowerCase()}-${AMZN_BACKEND_MODEL_VERSION.version}-${event.id}`,
      ticker: TICKER,
      name: `${scenario} event-dated AMZN assumptions ${event.fiscalPeriod}`,
      scenario,
      modelVersion: AMZN_BACKEND_MODEL_VERSION.version,
      asOfDate: event.eventDate,
      assumptionsJson: json(baseAssumptionsForPeriod(fallbackPeriod, scenario, valuationBase ?? fallbackPeriod)),
      sourceType: "forecast_assumption",
      createdAt: now,
    }));
  });

  const validationWarnings = [
    {
      id: "amzn-segment-source-gap",
      ticker: TICKER,
      scope: "segment_financials",
      severity: "medium",
      title: "AMZN segment and business-unit rows are research-only allocations",
      detail: "Seed imports consolidated SEC Companyfacts actuals. Segment, advertising, subscription, and business-unit fields are marked research_only until official AMZN segment tables are imported.",
      relatedTable: "segment_financials",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "amzn-market-price-anchor-required",
      ticker: TICKER,
      scope: "daily_price_bars",
      severity: "medium",
      title: "AMZN historical prices require daily_price_bars",
      detail: "Run npm run amzn:backend:import-prices before valuation backfill so currentPrice uses nearest prior daily adjusted close by event date.",
      relatedTable: "daily_price_bars",
      relatedRecordId: null,
      createdAt: now,
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    businessUnitFinancials,
    operatingMetricSnapshots,
    marketSnapshots,
    peerSnapshots,
    guidanceItems: [],
    transcriptEvents: [],
    transcriptExtractions: [],
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
