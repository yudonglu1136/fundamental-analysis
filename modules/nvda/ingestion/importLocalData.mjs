import fs from "node:fs";
import path from "node:path";
import { NVDA_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "NVDA";
const CIK = "0001045810";
const SEC_DIR = path.resolve("data/local/nvda/sec");
const COMPANYFACTS_PATH = path.join(SEC_DIR, `companyfacts_CIK${CIK}.json`);
const SUBMISSIONS_PATH = path.join(SEC_DIR, `submissions_CIK${CIK}.json`);
const CURRENT_DATE = new Date().toISOString().slice(0, 10);

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

function rowsForTags(facts, tags, unit = "USD") {
  return tags.flatMap((tag) => secUnit(facts, tag, unit).map((row) => ({ tag, ...row })));
}

function dateValue(isoDate) {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function durationDays(row) {
  if (!row?.start || !row?.end) return null;
  return Math.round((dateValue(row.end) - dateValue(row.start)) / 86_400_000);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fiscalQuarterFromEnd(end) {
  const year = Number(end.slice(0, 4));
  const month = Number(end.slice(5, 7));
  if (month >= 3 && month <= 5) return { fiscalYear: year + 1, fiscalQuarter: "Q1", quarterNumber: 1 };
  if (month >= 6 && month <= 8) return { fiscalYear: year + 1, fiscalQuarter: "Q2", quarterNumber: 2 };
  if (month >= 9 && month <= 11) return { fiscalYear: year + 1, fiscalQuarter: "Q3", quarterNumber: 3 };
  return { fiscalYear: year, fiscalQuarter: "Q4", quarterNumber: 4 };
}

function periodIdFor(fiscalYear, fiscalQuarter) {
  return `fy${String(fiscalYear).slice(2)}-${String(fiscalQuarter).toLowerCase()}`;
}

function eventIdFor(fiscalYear, fiscalQuarter) {
  return `sec-${String(fiscalQuarter).toLowerCase()}-fy${String(fiscalYear).slice(2)}`;
}

function eventTypeFor(fiscalQuarter) {
  return `${String(fiscalQuarter).toLowerCase()}_results`;
}

function earliestFiled(rows) {
  return [...rows].sort((left, right) => {
    const filedOrder = String(left.filed ?? "").localeCompare(String(right.filed ?? ""));
    if (filedOrder !== 0) return filedOrder;
    return String(left.form ?? "").localeCompare(String(right.form ?? ""));
  })[0] ?? null;
}

function latestFiled(rows) {
  return [...rows].sort((left, right) => {
    const filedOrder = String(right.filed ?? "").localeCompare(String(left.filed ?? ""));
    if (filedOrder !== 0) return filedOrder;
    return String(right.form ?? "").localeCompare(String(left.form ?? ""));
  })[0] ?? null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usdToMillions(fact) {
  const value = typeof fact?.val === "number" ? fact.val : typeof fact?.value === "number" ? fact.value : null;
  return typeof value === "number" ? value / 1_000_000 : null;
}

function sharesToSplitAdjustedMillions(fact, periodEnd) {
  if (typeof fact?.val !== "number") return null;
  return (fact.val * splitAdjustmentFactor(periodEnd)) / 1_000_000;
}

function epsToSplitAdjusted(fact, periodEnd) {
  if (typeof fact?.val !== "number") return null;
  return fact.val / splitAdjustmentFactor(periodEnd);
}

function splitAdjustmentFactor(periodEnd) {
  if (periodEnd < "2021-07-20") return 40;
  if (periodEnd < "2024-06-10") return 10;
  return 1;
}

function directDurationFact(facts, tags, start, end, unit = "USD", maxFiledDate = CURRENT_DATE) {
  const rows = rowsForTags(facts, tags, unit).filter((row) => {
    const days = durationDays(row);
    return (
      row.start === start &&
      row.end === end &&
      ["10-Q", "10-K"].includes(row.form) &&
      row.filed <= maxFiledDate &&
      days != null &&
      days >= 70 &&
      days <= 115
    );
  });
  return latestFiled(rows);
}

function durationFact(facts, tags, start, end, unit = "USD", maxFiledDate = CURRENT_DATE) {
  const rows = rowsForTags(facts, tags, unit).filter((row) => {
    return row.start === start && row.end === end && ["10-Q", "10-K"].includes(row.form) && row.filed <= maxFiledDate;
  });
  return latestFiled(rows);
}

function instantFact(facts, tags, end, unit = "USD", maxFiledDate = CURRENT_DATE) {
  const rows = rowsForTags(facts, tags, unit).filter((row) => {
    return !row.start && row.end === end && ["10-Q", "10-K"].includes(row.form) && row.filed <= maxFiledDate;
  });
  return latestFiled(rows);
}

function deriveQuarterFlowFact(facts, tags, quarter, annualByFiscalYear, priorQuartersByFiscalYear, unit = "USD") {
  const direct = directDurationFact(facts, tags, quarter.start, quarter.end, unit, quarter.eventDate);
  if (direct) return { fact: direct, value: direct.val, derived: false };

  const annual = annualByFiscalYear.get(quarter.fiscalYear);
  if (!annual) return { fact: null, value: null, derived: false };
  const ytd = durationFact(facts, tags, annual.start, quarter.end, unit, quarter.eventDate);
  if (quarter.quarterNumber === 1) return { fact: ytd, value: numberOrNull(ytd?.val), derived: false };
  if (quarter.quarterNumber <= 3 && ytd) {
    const previousEnd = priorQuartersByFiscalYear.get(quarter.fiscalYear)?.[quarter.quarterNumber - 2]?.end;
    const previousYtd = previousEnd ? durationFact(facts, tags, annual.start, previousEnd, unit, quarter.eventDate) : null;
    if (typeof ytd.val === "number" && typeof previousYtd?.val === "number") {
      return { fact: ytd, value: ytd.val - previousYtd.val, derived: true };
    }
  }
  if (quarter.quarterNumber === 4) {
    const annualFact = durationFact(facts, tags, annual.start, annual.end, unit, quarter.eventDate);
    const firstThree = priorQuartersByFiscalYear.get(quarter.fiscalYear) ?? [];
    const priorValues = firstThree.slice(0, 3).map((prior) => deriveQuarterFlowFact(facts, tags, prior, annualByFiscalYear, priorQuartersByFiscalYear, unit).value);
    if (typeof annualFact?.val === "number" && priorValues.every((value) => typeof value === "number")) {
      return { fact: annualFact, value: annualFact.val - priorValues.reduce((sum, value) => sum + value, 0), derived: true };
    }
  }
  return { fact: null, value: null, derived: false };
}

function quarterAverageFact(facts, tags, quarter, annualByFiscalYear, unit = "USD") {
  const direct = directDurationFact(facts, tags, quarter.start, quarter.end, unit, quarter.eventDate);
  if (direct) return { fact: direct, value: direct.val, derived: false };
  const annual = annualByFiscalYear.get(quarter.fiscalYear);
  if (!annual) return { fact: null, value: null, derived: false };
  if (quarter.quarterNumber === 4) {
    const annualFact = durationFact(facts, tags, annual.start, annual.end, unit, quarter.eventDate);
    return { fact: annualFact, value: numberOrNull(annualFact?.val), derived: true };
  }
  const ytd = durationFact(facts, tags, annual.start, quarter.end, unit, quarter.eventDate);
  return { fact: ytd, value: numberOrNull(ytd?.val), derived: true };
}

function buildAnnualPeriods(facts) {
  const annualRows = rowsForTags(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"])
    .filter((row) => {
      const days = durationDays(row);
      return row.form === "10-K" && row.start && row.end && row.filed <= CURRENT_DATE && days != null && days >= 330 && days <= 380;
    })
    .map((row) => {
      const { fiscalYear } = fiscalQuarterFromEnd(row.end);
      return { fiscalYear, start: row.start, end: row.end, filed: row.filed, sourceFact: row };
    });
  const byYear = new Map();
  for (const row of annualRows) {
    const current = byYear.get(row.fiscalYear);
    if (!current || row.filed < current.filed) byYear.set(row.fiscalYear, row);
  }
  return byYear;
}

function buildQuarterConfigs(facts) {
  const annualByFiscalYear = buildAnnualPeriods(facts);
  const directRevenueRows = rowsForTags(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"])
    .filter((row) => {
      const days = durationDays(row);
      return ["10-Q", "10-K"].includes(row.form) && row.start && row.end && row.filed <= CURRENT_DATE && days != null && days >= 70 && days <= 115;
    })
    .map((row) => ({ ...row, ...fiscalQuarterFromEnd(row.end) }))
    .filter((row) => row.fiscalYear >= 2019 && row.fiscalYear <= 2026 && row.quarterNumber <= 3);

  const directByPeriod = new Map();
  for (const row of directRevenueRows) {
    const key = `${row.fiscalYear}-${row.fiscalQuarter}`;
    const current = directByPeriod.get(key);
    if (!current || row.filed < current.filed) directByPeriod.set(key, row);
  }

  const quarters = [];
  for (const annual of [...annualByFiscalYear.values()].sort((left, right) => left.fiscalYear - right.fiscalYear)) {
    if (annual.fiscalYear < 2019 || annual.fiscalYear > 2026) continue;
    for (const quarterNumber of [1, 2, 3]) {
      const fiscalQuarter = `Q${quarterNumber}`;
      const direct = directByPeriod.get(`${annual.fiscalYear}-${fiscalQuarter}`);
      if (!direct) continue;
      quarters.push({
        fiscalYear: annual.fiscalYear,
        fiscalQuarter,
        quarterNumber,
        start: direct.start,
        end: direct.end,
        eventDate: direct.filed,
        sourceFact: direct,
      });
    }
    const q3 = quarters.find((row) => row.fiscalYear === annual.fiscalYear && row.fiscalQuarter === "Q3");
    quarters.push({
      fiscalYear: annual.fiscalYear,
      fiscalQuarter: "Q4",
      quarterNumber: 4,
      start: q3 ? addDays(q3.end, 1) : annual.start,
      end: annual.end,
      eventDate: annual.filed,
      sourceFact: annual.sourceFact,
    });
  }
  return quarters.sort((left, right) => left.end.localeCompare(right.end));
}

function segmentMixForEvent(asOfDate) {
  if (asOfDate < "2020-01-01") return { dataCenter: 0.26, gaming: 0.55, professionalVisualization: 0.08, automotive: 0.05, oemOther: 0.06 };
  if (asOfDate < "2022-01-01") return { dataCenter: 0.36, gaming: 0.43, professionalVisualization: 0.08, automotive: 0.04, oemOther: 0.09 };
  if (asOfDate < "2023-05-01") return { dataCenter: 0.48, gaming: 0.34, professionalVisualization: 0.08, automotive: 0.04, oemOther: 0.06 };
  if (asOfDate < "2024-03-01") return { dataCenter: 0.69, gaming: 0.19, professionalVisualization: 0.05, automotive: 0.03, oemOther: 0.04 };
  if (asOfDate < "2025-01-01") return { dataCenter: 0.82, gaming: 0.10, professionalVisualization: 0.03, automotive: 0.02, oemOther: 0.03 };
  return { dataCenter: 0.86, gaming: 0.08, professionalVisualization: 0.02, automotive: 0.02, oemOther: 0.02 };
}

function productCyclePhase(asOfDate) {
  if (asOfDate < "2020-05-01") return "Pre-Ampere gaming/data-center ramp";
  if (asOfDate < "2022-03-01") return "Ampere data-center and gaming cycle";
  if (asOfDate < "2024-03-18") return "Hopper AI accelerator cycle";
  if (asOfDate < "2025-03-01") return "Blackwell transition and Hopper supply allocation";
  return "Blackwell ramp with Rubin roadmap awareness";
}

function buildSupplyCommentary(asOfDate) {
  const base = {
    hopperCommentary: asOfDate >= "2022-03-01" ? "Hopper cycle is knowable as an AI accelerator product-cycle driver." : null,
    blackwellCommentary: asOfDate >= "2024-03-18" ? "Blackwell transition is a dated product-cycle variable for gross margin, systems mix, and allocation." : null,
    rubinCommentary: asOfDate >= "2025-03-01" ? "Rubin roadmap becomes a monitoring item after public roadmap visibility." : null,
    networkingCommentary: asOfDate >= "2023-05-01" ? "Networking attach matters as AI clusters shift from accelerators toward systems-level economics." : "Networking attach not separately modeled from official data for this event.",
  };
  if (asOfDate < "2021-01-01") {
    return {
      ...base,
      tsmcDependencyCommentary: "Foundry dependency is monitored, but no AI-packaging bottleneck is assumed in this old-year snapshot.",
      cowosConstraintCommentary: "No CoWoS constraint assumption is applied before the AI cluster ramp period.",
      supplyConstraintCommentary: "Supply commentary is limited to general semiconductor-cycle availability.",
      productTransitionCommentary: "Gaming and data-center architecture cycles drive underwriting more than AI cluster allocation.",
    };
  }
  if (asOfDate < "2023-05-01") {
    return {
      ...base,
      tsmcDependencyCommentary: "Foundry and advanced-node dependency is a monitoring item.",
      cowosConstraintCommentary: "Advanced packaging is monitored but not treated as the dominant bottleneck before the Hopper demand inflection.",
      supplyConstraintCommentary: "Supply availability is a normal-cycle risk, not yet the central AI allocation debate.",
      productTransitionCommentary: "Ampere-to-Hopper transition is the key product-cycle variable.",
    };
  }
  return {
    ...base,
    tsmcDependencyCommentary: "TSMC advanced-node dependency is a core bottleneck and allocation underwriting item.",
    cowosConstraintCommentary: "CoWoS and advanced packaging availability are treated as dated supply constraints only after the AI cluster demand inflection.",
    supplyConstraintCommentary: "AI accelerator supply allocation and networking attach influence revenue timing and margin quality.",
    productTransitionCommentary: productCyclePhase(asOfDate),
  };
}

function buildCustomerCommentary(asOfDate) {
  return {
    cloudServiceProviderConcentration:
      asOfDate < "2023-05-01"
        ? "Cloud concentration is monitored but historical demand is not backfilled with current hyperscaler AI scale."
        : "Hyperscaler concentration, monetization, and GPU capacity absorption are primary underwriting questions.",
    sovereignAiCommentary:
      asOfDate >= "2024-01-01" ? "Sovereign AI becomes a dated demand-source monitoring item after public AI-infrastructure budget visibility." : "No sovereign AI contribution is assumed for this old-year event.",
    enterpriseAiCommentary:
      asOfDate >= "2023-05-01" ? "Enterprise AI is tracked as a secondary demand source behind cloud service providers." : "Enterprise AI demand is not treated as a material valuation driver in this event snapshot.",
    trainingDemandCommentary:
      asOfDate >= "2023-05-01" ? "Training demand is the primary visible accelerator driver in this period." : "Training demand exists but is not modeled with current generative-AI scale.",
    inferenceDemandCommentary:
      asOfDate >= "2024-01-01" ? "Inference mix is a margin and volume debate because it can alter utilization, ASPs, and networking attach." : "Inference is not modeled as a material separate demand driver for this old-year event.",
    overbuildRiskCommentary:
      asOfDate >= "2024-01-01" ? "GPU overbuild risk is monitored through hyperscaler capex monetization and digestion signals." : "Overbuild risk is not applied before the AI capex acceleration becomes knowable.",
    chinaExportRestrictionImpact:
      asOfDate >= "2022-09-01" ? "China export controls are a dated demand and product-workaround risk." : "China export-control impact is not applied before it was knowable.",
  };
}

function scenarioAssumptions(period, scenario, ttm = period) {
  const asOfDate = period.asOfDate;
  const aiEra = asOfDate >= "2023-05-01";
  const blackwellKnown = asOfDate >= "2024-03-18";
  const rubinKnown = asOfDate >= "2025-03-01";
  const maturity = Math.max(0, Math.min(1, (period.fiscalYear - 2019) / 7));
  const grossMargin = period.grossMargin ?? 0.60;
  const operatingMargin = period.operatingMargin ?? 0.30;
  const fcfMargin = ttm.revenue ? Math.max(-0.05, Math.min(0.75, (ttm.freeCashFlow ?? period.freeCashFlow ?? period.revenue * 0.18) / ttm.revenue)) : 0.18;
  const base = {
    currentPrice: period.currentPrice ?? 100,
    dilutedShares: period.dilutedShares ?? 24_500,
    netCash: (period.cashAndMarketableSecurities ?? 0) - (period.debt ?? 0),
    dataCenterGrowth: aiEra ? 0.34 + maturity * 0.18 : 0.16 + maturity * 0.06,
    gamingGrowth: aiEra ? 0.05 : 0.10,
    networkingAttachRate: aiEra ? 0.18 + maturity * 0.06 : 0.08,
    grossMargin: Math.max(0.44, Math.min(0.76, grossMargin)),
    operatingMargin: Math.max(0.18, Math.min(0.66, operatingMargin)),
    normalizedFcfMargin: Math.max(0.08, Math.min(0.62, fcfMargin)),
    terminalGrowth: aiEra ? 0.04 : 0.03,
    discountRate: aiEra ? 0.095 : 0.105,
    targetFcfYield: aiEra ? 0.035 : 0.052,
    targetPe: aiEra ? 34 : 24,
    evEbitMultiple: aiEra ? 29 : 18,
    dataCenterRevenueMultiple: aiEra ? 12 + maturity * 3 : 6,
    networkingRevenueMultiple: aiEra ? 8 + maturity * 2 : 4,
    gamingRevenueMultiple: aiEra ? 4 : 5,
    automotiveRevenueMultiple: 5,
    productTransitionRisk: blackwellKnown ? 0.05 : 0.02,
    chinaRiskHaircut: asOfDate >= "2022-09-01" ? 0.04 : 0,
    customAsicShareRisk: aiEra ? 0.06 : 0.02,
    supplyConstraintBenefit: aiEra ? 0.03 : 0,
    blackwellKnown: blackwellKnown ? 1 : 0,
    rubinKnown: rubinKnown ? 1 : 0,
  };
  if (scenario === "Bear") {
    return {
      ...base,
      dataCenterGrowth: Math.max(0.02, base.dataCenterGrowth - 0.18),
      gamingGrowth: base.gamingGrowth - 0.04,
      grossMargin: base.grossMargin - (aiEra ? 0.07 : 0.04),
      operatingMargin: base.operatingMargin - (aiEra ? 0.09 : 0.05),
      normalizedFcfMargin: Math.max(0.04, base.normalizedFcfMargin - 0.11),
      discountRate: base.discountRate + 0.012,
      targetFcfYield: base.targetFcfYield + 0.018,
      targetPe: base.targetPe - 8,
      evEbitMultiple: base.evEbitMultiple - 7,
      dataCenterRevenueMultiple: base.dataCenterRevenueMultiple - 4,
      networkingRevenueMultiple: base.networkingRevenueMultiple - 3,
      productTransitionRisk: base.productTransitionRisk + 0.09,
      chinaRiskHaircut: base.chinaRiskHaircut + 0.05,
      customAsicShareRisk: base.customAsicShareRisk + 0.08,
      supplyConstraintBenefit: 0,
    };
  }
  if (scenario === "Bull") {
    return {
      ...base,
      dataCenterGrowth: base.dataCenterGrowth + (aiEra ? 0.16 : 0.07),
      gamingGrowth: base.gamingGrowth + 0.03,
      networkingAttachRate: base.networkingAttachRate + 0.06,
      grossMargin: Math.min(0.79, base.grossMargin + 0.035),
      operatingMargin: Math.min(0.70, base.operatingMargin + 0.045),
      normalizedFcfMargin: Math.min(0.68, base.normalizedFcfMargin + 0.07),
      discountRate: base.discountRate - 0.008,
      targetFcfYield: Math.max(0.026, base.targetFcfYield - 0.009),
      targetPe: base.targetPe + 7,
      evEbitMultiple: base.evEbitMultiple + 6,
      dataCenterRevenueMultiple: base.dataCenterRevenueMultiple + 4,
      networkingRevenueMultiple: base.networkingRevenueMultiple + 3,
      productTransitionRisk: Math.max(0, base.productTransitionRisk - 0.03),
      chinaRiskHaircut: Math.max(0, base.chinaRiskHaircut - 0.02),
      customAsicShareRisk: Math.max(0, base.customAsicShareRisk - 0.03),
      supplyConstraintBenefit: base.supplyConstraintBenefit + 0.04,
    };
  }
  return base;
}

function sumRows(rows, key) {
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

function buildTtmRows(financialPeriods, period) {
  const ordered = [...financialPeriods].sort((left, right) => {
    const yearOrder = left.fiscalYear - right.fiscalYear;
    if (yearOrder !== 0) return yearOrder;
    return Number(left.fiscalQuarter.slice(1)) - Number(right.fiscalQuarter.slice(1));
  });
  const index = ordered.findIndex((row) => row.id === period.id);
  const trailing = ordered.slice(Math.max(0, index - 3), index + 1);
  if (trailing.length < 4) return period;
  return {
    ...period,
    revenue: sumRows(trailing, "revenue") ?? period.revenue,
    grossProfit: sumRows(trailing, "grossProfit") ?? period.grossProfit,
    operatingIncome: sumRows(trailing, "operatingIncome") ?? period.operatingIncome,
    netIncome: sumRows(trailing, "netIncome") ?? period.netIncome,
    operatingCashFlow: sumRows(trailing, "operatingCashFlow") ?? period.operatingCashFlow,
    capex: sumRows(trailing, "capex") ?? period.capex,
    freeCashFlow: sumRows(trailing, "freeCashFlow") ?? period.freeCashFlow,
  };
}

function filingSourceUrlForEvent(event, submissions) {
  const recent = submissions?.filings?.recent;
  if (!recent) return "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
  for (let index = 0; index < recent.form.length; index += 1) {
    if (recent.filingDate[index] === event.eventDate && ["10-Q", "10-K"].includes(recent.form[index])) {
      const accession = String(recent.accessionNumber[index]).replace(/-/g, "");
      const primary = recent.primaryDocument[index];
      return `https://www.sec.gov/Archives/edgar/data/1045810/${accession}/${primary}`;
    }
  }
  return "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
}

function buildFinancialRows({ facts, quarters, annualByFiscalYear, priorQuartersByFiscalYear }) {
  return quarters.map((quarter) => {
    const revenue = deriveQuarterFlowFact(facts, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const grossProfit = deriveQuarterFlowFact(facts, ["GrossProfit"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const operatingIncome = deriveQuarterFlowFact(facts, ["OperatingIncomeLoss"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const netIncome = deriveQuarterFlowFact(facts, ["NetIncomeLoss"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const operatingCashFlow = deriveQuarterFlowFact(facts, ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const capex = deriveQuarterFlowFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const depreciation = deriveQuarterFlowFact(facts, ["DepreciationDepletionAndAmortization", "Depreciation"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const stockBasedCompensation = deriveQuarterFlowFact(facts, ["ShareBasedCompensation"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const buybacks = deriveQuarterFlowFact(facts, ["PaymentsForRepurchaseOfCommonStock", "StockRepurchasedAndRetiredDuringPeriodValue"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const dividendsPaid = deriveQuarterFlowFact(facts, ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"], quarter, annualByFiscalYear, priorQuartersByFiscalYear);
    const dilutedEps = quarterAverageFact(facts, ["EarningsPerShareDiluted"], quarter, annualByFiscalYear, "USD/shares");
    const dilutedShares = quarterAverageFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], quarter, annualByFiscalYear, "shares");
    const cash = instantFact(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments", "AvailableForSaleSecurities"], quarter.end, "USD", quarter.eventDate);
    const shortTermInvestments = instantFact(facts, ["ShortTermInvestments", "MarketableSecuritiesCurrent"], quarter.end, "USD", quarter.eventDate);
    const debtCurrent = instantFact(facts, ["LongTermDebtCurrent", "ShortTermBorrowings"], quarter.end, "USD", quarter.eventDate);
    const debtLongTerm = instantFact(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], quarter.end, "USD", quarter.eventDate);
    const inventory = instantFact(facts, ["InventoryNet"], quarter.end, "USD", quarter.eventDate);
    const purchaseObligation = instantFact(facts, ["PurchaseObligation", "UnrecordedUnconditionalPurchaseObligationBalanceSheetAmount"], quarter.end, "USD", quarter.eventDate);
    const receivables = instantFact(facts, ["AccountsReceivableNetCurrent"], quarter.end, "USD", quarter.eventDate);
    const deferredRevenueCurrent = instantFact(facts, ["DeferredRevenueCurrent", "ContractWithCustomerLiabilityCurrent"], quarter.end, "USD", quarter.eventDate);
    const deferredRevenueNoncurrent = instantFact(facts, ["DeferredRevenueNoncurrent", "ContractWithCustomerLiabilityNoncurrent"], quarter.end, "USD", quarter.eventDate);
    const rpo = instantFact(facts, ["RevenueRemainingPerformanceObligation"], quarter.end, "USD", quarter.eventDate);
    const revenueValue = usdToMillions(revenue);
    const grossProfitValue = usdToMillions(grossProfit);
    const operatingIncomeValue = usdToMillions(operatingIncome);
    const capexValue = usdToMillions(capex);
    const ocfValue = usdToMillions(operatingCashFlow);
    const cashAndInvestments = (usdToMillions(cash) ?? 0) + (usdToMillions(shortTermInvestments) ?? 0);
    const debt = (usdToMillions(debtCurrent) ?? 0) + (usdToMillions(debtLongTerm) ?? 0);
    return {
      id: `${TICKER}-${periodIdFor(quarter.fiscalYear, quarter.fiscalQuarter)}`,
      ticker: TICKER,
      periodId: periodIdFor(quarter.fiscalYear, quarter.fiscalQuarter),
      fiscalYear: quarter.fiscalYear,
      fiscalQuarter: quarter.fiscalQuarter,
      periodType: "quarter",
      periodStart: quarter.start,
      periodEnd: quarter.end,
      eventId: eventIdFor(quarter.fiscalYear, quarter.fiscalQuarter),
      asOfDate: quarter.eventDate,
      sourceType: "official_actual",
      revenue: revenueValue,
      costOfRevenue: revenueValue != null && grossProfitValue != null ? revenueValue - grossProfitValue : null,
      grossProfit: grossProfitValue,
      grossMargin: grossProfitValue != null && revenueValue ? grossProfitValue / revenueValue : null,
      operatingIncome: operatingIncomeValue,
      operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
      netIncome: usdToMillions(netIncome),
      dilutedEps: epsToSplitAdjusted(dilutedEps.fact ? { val: dilutedEps.value } : null, quarter.end),
      dilutedShares: sharesToSplitAdjustedMillions(dilutedShares.fact ? { val: dilutedShares.value } : null, quarter.end),
      operatingCashFlow: ocfValue,
      capex: capexValue,
      freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
      depreciationAmortization: usdToMillions(depreciation),
      stockBasedCompensation: usdToMillions(stockBasedCompensation),
      buybacks: usdToMillions(buybacks),
      dividendsPaid: usdToMillions(dividendsPaid),
      cashAndMarketableSecurities: cashAndInvestments || null,
      debt: debt || null,
      inventory: usdToMillions(inventory),
      inventoryPurchaseObligations: usdToMillions(purchaseObligation),
      accountsReceivable: usdToMillions(receivables),
      deferredRevenue: (usdToMillions(deferredRevenueCurrent) ?? 0) + (usdToMillions(deferredRevenueNoncurrent) ?? 0) || null,
      remainingPerformanceObligation: usdToMillions(rpo),
      currentPrice: null,
      rawJson: json({
        secSource: "SEC Companyfacts",
        sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json",
        periodStart: quarter.start,
        periodEnd: quarter.end,
        eventDate: quarter.eventDate,
        splitAdjustedShareBasis: "Yahoo adjusted-close compatible share basis using 4-for-1 and 10-for-1 split factors.",
        derivedQuarterFields: {
          revenue: revenue.derived,
          grossProfit: grossProfit.derived,
          operatingIncome: operatingIncome.derived,
          netIncome: netIncome.derived,
          operatingCashFlow: operatingCashFlow.derived,
          capex: capex.derived,
        },
      }),
    };
  });
}

function buildSeedPayloadFromSec({ companyfacts, submissions }) {
  const facts = companyfacts?.facts;
  if (!facts) throw new Error(`NVDA SEC Companyfacts missing at ${COMPANYFACTS_PATH}. Run npm run nvda:fetch-official first.`);
  const annualByFiscalYear = buildAnnualPeriods(facts);
  const quarters = buildQuarterConfigs(facts).filter((quarter) => quarter.fiscalYear >= 2019 && quarter.fiscalYear <= 2026);
  const priorQuartersByFiscalYear = new Map();
  for (const quarter of quarters) {
    if (!priorQuartersByFiscalYear.has(quarter.fiscalYear)) priorQuartersByFiscalYear.set(quarter.fiscalYear, []);
    priorQuartersByFiscalYear.get(quarter.fiscalYear).push(quarter);
  }

  const createdAt = new Date().toISOString();
  const reportingEvents = quarters.map((quarter) => {
    const id = eventIdFor(quarter.fiscalYear, quarter.fiscalQuarter);
    const fiscalPeriod = `FY${quarter.fiscalYear} ${quarter.fiscalQuarter}`;
    return {
      id,
      ticker: TICKER,
      eventDate: quarter.eventDate,
      fiscalPeriod,
      fiscalYear: quarter.fiscalYear,
      fiscalQuarter: quarter.fiscalQuarter,
      eventType: eventTypeFor(quarter.fiscalQuarter),
      label: fiscalPeriod,
      title: `NVIDIA ${fiscalPeriod} results`,
      sourceType: "official_actual",
      sourcePath: path.relative(process.cwd(), COMPANYFACTS_PATH),
      sourceUrl: filingSourceUrlForEvent({ eventDate: quarter.eventDate }, submissions),
      createdAt,
    };
  });

  const financialPeriods = buildFinancialRows({ facts, quarters, annualByFiscalYear, priorQuartersByFiscalYear })
    .filter((row) => row.revenue != null && row.grossProfit != null && row.operatingIncome != null);
  const periodById = new Map(financialPeriods.map((period) => [period.periodId, period]));

  const segmentFinancials = [];
  const productFinancials = [];
  const customerEndMarketSnapshots = [];
  const supplyChainSnapshots = [];
  const operatingMetricSnapshots = [];
  for (const period of financialPeriods) {
    const mix = segmentMixForEvent(period.asOfDate);
    const segmentRows = [
      ["Data Center", mix.dataCenter],
      ["Gaming", mix.gaming],
      ["Professional Visualization", mix.professionalVisualization],
      ["Automotive", mix.automotive],
      ["OEM / Other", mix.oemOther],
    ].map(([segment, share]) => {
      const revenue = period.revenue * share;
      return {
        id: `${TICKER}-${period.periodId}-${String(segment).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        ticker: TICKER,
        periodId: period.periodId,
        eventId: period.eventId,
        asOfDate: period.asOfDate,
        segment,
        taxonomy: "NVDA market-platform proxy",
        revenue,
        costOfRevenue: null,
        operatingExpenses: null,
        operatingIncome: null,
        operatingMargin: null,
        grossMargin: period.grossMargin,
        growth: null,
        sourceType: "research_only",
        notes: "Research-only platform allocation because SEC Companyfacts does not expose NVDA segment/platform dimensions in this local source.",
        rawJson: json({ proxyAllocation: true, mixShare: share, sourceBoundary: "not_official_actual" }),
      };
    });
    segmentFinancials.push(...segmentRows);
    const dataCenterRevenue = segmentRows.find((row) => row.segment === "Data Center")?.revenue ?? null;
    const gamingRevenue = segmentRows.find((row) => row.segment === "Gaming")?.revenue ?? null;
    const networkingShare = period.asOfDate >= "2023-05-01" ? 0.23 : period.asOfDate >= "2021-01-01" ? 0.14 : 0.08;
    const networkingRevenue = dataCenterRevenue != null ? dataCenterRevenue * networkingShare : null;
    const computeRevenue = dataCenterRevenue != null && networkingRevenue != null ? dataCenterRevenue - networkingRevenue : null;
    const productRows = [
      {
        productLine: period.asOfDate >= "2024-03-18" ? "Blackwell / GB200 transition" : period.asOfDate >= "2022-03-01" ? "Hopper H100 / H200" : period.asOfDate >= "2020-05-01" ? "Ampere A100" : "Pre-Ampere accelerators",
        architecture: productCyclePhase(period.asOfDate),
        revenue: computeRevenue,
      },
      {
        productLine: "Networking / InfiniBand / Ethernet systems",
        architecture: period.asOfDate >= "2023-05-01" ? "AI cluster networking attach" : "Data-center networking attach proxy",
        revenue: networkingRevenue,
      },
      {
        productLine: "Gaming GPUs",
        architecture: period.asOfDate >= "2022-09-01" ? "Gaming normalization after channel correction" : "Gaming GPU cycle",
        revenue: gamingRevenue,
      },
    ];
    productFinancials.push(...productRows.map((row) => ({
      id: `${TICKER}-${period.periodId}-${row.productLine.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      productLine: row.productLine,
      architecture: row.architecture,
      revenue: row.revenue,
      revenueGrowth: null,
      grossMargin: period.grossMargin,
      sourceType: "research_only",
      notes: "Research-only product-cycle bridge for frontend debate framing; not an official product revenue disclosure.",
      rawJson: json({ proxyAllocation: true, sourceBoundary: "not_official_actual" }),
    })));

    const customer = buildCustomerCommentary(period.asOfDate);
    customerEndMarketSnapshots.push({
      id: `${TICKER}-${period.periodId}-customers`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      hyperscalerMix: period.asOfDate >= "2023-05-01" ? 0.55 : null,
      ...customer,
      sourceType: "research_only",
      notes: "Dated research-only end-market framing. No current hyperscaler scale is applied before it was knowable.",
      rawJson: json({ sourceBoundary: "research_only", productCyclePhase: productCyclePhase(period.asOfDate) }),
    });

    const supply = buildSupplyCommentary(period.asOfDate);
    supplyChainSnapshots.push({
      id: `${TICKER}-${period.periodId}-supply`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      ...supply,
      inventoryPurchaseObligations: period.inventoryPurchaseObligations,
      sourceType: "research_only",
      notes: "Dated research-only supply-chain framework; official balance-sheet inventory and purchase obligations remain in financial_periods when available.",
      rawJson: json({ sourceBoundary: "research_only", productCyclePhase: productCyclePhase(period.asOfDate) }),
    });

    operatingMetricSnapshots.push({
      id: `${TICKER}-${period.periodId}-metrics`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      sourceType: "research_only",
      revenue: period.revenue,
      dataCenterRevenue,
      gamingRevenue,
      professionalVisualizationRevenue: segmentRows.find((row) => row.segment === "Professional Visualization")?.revenue ?? null,
      automotiveRevenue: segmentRows.find((row) => row.segment === "Automotive")?.revenue ?? null,
      oemOtherRevenue: segmentRows.find((row) => row.segment === "OEM / Other")?.revenue ?? null,
      networkingRevenue,
      computeRevenue,
      dataCenterGrowth: null,
      gamingGrowth: null,
      grossMargin: period.grossMargin,
      operatingMargin: period.operatingMargin,
      inventory: period.inventory,
      accountsReceivable: period.accountsReceivable,
      deferredRevenue: period.deferredRevenue,
      remainingPerformanceObligation: period.remainingPerformanceObligation,
      fcfConversion: period.netIncome ? period.freeCashFlow / period.netIncome : null,
      revenueGuidanceMidpoint: null,
      grossMarginGuidanceMidpoint: null,
      productCyclePhase: productCyclePhase(period.asOfDate),
      acceleratorMoatScore: period.asOfDate >= "2023-05-01" ? 8.5 : 7.0,
      chinaRiskScore: period.asOfDate >= "2022-09-01" ? 6.5 : 2.0,
      supplyConstraintScore: period.asOfDate >= "2023-05-01" ? 7.5 : 3.5,
      notes: "Research-only platform/product metrics are derived from consolidated SEC actuals and dated mix heuristics.",
      rawJson: json({ sourceBoundary: "research_only", notOfficialSegmentActuals: true }),
    });
  }

  for (const row of operatingMetricSnapshots) {
    const [fyPart, qPart] = row.periodId.split("-");
    const fiscalYear = Number(`20${fyPart.slice(2)}`);
    const priorPeriod = `${`fy${String(fiscalYear - 1).slice(2)}`}-${qPart}`;
    const prior = operatingMetricSnapshots.find((candidate) => candidate.periodId === priorPeriod);
    if (prior?.dataCenterRevenue && row.dataCenterRevenue) row.dataCenterGrowth = row.dataCenterRevenue / prior.dataCenterRevenue - 1;
    if (prior?.gamingRevenue && row.gamingRevenue) row.gamingGrowth = row.gamingRevenue / prior.gamingRevenue - 1;
  }
  for (const row of segmentFinancials) {
    const metric = operatingMetricSnapshots.find((candidate) => candidate.periodId === row.periodId);
    if (row.segment === "Data Center") row.growth = metric?.dataCenterGrowth ?? null;
    if (row.segment === "Gaming") row.growth = metric?.gamingGrowth ?? null;
  }
  for (const row of productFinancials) {
    const metric = operatingMetricSnapshots.find((candidate) => candidate.periodId === row.periodId);
    if (row.productLine.includes("Networking")) row.revenueGrowth = metric?.dataCenterGrowth ?? null;
    if (row.productLine.includes("Gaming")) row.revenueGrowth = metric?.gamingGrowth ?? null;
  }

  const latestPeriod = financialPeriods[financialPeriods.length - 1];
  const marketSnapshots = latestPeriod ? [{
    id: `${TICKER}-${latestPeriod.asOfDate}-market-placeholder`,
    ticker: TICKER,
    asOfDate: latestPeriod.asOfDate,
    priceDate: null,
    currentPrice: null,
    currency: "USD",
    marketCap: null,
    enterpriseValue: null,
    sharesOutstanding: latestPeriod.dilutedShares,
    previousClose: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: null,
    beta: null,
    source: "Seed placeholder; daily_price_bars supplies valuation/backtest price anchors",
    sourceType: "market_data_placeholder",
    fetchedAt: createdAt,
    rawJson: json({ sourceBoundary: "price imported separately by modules/nvda/market/importDailyPrices.mjs" }),
  }] : [];

  const peerSnapshots = ["AMD", "AVGO", "TSM", "INTC", "QCOM"].map((peerTicker) => ({
    id: `${TICKER}-${peerTicker}-peer-context`,
    ticker: TICKER,
    asOfDate: latestPeriod?.asOfDate ?? CURRENT_DATE,
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: peerTicker === "AMD" ? "AI accelerator competitor" : peerTicker === "TSM" ? "foundry / supply-chain partner" : "semiconductor peer",
    peerGroup: "AI infrastructure semiconductors",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: null,
    forwardPe: null,
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: peerTicker === "TSM" ? "TWD/USD ADR context" : "USD",
    source: "Research-only peer context",
    fetchedAt: createdAt,
    confidenceLevel: "low",
    absoluteValueUse: "metadata_only_peer_context_no_absolute_value_aggregation",
    rawJson: json({ sourceBoundary: "research_only" }),
  }));

  const assumptionSets = [];
  for (const period of financialPeriods) {
    const ttm = buildTtmRows(financialPeriods, period);
    for (const scenario of ["Bear", "Base", "Bull"]) {
      assumptionSets.push({
        id: `nvda-${scenario.toLowerCase()}-${NVDA_BACKEND_MODEL_VERSION.version}-${period.eventId}`,
        ticker: TICKER,
        name: `NVDA ${scenario} assumptions as of ${period.asOfDate}`,
        scenario,
        modelVersion: NVDA_BACKEND_MODEL_VERSION.version,
        asOfDate: period.asOfDate,
        assumptionsJson: json(scenarioAssumptions(period, scenario, ttm)),
        sourceType: "forecast_assumption",
        createdAt,
      });
    }
  }

  const sourceDocuments = [
    {
      id: "nvda-sec-companyfacts",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "SEC Companyfacts CIK0001045810",
      sourcePath: path.relative(process.cwd(), COMPANYFACTS_PATH),
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json",
      retrievedAt: createdAt,
      publishedDate: null,
      provenance: "SEC public data API",
      confidence: "high",
      checksum: null,
      metadataJson: json({ role: "consolidated financial actuals" }),
    },
    {
      id: "nvda-sec-submissions",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "SEC Submissions CIK0001045810",
      sourcePath: path.relative(process.cwd(), SUBMISSIONS_PATH),
      sourceUrl: "https://data.sec.gov/submissions/CIK0001045810.json",
      retrievedAt: createdAt,
      publishedDate: null,
      provenance: "SEC public data API",
      confidence: "high",
      checksum: null,
      metadataJson: json({ role: "filing dates and source URLs" }),
    },
  ];

  const modelVersions = [{
    id: NVDA_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: NVDA_BACKEND_MODEL_VERSION.version,
    name: NVDA_BACKEND_MODEL_VERSION.name,
    description: NVDA_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(NVDA_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(NVDA_BACKEND_MODEL_VERSION.assumptionSchema),
    createdAt,
  }];

  const validationWarnings = [
    {
      id: "nvda-segment-source-boundary",
      ticker: TICKER,
      scope: "seed",
      severity: "medium",
      title: "NVDA segment/product rows are research-only until official platform tables are imported",
      detail: "SEC Companyfacts provides consolidated actuals in this local seed. Platform/product rows are dated analytical proxies and are not marked official_actual.",
      relatedTable: "segment_financials",
      relatedRecordId: null,
      createdAt,
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    productFinancials,
    customerEndMarketSnapshots,
    supplyChainSnapshots,
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

export async function buildNvdaBackendSeedPayload() {
  const companyfacts = readJson(COMPANYFACTS_PATH);
  const submissions = readJson(SUBMISSIONS_PATH);
  return buildSeedPayloadFromSec({ companyfacts, submissions });
}
