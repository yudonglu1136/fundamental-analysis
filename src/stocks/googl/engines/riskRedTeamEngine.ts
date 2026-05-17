import type { GooglDataset, GooglRegulatoryRiskOutput, GooglValuationAssumptions } from "../model";
import { clamp } from "./helpers";

export function calculateGooglRiskRedTeamEngine(
  data: GooglDataset,
  regulatory: GooglRegulatoryRiskOutput,
  assumptions: GooglValuationAssumptions,
) {
  const thesis =
    "Alphabet compounds if AI increases Search and YouTube engagement, Cloud backlog converts at expanding margins, and TPU vertical integration lowers the cost of training/inference enough to justify the CapEx wave.";
  const strongestBearCase =
    "The bear case is not simply 'AI is expensive.' It is that AI answer engines reduce monetizable commercial journeys, regulatory remedies weaken default distribution and ad-tech economics, and the 2026-2027 technical-infrastructure step-up lifts depreciation faster than Cloud and Gemini can monetize.";
  const breakpoints = [
    { driver: "Search AI cannibalization", threshold: ">3.0% net revenue drag", current: assumptions.searchAiCannibalization, risk: assumptions.searchAiCannibalization > 0.03 ? "Active" : "Watch" },
    { driver: "Cloud terminal margin", threshold: "<25%", current: assumptions.cloudTerminalMargin, risk: assumptions.cloudTerminalMargin < 0.25 ? "Active" : "Watch" },
    { driver: "CapEx intensity", threshold: ">32% of revenue without FCF rebound", current: assumptions.capexIntensity, risk: assumptions.capexIntensity > 0.32 ? "Active" : "Watch" },
    { driver: "Regulatory discount", threshold: ">12%", current: assumptions.regulatoryDiscount, risk: assumptions.regulatoryDiscount > 0.12 ? "Active" : "Watch" },
    { driver: "TPU efficiency benefit", threshold: "<1.5%", current: assumptions.tpuEfficiencyBenefit, risk: assumptions.tpuEfficiencyBenefit < 0.015 ? "Active" : "Watch" },
  ];
  const riskRegister = regulatory.riskRows.map((risk) => ({
    id: risk.id,
    name: risk.name,
    score: risk.riskScore,
    severity: risk.severityLabel,
    affectedDriver: risk.affectedDriver,
    mitigation: risk.id === "capex-overbuild" ? "Demand gating, TPU utilization, phasing of technical infrastructure and FCF discipline." : risk.id === "regulatory-remedy" ? "Appeals, product redesign, contract changes, and scenario discounting." : "Monitor KPI deterioration before it flows into valuation.",
  }));
  const redTeamScore = clamp(
    riskRegister.reduce((sum, risk) => sum + risk.score, 0) * 24 +
      assumptions.regulatoryDiscount * 120 +
      assumptions.aiComputeConstraint * 18 +
      Math.max(assumptions.capexIntensity - assumptions.fcfMargin, 0) * 55,
    10,
    95,
  );

  return {
    thesis,
    strongestBearCase,
    redTeamScore,
    verdict:
      redTeamScore > 68
        ? "Caution: valuation depends on aggressive AI infrastructure monetization and clean regulatory outcomes."
        : redTeamScore > 48
          ? "Balanced: AI and Cloud evidence is strong, but CapEx and remedies must be monitored closely."
          : "Constructive: KPI evidence supports the AI/Cloud thesis and risk triggers are not flashing.",
    killCriteria: regulatory.killCriteria,
    breakpoints,
    riskRegister,
    monitoringTriggers: [
      ...regulatory.monitoringTriggers,
      "Search & other growth relative to AI Overviews / AI Mode adoption commentary.",
      "Cloud backlog additions and expected 24-month recognition.",
      "Cloud operating margin after Wiz, TPU hardware revenue and depreciation.",
      "TTM FCF margin versus FY2026/FY2027 CapEx guidance.",
      "Waymo weekly rides, funding needs, and Other Bets operating loss.",
    ],
    sourceId: data.risks[0]?.sourceId ?? "goog-fy-2025-10k",
  };
}
