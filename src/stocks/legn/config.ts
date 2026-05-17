import type { StockModule, StockValuationConfig } from "../types";
import { LegnDashboard } from "./dashboard";
import {
  legnAssumptionDefinitions,
  legnScenarioDefinitions,
  legnValuationAssumptionKeys,
  defaultLegnValuationAssumptions,
} from "./assumptions";
import {
  calculateLegnSummary,
  calculateLegnValuation,
  getDefaultLegnPeriod,
  getLegnPeriods,
  resolveLegnDataset,
  resolveLegnPeriodFromData,
} from "./calculations";
import { legnRealData } from "./realData";
import type { LegnValuationAssumptions } from "./types";

const legnValuationConfig: StockValuationConfig = {
  ticker: "LEGN",
  modelType: "Cell Therapy Commercial NAV / Collaboration Bridge / Label Expansion / Biotech rNPV",
  priceMetadata: {
    ticker: "LEGN",
    currentPrice: legnRealData.marketData.currentPrice,
    currency: "USD",
    unit: "share",
    asOfDate: legnRealData.marketData.priceDate,
    source: "actual",
    marketReference: legnRealData.marketData.currentPrice,
    provenance: "market_data: public StockAnalysis snapshot per NASDAQ ADS; one ADS equals two ordinary shares.",
  },
  assumptions: legnAssumptionDefinitions.filter((item) =>
    legnValuationAssumptionKeys.includes(item.key as (typeof legnValuationAssumptionKeys)[number]),
  ),
  scenarios: legnScenarioDefinitions,
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveLegnDataset(data);
    const period = resolveLegnPeriodFromData(data, getDefaultLegnPeriod());
    return calculateLegnValuation(
      dataset,
      period,
      scenario,
      { ...defaultLegnValuationAssumptions, ...(assumptions as Partial<LegnValuationAssumptions>) },
    );
  },
};

export const legnModule: StockModule = {
  ticker: "LEGN",
  name: "Legend Biotech",
  sector: "Biotechnology / Autologous Cell Therapy / Multiple Myeloma",
  currency: "USD",
  description:
    "Buy-side LEGN module focused on CARVYKTI NTS ramp, Janssen collaboration economics, manufacturing throughput, earlier-line expansion, CAR-T safety, pipeline rNPV and speculative platform option value.",
  tabs: [
    { value: "cockpit", label: "Cockpit" },
    { value: "carvykti", label: "CARVYKTI Commercial" },
    { value: "collaboration", label: "Collaboration Economics" },
    { value: "earnings-call", label: "Earnings Call" },
    { value: "clinical", label: "Clinical Evidence" },
    { value: "label", label: "Label Expansion" },
    { value: "solid-tumor", label: "Solid Tumor CAR-T" },
    { value: "pipeline", label: "Pipeline rNPV" },
    { value: "manufacturing", label: "Manufacturing & Access" },
    { value: "valuation", label: "Valuation" },
    { value: "risk", label: "Risk Red Team" },
    { value: "evidence", label: "Evidence" },
  ],
  periods: getLegnPeriods(),
  data: legnRealData,
  getDefaultPeriod: () => getDefaultLegnPeriod(),
  calculateSummary: (data) => calculateLegnSummary(resolveLegnDataset(data), resolveLegnPeriodFromData(data, getDefaultLegnPeriod())),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateLegnValuation(
      resolveLegnDataset(data),
      resolveLegnPeriodFromData(data, getDefaultLegnPeriod()),
      scenario,
      assumptions as Partial<LegnValuationAssumptions>,
    ),
  valuationConfig: legnValuationConfig,
  Dashboard: LegnDashboard,
};
