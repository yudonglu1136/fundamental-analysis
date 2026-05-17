import type { ValidationWarning } from "../../types";
import type { PltrActualQuarter, PltrResearchSignal, PltrTopicTrendPoint } from "../model";
import { clamp, metricValue, safeDivide, scoreFromPercent } from "./helpers";

export function calculateAipMonetizationEngine(
  actuals: PltrActualQuarter[],
  researchSignals: PltrResearchSignal[],
  topicTrends: PltrTopicTrendPoint[],
) {
  const latest = actuals[actuals.length - 1];
  const priorYear = actuals.find((period) => period.fiscalYear === latest.fiscalYear - 1 && period.fiscalQuarter === latest.fiscalQuarter);
  const usCommercialGrowth = metricValue(latest, "usCommercialGrowth");
  const usCommercialCustomerGrowth = priorYear
    ? safeDivide(metricValue(latest, "usCommercialCustomerCount"), metricValue(priorYear, "usCommercialCustomerCount")) - 1
    : 0;
  const commercialRevenuePerCustomer = safeDivide(
    metricValue(latest, "commercialRevenue"),
    metricValue(latest, "commercialCustomerCount"),
  );
  const priorCommercialRevenuePerCustomer = priorYear
    ? safeDivide(metricValue(priorYear, "commercialRevenue"), metricValue(priorYear, "commercialCustomerCount"))
    : 0;
  const revenuePerCustomerGrowth = priorCommercialRevenuePerCustomer
    ? commercialRevenuePerCustomer / priorCommercialRevenuePerCustomer - 1
    : 0;
  const managementSignal = researchSignals.find((signal) => signal.id === "aip-us-commercial-acceleration")?.score ?? 50;
  const aipMentions = topicTrends.filter((trend) => trend.topic === "AIP").reduce((sum, trend) => sum + trend.mentions, 0);
  const guidanceLinkedToAip = metricValue(latest, "guidanceRevenue") > 0 ? 80 : 45;
  const productionEvidence = metricValue(latest, "largeDeals10m") > 0 ? 75 : 45;

  const score =
    scoreFromPercent(usCommercialGrowth, 0.2, 1.4) * 0.22 +
    scoreFromPercent(usCommercialCustomerGrowth, 0.05, 0.5) * 0.18 +
    scoreFromPercent(revenuePerCustomerGrowth, -0.2, 0.6) * 0.14 +
    managementSignal * 0.16 +
    clamp(aipMentions * 6, 0, 100) * 0.08 +
    guidanceLinkedToAip * 0.1 +
    productionEvidence * 0.12;

  const warnings: ValidationWarning[] = [];
  if (topicTrends.every((trend) => trend.mentions === 0)) {
    warnings.push({
      id: "pltr-aip-transcript-data-missing",
      title: "AIP transcript evidence is missing",
      detail: "AIP adoption score currently leans on reported commercial KPIs because transcripts have not yet been parsed.",
      severity: "medium",
    });
  }

  return {
    score: Math.round(score),
    observedEvidence: [
      `US commercial revenue growth: ${(usCommercialGrowth * 100).toFixed(0)}%.`,
      `US commercial customer growth: ${(usCommercialCustomerGrowth * 100).toFixed(0)}%.`,
      `Commercial revenue per commercial customer: $${commercialRevenuePerCustomer.toFixed(2)}M per quarter.`,
      `Large Q1 2026 deal count: ${metricValue(latest, "largeDeals10m")} deals of at least $10M.`,
    ],
    inferredTrend: [
      "AIP appears to be converting fastest in US commercial, where customer growth and revenue growth both accelerated.",
      "Revenue growth is running ahead of customer growth, which supports an expansion and deal-size interpretation, but concentration still needs verification.",
    ],
    modelAssumptions: [
      "No AIP score is directly wired into revenue CAGR.",
      "To affect valuation, the analyst must explicitly change US commercial growth, retention, pricing, margin, or dilution assumptions.",
    ],
    valuationImpact: [
      "Research-only positive: stronger AIP evidence can support a higher commercial CAGR assumption.",
      "Research-only negative: weak production evidence or stalled customer expansion should lower commercial CAGR and terminal multiple assumptions.",
    ],
    warnings,
  };
}
