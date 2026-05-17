import type { DgeDataset, DgeUsDemandOutput } from "../types";
import { average, clamp, evidenceList, scoreFromGrowth } from "./helpers";

export function buildDgeUsDemandEngine(data: DgeDataset): DgeUsDemandOutput {
  const q3Na = data.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "North America");
  const q1Na = data.reportedData.regions.find((row) => row.periodId === "q1-fy2026" && row.region === "North America");
  const usSpiritsInventory = data.reportedData.channelInventory.find((row) => row.periodId === "q3-fy2026" && row.region === "North America");
  const tequila = data.reportedData.categories.find((row) => row.category === "Tequila");
  const whiskey = data.reportedData.categories.find((row) => row.category === "Canadian Whisky");
  const usPeers = data.competitorData.filter((peer) => peer.usGrowth != null);

  const q3Growth = q3Na?.organicNetSalesGrowth ?? 0;
  const q1Growth = q1Na?.organicNetSalesGrowth ?? 0;
  const depletionsGap = (usSpiritsInventory?.shipmentsGrowth ?? 0) - (usSpiritsInventory?.depletionsGrowth ?? 0);
  const consumptionGrowth = usSpiritsInventory?.consumptionGrowth ?? q3Growth;
  const industryPressure = average([-0.04, -0.022, 0.008]);
  const peerUsGrowth = average(usPeers.map((peer) => peer.usGrowth ?? 0));
  const categoryScore = average([
    scoreFromGrowth(tequila?.categoryGrowth ?? -0.04, 0, 0.08),
    scoreFromGrowth(whiskey?.categoryGrowth ?? -0.03, 0, 0.08),
  ]);

  const shipmentQualityScore = clamp(50 + depletionsGap * 400 - (usSpiritsInventory?.destocking ?? 0) * 350);
  const affordabilityPressureScore = clamp((tequila?.affordabilityPressure ?? 70) * 0.55 + 35);
  const competitivePressureScore = clamp(
    average(data.reportedData.brands.filter((brand) => brand.regionExposure["North America"]).map((brand) => brand.competitivePressure)),
  );
  const tequilaRiskScore = clamp((tequila?.riskScore ?? 80) + Math.abs(tequila?.depletionsVsShipments ?? -0.05) * 150);
  const trendScore = scoreFromGrowth(consumptionGrowth, -0.02, 0.1);
  const sequentialScore = scoreFromGrowth(q3Growth - q1Growth, -0.03, 0.12);
  const usDemandScore = Math.round(
    clamp(trendScore * 0.3 + shipmentQualityScore * 0.2 + (100 - affordabilityPressureScore) * 0.15 + (100 - competitivePressureScore) * 0.15 + categoryScore * 0.1 + sequentialScore * 0.1),
  );

  const trueConsumptionTrend =
    consumptionGrowth > -0.02 ? "improving" : consumptionGrowth > -0.06 ? "stable" : "deteriorating";
  const evidenceIds = evidenceList(
    q3Na?.sourceEvidenceIds ?? [],
    q1Na?.sourceEvidenceIds ?? [],
    usSpiritsInventory?.sourceEvidenceIds ?? [],
    tequila?.sourceEvidenceIds ?? [],
    data.competitorData.flatMap((peer) => peer.sourceEvidenceIds),
    ["industry-iwsr-us-2025", "industry-niq-onpremise-2025", "industry-discus-2025"],
  );

  return {
    usDemandScore,
    trueConsumptionTrend,
    shipmentQualityScore: Math.round(shipmentQualityScore),
    depletionsVsShipmentsGap: depletionsGap,
    affordabilityPressureScore: Math.round(affordabilityPressureScore),
    competitivePressureScore: Math.round(competitivePressureScore),
    tequilaRiskScore: Math.round(tequilaRiskScore),
    scenarios: {
      Bear: -0.08,
      Base: -0.02,
      Bull: 0.025,
    },
    diagnosis:
      usDemandScore < 45
        ? "US Spirits has not clearly bottomed. Q3 shipments were worse than depletions, true consumption remains weak, and tequila/Crown Royal share pressure points to brand competitiveness as well as channel adjustment."
        : "US demand is closer to stabilization, but the model still requires depletions and consumption to turn before underwriting a clean North America recovery.",
    bridge: [
      { label: "North America reported/organic sales", value: q3Growth, explanation: "Regional sales are the starting point, not the consumer-demand endpoint." },
      { label: "US Spirits shipment gap", value: depletionsGap, explanation: "Shipments were around five points weaker than depletions in Q3." },
      { label: "Modeled true consumption", value: consumptionGrowth, explanation: "Research-only bridge after inventory and affordability pressure." },
      { label: "Industry spirits backdrop", value: industryPressure, explanation: "Public industry data show broad US spirits volume/value pressure." },
      { label: "Peer US read-through", value: peerUsGrowth, explanation: "Pernod and Brown-Forman confirm US weakness is not Diageo-only, but Diageo share loss is company-specific." },
    ],
    evidenceIds,
    warnings: [
      "North America net sales are not used as a direct consumer-demand proxy.",
      "US Spirits shipments, depletions and consumption are separated; only shipments are directly reported by Diageo at this granularity.",
      ...(tequilaRiskScore > 75 ? ["Tequila normalization is a central risk, especially Casamigos and Don Julio."] : []),
    ],
  };
}
