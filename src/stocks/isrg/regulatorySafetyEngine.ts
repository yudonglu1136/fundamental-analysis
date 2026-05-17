import type { IsrgDataLayer } from "./model";
import { productSafetySources, regulatoryData } from "./data/regulatoryData";

export function calculateRegulatorySafetyEngine(_data: IsrgDataLayer) {
  const activeMilestones = regulatoryData;
  const safetyWatchlist = [
    {
      id: "recalls",
      title: "FDA recalls",
      status: "watch",
      severity: "Medium" as const,
      evidence: "Recall data should be fetched from FDA sources and manually reviewed before promotion into model variables.",
      sourceUrl: productSafetySources.find((source) => source.id === "fda-recalls")?.sourceUrl ?? null,
    },
    {
      id: "maude",
      title: "MAUDE adverse events",
      status: "watch",
      severity: "Medium" as const,
      evidence: "MAUDE is a signal-generation source, not a normalized incidence-rate dataset.",
      sourceUrl: productSafetySources.find((source) => source.id === "fda-maude")?.sourceUrl ?? null,
    },
    {
      id: "dv5-rollout",
      title: "da Vinci 5 regional approvals and launch discipline",
      status: "watch",
      severity: "Medium" as const,
      evidence: "Approvals matter only when converted into placements, utilization, revenue/procedure, or margin assumptions.",
      sourceUrl: activeMilestones.find((milestone) => milestone.id === "dv5-fda-clearance")?.sourceUrl ?? null,
    },
  ];

  return {
    milestones: activeMilestones,
    safetySources: productSafetySources,
    safetyWatchlist,
    riskScore: 58,
    valuationRule:
      "Regulatory, recall, MAUDE, and safety items are research-only until they create validated assumptions for procedure growth, installed-base adoption, ASP, legal cost, or margin.",
    nextQuarterMonitors: [
      "Any new FDA recall classes or field corrections tied to da Vinci systems",
      "MAUDE trend changes that require denominator-normalized follow-up",
      "da Vinci 5 clearance/approval cadence outside the U.S.",
      "Product safety or training comments in 10-Q risk factors",
    ],
  };
}

