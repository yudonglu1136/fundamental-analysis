import type { MckDataset } from "../types";
import { latestFinancial, segmentsForPeriod } from "./helpers";

export function calculateSpecialtyOncologyEngine(data: MckDataset) {
  const segment = segmentsForPeriod(data, latestFinancial(data).periodId).find((row) => row.segment === "Oncology & Multispecialty");
  return {
    segment,
    contribution:
      segment
        ? `Oncology & Multispecialty contributed $${(segment.adjustedOperatingProfit / 1000).toFixed(1)}B of adjusted operating profit at ${(segment.margin * 100).toFixed(1)}% margin, growing ${Math.round(segment.adjustedOperatingProfitGrowth * 100)}%.`
        : "Oncology & Multispecialty segment missing from dataset.",
    ecosystem: [
      { from: "Manufacturer", to: "Specialty distributor", label: "launch support, channel access, data" },
      { from: "Specialty distributor", to: "Provider / oncology practice", label: "drug availability, logistics, reimbursement support" },
      { from: "Provider / oncology practice", to: "Patient", label: "community care delivery and adherence" },
      { from: "Patient support", to: "Manufacturer", label: "access feedback, affordability, outcomes data loop" },
      { from: "Practice management", to: "Provider / oncology practice", label: "workflow, clinical, procurement and admin infrastructure" },
    ],
    tailwinds: [
      { theme: "Community oncology decentralization", assessment: "Supports practice-management stickiness if sites remain economically viable.", signal: "Positive" as const },
      { theme: "Biologics / biosimilars", assessment: "Can expand specialty volume, but economics depend on spread and service fee capture.", signal: "Neutral" as const },
      { theme: "Specialty drug pipeline", assessment: "Higher complexity favors scaled distributors and provider-service platforms.", signal: "Positive" as const },
      { theme: "Acquired practice contribution", assessment: "Growth quality needs organic/acquired split monitoring.", signal: "Needs Review" as const },
    ],
    managementCommentary: data.managementQuotes.filter((quote) => quote.topic === "oncology" || quote.topic === "specialty"),
  };
}
