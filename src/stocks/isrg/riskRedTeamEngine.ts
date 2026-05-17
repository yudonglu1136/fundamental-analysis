import type { IsrgDataLayer, IsrgMetricSource, IsrgRiskRedTeamItem, IsrgValuationAssumptions } from "./model";
import { latestActual, latestFullYear, metricValue, safeDivide } from "./utils";

function researchSource(label: string, sourceUrl: string | null, notes: string): IsrgMetricSource {
  return {
    sourceUrl,
    sourceType: sourceUrl ? "official_ir" : "manual_todo",
    publishedDate: null,
    retrievedAt: "2026-05-11T00:00:00.000Z",
    period: "research",
    metricName: label,
    rawValue: label,
    normalizedValue: label,
    confidence: sourceUrl ? "medium" : "todo",
    usedInValuation: false,
    researchOnly: true,
    notes,
  };
}

export function calculateRiskRedTeamEngine(data: IsrgDataLayer, assumptions?: IsrgValuationAssumptions) {
  const latest = latestActual(data);
  const fy = latestFullYear(data);
  const currentPrice = assumptions?.currentPrice ?? data.marketData.currentPrice;
  const recurringMix = safeDivide(metricValue(latest.revenue.instrumentsAccessories) + metricValue(latest.revenue.services), metricValue(latest.revenue.total));
  const procedureGrowth = metricValue(latest.procedures.worldwideDaVinciProcedureGrowth) || metricValue(fy.procedures.worldwideDaVinciProcedureGrowth);
  const dv5Share = safeDivide(metricValue(latest.placements.daVinci5Placements), metricValue(latest.placements.daVinciPlacements));
  const leaseMix = safeDivide(metricValue(latest.placements.operatingLeasePlacements), metricValue(latest.placements.daVinciPlacements));

  const items: IsrgRiskRedTeamItem[] = [
    {
      id: "priced-for-perfect-execution",
      redFlag: "Current valuation may already price in sustained premium execution",
      evidence: `Market snapshot price is $${currentPrice.toFixed(2)} while the base model requires durable low/mid-teens procedure growth and high recurring mix.`,
      source: data.marketData.source,
      severity: "High",
      timeHorizon: "1-2 years",
      valuationImpact: "Multiple compression if procedure growth or margins miss.",
      monitorNextQuarter: "Reverse DCF required procedure CAGR versus updated guidance and actual procedure growth.",
    },
    {
      id: "procedure-growth-slowdown",
      redFlag: "Procedure growth slows from mid-teens to low-teens",
      evidence: `Latest reported da Vinci procedure growth is approximately ${(procedureGrowth * 100).toFixed(1)}%; guidance midpoint is ${(data.officialGuidance[0]?.midpoint ?? 0) * 100}%.`,
      source: latest.procedures.worldwideDaVinciProcedureGrowth.source,
      severity: "High",
      timeHorizon: "Next quarter",
      valuationImpact: "I&A revenue growth and utilization assumptions reset lower.",
      monitorNextQuarter: "Worldwide procedure growth, regional growth spread, category commentary, and GLP-1 mentions.",
    },
    {
      id: "dv5-replacement-not-tam",
      redFlag: "da Vinci 5 is a replacement cycle rather than TAM expansion",
      evidence: `da Vinci 5 was ${(dv5Share * 100).toFixed(1)}% of latest da Vinci placements, but replacement versus net-new demand needs ongoing proof.`,
      source: latest.placements.daVinci5Placements.source,
      severity: "Medium",
      timeHorizon: "1-2 years",
      valuationImpact: "Placement growth may not translate into higher long-term procedure CAGR.",
      monitorNextQuarter: "Net new installed base, replacement proxy, da Vinci 5 backlog/supply commentary, and ASP evidence.",
    },
    {
      id: "ion-overcapitalized",
      redFlag: "Ion optionality is overcapitalized before revenue materiality",
      evidence: "Ion installed base and procedure growth are disclosed, but Ion revenue is not separately disclosed in the starter data.",
      source: latest.installedBase.ionInstalledBase.source,
      severity: "Medium",
      timeHorizon: "3-5 years",
      valuationImpact: "Optionality value should stay probability-weighted and haircut until revenue contribution is visible.",
      monitorNextQuarter: "Ion placements, installed base, procedure growth, reimbursement, and revenue disclosure changes.",
    },
    {
      id: "competition-margin-compression",
      redFlag: "J&J, Medtronic, CMR, and China players compress ASP or margin",
      evidence: "Competitive trackers are research-only but map to explicit ASP pressure and margin compression assumptions.",
      source: researchSource("Competition risk tracker", null, "Add official competitor/regulatory sources before changing model inputs."),
      severity: "High",
      timeHorizon: "3-5 years",
      valuationImpact: "Systems ASP, segment multiples, and terminal margins compress.",
      monitorNextQuarter: "Competitor approvals, tender results, hospital multi-vendor adoption, and China localization commentary.",
    },
    {
      id: "tariff-and-supply-chain",
      redFlag: "Tariffs and supply chain pressure have real gross margin impact",
      evidence: "FY 2026 non-GAAP gross margin guidance includes an estimated tariff impact of 1.0% of revenue.",
      source: data.officialGuidance[1].source,
      severity: "Medium",
      timeHorizon: "Next quarter",
      valuationImpact: "Gross margin bridge and FCF margin sensitivity deteriorate.",
      monitorNextQuarter: "Gross margin guide, inventory, manufacturing commentary, tariff assumptions, and localization costs.",
    },
    {
      id: "lease-mix-revenue-timing",
      redFlag: "Usage-based leasing lowers adoption friction but pressures upfront system revenue",
      evidence: `Latest operating lease mix was ${(leaseMix * 100).toFixed(1)}% of da Vinci placements.`,
      source: latest.placements.operatingLeasePlacements.source,
      severity: "Medium",
      timeHorizon: "1-2 years",
      valuationImpact: "Reported systems revenue and ASP proxy can weaken even if installed base grows.",
      monitorNextQuarter: "Operating lease placements, usage-based lease mix, system ASP proxy, and installed-base growth.",
    },
    {
      id: "sbc-and-dilution",
      redFlag: "SBC, dilution, and buybacks affect per-share compounding",
      evidence: `Q1 2026 disclosed $${metricValue(latest.sbcExpense).toFixed(1)}m of share-based compensation and $${metricValue(latest.buybackAmount).toFixed(1)}m of repurchases.`,
      source: latest.sbcExpense.source,
      severity: "Medium",
      timeHorizon: "1-2 years",
      valuationImpact: "Per-share EPS/FCF growth can diverge from enterprise value growth.",
      monitorNextQuarter: "Diluted share count, SBC expense, repurchase price, and net cash balance.",
    },
  ];

  return {
    items,
    redTeamRiskLevel: items.some((item) => item.severity === "High") ? "High" : "Medium",
    marketPricingQuestion:
      "Is ISRG still a high-quality surgical robotics compounder, or is the stock priced for flawless procedure growth, da Vinci 5 rollout, margin durability, and limited competitive disruption?",
    killCriteria: [
      "Procedure growth falls below installed-base growth for multiple quarters without a credible category-mix explanation.",
      "da Vinci 5 placements are mostly replacement while total installed-base growth slows.",
      "I&A revenue per procedure declines materially without mix-driven explanation.",
      "Tariff/competition pressure drives sustained operating margin compression.",
      "Ion/SP optionality consumes investment without evidence of consolidated revenue relevance.",
    ],
    recurringMix,
  };
}
