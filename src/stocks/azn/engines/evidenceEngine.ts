import type { AznDataset, AznSourceEvidence } from "../types";

export function getEvidenceByIds(data: AznDataset, ids: string[]): AznSourceEvidence[] {
  const evidenceById = new Map(data.evidenceData.map((item) => [item.id, item]));
  return ids.map((id) => evidenceById.get(id)).filter((item): item is AznSourceEvidence => Boolean(item));
}

export function buildEvidenceAudit(data: AznDataset) {
  const allReferencedIds = new Set<string>();
  data.periods.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.reportedData.therapyAreas.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.reportedData.drugRevenue.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.reportedData.geographies.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.guidanceData.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.pipelineData.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.patentRiskData.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));
  data.peers.forEach((row) => row.sourceEvidenceIds.forEach((id) => allReferencedIds.add(id)));

  const evidenceById = new Map(data.evidenceData.map((item) => [item.id, item]));
  const missingEvidenceIds = [...allReferencedIds].filter((id) => !evidenceById.has(id));
  const researchOnly = data.evidenceData.filter((item) => item.researchOnly);
  const valuationUsable = data.evidenceData.filter((item) => item.valuationUseAllowed && !item.researchOnly);
  const official = data.evidenceData.filter((item) => item.sourceQuality === "official" || item.sourceQuality === "filing");

  return {
    evidenceCount: data.evidenceData.length,
    officialEvidenceCount: official.length,
    valuationUsableEvidenceCount: valuationUsable.length,
    researchOnlyEvidenceCount: researchOnly.length,
    missingEvidenceIds,
    averageConfidence:
      data.evidenceData.reduce((sum, item) => sum + item.confidence, 0) / Math.max(data.evidenceData.length, 1),
    evidence: data.evidenceData,
  };
}
