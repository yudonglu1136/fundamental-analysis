import type { AznDataset } from "../types";

export function buildChinaExposureEngine(data: AznDataset) {
  const china = data.reportedData.geographies.find((region) => region.region === "China");
  const emerging = data.reportedData.geographies.find((region) => region.region === "Emerging Markets");
  const total = data.periods.find((period) => period.id === "q1-2026")?.totalRevenue ?? 1;
  const chinaRevenue = china?.revenue ?? 0;
  const emergingRevenue = emerging?.revenue ?? 0;

  return {
    chinaRevenue,
    chinaGrowth: china?.yoyGrowthCer ?? 0,
    chinaPercentageOfTotal: chinaRevenue / total,
    emergingMarketsRevenue: emergingRevenue,
    emergingMarketsGrowth: emerging?.yoyGrowthCer ?? 0,
    emergingMarketsPercentageOfTotal: emergingRevenue / total,
    vbpNrdlRisk: "High for mature and China-exposed products such as Farxiga, Lynparza and roxadustat; more balanced for innovative oncology launches.",
    antiCorruptionHospitalChannelRisk: "Medium: hospital channel and anti-corruption cycles can affect timing and tender behaviour.",
    localCompetition: "High in mature CVRM and selected oncology classes; lower in high-science launches with differentiated data.",
    regulatoryRisk: "Medium: approval and reimbursement cadence can help or hurt adoption.",
    longTermGrowthOpportunity: "China remains large, but the model treats it as a growth-plus-policy-risk engine rather than a pure TAM story.",
    geographyRevenueSplit: data.reportedData.geographies,
    chinaScenario: {
      Bear: chinaRevenue * 4 * 0.92,
      Base: chinaRevenue * 4 * 1.03,
      Bull: chinaRevenue * 4 * 1.11,
    },
  };
}
