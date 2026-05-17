import type { ValidationWarning } from "../types";
import type {
  IsrgDataLayer,
  IsrgForecastYear,
  IsrgReverseDcf,
  IsrgSegmentQualityScore,
  IsrgValuationAssumptions,
  IsrgValuationMethod,
} from "./model";
import { latestFullYear, metricValue, priorFullYear, safeDivide } from "./utils";

function normalizeWeights(assumptions: IsrgValuationAssumptions) {
  const raw = {
    procedureDcf: Math.max(assumptions.weightProcedureDcf, 0),
    segment: Math.max(assumptions.weightSegment, 0),
    pe: Math.max(assumptions.weightPe, 0),
    fcfYield: Math.max(assumptions.weightFcfYield, 0),
  };
  const total = raw.procedureDcf + raw.segment + raw.pe + raw.fcfYield || 1;
  return {
    procedureDcf: raw.procedureDcf / total,
    segment: raw.segment / total,
    pe: raw.pe / total,
    fcfYield: raw.fcfYield / total,
  };
}

function baseUnitEconomics(data: IsrgDataLayer) {
  const fy = latestFullYear(data);
  const priorFy = priorFullYear(data, fy);
  const procedures = metricValue(fy.procedures.worldwideDaVinciProcedures);
  const installedBase = metricValue(fy.installedBase.daVinciInstalledBase);
  const priorInstalledBase = metricValue(priorFy?.installedBase.daVinciInstalledBase);
  const avgInstalledBase = priorInstalledBase ? (installedBase + priorInstalledBase) / 2 : installedBase;
  return {
    fy,
    procedures,
    installedBase,
    proceduresPerSystem: safeDivide(procedures, avgInstalledBase),
    revenuePerProcedure: safeDivide(metricValue(fy.revenue.instrumentsAccessories), procedures),
    systemPlacements: metricValue(fy.placements.daVinciPlacements),
    systemAsp: safeDivide(metricValue(fy.revenue.systems), metricValue(fy.placements.daVinciPlacements)),
    serviceRevenuePerSystem: safeDivide(metricValue(fy.revenue.services), installedBase),
    baseRevenue: metricValue(fy.revenue.total),
    baseOperatingIncome: metricValue(fy.operatingIncome),
    baseDilutedEps: metricValue(fy.dilutedEps),
  };
}

function adjustedMargin(assumptions: IsrgValuationAssumptions) {
  return Math.max(0.12, assumptions.fcfMargin - assumptions.tariffGrossMarginDrag - assumptions.marginCompression * 0.5);
}

function runProcedureDcf(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions) {
  const base = baseUnitEconomics(data);
  const rows: IsrgForecastYear[] = [];
  let installedBase = assumptions.baseDaVinciInstalledBase || base.installedBase;
  let proceduresPerSystem = base.proceduresPerSystem;
  let revenuePerProcedure = base.revenuePerProcedure;
  let systemPlacements = base.systemPlacements;
  let systemAsp = base.systemAsp;
  let serviceRevenuePerSystem = base.serviceRevenuePerSystem;
  const fcfMargin = adjustedMargin(assumptions);
  const aspGrowth = assumptions.systemAspGrowth - assumptions.competitionAspPressure;
  const placementGrowth = assumptions.systemPlacementCagr + assumptions.daVinci5ReplacementCycleUplift * 0.35;
  const impliedUtilizationFromProcedureGrowth = assumptions.procedureCagr - assumptions.installedBaseCagr;
  const realizedUtilizationGrowth = Math.max(
    -0.04,
    assumptions.utilizationGrowth * 0.65 + impliedUtilizationFromProcedureGrowth * 0.35,
  );

  for (let i = 1; i <= 10; i += 1) {
    const year = base.fy.fiscalYear + i;
    installedBase *= 1 + assumptions.installedBaseCagr;
    proceduresPerSystem *= 1 + realizedUtilizationGrowth;
    revenuePerProcedure *= 1 + assumptions.revenuePerProcedureGrowth;
    systemPlacements *= 1 + placementGrowth;
    systemAsp *= 1 + aspGrowth;
    serviceRevenuePerSystem *= 1 + assumptions.serviceRevenuePerSystemGrowth;
    const daVinciProcedures = installedBase * proceduresPerSystem;
    const instrumentsAccessoriesRevenue = Math.max(daVinciProcedures * revenuePerProcedure, 0);
    const systemsRevenue = Math.max(systemPlacements * systemAsp, 0);
    const servicesRevenue = Math.max(installedBase * serviceRevenuePerSystem, 0);
    const totalRevenue = instrumentsAccessoriesRevenue + systemsRevenue + servicesRevenue;
    const operatingIncome = totalRevenue * Math.max(0.1, assumptions.operatingMargin - assumptions.marginCompression);
    const freeCashFlow = totalRevenue * fcfMargin;
    const discountFactor = 1 / (1 + assumptions.wacc) ** i;
    rows.push({
      year,
      installedBase,
      proceduresPerSystem,
      daVinciProcedures,
      revenuePerProcedure,
      instrumentsAccessoriesRevenue,
      systemPlacements,
      systemAsp,
      systemsRevenue,
      serviceRevenuePerSystem,
      servicesRevenue,
      totalRevenue,
      operatingIncome,
      freeCashFlow,
      discountFactor,
      presentValueFcf: freeCashFlow * discountFactor,
    });
  }

  const terminalGrowth = Math.min(assumptions.terminalGrowth, assumptions.wacc - 0.01);
  const finalFcf = rows[rows.length - 1]?.freeCashFlow ?? 0;
  const terminalValue = (finalFcf * (1 + terminalGrowth)) / Math.max(assumptions.wacc - terminalGrowth, 0.01);
  const terminalPresentValue = terminalValue / (1 + assumptions.wacc) ** rows.length;
  const enterpriseValue = rows.reduce((sum, row) => sum + row.presentValueFcf, 0) + terminalPresentValue;
  const equityValue = enterpriseValue + assumptions.netCash;
  const fairValue = safeDivide(equityValue, assumptions.dilutedShares);
  return {
    rows,
    terminalGrowth,
    terminalValue,
    terminalPresentValue,
    enterpriseValue,
    equityValue,
    fairValue,
    formula:
      "Revenue = Installed Base x Procedures/System x Revenue/Procedure + System Placements x ASP + Service Revenue/System x Installed Base.",
  };
}

function optionalityValue(assumptions: IsrgValuationAssumptions) {
  const ionGross = assumptions.ionRevenueRamp * 8 * assumptions.ionProbability;
  const spGross = assumptions.spRevenueRamp * 7 * assumptions.spProbability;
  const gross = ionGross + spGross;
  const value = gross * (1 - assumptions.optionalityDeduplicationHaircut);
  return {
    ionGross,
    spGross,
    gross,
    deDuplicationHaircut: assumptions.optionalityDeduplicationHaircut,
    value,
    valuePerShare: safeDivide(value, assumptions.dilutedShares),
  };
}

function segmentQualityScores(): IsrgSegmentQualityScore[] {
  const build = (
    segment: IsrgSegmentQualityScore["segment"],
    revenueRecurrence: number,
    marginDurability: number,
    cyclicality: number,
    pricingPower: number,
    competitiveIntensity: number,
    dataConfidence: number,
  ): IsrgSegmentQualityScore => ({
    segment,
    revenueRecurrence,
    marginDurability,
    cyclicality,
    pricingPower,
    competitiveIntensity,
    dataConfidence,
    overall: (revenueRecurrence + marginDurability + cyclicality + pricingPower + competitiveIntensity + dataConfidence) / 6,
  });
  return [
    build("Instruments & Accessories", 92, 86, 82, 82, 72, 88),
    build("Systems", 45, 68, 52, 65, 58, 84),
    build("Services", 86, 80, 80, 74, 70, 88),
    build("Ion / SP Optionality", 35, 55, 45, 60, 52, 45),
  ];
}

function segmentValuation(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions) {
  const latest = latestFullYear(data);
  const iaForwardRevenue = metricValue(latest.revenue.instrumentsAccessories) * (1 + assumptions.procedureCagr + assumptions.revenuePerProcedureGrowth);
  const systemsForwardRevenue = metricValue(latest.revenue.systems) * (1 + assumptions.systemPlacementCagr + assumptions.systemAspGrowth - assumptions.competitionAspPressure);
  const servicesForwardRevenue =
    metricValue(latest.revenue.services) * (1 + assumptions.installedBaseCagr + assumptions.serviceRevenuePerSystemGrowth);
  const optionality = optionalityValue(assumptions);
  const components = [
    {
      segment: "Instruments & Accessories",
      forwardRevenue: iaForwardRevenue,
      multiple: assumptions.recurringRevenueMultiple,
      enterpriseValue: iaForwardRevenue * assumptions.recurringRevenueMultiple,
      quality: "High recurring-like procedure revenue.",
    },
    {
      segment: "Systems",
      forwardRevenue: systemsForwardRevenue,
      multiple: assumptions.systemsRevenueMultiple,
      enterpriseValue: systemsForwardRevenue * assumptions.systemsRevenueMultiple,
      quality: "Placement-cycle and lease-mix affected revenue.",
    },
    {
      segment: "Services",
      forwardRevenue: servicesForwardRevenue,
      multiple: assumptions.servicesRevenueMultiple,
      enterpriseValue: servicesForwardRevenue * assumptions.servicesRevenueMultiple,
      quality: "Installed-base attached service revenue.",
    },
  ];
  const operatingEnterpriseValue = components.reduce((sum, item) => sum + item.enterpriseValue, 0);
  const enterpriseValue = operatingEnterpriseValue + optionality.value;
  const equityValue = enterpriseValue + assumptions.netCash;
  return {
    components,
    segmentQualityScores: segmentQualityScores(),
    optionality,
    operatingEnterpriseValue,
    enterpriseValue,
    equityValue,
    fairValue: safeDivide(equityValue, assumptions.dilutedShares),
    note:
      "Ion/SP optionality is separate, probability-weighted, and haircut for de-duplication. It is not capitalized as full TAM.",
  };
}

function peValue(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions) {
  const fy = latestFullYear(data);
  const forwardRevenue = metricValue(fy.revenue.total) * (1 + assumptions.procedureCagr + 0.35 * assumptions.installedBaseCagr);
  const forwardNetIncome = forwardRevenue * Math.max(0.1, assumptions.operatingMargin - assumptions.marginCompression) * (1 - assumptions.taxRate);
  const eps = safeDivide(forwardNetIncome, assumptions.dilutedShares);
  return {
    eps,
    fairValue: eps * assumptions.targetPe,
  };
}

function fcfYieldValue(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions) {
  const fy = latestFullYear(data);
  const forwardRevenue = metricValue(fy.revenue.total) * (1 + assumptions.procedureCagr + 0.35 * assumptions.installedBaseCagr);
  const fcfPerShare = safeDivide(forwardRevenue * adjustedMargin(assumptions), assumptions.dilutedShares);
  return {
    fcfPerShare,
    fairValue: safeDivide(fcfPerShare, assumptions.targetFcfYield),
  };
}

function solveForTarget(
  data: IsrgDataLayer,
  assumptions: IsrgValuationAssumptions,
  key: keyof IsrgValuationAssumptions,
  min: number,
  max: number,
) {
  let low = min;
  let high = max;
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2;
    const next = { ...assumptions, [key]: mid };
    const value = runProcedureDcf(data, next).fairValue;
    if (value < assumptions.currentPrice) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function reverseDcf(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions): IsrgReverseDcf {
  return {
    requiredProcedureCagr: solveForTarget(data, assumptions, "procedureCagr", 0.02, 0.24),
    requiredUtilizationGrowth: solveForTarget(data, assumptions, "utilizationGrowth", -0.03, 0.08),
    requiredOperatingMargin: solveForTarget(data, assumptions, "fcfMargin", 0.16, 0.4),
    notes: [
      "Reverse DCF solves only the procedure-based DCF leg, not the segment/multiple blend.",
      "If required procedure CAGR is meaningfully above guidance, the market is pricing stronger long-run execution than official near-term guide.",
      "If da Vinci 5 is only replacement, required utilization growth is the variable to stress first.",
    ],
  };
}

function methodCards(
  dcf: ReturnType<typeof runProcedureDcf>,
  segment: ReturnType<typeof segmentValuation>,
  pe: ReturnType<typeof peValue>,
  fcfYield: ReturnType<typeof fcfYieldValue>,
): IsrgValuationMethod[] {
  return [
    {
      key: "procedure-dcf",
      label: "Procedure-Based DCF",
      fairValue: dcf.fairValue,
      enterpriseValue: dcf.enterpriseValue,
      description: "Core da Vinci platform DCF built from installed base, utilization, revenue per procedure, placements, ASP, and services.",
    },
    {
      key: "segment-valuation",
      label: "Segment-Based Valuation",
      fairValue: segment.fairValue,
      enterpriseValue: segment.enterpriseValue,
      description: "Separate values for I&A recurring revenue, systems, services, and haircut Ion/SP optionality.",
    },
    {
      key: "pe-sanity",
      label: "Forward P/E Check",
      fairValue: pe.fairValue,
      description: "Forward EPS multiplied by target P/E. Used as sanity check only.",
    },
    {
      key: "fcf-yield-sanity",
      label: "FCF Yield Check",
      fairValue: fcfYield.fairValue,
      description: "Forward FCF/share capitalized at target FCF yield. Used as sanity check only.",
    },
  ];
}

export function calculateIsrgValuationEngine(data: IsrgDataLayer, assumptions: IsrgValuationAssumptions) {
  const dcf = runProcedureDcf(data, assumptions);
  const segment = segmentValuation(data, assumptions);
  const pe = peValue(data, assumptions);
  const fcfYield = fcfYieldValue(data, assumptions);
  const weights = normalizeWeights(assumptions);
  const blendedFairValue =
    dcf.fairValue * weights.procedureDcf +
    segment.fairValue * weights.segment +
    pe.fairValue * weights.pe +
    fcfYield.fairValue * weights.fcfYield;
  const methods = methodCards(dcf, segment, pe, fcfYield);
  const reverse = reverseDcf(data, assumptions);
  const latestForwardRevenue = dcf.rows[0]?.totalRevenue ?? 0;
  const latestForwardEbit = latestForwardRevenue * Math.max(0.1, assumptions.operatingMargin - assumptions.marginCompression);

  const warnings: ValidationWarning[] = [];
  if (assumptions.terminalGrowth >= assumptions.wacc) {
    warnings.push({
      id: "isrg-terminal-growth-gte-wacc",
      title: "Terminal growth must be below WACC",
      detail: "DCF clamps terminal growth below WACC, but assumptions should be reviewed.",
      severity: "high",
    });
  }
  if (assumptions.optionalityDeduplicationHaircut < 0.25) {
    warnings.push({
      id: "isrg-optionality-haircut-too-low",
      title: "Optionality de-duplication haircut is too low",
      detail: "Ion/SP optionality may be double counted against the core revenue DCF.",
      severity: "high",
    });
  }
  if (reverse.requiredProcedureCagr > (data.officialGuidance[0]?.high ?? 0.155) + 0.04) {
    warnings.push({
      id: "isrg-market-implies-high-procedure-growth",
      title: "Current price requires procedure growth above guidance",
      detail: `Reverse DCF requires ${(reverse.requiredProcedureCagr * 100).toFixed(1)}% procedure CAGR versus latest guidance high of ${((data.officialGuidance[0]?.high ?? 0) * 100).toFixed(1)}%.`,
      severity: "medium",
    });
  }

  return {
    procedureDcf: dcf,
    segmentValuation: segment,
    multipleSanityCheck: {
      forwardPeFairValue: pe.fairValue,
      forwardEps: pe.eps,
      fcfYieldFairValue: fcfYield.fairValue,
      forwardFcfPerShare: fcfYield.fcfPerShare,
      impliedForwardPe: safeDivide(assumptions.currentPrice, pe.eps),
      impliedFcfYield: safeDivide(fcfYield.fcfPerShare, assumptions.currentPrice),
      impliedEvSales: safeDivide(data.marketData.enterpriseValue ?? 0, latestForwardRevenue),
      impliedEvEbit: safeDivide(data.marketData.enterpriseValue ?? 0, latestForwardEbit),
      peg: safeDivide(safeDivide(assumptions.currentPrice, pe.eps), assumptions.procedureCagr * 100),
      roicWaccSpread: Math.max(0, assumptions.operatingMargin * (1 - assumptions.taxRate) - assumptions.wacc),
      historicalValuationPercentile: null,
      note: "Market multiples are sanity checks; procedure DCF and segment valuation remain the primary underwriting lenses.",
    },
    methods,
    weights,
    selectedFairValue: blendedFairValue,
    recommendedFairValue: blendedFairValue,
    reverseDcf: reverse,
    warnings,
  };
}
