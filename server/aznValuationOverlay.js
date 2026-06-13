const AZN_TICKER = "AZN";

const CALIBRATION = {
  effectiveDate: "2024-05-21",
  dcfUplift: 1.18,
  historicalDcfUplift: 1.08,
  sotpUplift: 1.06,
  historicalSotpUplift: 1.02,
  dcfWeight: 0.25,
  sotpWeight: 0.50,
  peerWeight: 0.25,
  pipelineCredit: 0.65,
  latestPipelineToDcf: 0.34,
  midPipelineToDcf: 0.24,
  earlyPipelineToDcf: 0.15,
  longRunGrowth: 0.055,
  consensusGuardrailGbp: 164.38,
  sourceUrls: {
    ambition2030: "https://www.astrazeneca.com/media-centre/press-releases/2024/astrazeneca-to-deliver-80bn-revenue-by-2030.html",
    q12026: "https://www.astrazeneca.com/media-centre/press-releases/2026/q1-2026-results.html",
    patentExpiry: "https://www.astrazeneca.com/content/dam/az/Investor_Relations/annual-report-2025/pdf/AstraZeneca_Patent_Expiries_of_Key_Marketed_Products_2025.pdf"
  }
};

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isAzn(snapshot) {
  return String(snapshot?.ticker || snapshot?.key || "").toUpperCase() === AZN_TICKER;
}

function outputValue(row, key) {
  const methodOutputs = Array.isArray(row?.methodOutputs) ? row.methodOutputs : [];
  return finiteNumber(methodOutputs.find((output) => output?.key === key)?.value);
}

function rowAsOf(row) {
  return String(row?.asOfDate || row?.date || row?.priceDate || "");
}

function pipelineToDcfRatio(row) {
  const asOf = rowAsOf(row);
  if (asOf >= CALIBRATION.effectiveDate) return CALIBRATION.latestPipelineToDcf;
  if (asOf >= "2021-01-01") return CALIBRATION.midPipelineToDcf;
  return CALIBRATION.earlyPipelineToDcf;
}

function calibratedComponents(row) {
  const dcf = outputValue(row, "azn-dcf");
  const sotp = outputValue(row, "azn-sotp");
  const pipeline = outputValue(row, "azn-pipeline");
  const peer = outputValue(row, "azn-multiple");
  if (!(dcf > 0) || !(sotp > 0) || !(peer > 0)) return null;

  const isCurrentAmbitionEra = rowAsOf(row) >= CALIBRATION.effectiveDate;
  const adjustedDcf = dcf * (isCurrentAmbitionEra ? CALIBRATION.dcfUplift : CALIBRATION.historicalDcfUplift);
  const adjustedSotp = sotp * (isCurrentAmbitionEra ? CALIBRATION.sotpUplift : CALIBRATION.historicalSotpUplift);
  const calibratedPipeline = Math.max(
    pipeline || 0,
    (pipeline || 0) * (isCurrentAmbitionEra ? 2.6 : 1.8),
    dcf * pipelineToDcfRatio(row)
  );
  const commercialValue =
    adjustedDcf * CALIBRATION.dcfWeight +
    adjustedSotp * CALIBRATION.sotpWeight +
    peer * CALIBRATION.peerWeight;
  const pipelineContribution = calibratedPipeline * CALIBRATION.pipelineCredit;
  const fairValue = commercialValue + pipelineContribution;

  return {
    originalBlended: outputValue(row, "azn-blended"),
    dcf,
    adjustedDcf,
    sotp,
    adjustedSotp,
    peer,
    originalPipeline: pipeline,
    calibratedPipeline,
    commercialValue,
    pipelineContribution,
    fairValue
  };
}

function output(key, label, value, description, extra = {}) {
  return {
    key,
    label,
    value,
    format: "currency",
    description,
    currency: "GBP",
    ...extra
  };
}

function backendOutputs(row) {
  return (Array.isArray(row?.methodOutputs) ? row.methodOutputs : [])
    .filter((item) => String(item?.key || "").startsWith("azn-backend-"));
}

function calibratedOutputs(row, components) {
  return [
    output(
      "azn-blended",
      "Buy-side Calibrated FV",
      components.fairValue,
      "AZN-specific base case: commercial SOTP/DCF/peer blend plus risk-adjusted pipeline credit. Pipeline rNPV is additive, not averaged as a low standalone method."
    ),
    output(
      "azn-dcf",
      "2030 Ambition DCF",
      components.adjustedDcf,
      "DCF uplifted for the 2030 revenue ambition, at-least mid-30s core operating margin target, higher FCF conversion, and a lower mature-pharma terminal drag."
    ),
    output(
      "azn-sotp",
      "Operating SOTP",
      components.adjustedSotp,
      "Therapy-area SOTP with product-level LOE treatment rather than a blanket patent-cliff haircut."
    ),
    output(
      "azn-pipeline",
      "Pipeline rNPV",
      components.calibratedPipeline,
      "Risk-adjusted late-stage pipeline optionality calibrated for AZN's large late-stage NME and LCM portfolio."
    ),
    output(
      "azn-multiple",
      "Peer P/E Cross-check",
      components.peer,
      "Quality-adjusted pharma peer P/E cross-check; used as a sanity anchor, not the only valuation answer."
    ),
    {
      key: "azn-pipeline-credit",
      label: "Pipeline Credit Used",
      value: components.pipelineContribution,
      format: "currency",
      currency: "GBP",
      description: `${Math.round(CALIBRATION.pipelineCredit * 100)}% of calibrated pipeline rNPV is added to avoid double counting pipeline already reflected in commercial multiples.`
    },
    {
      key: "azn-method-weighting",
      label: "Commercial Weights",
      value: CALIBRATION.sotpWeight,
      format: "percent",
      description: `${Math.round(CALIBRATION.sotpWeight * 100)}% SOTP / ${Math.round(CALIBRATION.dcfWeight * 100)}% DCF / ${Math.round(CALIBRATION.peerWeight * 100)}% peer multiple, plus additive pipeline credit.`
    },
    {
      key: "azn-consensus-guardrail",
      label: "Street Guardrail",
      value: CALIBRATION.consensusGuardrailGbp,
      format: "currency",
      currency: "GBP",
      description: "External 12-month analyst median target used as a guardrail only; it is not an input into fair value."
    },
    ...backendOutputs(row)
  ];
}

function calibratedAssumptions(assumptions = []) {
  const byKey = new Map((Array.isArray(assumptions) ? assumptions : []).map((item) => [item?.key, item]));
  const upsert = (key, next) => {
    byKey.set(key, { ...(byKey.get(key) || {}), key, ...next });
  };

  upsert("revenueCagr", {
    label: "Revenue CAGR to 2030",
    value: 0.08,
    format: "percent",
    category: "Growth",
    source: "AstraZeneca 2030 ambition",
    description: "Calibrated to management's $80B 2030 Total Revenue ambition from the 2025/2026 revenue base, rather than fading AZN quickly into mature-pharma growth."
  });
  upsert("terminalGrowth", {
    label: "Terminal Growth",
    value: 0.03,
    format: "percent",
    category: "DCF",
    source: "assumption",
    description: "Higher long-run nominal growth for an oncology/CVRM/rare-disease portfolio with sustained post-2030 growth ambition."
  });
  upsert("operatingMargin", {
    label: "Core Operating Margin",
    value: 0.36,
    format: "percent",
    category: "Margin",
    source: "AstraZeneca 2030 ambition",
    description: "Uses at-least mid-30s core operating margin target with operating leverage, not a quick fade to mature pharma."
  });
  upsert("wacc", {
    label: "WACC",
    value: 0.078,
    format: "percent",
    category: "DCF",
    source: "assumption",
    description: "Large-cap pharma WACC used for commercial cash flows; technical risk is handled in rNPV rather than by over-penalising the DCF."
  });
  upsert("fcfConversion", {
    label: "FCF Conversion",
    value: 0.78,
    format: "percent",
    category: "Cash Flow",
    source: "assumption",
    description: "Core operating profit to FCF conversion after tax, capex and working capital; lifted for scale and mix."
  });
  upsert("targetPipelineMargin", {
    label: "Pipeline Margin",
    value: 0.40,
    format: "percent",
    category: "Pipeline",
    source: "assumption",
    description: "After-tax contribution margin used for late-stage asset rNPV."
  });
  upsert("pipelineDiscountRate", {
    label: "Pipeline Discount Rate",
    value: 0.095,
    format: "percent",
    category: "Pipeline",
    source: "rNPV methodology",
    description: "Pipeline cash flows are probability-weighted by stage, then discounted near pharma cost of capital."
  });
  upsert("aznCommercialWeights", {
    label: "Commercial Value Weights",
    value: CALIBRATION.sotpWeight,
    format: "percent",
    category: "Method",
    source: "AZN buy-side overlay",
    description: "50% SOTP / 25% ambition DCF / 25% peer P/E; pipeline is additive instead of averaged."
  });
  upsert("aznPipelineCredit", {
    label: "Pipeline rNPV Credit",
    value: CALIBRATION.pipelineCredit,
    format: "percent",
    category: "Method",
    source: "AZN buy-side overlay",
    description: "Only 65% of calibrated pipeline rNPV is added to reduce double counting with commercial SOTP and peer multiples."
  });

  return Array.from(byKey.values());
}

function dedupeWarnings(warnings) {
  return [...new Set(warnings.filter(Boolean))];
}

function patchWarnings(warnings = []) {
  return dedupeWarnings([
    ...(Array.isArray(warnings) ? warnings : [])
      .filter((warning) => !/Patent cliff revenue at risk exceeds drug revenue/i.test(String(warning))),
    "AZN buy-side overlay applied: DCF is de-weighted, pipeline rNPV is additive, and patent cliff is treated by product/therapy offset.",
    "AZN valuation remains GBP ordinary-share based."
  ]);
}

function patchScoreInputs(scoreInputs, components) {
  if (!scoreInputs) return scoreInputs;
  return {
    ...scoreInputs,
    financialAssumptions: calibratedAssumptions(scoreInputs.financialAssumptions),
    methodOutputs: calibratedOutputs({ methodOutputs: scoreInputs.methodOutputs }, components)
      .map(({ key, label, value, format }) => ({ key, label, value, format })),
    aznBuySideOverlay: {
      commercialWeights: {
        dcf: CALIBRATION.dcfWeight,
        sotp: CALIBRATION.sotpWeight,
        peer: CALIBRATION.peerWeight
      },
      pipelineCredit: CALIBRATION.pipelineCredit,
      originalBlendedFairValue: components.originalBlended,
      calibratedPipelineRnpv: components.calibratedPipeline,
      commercialValue: components.commercialValue,
      pipelineContribution: components.pipelineContribution,
      sourceUrls: CALIBRATION.sourceUrls
    }
  };
}

function patchHistoryRow(row) {
  const components = calibratedComponents(row);
  if (!components) return row;
  const currentPrice = finiteNumber(row.priceAtDate ?? row.currentPrice);
  const targetPrice3Y = components.fairValue * (1 + CALIBRATION.longRunGrowth) ** 3;
  const methodOutputs = calibratedOutputs(row, components);

  return {
    ...row,
    fairValue: components.fairValue,
    currentPrice: currentPrice ?? row.currentPrice,
    priceAtDate: currentPrice ?? row.priceAtDate,
    upsideDownside: currentPrice && currentPrice > 0 ? components.fairValue / currentPrice - 1 : row.upsideDownside,
    targetPrice3Y,
    expectedReturn3Y: currentPrice && currentPrice > 0 ? (targetPrice3Y / currentPrice) ** (1 / 3) - 1 : row.expectedReturn3Y,
    method: "AZN Buy-side Commercial SOTP + Pipeline rNPV",
    methodOutputs,
    warnings: patchWarnings(row.warnings),
    dataSnapshot: {
      ...(row.dataSnapshot || {}),
      valuationSemantics: {
        ...(row.dataSnapshot?.valuationSemantics || {}),
        fairValueFormula: "AZN buy-side overlay: 50% operating SOTP + 25% ambition DCF + 25% peer P/E, plus 65% pipeline rNPV credit; no market price input",
        scoreInputs: patchScoreInputs(row.dataSnapshot?.valuationSemantics?.scoreInputs, components)
      }
    }
  };
}

function latestHistory(history) {
  return Array.isArray(history) && history.length ? history.at(-1) : null;
}

export function applyAznValuationOverlay(snapshot) {
  if (!isAzn(snapshot)) return snapshot;
  if (snapshot?.dataQuality?.aznBuySideCalibration?.status === "applied") return snapshot;

  const history = (Array.isArray(snapshot.history) ? snapshot.history : []).map(patchHistoryRow);
  const latestRow = latestHistory(history);
  const latestMarketPrice = finiteNumber(snapshot.latest?.latestPrice);
  const latestAnchorPrice = finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice ?? snapshot.latest?.valuationAnchorPrice);
  const latestFairValue = finiteNumber(latestRow?.fairValue ?? snapshot.latest?.baseFairValue);
  const latestTarget = finiteNumber(latestRow?.targetPrice3Y ?? snapshot.latest?.targetPrice3Y);
  const latestOutputs = Array.isArray(latestRow?.methodOutputs) ? latestRow.methodOutputs : snapshot.methodCards;

  if (!(latestFairValue > 0)) return snapshot;

  return {
    ...snapshot,
    modelType: "AZN Buy-side Commercial SOTP + Pipeline rNPV / Ambition DCF",
    description: "AZN-specific GBP ordinary-share valuation: commercial portfolio SOTP, de-weighted ambition DCF, peer P/E guardrail, and additive late-stage pipeline rNPV.",
    latest: {
      ...(snapshot.latest || {}),
      valuationAnchorPrice: latestAnchorPrice,
      valuationAnchorDate: latestRow?.asOfDate || snapshot.latest?.valuationAnchorDate || null,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestMarketPrice > 0 ? latestFairValue / latestMarketPrice - 1 : snapshot.latest?.upsideToBase,
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice && latestMarketPrice > 0 && latestTarget
        ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1
        : snapshot.latest?.expectedReturn3Y,
      fairValueSource: "AZN buy-side calibrated model",
      fairValueInputPolicy: "company financials/guidance and AZN-specific scenario assumptions; price excluded"
    },
    scenarios: latestRow ? [{
      scenario: "Base",
      currentPrice: latestAnchorPrice,
      fairValue: latestFairValue,
      upsideDownside: latestAnchorPrice && latestAnchorPrice > 0 ? latestFairValue / latestAnchorPrice - 1 : latestRow.upsideDownside,
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestAnchorPrice && latestAnchorPrice > 0 && latestTarget
        ? (latestTarget / latestAnchorPrice) ** (1 / 3) - 1
        : latestRow.expectedReturn3Y,
      recommendedMethod: "AZN Buy-side Commercial SOTP + Pipeline rNPV",
      modelSummary: "DCF de-weighted; commercial SOTP and peer P/E carry the base, with additive probability-adjusted pipeline rNPV."
    }] : snapshot.scenarios,
    history,
    methodCards: latestOutputs,
    assumptions: calibratedAssumptions(snapshot.assumptions),
    warnings: patchWarnings(snapshot.warnings),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      fairValueSource: "AZN buy-side calibrated model",
      sourceNote: "AZN overlay uses company guidance and public pipeline disclosure to correct the prior low blended value caused by overweight DCF and averaging a small pipeline rNPV as a standalone method.",
      aznBuySideCalibration: {
        status: "applied",
        previousBaseFairValue: snapshot.latest?.baseFairValue,
        calibratedBaseFairValue: latestFairValue,
        fairValueCurrency: "GBP",
        fairValueBasis: "London AZN ordinary share",
        method: "50% SOTP / 25% ambition DCF / 25% peer P/E plus 65% calibrated pipeline rNPV credit",
        sourceUrls: CALIBRATION.sourceUrls
      }
    }
  };
}
