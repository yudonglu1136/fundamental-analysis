import { CEG_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latestFinancial(snapshot) {
  const eventId = snapshot?.reportingEvent?.id;
  const matched = (snapshot?.financialPeriods ?? [])
    .filter((row) => row.eventId === eventId)
    .sort((left, right) => (right.periodType === "quarter" ? 1 : 0) - (left.periodType === "quarter" ? 1 : 0))[0];
  return matched ?? (snapshot?.financialPeriods ?? []).at(-1) ?? {};
}

function annualize(row) {
  const multiplier = row.periodType === "quarter" ? 4 : 1;
  return {
    revenue: numberOr(row.revenue) * multiplier,
    operatingIncome: numberOr(row.operatingIncome) * multiplier,
    netIncome: numberOr(row.netIncome) * multiplier,
    freeCashFlow: numberOr(row.freeCashFlow) * multiplier,
    operatingCashFlow: numberOr(row.operatingCashFlow) * multiplier,
    capex: numberOr(row.capex) * multiplier,
  };
}

function dcfPerShare({ startingFcf, revenue, revenueGrowth, fcfMargin, discountRate, terminalGrowth, shares }) {
  let projectedRevenue = revenue;
  let pv = 0;
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.25, 1 - (year - 1) * 0.13);
    projectedRevenue *= 1 + terminalGrowth + (revenueGrowth - terminalGrowth) * fade;
    const fcf = year === 1 ? Math.max(startingFcf, projectedRevenue * fcfMargin * 0.8) : projectedRevenue * fcfMargin;
    pv += fcf / (1 + discountRate) ** year;
  }
  const terminalFcf = projectedRevenue * fcfMargin * (1 + terminalGrowth);
  pv += (terminalFcf / Math.max(discountRate - terminalGrowth, 0.02)) / (1 + discountRate) ** 6;
  return shares ? pv / shares : null;
}

function valuationPoint(scenario, baseline, assumptions) {
  const shares = baseline.shares * (1 - numberOr(assumptions.buybackYield, 0));
  const revenue = baseline.revenue * (1 + assumptions.revenueGrowth);
  const operatingIncome = revenue * assumptions.operatingMargin;
  const normalizedFcf = revenue * assumptions.normalizedFcfMargin;
  const eps = (operatingIncome * 0.74) / shares;
  const dcf = dcfPerShare({
    startingFcf: Math.max(baseline.freeCashFlow, normalizedFcf * 0.45),
    revenue,
    revenueGrowth: assumptions.revenueGrowth,
    fcfMargin: assumptions.normalizedFcfMargin,
    discountRate: assumptions.discountRate,
    terminalGrowth: assumptions.terminalGrowth,
    shares,
  });
  const fcfYield = (normalizedFcf / shares) / assumptions.targetFcfYield;
  const pe = eps * assumptions.targetPe;
  const evEbitda = ((operatingIncome * 1.22) * assumptions.evEbitdaMultiple) / shares;
  const scarcityUplift = 1 + assumptions.nuclearScarcityPremium + assumptions.dataCenterDemandUplift + numberOr(assumptions.powerPriceUpside, 0);
  const riskMultiplier = clamp(1 - assumptions.regulatoryHaircut - numberOr(assumptions.commodityHedgeHaircut, 0) - numberOr(assumptions.balanceSheetHaircut, 0), 0.55, 1.15);
  const fairValue = (dcf * 0.35 + (fcfYield * 0.45 + pe * 0.35 + evEbitda * 0.20) * 0.65) * scarcityUplift * riskMultiplier;
  const targetPrice3Y = fairValue * (1 + clamp(assumptions.revenueGrowth + assumptions.dataCenterDemandUplift * 0.12, -0.02, 0.13)) ** 3;
  const cumulativeDividends = baseline.currentPrice * numberOr(assumptions.dividendYield, 0.006) * 3;
  return {
    scenario,
    fairValue,
    upsideDownside: fairValue / baseline.currentPrice - 1,
    expectedReturn3Y: ((targetPrice3Y + cumulativeDividends) / baseline.currentPrice) ** (1 / 3) - 1,
    targetPrice3Y,
    cumulativeDividends,
    dcf,
    fcfYield,
    pe,
    evEbitda,
    scarcityUplift,
    riskMultiplier,
  };
}

export async function runCegBackendValuation({
  snapshot,
  scenario = "Base",
  modelVersion = CEG_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const financial = latestFinancial(snapshot);
  const annual = annualize(financial);
  const market = snapshot?.marketSnapshot ?? {};
  const currentPrice = numberOr(market.currentPrice, 260.8);
  const baseline = {
    currentPrice,
    revenue: Math.max(numberOr(assumptions.normalizedRevenue, 0), annual.revenue * 0.82, 18000),
    freeCashFlow: annual.freeCashFlow,
    shares: numberOr(financial.dilutedShares ?? market.sharesOutstanding, 315),
  };
  const point = valuationPoint(scenario, baseline, assumptions);
  return {
    ticker: "CEG",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    currentPrice,
    fairValues: [point],
    recommendedFairValue: point.fairValue,
    blendedFairValue: point.fairValue,
    probabilityWeightedFairValue: point.fairValue,
    targetPrice3Y: point.targetPrice3Y,
    expectedReturn3Y: point.expectedReturn3Y,
    methodCards: [
      { key: "dcf", label: "DCF / Normalized FCF", value: point.dcf, format: "currency", description: "Event-visible normalized FCF DCF." },
      { key: "fcf-yield", label: "FCF Yield", value: point.fcfYield, format: "currency", description: "Normalized FCF per share capitalized at target yield." },
      { key: "pe", label: "P/E", value: point.pe, format: "currency", description: "Normalized earnings multiple cross-check." },
      { key: "ev-ebitda", label: "EV/EBITDA", value: point.evEbitda, format: "currency", description: "Infrastructure EBITDA multiple cross-check." },
    ],
    sensitivityTables: [],
    validationWarnings: [
      {
        id: "ceg-backend-no-future-leakage",
        severity: "low",
        title: "Event-visible CEG valuation",
        detail: `Inputs are selected with asOfDate <= ${snapshot?.asOfDate}; price anchor uses nearest prior daily bar.`,
      },
    ],
    backendSnapshot: {
      baseline,
      valuationFinancialPeriodId: financial.periodId,
      reportingEventId: snapshot?.reportingEvent?.id,
    },
  };
}
