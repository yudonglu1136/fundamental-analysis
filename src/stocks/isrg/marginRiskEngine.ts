import type { IsrgDataLayer, IsrgValuationAssumptions } from "./model";
import { latestActual, metricMaybe, metricValue, priorYearQuarter, safeDivide } from "./utils";

export function calculateMarginRiskEngine(data: IsrgDataLayer, assumptions?: IsrgValuationAssumptions) {
  const latest = latestActual(data);
  const prior = priorYearQuarter(data, latest);
  const grossMargin = metricValue(latest.gaapGrossMargin);
  const nonGaapGrossMargin = metricValue(latest.nonGaapGrossMargin);
  const priorNonGaapGrossMargin = metricMaybe(prior?.nonGaapGrossMargin);
  const operatingMargin = safeDivide(metricValue(latest.operatingIncome), metricValue(latest.revenue.total));
  const tariffGuidance = data.officialGuidance.find((item) => item.id === "fy2026-non-gaap-gross-margin");
  const tariffDrag = assumptions?.tariffGrossMarginDrag ?? 0.01;
  const marginCompression = assumptions?.marginCompression ?? 0.005;

  return {
    grossMargin,
    nonGaapGrossMargin,
    nonGaapGrossMarginYoY: priorNonGaapGrossMargin == null ? null : nonGaapGrossMargin - priorNonGaapGrossMargin,
    operatingMargin,
    tariffGuidanceMidpoint: tariffGuidance?.midpoint ?? null,
    tariffDrag,
    marginCompression,
    riskDrivers: [
      {
        driver: "Tariffs",
        severity: tariffDrag >= 0.015 ? "High" : "Medium",
        evidence: "FY 2026 gross margin outlook includes explicit tariff impact in official guidance.",
      },
      {
        driver: "Manufacturing / supply chain",
        severity: "Medium",
        evidence: "New platform ramps can create temporary manufacturing inefficiency and inventory/capacity pressure.",
      },
      {
        driver: "Lease mix",
        severity: "Medium",
        evidence: "Operating leases and usage-based leases can shift reported systems revenue timing and pressure upfront system economics.",
      },
      {
        driver: "Competition / tenders",
        severity: "High",
        evidence: "China/local tender pressure and multi-vendor competition can affect ASP and margin durability.",
      },
    ],
    marginBridge: [
      { label: "Current non-GAAP gross margin", value: nonGaapGrossMargin },
      { label: "Tariff drag assumption", value: -tariffDrag },
      { label: "Other compression assumption", value: -marginCompression },
      { label: "Risk-adjusted gross margin proxy", value: nonGaapGrossMargin - tariffDrag - marginCompression },
    ],
  };
}
