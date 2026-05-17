import type { MckDataset } from "../types";

export function calculateBiopharmaServicesEngine(data: MckDataset) {
  const accessQuote = data.managementQuotes.find((quote) => quote.topic === "oncology");
  return {
    qualityScore: 82,
    thesis:
      "Biopharma services are the manufacturer-facing infrastructure layer: access, affordability, hub services, data, launch support and adherence. This can raise the quality of MCK's profit pool beyond pure distribution.",
    marginPotential:
      "Higher than core drug distribution because revenue is tied to services and connectivity, but still dependent on manufacturer budgets and reimbursement workflows.",
    evidence: [
      "FY2026 management highlighted investment in Oncology and Biopharma Services.",
      "FY2025 official release cited patient affordability/access services as a strategic growth area.",
      accessQuote?.interpretation ?? "Full transcript ingestion needed for richer quote support.",
    ],
  };
}
