import type { IsrgCompetitor, IsrgDataLayer, IsrgMetricSource } from "./model";

function researchSource(label: string, url: string | null, notes: string): IsrgMetricSource {
  return {
    sourceUrl: url,
    sourceType: url?.includes("intuitive") || url?.includes("isrg") ? "official_ir" : "manual_todo",
    publishedDate: null,
    retrievedAt: "2026-05-11T00:00:00.000Z",
    period: "research",
    metricName: label,
    rawValue: label,
    normalizedValue: label,
    confidence: url ? "medium" : "todo",
    usedInValuation: false,
    researchOnly: true,
    notes,
  };
}

export function calculateCompetitionRiskEngine(_data: IsrgDataLayer) {
  const competitors: IsrgCompetitor[] = [
    {
      id: "jnj-ottava",
      name: "Johnson & Johnson Ottava",
      productStatus: "Robotic surgery platform in development / staged commercialization path.",
      regulatoryStatus: "Requires ongoing regulatory tracking before valuation impact.",
      targetProcedures: "General surgery and multi-specialty robotic procedures.",
      geography: "United States and international markets over time.",
      commercializationMaturity: "early",
      likelyImpact: "Most relevant if J&J can use Ethicon channel strength to compete in general surgery.",
      riskSeverity: "Medium",
      timing: "Medium term",
      source: researchSource("J&J Ottava competitive tracker", null, "Research-only placeholder. Add official J&J/regulatory source through data/local/isrg/official."),
      researchOnly: true,
    },
    {
      id: "mdt-hugo",
      name: "Medtronic Hugo",
      productStatus: "Commercially available in selected geographies with evolving indications.",
      regulatoryStatus: "Track FDA/CE/regional approvals and indication breadth.",
      targetProcedures: "Urology, gynecology, general surgery categories where approved.",
      geography: "Europe, Asia, and selected international markets; U.S. timing requires verification.",
      commercializationMaturity: "ramping",
      likelyImpact: "Could pressure system ASP and hospital negotiations before materially shifting surgeon installed-base behavior.",
      riskSeverity: "Medium",
      timing: "Medium term",
      source: researchSource("Medtronic Hugo competitive tracker", null, "Research-only placeholder. Add official Medtronic/regulatory source before changing assumptions."),
      researchOnly: true,
    },
    {
      id: "cmr-versius",
      name: "CMR Versius",
      productStatus: "Commercial surgical robotics system in selected countries.",
      regulatoryStatus: "Track country-level approvals and procedure categories.",
      targetProcedures: "General surgery, gynecology, urology, and laparoscopic categories.",
      geography: "Europe and international markets.",
      commercializationMaturity: "ramping",
      likelyImpact: "Potential hospital-budget alternative in international markets; most relevant to OUS ASP and tender pressure.",
      riskSeverity: "Medium",
      timing: "Medium term",
      source: researchSource("CMR Versius competitive tracker", null, "Research-only placeholder. Add official CMR/regulatory source before changing assumptions."),
      researchOnly: true,
    },
    {
      id: "china-local-players",
      name: "China local robotic surgery players",
      productStatus: "Local competitors and localization initiatives require procedure/category tracking.",
      regulatoryStatus: "Track NMPA approvals, tender outcomes, and local hospital adoption.",
      targetProcedures: "Urology, gynecology, general surgery, thoracic, and localized categories.",
      geography: "China",
      commercializationMaturity: "unclear",
      likelyImpact: "Highest regional risk to ASP, placements, and long-duration OUS penetration economics.",
      riskSeverity: "High",
      timing: "Near term",
      source: researchSource("China local robotics competitive tracker", null, "Research-only placeholder. Needs reliable regional source and tender evidence."),
      researchOnly: true,
    },
  ];

  const riskHeatmap = [
    { category: "General surgery", globalRisk: "Medium", chinaRisk: "High", marginRisk: "Medium" },
    { category: "Urology", globalRisk: "Medium", chinaRisk: "Medium", marginRisk: "Medium" },
    { category: "Gynecology", globalRisk: "Medium", chinaRisk: "Medium", marginRisk: "Medium" },
    { category: "Thoracic / biopsy", globalRisk: "Low", chinaRisk: "Medium", marginRisk: "Low" },
    { category: "Capital equipment ASP", globalRisk: "Medium", chinaRisk: "High", marginRisk: "High" },
  ];

  return {
    competitors,
    riskHeatmap,
    timeline: competitors.map((competitor) => ({
      competitor: competitor.name,
      timing: competitor.timing,
      severity: competitor.riskSeverity,
      likelyImpact: competitor.likelyImpact,
    })),
    valuationRule:
      "Competition tracker is research-only. Valuation changes only through explicit assumptions such as competitionAspPressure, marginCompression, or terminal multiples.",
  };
}
