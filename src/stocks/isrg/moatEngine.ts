import type { IsrgDataLayer, IsrgMetricSource, IsrgMoatFactor } from "./model";
import { latestActual, latestFullYear, metricValue, safeDivide } from "./utils";

function sourceFrom(data: IsrgDataLayer, id: string): IsrgMetricSource {
  const record = data.sources.find((item) => item.id === id);
  return {
    sourceUrl: record?.url ?? null,
    sourceType: record?.sourceType ?? "manual_todo",
    publishedDate: null,
    retrievedAt: "2026-05-11T00:00:00.000Z",
    period: "research",
    metricName: record?.label ?? id,
    rawValue: record?.label ?? id,
    normalizedValue: record?.label ?? id,
    confidence: record?.sourceConfidence ?? "todo",
    usedInValuation: false,
    researchOnly: true,
    notes: record?.notes ?? "Research-only moat evidence placeholder.",
  };
}

export function calculateMoatEngine(data: IsrgDataLayer) {
  const latest = latestActual(data);
  const fy = latestFullYear(data);
  const installedBase = metricValue(latest.installedBase.daVinciInstalledBase);
  const recurringMix = safeDivide(metricValue(latest.revenue.instrumentsAccessories) + metricValue(latest.revenue.services), metricValue(latest.revenue.total));
  const procedureGrowth = metricValue(latest.procedures.worldwideDaVinciProcedureGrowth) || metricValue(fy.procedures.worldwideDaVinciProcedureGrowth);
  const dv5Share = safeDivide(metricValue(latest.placements.daVinci5Placements), metricValue(latest.placements.daVinciPlacements));

  const factors: IsrgMoatFactor[] = [
    {
      id: "installed-base-moat",
      label: "Installed base moat",
      score: Math.min(95, 55 + installedBase / 300),
      trend: "improving",
      evidence: `${installedBase.toLocaleString()} da Vinci systems installed at latest official disclosure.`,
      source: latest.installedBase.daVinciInstalledBase.source,
      confidence: "high",
      valuationRelevant: true,
    },
    {
      id: "surgeon-training-habit",
      label: "Surgeon training / habit moat",
      score: 84,
      trend: "stable",
      evidence: "Procedure growth above installed-base growth suggests surgeon familiarity and utilization still compound.",
      source: fy.procedures.worldwideDaVinciProcedureGrowth.source,
      confidence: "medium",
      valuationRelevant: true,
    },
    {
      id: "hospital-workflow-integration",
      label: "Hospital workflow integration",
      score: 80,
      trend: "stable",
      evidence: "Large installed base and service revenue attachment create workflow and uptime dependencies.",
      source: latest.revenue.services.source,
      confidence: "high",
      valuationRelevant: true,
    },
    {
      id: "instrument-ecosystem",
      label: "Instrument ecosystem",
      score: Math.min(95, 60 + recurringMix * 35),
      trend: "improving",
      evidence: `${(recurringMix * 100).toFixed(1)}% of latest revenue came from I&A plus services.`,
      source: latest.revenue.instrumentsAccessories.source,
      confidence: "high",
      valuationRelevant: true,
    },
    {
      id: "clinical-evidence",
      label: "Clinical evidence",
      score: 78,
      trend: "stable",
      evidence: "Clinical evidence is treated as a source diligence item; starter module tracks procedure growth as the observable adoption output.",
      source: sourceFrom(data, "q1-2026-release"),
      confidence: "medium",
      valuationRelevant: false,
    },
    {
      id: "regulatory-safety-record",
      label: "Regulatory and safety track record",
      score: 82,
      trend: "stable",
      evidence: "da Vinci 5 FDA clearance, CE mark, and cardiac indication expansion support product-cycle execution.",
      source: sourceFrom(data, "dv5-fda"),
      confidence: "high",
      valuationRelevant: false,
    },
    {
      id: "service-network",
      label: "Service network",
      score: 83,
      trend: "improving",
      evidence: "Service revenue grows with installed base and supports switching costs.",
      source: latest.revenue.services.source,
      confidence: "high",
      valuationRelevant: true,
    },
    {
      id: "product-cycle-leadership",
      label: "Product cycle leadership",
      score: Math.min(90, 65 + dv5Share * 35),
      trend: "improving",
      evidence: `da Vinci 5 was ${(dv5Share * 100).toFixed(1)}% of latest da Vinci placements.`,
      source: latest.placements.daVinci5Placements.source,
      confidence: "high",
      valuationRelevant: true,
    },
    {
      id: "data-software-optionality",
      label: "Data / software / digital surgery optionality",
      score: 68,
      trend: "improving",
      evidence: "da Vinci 5 compute and real-time insights support digital surgery optionality, but revenue model remains research-only.",
      source: sourceFrom(data, "dv5-insights"),
      confidence: "medium",
      valuationRelevant: false,
    },
  ];

  const moatScore = factors.reduce((sum, factor) => sum + factor.score, 0) / factors.length;
  const valuationRelevantScore =
    factors.filter((factor) => factor.valuationRelevant).reduce((sum, factor) => sum + factor.score, 0) /
    factors.filter((factor) => factor.valuationRelevant).length;

  return {
    factors,
    moatScore,
    valuationRelevantScore,
    procedureGrowth,
    conclusion:
      moatScore >= 80
        ? "ISRG still screens as a high-quality platform moat, but valuation relevance should flow through installed base, utilization, recurring revenue, and margin assumptions."
        : "Moat score needs review; do not underwrite a premium multiple without driver-level evidence.",
  };
}
