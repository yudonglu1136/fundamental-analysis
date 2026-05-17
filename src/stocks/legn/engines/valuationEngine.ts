import type { Scenario, ValidationWarning } from "../../types";
import type {
  LegnCollaborationEconomicsOutput,
  LegnCommercialEngineOutput,
  LegnDataset,
  LegnLabelExpansionOutput,
  LegnPipelineRnpvOutput,
  LegnPlatformOptionOutput,
  LegnValuationAssumptions,
  LegnValuationOutput,
} from "../types";
import { computeUpsideDownside } from "../../../utils/valuation";
import { discountFactor, explain, pv } from "./helpers";

function productDiscountRate(scenario: Scenario) {
  if (scenario === "Bear") return 0.115;
  if (scenario === "Bull") return 0.095;
  return 0.105;
}

function dilutionAdjustment(data: LegnDataset, scenario: Scenario) {
  if (scenario !== "Bear") return 0;
  const bearRaise = data.assumptions.researchAssumptions.find((item) => item.id === "bear-equity-raise")?.value;
  return typeof bearRaise === "number" ? -bearRaise / data.marketData.adsOutstandingM : 0;
}

function sensitivityTable(
  data: LegnDataset,
  baseCoreUsdM: number,
  peakNts: number,
  discountRate: number,
) {
  const peakScalars = [0.8, 0.9, 1, 1.1, 1.2];
  const discountRates = [discountRate - 0.02, discountRate - 0.01, discountRate, discountRate + 0.01, discountRate + 0.02];
  return [
    ["Peak NTS \\ Discount", ...discountRates.map((rate) => `${(rate * 100).toFixed(1)}%`)],
    ...peakScalars.map((scalar) => [
      `$${(peakNts * scalar / 1_000).toFixed(1)}bn`,
      ...discountRates.map((rate) => Number(((baseCoreUsdM * scalar * (discountRate / rate)) / data.marketData.adsOutstandingM).toFixed(2))),
    ]),
  ];
}

export function buildLegnValuationEngine(
  data: LegnDataset,
  commercial: LegnCommercialEngineOutput,
  collaboration: LegnCollaborationEconomicsOutput,
  labelExpansion: LegnLabelExpansionOutput,
  pipelineRnpv: LegnPipelineRnpvOutput,
  platformOption: LegnPlatformOptionOutput,
  scenario: Scenario,
  overrides?: Partial<LegnValuationAssumptions>,
): LegnValuationOutput {
  const discountRate = overrides?.productDiscountRate ?? productDiscountRate(scenario);
  const taxRate = Number(data.assumptions.researchAssumptions.find((item) => item.id === "label-expansion-tax-rate")?.value ?? 0.18);
  const coreCarvyktiNavUsdM = collaboration.rows.reduce(
    (sum, row) => sum + pv(Math.max(0, row.cashContribution) * (1 - taxRate), row.year, 2026, discountRate),
    0,
  );
  const coreCarvyktiNavPerAds = coreCarvyktiNavUsdM / data.marketData.adsOutstandingM;
  const labelExpansionNavPerAds = labelExpansion.totalNavUsdM / data.marketData.adsOutstandingM;
  const pipelineRnpvPerAds = pipelineRnpv.valuePerAds;
  const platformOptionValuePerAds = platformOption.probabilityWeightedOptionValue / data.marketData.adsOutstandingM;
  const netCashFundingAdjustmentPerAds = data.marketData.netCashAfterFundingUsdM / data.marketData.adsOutstandingM;
  const dilutionPerAds = dilutionAdjustment(data, scenario);
  const fairValuePerAds =
    coreCarvyktiNavPerAds +
    labelExpansionNavPerAds +
    pipelineRnpvPerAds +
    platformOptionValuePerAds +
    netCashFundingAdjustmentPerAds +
    dilutionPerAds;

  const marketEnterpriseValue = data.marketData.enterpriseValueUsdM;
  const nonCoreValueUsdM =
    labelExpansion.totalNavUsdM + pipelineRnpv.totalRnpvUsdM + platformOption.probabilityWeightedOptionValue + data.marketData.netCashAfterFundingUsdM;
  const marketCoreValueUsdM = Math.max(0, marketEnterpriseValue - nonCoreValueUsdM);
  const peakToCoreNavMultiple = coreCarvyktiNavUsdM / Math.max(commercial.peakNts, 1);
  const impliedCarvyktiPeakSalesInCurrentPrice = marketCoreValueUsdM / Math.max(peakToCoreNavMultiple, 0.01);
  const solidTumorAssets = pipelineRnpv.assets.filter((asset) => asset.assetName.includes("LB1908") || asset.assetName.includes("LB2102"));
  const solidTumorUnadjusted = solidTumorAssets.reduce(
    (sum, asset) =>
      sum +
      Math.max(
        0,
        (asset.estimatedPeakSales * 0.24 * 5) / discountFactor(asset.estimatedLaunchYear, 2026, asset.discountRate) -
          asset.developmentCostRemaining,
      ),
    0,
  );
  const impliedProbabilityOfSolidTumorSuccess = Math.max(
    0,
    Math.min(1, (data.marketData.marketCapUsdM - fairValuePerAds * data.marketData.adsOutstandingM + pipelineRnpv.totalRnpvUsdM) / Math.max(solidTumorUnadjusted, 1)),
  );

  const warnings: ValidationWarning[] = [...data.marketData.validationWarnings];
  if (labelExpansion.doubleCountGuardrail.warning) {
    warnings.push({
      id: "legn-frontline-double-count",
      title: "Frontline expansion double-count guardrail active",
      detail: labelExpansion.doubleCountGuardrail.warning,
      severity: "high",
    });
  }
  if (commercial.annualForecast.some((row) => row.ntsFrontline > 0) && labelExpansion.totalNavUsdM > 0) {
    warnings.push({
      id: "legn-frontline-in-core-and-option",
      title: "Frontline may be double counted",
      detail: "Core commercial forecast includes frontline NTS while label-expansion NAV is positive.",
      severity: "high",
    });
  }

  return {
    scenario,
    currentPrice: data.marketData.currentPrice,
    fairValuePerAds,
    coreCarvyktiNavPerAds,
    labelExpansionNavPerAds,
    pipelineRnpvPerAds,
    platformOptionValuePerAds,
    netCashFundingAdjustmentPerAds,
    dilutionAdjustmentPerAds: dilutionPerAds,
    marginOfSafety: computeUpsideDownside(fairValuePerAds, data.marketData.currentPrice),
    peakCarvyktiNts: commercial.peakNts,
    impliedCarvyktiPeakSalesInCurrentPrice,
    impliedProbabilityOfSolidTumorSuccess,
    navStack: [
      { label: "Core CARVYKTI NAV", valuePerAds: coreCarvyktiNavPerAds, valueUsdM: coreCarvyktiNavUsdM, quality: "derived" as const },
      { label: "Label Expansion NAV", valuePerAds: labelExpansionNavPerAds, valueUsdM: labelExpansion.totalNavUsdM, quality: "research_only" as const },
      { label: "Pipeline rNPV", valuePerAds: pipelineRnpvPerAds, valueUsdM: pipelineRnpv.totalRnpvUsdM, quality: "research_only" as const },
      { label: "Platform Option", valuePerAds: platformOptionValuePerAds, valueUsdM: platformOption.probabilityWeightedOptionValue, quality: "research_only" as const },
      {
        label: "Net Cash / Funding Adj.",
        valuePerAds: netCashFundingAdjustmentPerAds,
        valueUsdM: data.marketData.netCashAfterFundingUsdM,
        quality: "filing" as const,
      },
      { label: "Dilution Adj.", valuePerAds: dilutionPerAds, valueUsdM: dilutionPerAds * data.marketData.adsOutstandingM, quality: "research_only" as const },
    ],
    keyAssumptions: [
      {
        label: "Approved-label CARVYKTI peak NTS",
        value: `$${(commercial.peakNts / 1_000).toFixed(1)}bn`,
        sourceQuality: "research_only",
        evidenceIds: commercial.explainability.evidenceIds,
      },
      {
        label: "NTS to Legend collaboration revenue",
        value: `${(data.collaborationEconomicsBridge.ntsToCollaborationRevenueRatio * 100).toFixed(1)}%`,
        sourceQuality: "filing",
        evidenceIds: data.collaborationEconomicsBridge.sourceEvidenceIds,
      },
      {
        label: "Product discount rate",
        value: `${(discountRate * 100).toFixed(1)}%`,
        sourceQuality: "research_only",
        evidenceIds: ["research-assumption-rnpv"],
      },
      {
        label: "ADS count",
        value: `${data.marketData.adsOutstandingM.toFixed(1)}m ADS`,
        sourceQuality: "filing",
        evidenceIds: ["legn-20f-2025-share-count"],
      },
    ],
    sensitivityHeatmap: sensitivityTable(data, coreCarvyktiNavUsdM, commercial.peakNts, discountRate),
    crossChecks: [
      {
        label: "EV / 2026E CARVYKTI NTS",
        value: marketEnterpriseValue / Math.max(commercial.annualForecast[0]?.globalNts ?? 1, 1),
        unit: "x",
        note: "Sanity check only; not used in fair value.",
      },
      {
        label: "EV / 2030E Legend economic profit",
        value: marketEnterpriseValue / Math.max(collaboration.rows.find((row) => row.year === 2030)?.operatingProfitContribution ?? 1, 1),
        unit: "x",
        note: "Sanity check only; collaboration accounting and recoupment make raw multiples noisy.",
      },
      {
        label: "EV / rNPV",
        value: marketEnterpriseValue / Math.max(coreCarvyktiNavUsdM + labelExpansion.totalNavUsdM + pipelineRnpv.totalRnpvUsdM, 1),
        unit: "x",
        note: "Sanity check only; rNPV stack is the primary valuation.",
      },
    ],
    doubleCountGuardrail: labelExpansion.doubleCountGuardrail,
    warnings,
    explainability: explain(
      "LEGN fair value uses a biotech NAV stack: approved CARVYKTI NAV, separate label-expansion NAV, pipeline rNPV, speculative platform option and net cash/funding adjustment.",
      "fair value per ADS = core CARVYKTI NAV + label expansion NAV + pipeline rNPV + platform option + net cash/funding adjustment - dilution, all per ADS",
      Array.from(
        new Set([
          ...commercial.explainability.evidenceIds,
          ...collaboration.explainability.evidenceIds,
          ...labelExpansion.explainability.evidenceIds,
          ...pipelineRnpv.explainability.evidenceIds,
          ...platformOption.explainability.evidenceIds,
          "market-snapshot-legn-2026-05-07",
        ]),
      ),
      [
        "No terminal-growth DCF is used as the primary valuation method",
        "Frontline is separated from approved-label CARVYKTI",
        "Solid tumor CAR-T is high-discount option value only",
      ],
    ),
  };
}
