import type { GooglDataset, GooglRegulatoryRiskOutput, GooglValuationAssumptions } from "../model";
import { clamp, riskLabel } from "./helpers";

export function calculateGooglRegulatoryRiskEngine(
  data: GooglDataset,
  assumptions: GooglValuationAssumptions,
): GooglRegulatoryRiskOutput {
  const riskRows = data.risks.map((risk) => {
    const riskScore = clamp(risk.probability * risk.impact * (1 - risk.detectability * 0.35), 0, 1);
    return {
      ...risk,
      riskScore,
      severityLabel: riskLabel(riskScore),
    };
  });
  const legalAccrual = data.commitmentsAndCapitalStructure.accruedLegalRegulatory;
  const regulatoryRows = riskRows.filter((risk) => risk.id.includes("regulatory") || /DMA|Play|privacy|distribution/i.test(risk.name));
  const riskScore = clamp(regulatoryRows.reduce((sum, risk) => sum + risk.riskScore, 0) * 100 + assumptions.regulatoryDiscount * 130, 15, 95);

  return {
    discount: assumptions.regulatoryDiscount,
    riskScore,
    legalAccrual,
    riskRows,
    killCriteria: [
      "Search distribution remedies materially reduce default placement on Android, Chrome, or paid partner surfaces.",
      "Ad-tech structural remedy removes durable publisher/advertiser stack economics or forces separation with low offsetting value.",
      "EU DMA or privacy remedies reduce personalized ad measurement enough to show up in Search/YouTube revenue per query or TAC.",
      "Google Play remedies permanently lower subscriptions, platforms, and devices margin without enough volume elasticity.",
    ],
    monitoringTriggers: [
      "DOJ Search remedies final order and appeal path.",
      "Ad-tech remedies judgment and any structural divestiture language.",
      "EU DMA non-compliance findings, fines, and Search self-preferencing changes.",
      "TAC / Google advertising revenue ratio and Network revenue trend.",
      "Legal and regulatory accrual changes in 10-Q/10-K filings.",
    ],
  };
}
