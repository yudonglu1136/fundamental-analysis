const LSEG_TICKERS = new Set(["LSEG", "LSEG.L", "LSEGL"]);
const LSEG_OVERLAY_PERIOD_ID = "lseg-parent-economic-2026-08-28";

export const LSEG_PARENT_ECONOMIC_MODEL = Object.freeze({
  modelVersion: "lseg-parent-economic-fcfe-v1-2026-08-30",
  valuationDate: "2026-08-28",
  generatedAt: "2026-08-30T23:59:59.000Z",
  currency: "GBP",
  issuerReportedEquityFcfM: 2_700,
  parentEconomicFcfe2026M: 2_350,
  parentAttributionAdjustmentM: 350,
  annualFcfeM: Object.freeze([
    Object.freeze({ year: 2027, valueM: 2_590 }),
    Object.freeze({ year: 2028, valueM: 2_860 }),
    Object.freeze({ year: 2029, valueM: 3_150 }),
    Object.freeze({ year: 2030, valueM: 3_420 }),
    Object.freeze({ year: 2031, valueM: 3_700 })
  ]),
  costOfEquity: 0.09,
  terminalGrowth: 0.025,
  sharesM: 485.634019,
  adjustedEps2026: 4.803,
  epsMultiple: 20,
  sotpPerShare: 117.66,
  weights: Object.freeze({ dcf: 0.4, sotp: 0.3, adjustedEps: 0.3 }),
  riskReserveM: 850,
  targetGrowth: 0.07,
  sourceUrls: Object.freeze({
    h1Results: "https://www.lseg.com/en/media-centre/press-releases/2026/london-stock-exchange-group-plc-h1-2026-interim-results",
    consensus: "https://www.lseg.com/en/investor-relations/consensus"
  })
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isLseg(snapshot) {
  return LSEG_TICKERS.has(String(snapshot?.ticker || snapshot?.key || "").toUpperCase());
}

function hasNewerValuationNode(snapshot, valuationDate) {
  return (Array.isArray(snapshot?.history) ? snapshot.history : []).some((row) =>
    row?.periodId !== LSEG_OVERLAY_PERIOD_ID &&
    typeof row?.asOfDate === "string" &&
    row.asOfDate.slice(0, 10) > valuationDate
  );
}

function validateParentEconomicInputs({ annualFcfeM, costOfEquity, terminalGrowth, sharesM }) {
  if (!Array.isArray(annualFcfeM) || annualFcfeM.length !== 5) {
    throw new Error("LSEG parent-economic FCFE requires exactly five annual cash flows.");
  }
  if (!annualFcfeM.every((row) => Number.isInteger(row?.year) && finiteNumber(row?.valueM) > 0)) {
    throw new Error("LSEG parent-economic FCFE contains an invalid year or cash flow.");
  }
  if (!(finiteNumber(costOfEquity) > finiteNumber(terminalGrowth))) {
    throw new Error("LSEG cost of equity must exceed terminal growth.");
  }
  if (!(finiteNumber(sharesM) > 0)) {
    throw new Error("LSEG current shares must be positive.");
  }
}

export function buildParentEconomicFcfeDcf(model = LSEG_PARENT_ECONOMIC_MODEL) {
  const annualFcfeM = model.annualFcfeM;
  const costOfEquity = finiteNumber(model.costOfEquity);
  const terminalGrowth = finiteNumber(model.terminalGrowth);
  const sharesM = finiteNumber(model.sharesM);
  validateParentEconomicInputs({ annualFcfeM, costOfEquity, terminalGrowth, sharesM });

  const annualCashFlows = annualFcfeM.map((row, index) => {
    const discountYear = index + 1;
    const discountFactor = 1 / (1 + costOfEquity) ** discountYear;
    const presentValueM = row.valueM * discountFactor;
    return {
      year: row.year,
      discountYear,
      fcfM: row.valueM,
      discountFactor,
      presentValueM
    };
  });
  const explicitPresentValueM = annualCashFlows.reduce((sum, row) => sum + row.presentValueM, 0);
  const terminalFcfM = annualCashFlows.at(-1).fcfM;
  const terminalValueM = terminalFcfM * (1 + terminalGrowth) / (costOfEquity - terminalGrowth);
  const terminalPresentValueM = terminalValueM / (1 + costOfEquity) ** annualCashFlows.length;
  const equityValueM = explicitPresentValueM + terminalPresentValueM;
  const fairValue = equityValueM / sharesM;

  return {
    fairValue,
    equityValueM,
    explicitPresentValueM,
    terminalValueM,
    terminalPresentValueM,
    terminalValueShare: terminalPresentValueM / equityValueM,
    discountRate: costOfEquity,
    discountRateType: "levered_cost_of_equity",
    terminalGrowth,
    discountTiming: "year_end",
    ownershipBasis: "parent_common_equity",
    startingParentEconomicFcfeM: finiteNumber(model.parentEconomicFcfe2026M),
    issuerReportedEquityFcfM: finiteNumber(model.issuerReportedEquityFcfM),
    parentAttributionAdjustmentM: finiteNumber(model.parentAttributionAdjustmentM),
    sharesM,
    netDebtDeductedM: 0,
    nciDeductedM: 0,
    annualCashFlows
  };
}

export function buildLsegValuation(model = LSEG_PARENT_ECONOMIC_MODEL) {
  const dcf = buildParentEconomicFcfeDcf(model);
  const adjustedEpsValue = model.adjustedEps2026 * model.epsMultiple;
  const grossFairValue =
    dcf.fairValue * model.weights.dcf +
    model.sotpPerShare * model.weights.sotp +
    adjustedEpsValue * model.weights.adjustedEps;
  const riskReservePerShare = model.riskReserveM / model.sharesM;
  const fairValue = grossFairValue - riskReservePerShare;
  const parentFcfeCagr = (model.annualFcfeM.at(-1).valueM / model.parentEconomicFcfe2026M) **
    (1 / model.annualFcfeM.length) - 1;

  return {
    fairValue,
    grossFairValue,
    riskReservePerShare,
    adjustedEpsValue,
    sotpPerShare: model.sotpPerShare,
    targetPrice3Y: fairValue * (1 + model.targetGrowth) ** 3,
    parentFcfeCagr,
    dcf
  };
}

export function lsegDcfSensitivity({
  costOfEquity,
  terminalGrowth,
  model = LSEG_PARENT_ECONOMIC_MODEL
}) {
  return buildParentEconomicFcfeDcf({
    ...model,
    costOfEquity,
    terminalGrowth
  }).fairValue;
}

function pricePointAtOrBefore(snapshot, date) {
  return (Array.isArray(snapshot?.priceHistory) ? snapshot.priceHistory : [])
    .filter((point) => point?.date && String(point.date).slice(0, 10) <= date && finiteNumber(point.close) > 0)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function output(key, label, value, description, extra = {}) {
  return {
    key,
    label,
    value,
    format: "currency",
    currency: "GBP",
    description,
    ...extra
  };
}

function methodOutputs(valuation) {
  const model = LSEG_PARENT_ECONOMIC_MODEL;
  return [
    output(
      "lseg-risk-adjusted-blended",
      "Risk-adjusted fair value",
      valuation.fairValue,
      "40% parent-economic FCFE DCF, 30% operating SOTP and 30% adjusted-EPS cross-check, less the separately disclosed risk reserve."
    ),
    output(
      "lseg-parent-fcfe-dcf",
      "Parent-economic FCFE DCF",
      valuation.dcf.fairValue,
      "LSEG-parent cash flows only, discounted at 9.0% levered cost of equity with 2.5% terminal growth. Net debt and Tradeweb NCI are not deducted again.",
      { weight: model.weights.dcf }
    ),
    output(
      "lseg-operating-sotp",
      "Operating SOTP",
      valuation.sotpPerShare,
      "Analyst operating SOTP cross-check supplied for the 28 August 2026 model audit.",
      { weight: model.weights.sotp }
    ),
    output(
      "lseg-adjusted-eps-cross-check",
      "20x adjusted EPS",
      valuation.adjustedEpsValue,
      `2026E adjusted EPS £${model.adjustedEps2026.toFixed(3)} x ${model.epsMultiple.toFixed(0)}x.`,
      { weight: model.weights.adjustedEps }
    ),
    output(
      "lseg-risk-reserve",
      "CCP / cyber / regulatory reserve",
      -valuation.riskReservePerShare,
      `Subtracts a £${model.riskReserveM.toFixed(0)}m reserve, or £${valuation.riskReservePerShare.toFixed(2)} per current share, after method triangulation.`
    )
  ];
}

function assumptions(valuation) {
  const model = LSEG_PARENT_ECONOMIC_MODEL;
  return [
    {
      key: "lsegIssuerEquityFcf",
      label: "Issuer-reported 2026 EFCF",
      value: model.issuerReportedEquityFcfM,
      format: "number",
      category: "Cash flow",
      source: "LSEG H1 2026 guidance",
      description: "At least £2.7bn of consolidated equity free cash flow; retained separately from the analyst ownership adjustment."
    },
    {
      key: "lsegParentEconomicFcfe",
      label: "2026 parent-economic FCFE",
      value: model.parentEconomicFcfe2026M,
      format: "number",
      category: "Cash flow",
      source: "Analyst estimate dated 2026-08-28",
      description: "LSEG-parent economic cash flow after the Tradeweb and other non-controlling ownership adjustment; this is not an issuer-reported figure."
    },
    {
      key: "lsegCostOfEquity",
      label: "Cost of equity",
      value: model.costOfEquity,
      format: "percent",
      category: "DCF",
      source: "Analyst assumption",
      description: "Levered equity discount rate. No WACC and no separate net-debt deduction are used in the parent FCFE DCF."
    },
    {
      key: "lsegTerminalGrowth",
      label: "Terminal growth",
      value: model.terminalGrowth,
      format: "percent",
      category: "DCF",
      source: "Analyst assumption",
      description: "Gordon-growth terminal value at 2031 year-end."
    },
    {
      key: "lsegCurrentShares",
      label: "Current shares ex treasury",
      value: model.sharesM,
      format: "number",
      category: "Equity",
      source: "Analyst model input dated 2026-08-28",
      description: "Current ordinary shares outstanding, not the 497m H1 weighted-average EPS denominator."
    },
    {
      key: "lsegExplicitFcfe",
      label: "2027-2031 parent FCFE",
      value: valuation.dcf.annualCashFlows.at(-1).fcfM,
      format: "number",
      category: "DCF",
      source: "Analyst forecast",
      description: "Explicit annual cash flows: £2.59bn, £2.86bn, £3.15bn, £3.42bn and £3.70bn."
    }
  ];
}

function priorDcfValue(row) {
  return finiteNumber(
    (Array.isArray(row?.methodOutputs) ? row.methodOutputs : [])
      .find((item) => item?.key === "fcfe-dcf")?.value
  );
}

function buildOverlayRow(snapshot, valuation) {
  const model = LSEG_PARENT_ECONOMIC_MODEL;
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const prior = history
    .filter((row) => row?.periodId !== LSEG_OVERLAY_PERIOD_ID)
    .sort((left, right) => String(left?.asOfDate || "").localeCompare(String(right?.asOfDate || "")))
    .at(-1) || {};
  const selectedPricePoint = pricePointAtOrBefore(snapshot, model.valuationDate);
  const price = finiteNumber(selectedPricePoint?.close) ??
    finiteNumber(snapshot?.latest?.latestPrice) ??
    finiteNumber(prior?.priceAtDate ?? prior?.currentPrice);
  const targetPrice3Y = valuation.targetPrice3Y;
  const outputs = methodOutputs(valuation);
  const priorHeadlineFairValue = finiteNumber(prior?.fairValue ?? snapshot?.latest?.baseFairValue);
  const priorPlatformDcfFairValue = priorDcfValue(prior);

  return {
    ...prior,
    periodId: LSEG_OVERLAY_PERIOD_ID,
    runCreatedAt: model.generatedAt,
    label: "Analyst valuation · 2026-08-28",
    asOfDate: model.valuationDate,
    fiscalYear: 2026,
    fiscalQuarter: "Q2",
    eventType: "analyst_valuation_update",
    sourceType: "lseg_parent_economic_fcfe_overlay",
    sourceUrl: model.sourceUrls.h1Results,
    currentPrice: price,
    priceAtDate: price,
    priceDate: selectedPricePoint?.date || snapshot?.latest?.latestPriceDate || null,
    fairValue: valuation.fairValue,
    dcfFairValue: valuation.dcf.fairValue,
    grossFairValue: valuation.grossFairValue,
    valuationKind: "risk_adjusted_triangulation",
    upsideDownside: price && price > 0 ? valuation.fairValue / price - 1 : null,
    targetPrice3Y,
    expectedReturn3Y: price && price > 0 ? (targetPrice3Y / price) ** (1 / 3) - 1 : null,
    method: "LSEG Parent-economic FCFE + SOTP + Adjusted EPS",
    methodOutputs: outputs,
    warnings: [
      "The £2.35bn parent-economic FCFE and £117.66 SOTP are analyst estimates, not LSEG guidance.",
      "The platform headline is a risk-adjusted triangulation; the standalone parent-economic FCFE DCF is disclosed separately.",
      ...(Array.isArray(prior?.warnings) ? prior.warnings : [])
    ],
    dataSnapshot: {
      ...(prior?.dataSnapshot || {}),
      valuationDate: model.valuationDate,
      valuationSemantics: {
        ...(prior?.dataSnapshot?.valuationSemantics || {}),
        sourceType: "lseg_parent_economic_fcfe_overlay",
        modelVersion: model.modelVersion,
        priceExcludedFromFairValue: true,
        valuationKind: "risk_adjusted_triangulation",
        dcfFairValue: valuation.dcf.fairValue,
        grossFairValue: valuation.grossFairValue,
        riskAdjustedFairValue: valuation.fairValue,
        fairValueFormula: "40% parent-economic FCFE DCF + 30% operating SOTP + 30% 20x adjusted EPS, less £850m CCP/cyber/regulatory reserve; no market price input",
        scoreInputs: {
          profile: "lseg_market_infrastructure",
          ownershipBasis: valuation.dcf.ownershipBasis,
          valuationKind: "risk_adjusted_triangulation",
          issuerReportedEquityFcfM: model.issuerReportedEquityFcfM,
          parentEconomicFcfe2026M: model.parentEconomicFcfe2026M,
          parentAttributionAdjustmentM: model.parentAttributionAdjustmentM,
          parentAttributionSource: "analyst_estimate",
          annualParentEconomicFcfeM: valuation.dcf.annualCashFlows.map((row) => ({
            year: row.year,
            valueM: row.fcfM
          })),
          parentFcfeCagr: valuation.parentFcfeCagr,
          sharesM: model.sharesM,
          shareBasis: "current_ordinary_shares_ex_treasury",
          adjustedEps2026: model.adjustedEps2026,
          epsMultiple: model.epsMultiple,
          sotpPerShare: model.sotpPerShare,
          riskReserveM: model.riskReserveM,
          riskReservePerShare: valuation.riskReservePerShare,
          grossFairValue: valuation.grossFairValue,
          equityDcf: valuation.dcf,
          netDebtDeductedM: 0,
          nciDeductedM: 0,
          previousPlatformHeadlineFairValue: priorHeadlineFairValue,
          previousPlatformDcfFairValue: priorPlatformDcfFairValue,
          previousPlatformValuationKind: "earnings_fcfe_blend",
          methodWeights: {
            "lseg-parent-fcfe-dcf": model.weights.dcf,
            "lseg-operating-sotp": model.weights.sotp,
            "lseg-adjusted-eps-cross-check": model.weights.adjustedEps
          },
          sensitivity: [0.08, 0.085, 0.09, 0.095, 0.10].map((ke) => ({
            costOfEquity: ke,
            values: [0.02, 0.025, 0.03].map((g) => ({
              terminalGrowth: g,
              fairValue: lsegDcfSensitivity({ costOfEquity: ke, terminalGrowth: g })
            }))
          })),
          sourceUrls: model.sourceUrls
        }
      }
    }
  };
}

function dedupeWarnings(warnings) {
  return [...new Set((warnings || []).filter(Boolean))];
}

export function applyLsegValuationOverlay(snapshot) {
  if (!isLseg(snapshot)) return snapshot;
  if (hasNewerValuationNode(snapshot, LSEG_PARENT_ECONOMIC_MODEL.valuationDate)) {
    return snapshot;
  }
  if (snapshot?.dataQuality?.lsegParentEconomicValuation?.modelVersion === LSEG_PARENT_ECONOMIC_MODEL.modelVersion) {
    return snapshot;
  }

  const valuation = buildLsegValuation();
  const overlayRow = buildOverlayRow(snapshot, valuation);
  const history = [
    ...(Array.isArray(snapshot?.history) ? snapshot.history : [])
      .filter((row) => row?.periodId !== overlayRow.periodId),
    overlayRow
  ].sort((left, right) =>
    String(left?.asOfDate || "").localeCompare(String(right?.asOfDate || "")) ||
    String(left?.periodId || "").localeCompare(String(right?.periodId || ""))
  );
  const marketPrice = finiteNumber(snapshot?.latest?.latestPrice) ?? finiteNumber(overlayRow.priceAtDate);
  const anchorPrice = finiteNumber(overlayRow.priceAtDate);

  return {
    ...snapshot,
    modelType: "LSEG Parent-economic FCFE + SOTP + Adjusted EPS",
    description: "LSEG-specific GBP ordinary-share valuation that separates issuer EFCF from LSEG-parent economic FCFE and discloses DCF separately from the risk-adjusted headline.",
    latest: {
      ...(snapshot?.latest || {}),
      valuationAnchorPrice: anchorPrice,
      valuationAnchorDate: LSEG_PARENT_ECONOMIC_MODEL.valuationDate,
      baseFairValue: valuation.fairValue,
      dcfFairValue: valuation.dcf.fairValue,
      grossFairValue: valuation.grossFairValue,
      valuationKind: "risk_adjusted_triangulation",
      upsideToBase: marketPrice && marketPrice > 0 ? valuation.fairValue / marketPrice - 1 : null,
      targetPrice3Y: valuation.targetPrice3Y,
      expectedReturn3Y: marketPrice && marketPrice > 0
        ? (valuation.targetPrice3Y / marketPrice) ** (1 / 3) - 1
        : null,
      fairValueSource: "LSEG parent-economic analyst model dated 2026-08-28",
      fairValueInputPolicy: "public issuer/consensus inputs plus disclosed analyst ownership, SOTP and risk assumptions; price excluded"
    },
    scenarios: [{
      scenario: "Base",
      currentPrice: anchorPrice,
      fairValue: valuation.fairValue,
      dcfFairValue: valuation.dcf.fairValue,
      grossFairValue: valuation.grossFairValue,
      valuationKind: "risk_adjusted_triangulation",
      upsideDownside: anchorPrice && anchorPrice > 0 ? valuation.fairValue / anchorPrice - 1 : null,
      targetPrice3Y: valuation.targetPrice3Y,
      expectedReturn3Y: anchorPrice && anchorPrice > 0
        ? (valuation.targetPrice3Y / anchorPrice) ** (1 / 3) - 1
        : null,
      recommendedMethod: "LSEG Parent-economic FCFE + SOTP + Adjusted EPS",
      modelSummary: "Standalone parent-economic FCFE DCF triangulated with operating SOTP and adjusted EPS, followed by an explicit risk reserve."
    }],
    history,
    methodCards: overlayRow.methodOutputs,
    assumptions: assumptions(valuation),
    warnings: dedupeWarnings([
      ...(Array.isArray(snapshot?.warnings) ? snapshot.warnings : []),
      ...overlayRow.warnings
    ]),
    dataQuality: {
      ...(snapshot?.dataQuality || {}),
      fairValueSource: "LSEG parent-economic analyst model dated 2026-08-28",
      sourceNote: "The current LSEG value is a dated analyst overlay. Historical PIT rows remain unchanged and continue to use only information available at each original reporting event.",
      lsegParentEconomicValuation: {
        status: "applied",
        modelVersion: LSEG_PARENT_ECONOMIC_MODEL.modelVersion,
        valuationDate: LSEG_PARENT_ECONOMIC_MODEL.valuationDate,
        previousBaseFairValue: finiteNumber(snapshot?.latest?.baseFairValue),
        standaloneDcfFairValue: valuation.dcf.fairValue,
        grossTriangulatedFairValue: valuation.grossFairValue,
        riskAdjustedFairValue: valuation.fairValue,
        ownershipBasis: valuation.dcf.ownershipBasis,
        fairValueCurrency: "GBP",
        sourceUrls: LSEG_PARENT_ECONOMIC_MODEL.sourceUrls
      }
    }
  };
}
