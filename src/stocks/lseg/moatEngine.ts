import type { DashboardInterpretation, Signal } from "../types";

function scoreToSignal(score: number): Signal {
  if (score >= 78) return "Positive";
  if (score >= 64) return "Inflecting";
  if (score >= 50) return "Neutral";
  return "Needs Review";
}

export function calculateMoatEngine(input: {
  workflowLockInScore: number;
  recurringRevenueQualityScore: number;
  postTradeMoatScore: number;
  structuralMarginExpansionScore: number;
  moatCompoundingScore: number;
  costSynergyExhaustionRisk: number;
  pricingPowerScore: number;
}) {
  const overallScore =
    input.workflowLockInScore * 0.22 +
    input.recurringRevenueQualityScore * 0.2 +
    input.postTradeMoatScore * 0.18 +
    input.structuralMarginExpansionScore * 0.15 +
    input.moatCompoundingScore * 0.17 +
    input.pricingPowerScore * 0.08;

  const cards: DashboardInterpretation[] = [
      {
        title: "Workflow lock-in deepening",
        signal: scoreToSignal(input.workflowLockInScore),
        detail: input.workflowLockInScore >= 72 ? "Clients are using more connected products per workflow, which raises switching costs." : "Workflow depth is improving, but still needs more product attachment to harden the moat.",
        badge: "Derived",
      },
      {
        title: "Cost synergy exhaustion risk rising",
        signal: (input.costSynergyExhaustionRisk >= 60 ? "Needs Review" : "Neutral") as Signal,
        detail: input.costSynergyExhaustionRisk >= 60 ? "Temporary integration savings are fading faster than structural margin drivers are replacing them." : "Cost takeout is no longer the only margin lever, which reduces exhaustion risk.",
        badge: input.costSynergyExhaustionRisk >= 60 ? "Needs Review" : "Derived",
      },
      {
        title: "Recurring revenue quality improving",
        signal: scoreToSignal(input.recurringRevenueQualityScore),
        detail: input.recurringRevenueQualityScore >= 78 ? "Retention, pricing realization, and contract duration all support a stronger recurring earnings base." : "Recurring mix is solid, but not yet obviously compounding faster.",
        badge: "Actual",
      },
      {
        title: "Clearing moat strengthening",
        signal: scoreToSignal(input.postTradeMoatScore),
        detail: input.postTradeMoatScore >= 76 ? "Post Trade economics look more defensible as collateral utility and network density improve together." : "Clearing remains strong, but moat expansion is only moderate.",
        badge: "Derived",
      },
      {
        title: "Pricing power expansion",
        signal: scoreToSignal(input.pricingPowerScore),
        detail: input.pricingPowerScore >= 66 ? "Bundling and workflow dependency are starting to translate into better pricing realization." : "Pricing power remains good but not yet broad enough to drive a full re-rating.",
        badge: "Derived",
      },
      {
        title: "Structural operating leverage improving",
        signal: scoreToSignal(input.structuralMarginExpansionScore),
        detail: input.structuralMarginExpansionScore >= 74 ? "Digital delivery, recurring mix, and clearing leverage now do more work than one-time integration savings." : "Operating leverage is improving, but too much still depends on finite synergy capture.",
        badge: "Derived",
      },
    ];

  return {
    overallScore,
    cards,
    conclusion:
      overallScore >= 75
        ? "LSEG is becoming structurally more valuable and more irreplaceable as a financial market operating system."
        : "LSEG still has strong assets, but the case for a compounding platform moat is not yet fully proven by the current trajectory.",
  };
}
