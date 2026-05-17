const DEFAULTS = {
  adrEquivalentShares: 5_186,
  netCashUsd: 55_000,
  revenueGrowth: 0.19,
  hpcGrowth: 0.32,
  advancedNodeMix: 0.70,
  operatingMargin: 0.55,
  normalizedFcfMargin: 0.34,
  capexIntensity: 0.36,
  targetFcfYield: 0.035,
  targetPe: 28,
  evEbitMultiple: 21,
  leadingEdgeRevenueMultiple: 11,
  matureNodeRevenueMultiple: 4,
  discountRate: 0.095,
  terminalGrowth: 0.035,
  customerConcentrationHaircut: 0.04,
  geopoliticsHaircut: 0.11,
  aiCycleHaircut: 0.05,
  localizationCostDrag: 0.025,
};

const SCENARIOS = {
  Bear: {
    revenueGrowth: 0.08,
    hpcGrowth: 0.15,
    normalizedFcfMargin: 0.24,
    capexIntensity: 0.42,
    targetFcfYield: 0.055,
    targetPe: 20,
    evEbitMultiple: 15,
    leadingEdgeRevenueMultiple: 7,
    matureNodeRevenueMultiple: 2.5,
    discountRate: 0.112,
    terminalGrowth: 0.025,
    customerConcentrationHaircut: 0.08,
    geopoliticsHaircut: 0.18,
    aiCycleHaircut: 0.14,
    localizationCostDrag: 0.045,
  },
  Base: {},
  Bull: {
    revenueGrowth: 0.27,
    hpcGrowth: 0.43,
    normalizedFcfMargin: 0.39,
    capexIntensity: 0.34,
    targetFcfYield: 0.029,
    targetPe: 34,
    evEbitMultiple: 26,
    leadingEdgeRevenueMultiple: 14,
    matureNodeRevenueMultiple: 5,
    discountRate: 0.087,
    terminalGrowth: 0.04,
    customerConcentrationHaircut: 0.03,
    geopoliticsHaircut: 0.08,
    aiCycleHaircut: 0.025,
    localizationCostDrag: 0.015,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function valuePerAdr(enterpriseValue, assumptions) {
  return assumptions.adrEquivalentShares ? (enterpriseValue + assumptions.netCashUsd) / assumptions.adrEquivalentShares : 0;
}

function dcfEnterpriseValue(revenueBase, assumptions) {
  let revenue = revenueBase;
  let presentValue = 0;
  for (let year = 1; year <= 6; year += 1) {
    const fade = Math.max(0.30, 1 - (year - 1) * 0.14);
    const growth = assumptions.terminalGrowth + (assumptions.revenueGrowth - assumptions.terminalGrowth) * fade;
    revenue *= 1 + growth;
    const marginDrag = Math.max(0, assumptions.capexIntensity - 0.34) * 0.20 + Math.max(0, assumptions.localizationCostDrag);
    const fcfMargin = clamp(assumptions.normalizedFcfMargin - marginDrag - Math.max(0, year - 3) * 0.006, 0.08, 0.48);
    presentValue += (revenue * fcfMargin) / (1 + assumptions.discountRate) ** year;
  }
  const terminalFcf = revenue * clamp(assumptions.normalizedFcfMargin - 0.015, 0.08, 0.46) * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.discountRate - assumptions.terminalGrowth, 0.025);
  return presentValue + terminalValue / (1 + assumptions.discountRate) ** 6;
}

export function calculateTsmBackendValuation({ financialPeriod, currentPrice, scenario = "Base", modelVersion }) {
  if (!financialPeriod) throw new Error("financialPeriod is required");
  const scenarioPreset = SCENARIOS[scenario] ?? SCENARIOS.Base;
  const sourceDiscipline = financialPeriod.rawJson?.sourceDiscipline;
  const proxyFields = Array.isArray(financialPeriod.rawJson?.proxyFields) ? financialPeriod.rawJson.proxyFields : [];
  const qRevenue = Number(financialPeriod.revenueUsd ?? 0);
  const revenueBase = Number(financialPeriod.guidanceRevenueNextQuarterUsd ?? 0) > 0
    ? Number(financialPeriod.guidanceRevenueNextQuarterUsd) * 4
    : qRevenue * 4;
  const hpcMix = Number(financialPeriod.hpcMix ?? 0.55);
  const advancedNodeMix = Number(financialPeriod.advancedNodeMix ?? 0.68);
  const capexIntensity = clamp(Number(financialPeriod.capexGuidanceUsd ?? 42_000) / Math.max(revenueBase, 1), 0.18, 0.55);
  const yoy = Number(financialPeriod.revenueGrowth ?? 0.25);
  const assumptions = {
    ...DEFAULTS,
    ...scenarioPreset,
    currentPrice,
    revenueGrowth: clamp((scenarioPreset.revenueGrowth ?? DEFAULTS.revenueGrowth) * 0.65 + yoy * 0.35, -0.05, 0.45),
    hpcGrowth: clamp((scenarioPreset.hpcGrowth ?? DEFAULTS.hpcGrowth) * 0.70 + hpcMix * 0.20, -0.05, 0.65),
    advancedNodeMix,
    operatingMargin: Number(financialPeriod.guidanceOperatingMarginNextQuarter ?? financialPeriod.operatingMargin ?? DEFAULTS.operatingMargin),
    capexIntensity,
  };
  const effectiveGrowth = clamp(
    assumptions.revenueGrowth * 0.58 +
      assumptions.hpcGrowth * 0.22 +
      (assumptions.advancedNodeMix - 0.60) * 0.16 -
      assumptions.aiCycleHaircut * 0.32,
    -0.05,
    0.42,
  );
  const normalizedRevenue = revenueBase * (1 + effectiveGrowth);
  const operatingMargin = clamp(
    assumptions.operatingMargin +
      (assumptions.advancedNodeMix - 0.68) * 0.12 -
      assumptions.localizationCostDrag -
      Math.max(0, assumptions.capexIntensity - 0.36) * 0.08,
    0.32,
    0.66,
  );
  const normalizedEbit = normalizedRevenue * operatingMargin;
  const normalizedNetIncome = normalizedEbit * 0.84;
  const fcfMargin = clamp(
    assumptions.normalizedFcfMargin +
      (operatingMargin - 0.52) * 0.25 -
      Math.max(0, assumptions.capexIntensity - 0.34) * 0.35,
    0.10,
    0.48,
  );
  const normalizedFcf = normalizedRevenue * fcfMargin;
  const riskMultiplier = clamp(
    1 - assumptions.customerConcentrationHaircut - assumptions.geopoliticsHaircut - assumptions.aiCycleHaircut,
    0.55,
    1.05,
  );
  const dcfFairValue = valuePerAdr(dcfEnterpriseValue(revenueBase, assumptions) * riskMultiplier, assumptions);
  const fcfYieldFairValue = valuePerAdr((normalizedFcf / assumptions.targetFcfYield) * riskMultiplier, assumptions);
  const peFairValue = ((normalizedNetIncome * assumptions.targetPe) * riskMultiplier + assumptions.netCashUsd) / assumptions.adrEquivalentShares;
  const evEbitFairValue = valuePerAdr((normalizedEbit * assumptions.evEbitMultiple) * riskMultiplier, assumptions);
  const leadingEdgeRevenue = normalizedRevenue * assumptions.advancedNodeMix;
  const matureRevenue = Math.max(0, normalizedRevenue - leadingEdgeRevenue);
  const sotpFairValue = valuePerAdr(
    (leadingEdgeRevenue * assumptions.leadingEdgeRevenueMultiple + matureRevenue * assumptions.matureNodeRevenueMultiple) * riskMultiplier,
    assumptions,
  );
  const fairValue =
    dcfFairValue * 0.30 +
    fcfYieldFairValue * 0.24 +
    peFairValue * 0.18 +
    evEbitFairValue * 0.14 +
    sotpFairValue * 0.14;
  const targetPrice3Y = fairValue * (1 + clamp(effectiveGrowth * 0.45, 0.015, 0.16)) ** 3;
  const expectedShareholderCagr = currentPrice ? ((targetPrice3Y + currentPrice * 0.012 * 3) / currentPrice) ** (1 / 3) - 1 : null;
  const upsideDownside = currentPrice ? fairValue / currentPrice - 1 : null;
  return {
    currentPrice,
    fairValue,
    targetPrice3Y,
    expectedShareholderCagr,
    upsideDownside,
    probabilityWeightedFairValue: fairValue,
    methodOutputsJson: [
      { key: "dcf", label: "DCF / FCFF", value: dcfFairValue, format: "currency", description: "Six-year FCFF fade from event-visible revenue, WACC and terminal growth." },
      { key: "fcf-yield", label: "FCF Yield", value: fcfYieldFairValue, format: "currency", description: "Normalized event-visible FCF capitalized at a scenario FCF yield." },
      { key: "pe", label: "P/E", value: peFairValue, format: "currency", description: "Normalized net income valued at a scenario P/E multiple." },
      { key: "ev-ebit", label: "EV / EBIT", value: evEbitFairValue, format: "currency", description: "Operating profit power valued at a foundry EV/EBIT multiple." },
      { key: "node-mix-sotp", label: "Node Mix SOTP", value: sotpFairValue, format: "currency", description: "Leading-edge and mature-node revenue pools capitalized separately." },
    ],
    sensitivityTablesJson: [
      {
        title: "Event-visible drivers",
        table: [
          ["Driver", "Value"],
          ["Revenue base", Math.round(revenueBase)],
          ["Effective growth", Number(effectiveGrowth.toFixed(4))],
          ["FCF margin", Number(fcfMargin.toFixed(4))],
          ["Risk multiplier", Number(riskMultiplier.toFixed(4))],
        ],
      },
    ],
    warningsJson: [
      {
        id: "tsm-event-visible-valuation",
        title: "Event-visible valuation",
        detail: "Historical valuation uses only the reporting event financial row, event guidance and nearest-prior ADR price.",
        severity: "low",
      },
      ...(proxyFields.length
        ? [
            {
              id: "tsm-proxy-operating-drivers",
              title: "Proxy operating drivers",
              detail:
                sourceDiscipline ??
                `The valuation uses proxy/research-only operating drivers for ${proxyFields.join(", ")} until full TSMC management-report tables are imported.`,
              severity: "medium",
            },
          ]
        : []),
    ],
    dataSnapshotJson: {
      modelVersion,
      financialPeriod,
      assumptions,
      revenueBase,
      effectiveGrowth,
      normalizedRevenue,
      operatingMargin,
      fcfMargin,
      riskMultiplier,
    },
  };
}
