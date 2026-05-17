import type { IsrgDataLayer } from "./model";
import { latestFullYear, metricMaybe, metricValue } from "./utils";

export function calculateInternationalExpansionEngine(data: IsrgDataLayer) {
  const fy = latestFullYear(data);
  const ousGrowth = metricMaybe(fy.procedures.ousDaVinciProcedureGrowth);
  const usGrowth = metricMaybe(fy.procedures.usDaVinciProcedureGrowth);
  const spread = ousGrowth != null && usGrowth != null ? ousGrowth - usGrowth : null;
  const europeEvent = data.researchOnlyData.productEvents.find((event) => event.id === "europe-expansion");

  return {
    ousProcedureGrowth: ousGrowth,
    usProcedureGrowth: usGrowth,
    ousVsUsGrowthSpread: spread,
    guidance:
      "Starter dataset captures procedure growth rates rather than absolute U.S./OUS procedure volumes. Add regional procedure count overrides only with source and confidence.",
    penetrationReadThrough:
      spread != null && spread > 0
        ? "OUS procedure growth above U.S. growth supports the long-duration international penetration debate."
        : "OUS growth spread is unavailable or not above U.S.; treat international TAM claims cautiously.",
    regionRiskExposure: [
      { region: "China", exposure: "Tender pressure, localization, and local robotics competition", severity: "High" },
      { region: "Europe", exposure: "Regulatory rollout, hospital budgets, and direct-operations transition", severity: "Medium" },
      { region: "Japan", exposure: "Procedure penetration and reimbursement cadence", severity: "Medium" },
      { region: "United States", exposure: "Mature categories, GLP-1 bariatric risk, and capex constraints", severity: "Medium" },
    ],
    directOperationsMilestone: europeEvent
      ? {
          title: europeEvent.title,
          date: europeEvent.date,
          description: europeEvent.description,
          source: europeEvent.source.sourceUrl,
        }
      : null,
    procedureVolumeDisclosureGap: metricValue(fy.procedures.worldwideDaVinciProcedures) > 0 && ousGrowth != null,
  };
}
