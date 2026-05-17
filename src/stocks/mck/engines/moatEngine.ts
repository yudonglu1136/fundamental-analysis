import type { MckDataset } from "../types";
import { calculateSegmentEconomicsEngine } from "./segmentEconomicsEngine";

export function calculateMoatEngine(data: MckDataset) {
  const segmentEconomics = calculateSegmentEconomicsEngine(data);
  const weightedMoatScore = segmentEconomics.segments.reduce((sum, segment) => sum + segment.moatScore * segment.profitMix, 0);
  return {
    weightedMoatScore,
    sources: [
      "Scale purchasing and fulfillment density in pharmaceutical distribution.",
      "Provider/practice-management stickiness in oncology and multispecialty.",
      "Manufacturer and patient connectivity in RxTS and biopharma services.",
      "Cash-flow scale supports recurring buyback-driven per-share compounding.",
    ],
    caveats: [
      "Low gross margin is not evidence of weak moat, but it makes operating discipline and working capital critical.",
      "Moat score is research-only and does not directly change valuation multiples without explicit analyst assumption changes.",
    ],
  };
}
