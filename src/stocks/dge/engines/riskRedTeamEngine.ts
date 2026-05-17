import type {
  DgeBrandPortfolioOutput,
  DgeCashFlowOutput,
  DgeDataset,
  DgeLacInventoryOutput,
  DgeMarginSavingsOutput,
  DgeUsDemandOutput,
} from "../types";
import { average, clamp } from "./helpers";

export function buildDgeRiskRedTeam(
  data: DgeDataset,
  usDemand: DgeUsDemandOutput,
  lacInventory: DgeLacInventoryOutput,
  brandPortfolio: DgeBrandPortfolioOutput,
  marginSavings: DgeMarginSavingsOutput,
  cashFlow: DgeCashFlowOutput,
) {
  const risks = [
    {
      id: "us-demand",
      title: "US Spirits demand has not bottomed",
      probability: clamp(100 - usDemand.usDemandScore),
      severity: 88,
      detectability: 72,
      timeToMaterialize: "1-3 quarters",
      killCriteria: "US depletions and consumption keep declining while shipments only temporarily normalize.",
      mitigation: "Require depletion improvement and category share stabilization before underwriting multiple expansion.",
      evidenceIds: usDemand.evidenceIds,
    },
    {
      id: "lac-inventory",
      title: "LAC growth is low-quality restocking",
      probability: clamp(100 - lacInventory.lacInventoryHealthScore + lacInventory.pullForwardRisk * 0.25),
      severity: 74,
      detectability: 65,
      timeToMaterialize: "Q4 FY2026 / H1 FY2027",
      killCriteria: "Brazil recovery fades, Mexico stays negative, and World Cup pull-forward reverses.",
      mitigation: "Track normalized LAC growth after inventory and low-base haircuts.",
      evidenceIds: lacInventory.evidenceIds,
    },
    {
      id: "tequila-reset",
      title: "Tequila super-premium reset deepens",
      probability: brandPortfolio.tequilaNormalizationRisk,
      severity: 80,
      detectability: 70,
      timeToMaterialize: "Ongoing",
      killCriteria: "Casamigos and Don Julio require sustained promotion and still lose share.",
      mitigation: "Separate category slowdown from Diageo share loss; demand evidence from Circana/Nielsen/NABCA should be refreshed.",
      evidenceIds: brandPortfolio.evidenceIds,
    },
    {
      id: "premiumisation-failure",
      title: "Premiumisation thesis turns into affordability problem",
      probability: brandPortfolio.affordabilityGapScore,
      severity: 76,
      detectability: 60,
      timeToMaterialize: "2-6 quarters",
      killCriteria: "Price/mix stays negative while volume recovery requires value-tier promotions.",
      mitigation: "Underwrite value-tier coverage and portfolio rebalancing rather than blanket premiumisation.",
      evidenceIds: ["h1fy2026-us-affordability", "research-assumption-demand-cycle"],
    },
    {
      id: "fx-tariffs",
      title: "FX and tariff drag absorb savings",
      probability: 58,
      severity: 62,
      detectability: 55,
      timeToMaterialize: "FY2026-FY2027",
      killCriteria: "Tariff/FX headwinds exceed savings and are not offset by price or supply-chain action.",
      mitigation: "Keep margin scenario haircut until quantified tariff impact is disclosed.",
      evidenceIds: marginSavings.evidenceIds,
    },
    {
      id: "leverage-dividend",
      title: "Deleveraging and dividend floor credibility weaken",
      probability: clamp(100 - cashFlow.dividendSafetyScore + (cashFlow.fcfQualityScore < 60 ? 20 : 0)),
      severity: 82,
      detectability: 75,
      timeToMaterialize: "FY2026 cash-flow close",
      killCriteria: "FCF misses $3bn materially, EABL proceeds slip, leverage remains above comfort range.",
      mitigation: "Use rebased dividend floor only and haircut old payout history.",
      evidenceIds: cashFlow.evidenceIds,
    },
    {
      id: "management-execution",
      title: "Turnaround execution is slower than market patience",
      probability: 62,
      severity: 68,
      detectability: 58,
      timeToMaterialize: "FY2027",
      killCriteria: "Customer-service, affordability and operating-model changes do not stabilize US share.",
      mitigation: "Tie valuation multiple to evidence of early wins, not strategy language.",
      evidenceIds: ["h1fy2026-priorities", "q3fy2026-guidance"],
    },
  ].map((risk) => ({
    ...risk,
    riskScore: Math.round(clamp(risk.probability * 0.42 + risk.severity * 0.42 + (100 - risk.detectability) * 0.16)),
  }));

  return {
    verdict:
      usDemand.usDemandScore < 45 || lacInventory.lacInventoryHealthScore < 55
        ? "Caution: DGE can be a value trap unless US depletions/consumption stabilize and LAC growth survives inventory normalization."
        : "Balanced: valuation can work if US demand bottoms and LAC growth quality improves, but evidence must keep moving.",
    strongestBearCase:
      "The market is not overreacting to a temporary consumer-staples wobble; Diageo has category/share problems in US Spirits, super-premium tequila is normalizing, and LAC recovery quality is overstated by channel effects.",
    killCriteria: risks.map((risk) => risk.killCriteria),
    riskRegister: risks.sort((a, b) => b.riskScore - a.riskScore),
    monitoringTriggers: [
      "US Spirits depletion growth versus shipments.",
      "Casamigos, Don Julio and Crown Royal share data.",
      "LAC Q4/FY27 growth after World Cup pull-forward reverses.",
      "Brazil sell-out and Mexico stabilization.",
      "FY2026 FCF bridge: OCF, capex, working capital, exceptionals, inventory build.",
      "Net debt / adjusted EBITDA after EABL disposal proceeds.",
    ],
    aggregateRiskScore: Math.round(average(risks.map((risk) => risk.riskScore))),
    evidenceIds: Array.from(new Set(risks.flatMap((risk) => risk.evidenceIds))),
    dataSourceCount: data.evidenceData.length,
  };
}
