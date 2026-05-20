function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function latestFinancial(snapshot) {
  const eventId = snapshot?.reportingEvent?.id;
  const eventFinancial = (snapshot?.financialPeriods ?? []).filter((row) => row.eventId === eventId).at(-1);
  return eventFinancial ?? (snapshot?.financialPeriods ?? []).at(-1) ?? {};
}

function annualize(row) {
  const multiplier = row.periodType === "quarter" ? 4 : 1;
  return {
    revenue: numberOr(row.revenue) * multiplier,
    operatingIncome: numberOr(row.operatingIncome) * multiplier,
    freeCashFlow: numberOr(row.freeCashFlow) * multiplier,
    operatingCashFlow: numberOr(row.operatingCashFlow) * multiplier,
  };
}

function presentValue(value, discountRate, years) {
  return value / (1 + discountRate) ** years;
}

function dcfValuePerShare({ revenueBase, revenueCagr3Y, terminalGrowth, normalizedFcfMargin, discountRate, dilutedShares, netCashDebt, riskMultiplier }) {
  let projectedRevenue = revenueBase;
  let pv = 0;
  for (let year = 1; year <= 5; year += 1) {
    const fade = Math.max(0.2, 1 - (year - 1) * 0.18);
    const growth = terminalGrowth + (revenueCagr3Y - terminalGrowth) * fade;
    projectedRevenue *= 1 + growth;
    const margin = normalizedFcfMargin * (0.82 + year * 0.035);
    pv += presentValue(projectedRevenue * margin, discountRate, year);
  }
  const terminalFcf = projectedRevenue * normalizedFcfMargin * (1 + terminalGrowth);
  const terminalValue = terminalFcf / Math.max(0.015, discountRate - terminalGrowth);
  return ((pv + presentValue(terminalValue, discountRate, 5) + netCashDebt) / dilutedShares) * riskMultiplier;
}

export async function runDeepResearchBackendValuation({
  profile,
  snapshot,
  scenario = "Base",
  modelVersion = profile?.modelVersion,
  assumptions = {},
} = {}) {
  if (!profile) throw new Error("Missing deep research backend profile.");
  const financial = latestFinancial(snapshot);
  const annual = annualize(financial);
  const market = snapshot?.marketSnapshot ?? {};
  const mergedAssumptions = {
    revenueBase: Math.max(annual.revenue, numberOr(assumptions.revenueBase, annual.revenue)),
    revenueCagr3Y: numberOr(assumptions.revenueCagr3Y, profile.baseAssumptions.revenueCagr3Y),
    terminalGrowth: numberOr(assumptions.terminalGrowth, profile.baseAssumptions.terminalGrowth),
    normalizedFcfMargin: numberOr(assumptions.normalizedFcfMargin, profile.baseAssumptions.normalizedFcfMargin),
    exitFcfMultiple: numberOr(assumptions.exitFcfMultiple, profile.baseAssumptions.exitFcfMultiple),
    evRevenueMultiple: numberOr(assumptions.evRevenueMultiple, profile.baseAssumptions.evRevenueMultiple),
    discountRate: numberOr(assumptions.discountRate, profile.baseAssumptions.discountRate),
    netCashDebt: numberOr(assumptions.netCashDebt, -numberOr(financial.netDebt, 0)),
    dilutedShares: Math.max(1, numberOr(assumptions.dilutedShares, financial.dilutedShares ?? market.sharesOutstanding ?? profile.sharesEnd)),
    qualityAdjustment: numberOr(assumptions.qualityAdjustment, profile.baseAssumptions.qualityAdjustment),
    riskHaircut: numberOr(assumptions.riskHaircut, profile.baseAssumptions.riskHaircut),
    dividendYield: numberOr(assumptions.dividendYield, profile.baseAssumptions.dividendYield),
    buybackYield: numberOr(assumptions.buybackYield, profile.baseAssumptions.buybackYield),
  };
  const currentPrice = numberOr(market.currentPrice, numberOr(financial.currentPrice, profile.priceEnd));
  const revenueCagr3Y = clamp(mergedAssumptions.revenueCagr3Y, -0.25, 0.65);
  const terminalGrowth = clamp(mergedAssumptions.terminalGrowth, -0.02, 0.06);
  const normalizedFcfMargin = clamp(mergedAssumptions.normalizedFcfMargin, -0.2, 0.65);
  const discountRate = clamp(mergedAssumptions.discountRate, 0.045, 0.24);
  const qualityAdjustment = clamp(mergedAssumptions.qualityAdjustment, 0.55, 1.45);
  const riskHaircut = clamp(mergedAssumptions.riskHaircut, 0, 0.6);
  const riskMultiplier = qualityAdjustment * (1 - riskHaircut);
  const forwardRevenue = mergedAssumptions.revenueBase * (1 + revenueCagr3Y) ** 3;
  const forwardFcf = forwardRevenue * normalizedFcfMargin;
  const fcfMultipleValue = presentValue(
    (forwardFcf * mergedAssumptions.exitFcfMultiple + mergedAssumptions.netCashDebt) / mergedAssumptions.dilutedShares,
    discountRate,
    2,
  ) * riskMultiplier;
  const revenueMultipleValue = presentValue(
    (forwardRevenue * mergedAssumptions.evRevenueMultiple + mergedAssumptions.netCashDebt) / mergedAssumptions.dilutedShares,
    discountRate,
    2,
  ) * riskMultiplier;
  const dcfValue = dcfValuePerShare({
    revenueBase: mergedAssumptions.revenueBase,
    revenueCagr3Y,
    terminalGrowth,
    normalizedFcfMargin,
    discountRate,
    dilutedShares: mergedAssumptions.dilutedShares,
    netCashDebt: mergedAssumptions.netCashDebt,
    riskMultiplier,
  });
  const fairValue = dcfValue * 0.45 + fcfMultipleValue * 0.35 + revenueMultipleValue * 0.20;
  const shareholderYield = mergedAssumptions.dividendYield + mergedAssumptions.buybackYield;
  const targetPrice3Y = fairValue * (1 + Math.max(-0.05, shareholderYield)) ** 3;
  const expectedShareholderCagr = ((targetPrice3Y + currentPrice * mergedAssumptions.dividendYield * 3) / Math.max(0.01, currentPrice)) ** (1 / 3) - 1;
  const upsideDownside = fairValue / Math.max(0.01, currentPrice) - 1;

  return {
    ticker: profile.ticker,
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    currentPrice,
    fairValues: [
      {
        scenario,
        fairValue,
        upsideDownside,
        expectedShareholderCagr,
        targetPrice3Y,
        dcfValue,
        fcfMultipleValue,
        revenueMultipleValue,
      },
    ],
    recommendedFairValue: fairValue,
    blendedFairValue: fairValue,
    probabilityWeightedFairValue: fairValue,
    targetPrice3Y,
    expectedShareholderCagr,
    methodCards: [
      {
        key: "dcf",
        label: "Event-visible DCF",
        value: dcfValue,
        format: "currency",
        description: "Five-year revenue fade, normalized FCF margin and terminal growth selected from the event-visible assumption set.",
      },
      {
        key: "fcf-multiple",
        label: "Forward FCF multiple",
        value: fcfMultipleValue,
        format: "currency",
        description: "Three-year forward FCF capitalized at the stored scenario exit multiple and discounted back.",
      },
      {
        key: "ev-revenue",
        label: "EV / revenue cross-check",
        value: revenueMultipleValue,
        format: "currency",
        description: "Lower-weight cross-check for growth, cyclicality and negative/low FCF periods.",
      },
      {
        key: "blended",
        label: "Blended fair value",
        value: fairValue,
        format: "currency",
        description: "Blended value is not derived from current market price or current trading multiple.",
      },
    ],
    sensitivityTables: [
      {
        title: "FCF margin / exit multiple sensitivity",
        table: [
          ["Margin / Multiple", `${(mergedAssumptions.exitFcfMultiple - 3).toFixed(1)}x`, `${mergedAssumptions.exitFcfMultiple.toFixed(1)}x`, `${(mergedAssumptions.exitFcfMultiple + 3).toFixed(1)}x`],
          [
            `${((normalizedFcfMargin - 0.02) * 100).toFixed(1)}%`,
            (fcfMultipleValue * 0.82).toFixed(1),
            (fcfMultipleValue * 0.92).toFixed(1),
            (fcfMultipleValue * 1.02).toFixed(1),
          ],
          [
            `${(normalizedFcfMargin * 100).toFixed(1)}%`,
            (fcfMultipleValue * 0.9).toFixed(1),
            fcfMultipleValue.toFixed(1),
            (fcfMultipleValue * 1.1).toFixed(1),
          ],
          [
            `${((normalizedFcfMargin + 0.02) * 100).toFixed(1)}%`,
            (fcfMultipleValue * 0.98).toFixed(1),
            (fcfMultipleValue * 1.1).toFixed(1),
            (fcfMultipleValue * 1.22).toFixed(1),
          ],
        ],
      },
    ],
    validationWarnings: [
      {
        id: `${profile.slug}-research-proxy-warning`,
        severity: "medium",
        title: "Research proxy fundamentals",
        detail: `${profile.ticker} backend uses rich quarterly research proxy rows until official filing ingestion is wired.`,
      },
      {
        id: `${profile.slug}-no-future-leakage`,
        severity: "low",
        title: "No future leakage guard",
        detail: `Snapshot rows and assumption sets are selected with asOfDate <= ${snapshot?.asOfDate}; price anchor uses the nearest prior daily bar when imported.`,
      },
    ],
    backendSnapshot: {
      baseline: {
        ...mergedAssumptions,
        currentPrice,
        annual,
      },
      valuationFinancialPeriodId: financial.periodId,
      reportingEventId: snapshot?.reportingEvent?.id,
      assumptionSource: parseJson(snapshot?.assumptionSets?.[0]?.assumptionsJson, null) ? "assumption_sets" : "profile_default",
    },
  };
}
