import type { AznDataset, AznDrugRevenue, AznDurabilityScore } from "../types";
import { clamp, riskScore, safeRatio } from "./helpers";

function patentScore(drug: AznDrugRevenue, data: AznDataset) {
  const patent = data.patentRiskData.find((item) => item.product === drug.drugName || item.product.includes(drug.drugName));
  if (!patent) return 3;
  if (patent.genericBiosimilarRisk === "High") return patent.product === "Farxiga" || patent.product === "Lynparza" || patent.product === "Brilinta" || patent.product === "Symbicort" || patent.product === "Soliris" ? 1 : 2;
  if (patent.genericBiosimilarRisk === "Medium") return 3;
  return 5;
}

function regionDiversificationScore(drug: AznDrugRevenue) {
  const values = Object.entries(drug.regionExposure)
    .filter(([region]) => region !== "Global" && region !== "China" && region !== "Japan")
    .map(([, value]) => value);
  const largest = Math.max(...values, 0);
  return clamp(Math.round((1 - largest) * 7), 1, 5);
}

function leadershipScore(drug: AznDrugRevenue) {
  const text = drug.marketPosition.toLowerCase();
  if (/leader|leadership|standard-of-care|backbone/.test(text)) return 5;
  if (/fastest-growing|successor|core/.test(text)) return 4;
  if (/mature/.test(text)) return 2;
  return 3;
}

function indicationExpansionScore(drug: AznDrugRevenue) {
  const text = `${drug.lifecycleExpansion} ${drug.comboTherapyPotential}`.toLowerCase();
  if (/high|multiple|broad|phase iii|adult|launch/.test(text)) return 5;
  if (/medium|additional|expanded/.test(text)) return 4;
  if (/limited|tail/.test(text)) return 1;
  return 3;
}

export function buildDrugDurabilityMatrix(data: AznDataset, periodId: string) {
  const drugs = data.reportedData.drugRevenue.filter((row) => row.periodId === periodId);
  const scores: AznDurabilityScore[] = drugs.map((drug) => {
    const marketLeadershipScore = leadershipScore(drug);
    const patentProtectionScore = patentScore(drug, data);
    const indicationScore = indicationExpansionScore(drug);
    const competitiveMoatScore = riskScore(drug.competitiveRisk) + (marketLeadershipScore >= 4 ? 1 : 0);
    const pricingPowerScore = riskScore(drug.pricingRisk);
    const geographicDiversificationScore = regionDiversificationScore(drug);
    const raw =
      marketLeadershipScore +
      patentProtectionScore +
      indicationScore +
      clamp(competitiveMoatScore, 1, 5) +
      pricingPowerScore +
      geographicDiversificationScore;
    return {
      drugName: drug.drugName,
      marketLeadershipScore,
      patentProtectionScore,
      indicationExpansionScore: indicationScore,
      competitiveMoatScore: clamp(competitiveMoatScore, 1, 5),
      pricingPowerScore,
      geographicDiversificationScore,
      durabilityScore: Math.round((raw / 30) * 100),
      explanation: `${drug.drugName} scores ${Math.round((raw / 30) * 100)} because leadership (${marketLeadershipScore}/5), patent protection (${patentProtectionScore}/5), expansion (${indicationScore}/5), competition (${clamp(competitiveMoatScore, 1, 5)}/5), pricing (${pricingPowerScore}/5), and geography (${geographicDiversificationScore}/5) are scored separately.`,
    };
  });

  const scoreByDrug = new Map(scores.map((score) => [score.drugName, score]));
  const matrix = drugs
    .map((drug) => ({
      ...drug,
      annualizedRevenue: drug.currentRevenue * 4,
      percentageOfProductRevenue: safeRatio(drug.currentRevenue, data.periods.find((period) => period.id === periodId)?.productRevenue ?? 1),
      durability: scoreByDrug.get(drug.drugName),
      patentRisk: data.patentRiskData.find((risk) => risk.product === drug.drugName || risk.product.includes(drug.drugName)),
    }))
    .sort((a, b) => b.currentRevenue - a.currentRevenue);

  return {
    matrix,
    scores,
    topDurability: [...matrix].sort((a, b) => (b.durability?.durabilityScore ?? 0) - (a.durability?.durabilityScore ?? 0)).slice(0, 5),
    highRiskRevenue: matrix
      .filter((drug) => (drug.durability?.patentProtectionScore ?? 5) <= 2 || drug.competitiveRisk === "High")
      .reduce((sum, drug) => sum + drug.currentRevenue, 0),
  };
}
