import type { ValidationWarning } from "../../types";
import type { MsftDataset, MsftValuationAssumptions } from "../model";

export function calculateMsftOpenAiExposureEngine(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const openAiRecords = data.aiDisclosures.filter((item) => item.id.startsWith("openai"));
  const officialRecords = openAiRecords.filter((item) => item.sourceStatus === "official_actual" || item.sourceStatus === "management_commentary");
  const scenarioRecords = openAiRecords.filter((item) => item.sourceStatus === "scenario_assumption");
  const warnings: ValidationWarning[] = [];

  const forbiddenOfficialMetrics = ["openai-revenue-share-economics"];
  const crossedBoundary = openAiRecords.some((record) => forbiddenOfficialMetrics.includes(record.id) && record.sourceStatus === "official_actual");
  if (crossedBoundary) {
    warnings.push({
      id: "msft-openai-source-boundary",
      title: "OpenAI scenario data crossed into official actuals",
      detail: "OpenAI revenue contribution, revenue share, and compute economics are not disclosed and must remain scenario assumptions.",
      severity: "high",
    });
  }

  const scenarioRevenue = assumptions.openAiRevenueContribution;
  const scenarioGrossMargin = assumptions.openAiGrossMargin;
  const dependencyScore = Math.round(100 * (scenarioRevenue * 10 + (1 - scenarioGrossMargin) * 0.35));

  return {
    officialRecords,
    scenarioRecords,
    scenarioRevenue,
    scenarioGrossMargin,
    dependencyScore: Math.max(0, Math.min(100, dependencyScore)),
    warnings,
    keyBoundary:
      "Official data covers OpenAI investment P&L impact, RPO commentary, revenue-share term, and IP rights. It does not disclose OpenAI revenue contribution, revenue-share percentage, compute resale margin, or standalone OpenAI profitability.",
    cases: data.scenarios.map((scenario) => ({
      scenario: scenario.scenario,
      probability: scenario.probability,
      revenueContribution: scenario.openAiRevenueContribution,
      grossMargin: scenario.openAiGrossMargin,
      narrative: scenario.narrative,
    })),
  };
}
