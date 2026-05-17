import type { MckDataset, MckRiskItem } from "../types";
import { clamp } from "./helpers";

export function calculateRiskEngine(data: MckDataset): MckRiskItem[] {
  return data.risks.map((risk) => {
    const score = clamp(risk.probability * risk.severity * 100, 0, 100);
    return {
      ...risk,
      score,
      signal: score > 35 ? "Negative" : score > 22 ? "Needs Review" : "Neutral",
    };
  });
}
