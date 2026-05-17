import type {
  GooglAiTpuCapexOutput,
  GooglCloudOutput,
  GooglMoatOutput,
  GooglOtherBetsOutput,
  GooglRegulatoryRiskOutput,
  GooglSearchAdsOutput,
  GooglYoutubeOutput,
} from "../model";
import { clamp } from "./helpers";

export function calculateGooglMoatEngine(
  search: GooglSearchAdsOutput,
  youtube: GooglYoutubeOutput,
  cloud: GooglCloudOutput,
  tpu: GooglAiTpuCapexOutput,
  regulatory: GooglRegulatoryRiskOutput,
  otherBets: GooglOtherBetsOutput,
): GooglMoatOutput {
  const drivers = [
    {
      label: "Search intent graph",
      score: search.searchMoatScore,
      explanation: "Search growth, paid-click/CPC disclosure, AI monetization balance, TAC and distribution risk.",
    },
    {
      label: "YouTube creator graph",
      score: youtube.youtubeScaleScore,
      explanation: "Living-room usage, Shorts publishing scale, subscription adjacency, and creator monetization surface.",
    },
    {
      label: "Cloud AI backlog",
      score: cloud.aiWorkloadScore,
      explanation: "Backlog coverage, AI workload demand, Gemini Enterprise momentum, and Cloud margin expansion.",
    },
    {
      label: "TPU vertical integration",
      score: tpu.tpuMoatScore,
      explanation: "TPU performance per dollar, response cost reductions, utilization and capex payback.",
    },
    {
      label: "Regulatory resilience",
      score: clamp(100 - regulatory.riskScore, 5, 95),
      explanation: "Residual moat after antitrust, DMA, Play and privacy remedies.",
    },
    {
      label: "Option portfolio",
      score: clamp(65 - otherBets.burnRiskScore * 0.25 + otherBets.waymoRideScale / 40_000, 20, 85),
      explanation: "Waymo scale and Other Bets burn discipline without over-capitalizing options.",
    },
  ];
  const moatScore = clamp(drivers.reduce((sum, driver) => sum + driver.score, 0) / drivers.length, 15, 95);
  return { moatScore, drivers };
}
