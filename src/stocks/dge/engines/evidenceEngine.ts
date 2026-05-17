import type { DgeDataset } from "../types";
import { average } from "./helpers";

function collectEvidenceIds(data: DgeDataset) {
  const ids: string[] = [];
  data.periods.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.reportedData.regions.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.reportedData.brands.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.reportedData.categories.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.reportedData.channelInventory.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.guidanceData.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.competitorData.forEach((row) => ids.push(...row.sourceEvidenceIds));
  data.researchAssumptions.forEach((row) => ids.push(...row.sourceEvidenceIds));
  ids.push(...data.marketData.sourceEvidenceIds);
  return ids;
}

function confidenceToNumber(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return 0.95;
  if (confidence === "medium") return 0.72;
  return 0.45;
}

export function buildDgeEvidenceAudit(data: DgeDataset) {
  const evidenceById = new Map(data.evidenceData.map((record) => [record.id, record]));
  const usedIds = collectEvidenceIds(data);
  const uniqueUsedIds = Array.from(new Set(usedIds));
  const missingEvidenceIds = uniqueUsedIds.filter((id) => !evidenceById.has(id));
  const officialEvidenceCount = data.evidenceData.filter((item) =>
    ["annual_report", "interim_results", "trading_statement", "company_guidance", "investor_presentation", "earnings_transcript"].includes(item.sourceType),
  ).length;
  const researchOnlyEvidence = data.evidenceData.filter((item) => item.sourceType === "research_assumption");
  const usedRecords = uniqueUsedIds.map((id) => evidenceById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const usedInModelCount = usedRecords.filter((item) => item.usedInModel).length;
  const evidenceCoverageRatio = uniqueUsedIds.length === 0 ? 0 : (uniqueUsedIds.length - missingEvidenceIds.length) / uniqueUsedIds.length;

  return {
    evidence: data.evidenceData,
    uniqueUsedEvidenceIds: uniqueUsedIds,
    missingEvidenceIds,
    officialEvidenceCount,
    researchOnlyEvidence,
    usedInModelCount,
    evidenceCoverageRatio,
    averageConfidence: average(usedRecords.map((item) => confidenceToNumber(item.confidence))),
    warnings: [
      ...(missingEvidenceIds.length > 0 ? [`Missing evidence ids: ${missingEvidenceIds.join(", ")}`] : []),
      ...(evidenceCoverageRatio < 0.9 ? ["Evidence coverage ratio is below 90%."] : []),
      ...(!researchOnlyEvidence.some((item) => item.id === "research-assumption-demand-cycle")
        ? ["Research-only channel inventory assumptions are not explicitly evidenced."]
        : []),
    ],
  };
}
