import type { NocDataset, NocRiskOutput } from "../model";
import { scoreToRiskLabel } from "./helpers";

export function calculateNocRiskRedTeamEngine(data: NocDataset): NocRiskOutput {
  const rows = data.risks
    .map((risk) => {
      const weightedScore = Math.round((risk.probability * 0.35 + risk.impact * 0.45 + (1 - risk.detectability) * 0.2) * 100);
      return {
        ...risk,
        weightedScore,
        severityLabel: scoreToRiskLabel(weightedScore),
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);

  const riskScore = Math.round(rows.reduce((sum, row) => sum + row.weightedScore, 0) / Math.max(rows.length, 1));
  return {
    riskScore,
    redTeamVerdict:
      "NOC is not a generic defense multiple story: the bull case needs B-21 scale economics, Sentinel cost discipline, Space re-acceleration and Mission Systems margin durability to show up together. The bear case is not budget collapse; it is budget dollars arriving through programs with poor cost conversion.",
    killCriteria: rows.map((row) => row.killCriterion),
    rows,
    monitoringTriggers: [
      "B-21: any new LRIP provision, revised production economics, or evidence that acceleration requires margin concessions.",
      "Sentinel: restructuring milestones, EAC adjustments, incremental DoD/GAO cost updates and initial capability timing.",
      "Space Systems: backlog conversion into sales after NGI/restricted wind-down, SDA material timing and GEM 63XL resolution.",
      "Mission Systems: margin staying in the high-14%/15% zone without one-off favorable EAC dependence.",
      "Cash conversion: trade working capital, unbilled receivables and FY2026 FCF guidance bridge.",
      "Backlog: funded ratio, book-to-bill and segment mix of restricted awards.",
    ],
  };
}
