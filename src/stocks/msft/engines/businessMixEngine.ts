import type { MsftDataset } from "../model";

export function calculateMsftBusinessMixEngine(data: MsftDataset) {
  const rows = data.businessUnits.map((unit) => ({
    ...unit,
    qualityScore: Math.round(unit.moatScore * 0.35 + unit.growthScore * 0.25 + unit.marginScore * 0.25 + (100 - unit.riskScore) * 0.15),
  }));
  return {
    rows,
    topMoat: rows.slice().sort((a, b) => b.moatScore - a.moatScore)[0],
    topRisk: rows.slice().sort((a, b) => b.riskScore - a.riskScore)[0],
  };
}
