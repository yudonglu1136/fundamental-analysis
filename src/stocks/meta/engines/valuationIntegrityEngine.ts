import type { ValidationWarning } from "../../types";
import { metaAssumptionMetadata, metaValuationAssumptionKeys } from "../assumptions";
import type { MetaDataset, MetaForecastYear, MetaLineageAuditItem, MetaMarketImpliedValuation, MetaThesisBreakpoint, MetaValuationIntegrityOutput, MetaValuationOutput } from "../model";

function warning(id: string, title: string, detail: string, severity: ValidationWarning["severity"]): ValidationWarning {
  return { id, title, detail, severity };
}

function auditArea(area: string, rows: Array<{ lineage?: unknown; fieldLineage?: Record<string, unknown> | undefined }>): MetaLineageAuditItem {
  const total = rows.length;
  const covered = rows.filter((row) => Boolean(row.lineage)).length;
  const manualSeedCount = rows.filter((row) => {
    const lineage = row.lineage as { sourceType?: string } | undefined;
    return lineage?.sourceType === "manual_seed";
  }).length;
  const lowConfidenceCount = rows.filter((row) => {
    const lineage = row.lineage as { confidence?: string } | undefined;
    return lineage?.confidence === "low";
  }).length;
  return {
    area,
    covered,
    total,
    coverage: total === 0 ? 1 : covered / total,
    manualSeedCount,
    lowConfidenceCount,
    notes: `${covered}/${total} rows carry row-level lineage.`,
  };
}

export function calculateMetaValuationIntegrity(
  data: MetaDataset,
  forecast: MetaForecastYear[],
  valuation: MetaValuationOutput,
  marketImplied: MetaMarketImpliedValuation,
  breakpoints: MetaThesisBreakpoint[],
): MetaValuationIntegrityOutput {
  const lineageAudit = [
    auditArea("Sources", data.sources),
    auditArea("Official actuals", data.periods),
    auditArea("Segments", data.segments),
    auditArea("Guidance", data.guidance),
    auditArea("Ad economics", data.adEconomics),
    auditArea("AI capex", data.aiCapex),
    auditArea("Product signals", data.productSignals),
    auditArea("Reality Labs", data.realityLabs),
    auditArea("Risks", data.regulatoryRisks),
    auditArea("Transcripts", data.transcriptInsights),
    auditArea("Earnings calls", data.earningsCalls),
    auditArea("Research notes", data.researchNotes),
    auditArea("Market data", [data.marketData]),
  ];
  const weightedCoverage = lineageAudit.reduce((sum, item) => sum + item.coverage, 0) / Math.max(lineageAudit.length, 1);
  const assumptionCoverage = metaValuationAssumptionKeys.filter((key) => Boolean(metaAssumptionMetadata[key]?.lineage)).length / metaValuationAssumptionKeys.length;
  const productSignalsCapitalizedDirectly = data.productSignals.filter((signal) => signal.lineage.valuationTreatment === "direct_input").length;
  const terminalValuePenalty = valuation.dcf.terminalValueShareOfEv > 0.78 ? 12 : valuation.dcf.terminalValueShareOfEv > 0.7 ? 6 : 0;
  const breakpointsSolved = breakpoints.filter((point) => point.breakValue != null).length / Math.max(breakpoints.length, 1);
  const marketImpliedScore = marketImplied.impliedRevenueCagr2027To2030 != null && marketImplied.impliedFoaOperatingMargin != null ? 92 : 70;

  const severeWarnings: ValidationWarning[] = [];
  if (weightedCoverage < 0.95) {
    severeWarnings.push(warning("meta-lineage-coverage-low", "Lineage coverage is incomplete", `Lineage coverage is ${(weightedCoverage * 100).toFixed(1)}%.`, "medium"));
  }
  if (productSignalsCapitalizedDirectly > 0) {
    severeWarnings.push(warning("meta-product-signal-capitalized", "Product signals are crossing into direct valuation", `${productSignalsCapitalizedDirectly} product signal(s) are marked direct_input. Product signals should pass through named drivers.`, "high"));
  }
  if (breakpointsSolved < 0.5) {
    severeWarnings.push(warning("meta-breakpoint-coverage-low", "Thesis breakpoints are underspecified", "Fewer than half of thesis breakpoints solve to the current market price.", "medium"));
  }
  if (forecast[0]?.revenueBridge == null) {
    severeWarnings.push(warning("meta-revenue-guide-bridge-missing", "2026 revenue guide bridge missing", "Forecast year one does not show Q1 actual + Q2 guidance + H2 implied bridge.", "high"));
  }

  const dataLineageScore = Math.round(weightedCoverage * 100);
  const assumptionQualityScore = Math.round(assumptionCoverage * 100);
  const valuationIsolationScore = Math.max(55, 96 - terminalValuePenalty - productSignalsCapitalizedDirectly * 18);
  const overallIntegrityScore = Math.round((dataLineageScore * 0.3) + (assumptionQualityScore * 0.25) + (valuationIsolationScore * 0.25) + (marketImpliedScore * 0.2));

  return {
    overallIntegrityScore,
    dataLineageScore,
    assumptionQualityScore,
    valuationIsolationScore,
    marketImpliedScore,
    lineageAudit,
    blindSpots: [
      "Meta does not disclose official AI-only capex; AI growth capex remains a scenario assumption.",
      "WhatsApp, Reels, Threads, and Business AI are product-cycle signals rather than separately disclosed revenue segments.",
      "Market data is a dated snapshot and should be refreshed before live trading decisions.",
      "Peer multiple database is still not populated with live comparable-company marks.",
    ],
    severeWarnings,
  };
}
