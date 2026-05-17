import type { Scenario, ValidationWarning } from "../../types";
import { buildSensitivityTable } from "../../../utils/chartHelpers";
import type {
  DgeBrandPortfolioOutput,
  DgeCashFlowOutput,
  DgeDataset,
  DgeLacInventoryOutput,
  DgeMarginSavingsOutput,
  DgeUsDemandOutput,
  DgeValuationAssumptions,
  DgeValuationOutput,
} from "../types";
import { clamp, normalizeWeights, safeRatio } from "./helpers";

function toGbp(usd: number, assumptions: DgeValuationAssumptions) {
  return usd / assumptions.gbpUsd;
}

function equityValuePerShareGbp(equityValueUsdM: number, assumptions: DgeValuationAssumptions) {
  return toGbp(equityValueUsdM / assumptions.sharesOutstandingM, assumptions);
}

function dynamicFcfYield(
  assumptions: DgeValuationAssumptions,
  usDemand: DgeUsDemandOutput,
  lacInventory: DgeLacInventoryOutput,
  brandPortfolio: DgeBrandPortfolioOutput,
  cashFlow: DgeCashFlowOutput,
  marginSavings: DgeMarginSavingsOutput,
) {
  const penalty =
    (55 - usDemand.usDemandScore) * 0.0008 +
    (55 - lacInventory.lacInventoryHealthScore) * 0.0006 +
    (65 - brandPortfolio.brandHealthScore) * 0.0004 +
    (60 - cashFlow.dividendSafetyScore) * 0.0005 +
    (60 - marginSavings.underlyingMarginScore) * 0.0004;
  return Math.max(0.055, assumptions.targetFcfYield + penalty);
}

function buildScenarioWarning(assumptions: DgeValuationAssumptions): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (assumptions.currentPriceGbp > 100) {
    warnings.push({
      id: "dge-price-unit-gbp-gbx",
      title: "DGE.L price unit may be wrong",
      detail: "London DGE.L is quoted in GBX; valuation assumptions must use GBP per ordinary share.",
      severity: "high",
    });
  }
  if (assumptions.weightFcfYield + assumptions.weightEvEbit + assumptions.weightEvEbitda + assumptions.weightPe + assumptions.weightDividend + assumptions.weightRegionQuality <= 0) {
    warnings.push({
      id: "dge-valuation-weight-zero",
      title: "Valuation method weights sum to zero",
      detail: "At least one valuation method needs a positive weight.",
      severity: "high",
    });
  }
  return warnings;
}

export function buildDgeValuationEngine(
  data: DgeDataset,
  assumptions: DgeValuationAssumptions,
  scenario: Scenario,
  usDemand: DgeUsDemandOutput,
  lacInventory: DgeLacInventoryOutput,
  brandPortfolio: DgeBrandPortfolioOutput,
  cashFlow: DgeCashFlowOutput,
  marginSavings: DgeMarginSavingsOutput,
): DgeValuationOutput {
  const warnings = [...data.marketData.validationWarnings, ...buildScenarioWarning(assumptions)];
  const targetFcfYield = dynamicFcfYield(assumptions, usDemand, lacInventory, brandPortfolio, cashFlow, marginSavings);
  const normalizedFcfEquityValueUsdM = assumptions.normalizedFcf / targetFcfYield;
  const normalizedFcfFairValueGbp = equityValuePerShareGbp(normalizedFcfEquityValueUsdM, assumptions);
  const evEbitEquityUsdM = assumptions.normalizedEbit * assumptions.evEbitMultiple - assumptions.netDebtUsdM;
  const evEbitdaEquityUsdM = assumptions.normalizedEbitda * assumptions.evEbitdaMultiple - assumptions.netDebtUsdM;
  const evEbitFairValueGbp = equityValuePerShareGbp(evEbitEquityUsdM, assumptions);
  const evEbitdaFairValueGbp = equityValuePerShareGbp(evEbitdaEquityUsdM, assumptions);
  const peFairValueGbp = toGbp(assumptions.epsBeforeExceptional * assumptions.peMultiple, assumptions);
  const dividendTargetYield =
    scenario === "Bear" ? 0.055 : scenario === "Bull" ? 0.036 : clamp(targetFcfYield * 0.52, 0.038, 0.052);
  const dividendFloorValueGbp = toGbp(assumptions.dividendFloorUsd / dividendTargetYield, assumptions);
  const regionQualityFairValueGbp = normalizedFcfFairValueGbp * (1 + assumptions.regionQualityAdjustment);
  const weights = normalizeWeights({
    fcfYield: assumptions.weightFcfYield,
    evEbit: assumptions.weightEvEbit,
    evEbitda: assumptions.weightEvEbitda,
    pe: assumptions.weightPe,
    dividend: assumptions.weightDividend,
    regionQuality: assumptions.weightRegionQuality,
  });
  const blendedFairValueGbp =
    normalizedFcfFairValueGbp * weights.fcfYield +
    evEbitFairValueGbp * weights.evEbit +
    evEbitdaFairValueGbp * weights.evEbitda +
    peFairValueGbp * weights.pe +
    dividendFloorValueGbp * weights.dividend +
    regionQualityFairValueGbp * weights.regionQuality;

  const marketCapUsdM = data.marketData.marketCapUsdM;
  const requiredFcfYield = safeRatio(assumptions.normalizedFcf, marketCapUsdM);
  const impliedUsRecovery = clamp((data.marketData.londonPriceGbp / Math.max(blendedFairValueGbp, 0.01) - 0.78) / 0.6, -0.12, 0.04);
  const adrEquivalentUsd = blendedFairValueGbp * assumptions.gbpUsd * data.marketData.ordinarySharesPerAdr;

  return {
    normalizedFcfFairValueGbp,
    evEbitFairValueGbp,
    evEbitdaFairValueGbp,
    peFairValueGbp,
    dividendFloorValueGbp,
    regionQualityFairValueGbp,
    blendedFairValueGbp,
    blendedFairValueGbx: blendedFairValueGbp * 100,
    adrEquivalentUsd,
    marketImplied: {
      normalizedFcf: marketCapUsdM * targetFcfYield,
      requiredFcfYield,
      usDemandRecovery: impliedUsRecovery,
      lacNormalizedGrowth: lacInventory.normalizedLacGrowth * (data.marketData.londonPriceGbp / Math.max(blendedFairValueGbp, 0.01)),
      operatingMargin: assumptions.operatingMargin,
      netDebtToEbitda: safeRatio(assumptions.netDebtUsdM, assumptions.normalizedEbitda),
      terminalOrganicGrowth: assumptions.terminalOrganicGrowth,
    },
    methodWeights: weights,
    sensitivityTables: [
      {
        title: "US Organic Growth x Target FCF Yield",
        table: buildSensitivityTable(
          "US growth",
          "FCF yield",
          [-0.08, -0.05, -0.02, 0.0, 0.025],
          [targetFcfYield - 0.01, targetFcfYield - 0.005, targetFcfYield, targetFcfYield + 0.005, targetFcfYield + 0.01],
          (usGrowth, fcfYield) => equityValuePerShareGbp((assumptions.normalizedFcf * (1 + (usGrowth - assumptions.usOrganicGrowth) * 0.9)) / Math.max(fcfYield, 0.001), assumptions),
        ),
      },
      {
        title: "LAC Normalized Growth x Inventory Haircut",
        table: buildSensitivityTable(
          "LAC growth",
          "Inventory haircut",
          [-0.02, 0.0, 0.03, 0.06, 0.09],
          [0, 0.025, 0.05, 0.075, 0.1],
          (lacGrowth, haircut) => blendedFairValueGbp * (1 + (lacGrowth - assumptions.lacNormalizedGrowth) * 0.35 - haircut * 0.45),
        ),
      },
      {
        title: "Operating Margin x FCF",
        table: buildSensitivityTable(
          "Margin",
          "FCF",
          [assumptions.operatingMargin - 0.03, assumptions.operatingMargin - 0.015, assumptions.operatingMargin, assumptions.operatingMargin + 0.015, assumptions.operatingMargin + 0.03],
          [assumptions.normalizedFcf - 400, assumptions.normalizedFcf - 200, assumptions.normalizedFcf, assumptions.normalizedFcf + 200, assumptions.normalizedFcf + 400],
          (margin, fcf) => equityValuePerShareGbp((fcf * (1 + (margin - assumptions.operatingMargin) * 1.6)) / targetFcfYield, assumptions),
        ),
      },
      {
        title: "Net Debt / EBITDA x EV/EBITDA Multiple",
        table: buildSensitivityTable(
          "Leverage",
          "EV/EBITDA",
          [2.5, 3.0, 3.4, 3.8, 4.2],
          [7.5, 8.5, assumptions.evEbitdaMultiple, 10.5, 11.5],
          (leverage, multiple) => equityValuePerShareGbp(assumptions.normalizedEbitda * multiple - assumptions.normalizedEbitda * leverage, assumptions),
        ),
      },
      {
        title: "Price/Mix x Volume",
        table: buildSensitivityTable(
          "Price/mix",
          "Volume",
          [-0.03, -0.015, 0, 0.015, 0.03],
          [-0.04, -0.02, 0, 0.02, 0.04],
          (priceMix, volume) => blendedFairValueGbp * (1 + priceMix * 1.8 + volume * 1.4),
        ),
      },
    ],
    warnings,
  };
}
