import type { ValidationWarning } from "../../types";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type { AznDataset, AznPipelineValue, AznValuationAssumptions, AznValuationOutput } from "../types";
import { annualizeQuarterly, normalizeBlendWeights, safeRatio } from "./helpers";

function calculateDcfValue(data: AznDataset, assumptions: AznValuationAssumptions) {
  const baseRevenue = data.periods.find((period) => period.id === "fy2025")?.totalRevenue ?? 0;
  const forecastYears = [1, 2, 3, 4, 5].map((year) => {
    const revenue = baseRevenue * ((1 + assumptions.revenueCagr) ** year);
    const margin = assumptions.operatingMargin - Math.max(0, 5 - year) * 0.003;
    const nopat = revenue * margin * (1 - assumptions.taxRate);
    const reinvestment = revenue * assumptions.reinvestmentRate * 0.12;
    const fcf = Math.max(nopat * assumptions.fcfConversion - reinvestment, 0);
    return { year: 2025 + year, revenue, margin, nopat, fcf };
  });
  const pvForecast = forecastYears.reduce((sum, row, index) => sum + row.fcf / ((1 + assumptions.wacc) ** (index + 1)), 0);
  const terminalFcf = forecastYears[forecastYears.length - 1].fcf * (1 + assumptions.terminalGrowth);
  const terminalValue = terminalFcf / Math.max(assumptions.wacc - assumptions.terminalGrowth, 0.002);
  const pvTerminal = terminalValue / ((1 + assumptions.wacc) ** forecastYears.length);
  const enterpriseValue = pvForecast + pvTerminal;
  const equityValue = enterpriseValue - assumptions.netDebtUsdM;
  const valuePerShareUsd = equityValue / data.marketData.sharesOutstandingM;
  return { forecastYears, enterpriseValue, equityValue, valuePerShareUsd };
}

function calculateSotpValue(data: AznDataset, assumptions: AznValuationAssumptions) {
  const q1Rows = data.reportedData.therapyAreas;
  const multipleByArea = {
    Oncology: assumptions.oncologyRevenueMultiple,
    CVRM: assumptions.cvrmRevenueMultiple,
    "Respiratory & Immunology": assumptions.respiratoryRevenueMultiple,
    "Infectious Disease": assumptions.infectiousDiseaseRevenueMultiple,
    "Rare Disease": assumptions.rareDiseaseRevenueMultiple,
    "Other Medicines": assumptions.otherRevenueMultiple,
  };
  const riskHaircutByArea = {
    Oncology: 0.92,
    CVRM: 0.78,
    "Respiratory & Immunology": 0.82,
    "Infectious Disease": 0.75,
    "Rare Disease": 0.9,
    "Other Medicines": 0.4,
  };
  const components = q1Rows.map((row) => {
    const annualizedRevenue = annualizeQuarterly(row.revenue);
    const multiple = multipleByArea[row.therapyArea];
    const riskHaircut = riskHaircutByArea[row.therapyArea];
    const value = annualizedRevenue * multiple * riskHaircut;
    return { therapyArea: row.therapyArea, annualizedRevenue, multiple, riskHaircut, value };
  });
  const pipelineOptionality = data.pipelineData.reduce((sum, asset) => sum + asset.peakSalesEstimate * asset.probabilityOfSuccess * 0.25, 0);
  const enterpriseValue = components.reduce((sum, item) => sum + item.value, 0) + pipelineOptionality * assumptions.pipelineMultiple;
  const equityValue = enterpriseValue - assumptions.netDebtUsdM;
  return { components, pipelineOptionality, enterpriseValue, equityValue, valuePerShareUsd: equityValue / data.marketData.sharesOutstandingM };
}

function calculatePipelineFairValue(data: AznDataset, pipelineAssets: AznPipelineValue[], assumptions: AznValuationAssumptions) {
  const pipelineEnterpriseValue = pipelineAssets.reduce((sum, asset) => sum + asset.probabilityAdjustedPipelineValue, 0) * assumptions.pipelineMultiple;
  return {
    pipelineEnterpriseValue,
    valuePerShareUsd: pipelineEnterpriseValue / data.marketData.sharesOutstandingM,
  };
}

function calculateMultipleValue(data: AznDataset, assumptions: AznValuationAssumptions) {
  const fy = data.periods.find((period) => period.id === "fy2025") ?? data.periods[0];
  const marginDelta = assumptions.operatingMargin - fy.coreOperatingMargin;
  const forwardCoreEps = fy.coreEps * (1 + assumptions.revenueCagr + marginDelta * 0.65);
  return {
    forwardCoreEps,
    valuePerShareUsd: forwardCoreEps * assumptions.peerPeMultiple,
  };
}

function toGbp(valueUsd: number, assumptions: AznValuationAssumptions) {
  return valueUsd / assumptions.gbpUsd;
}

export function buildAznValuationEngine(
  data: AznDataset,
  assumptions: AznValuationAssumptions,
  pipelineAssets: AznPipelineValue[],
): AznValuationOutput {
  const warnings: ValidationWarning[] = [...data.marketData.validationWarnings];
  const weights = normalizeBlendWeights(assumptions);
  const dcf = calculateDcfValue(data, assumptions);
  const sotp = calculateSotpValue(data, assumptions);
  const pipeline = calculatePipelineFairValue(data, pipelineAssets, assumptions);
  const multiple = calculateMultipleValue(data, assumptions);
  const blendedFairValueUsd =
    dcf.valuePerShareUsd * weights.dcf +
    sotp.valuePerShareUsd * weights.sotp +
    pipeline.valuePerShareUsd * weights.pipeline +
    multiple.valuePerShareUsd * weights.multiples;

  if (assumptions.terminalGrowth >= assumptions.wacc) {
    warnings.push({
      id: "azn-terminal-growth-above-wacc",
      title: "Terminal growth must be below WACC",
      detail: "DCF terminal growth is greater than or equal to WACC, which would make the terminal value unusable.",
      severity: "high",
    });
  }
  if (pipelineAssets.some((asset) => asset.researchOnlyEstimate !== true)) {
    warnings.push({
      id: "azn-pipeline-rnpv-source-boundary",
      title: "Pipeline valuation source boundary unclear",
      detail: "Pipeline rNPV must remain probability-adjusted and tagged as research-only estimates.",
      severity: "high",
    });
  }

  const currentPriceGbp = assumptions.currentPriceGbp;
  const target3YGbp = toGbp(blendedFairValueUsd, assumptions) * 1.08;
  const cumulativeDividendsGbp = (assumptions.dividendPerShareUsd / assumptions.gbpUsd) * 3;
  const impliedCagrReturn = currentPriceGbp > 0
    ? ((target3YGbp + cumulativeDividendsGbp) / currentPriceGbp) ** (1 / 3) - 1
    : 0;

  return {
    dcfFairValueGbp: toGbp(dcf.valuePerShareUsd, assumptions),
    dcfFairValueUsd: dcf.valuePerShareUsd,
    sotpFairValueGbp: toGbp(sotp.valuePerShareUsd, assumptions),
    sotpFairValueUsd: sotp.valuePerShareUsd,
    pipelineFairValueGbp: toGbp(pipeline.valuePerShareUsd, assumptions),
    pipelineFairValueUsd: pipeline.valuePerShareUsd,
    multiplesFairValueGbp: toGbp(multiple.valuePerShareUsd, assumptions),
    multiplesFairValueUsd: multiple.valuePerShareUsd,
    blendedFairValueGbp: toGbp(blendedFairValueUsd, assumptions),
    blendedFairValueUsd,
    formerAdrFairValueUsd: blendedFairValueUsd * data.marketData.historicalAdrRatioOrdinarySharePerAdr,
    nyseOrdinaryFairValueUsd: blendedFairValueUsd * data.marketData.currentUsListingOrdinaryShareRatio,
    impliedCagrReturn,
    dividendReinvestmentReturn: safeRatio(assumptions.dividendPerShareUsd, blendedFairValueUsd),
    methodWeights: weights,
    sensitivityTables: [
      {
        title: "WACC x Terminal Growth",
        table: buildSensitivityTable(
          "WACC",
          "Terminal Growth",
          [assumptions.wacc - 0.01, assumptions.wacc - 0.005, assumptions.wacc, assumptions.wacc + 0.005, assumptions.wacc + 0.01],
          [assumptions.terminalGrowth - 0.01, assumptions.terminalGrowth - 0.005, assumptions.terminalGrowth, assumptions.terminalGrowth + 0.005, assumptions.terminalGrowth + 0.01],
          (wacc, terminalGrowth) => toGbp(calculateDcfValue(data, { ...assumptions, wacc, terminalGrowth }).valuePerShareUsd, assumptions),
        ),
      },
      {
        title: "Revenue CAGR x Core Operating Margin",
        table: buildSensitivityTable(
          "Revenue CAGR",
          "Operating Margin",
          [assumptions.revenueCagr - 0.02, assumptions.revenueCagr - 0.01, assumptions.revenueCagr, assumptions.revenueCagr + 0.01, assumptions.revenueCagr + 0.02],
          [assumptions.operatingMargin - 0.03, assumptions.operatingMargin - 0.015, assumptions.operatingMargin, assumptions.operatingMargin + 0.015, assumptions.operatingMargin + 0.03],
          (revenueCagr, operatingMargin) => toGbp(calculateDcfValue(data, { ...assumptions, revenueCagr, operatingMargin }).valuePerShareUsd, assumptions),
        ),
      },
      {
        title: "Peer P/E x Forward Core EPS",
        table: buildSensitivityTable(
          "P/E",
          "Forward EPS",
          [assumptions.peerPeMultiple - 4, assumptions.peerPeMultiple - 2, assumptions.peerPeMultiple, assumptions.peerPeMultiple + 2, assumptions.peerPeMultiple + 4],
          [multiple.forwardCoreEps * 0.9, multiple.forwardCoreEps * 0.95, multiple.forwardCoreEps, multiple.forwardCoreEps * 1.05, multiple.forwardCoreEps * 1.1],
          (pe, eps) => toGbp(pe * eps, assumptions),
        ),
      },
    ],
    warnings,
  };
}
