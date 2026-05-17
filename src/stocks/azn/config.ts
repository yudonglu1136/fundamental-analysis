import type { StockModule, StockValuationConfig } from "../types";
import { AznDashboard } from "./dashboard";
import {
  aznScenarioDefinitions,
  aznValuationAssumptionKeys,
  aznAssumptionDefinitions,
  defaultAznValuationAssumptions,
} from "./assumptions";
import {
  calculateAznSummary,
  calculateAznValuation,
  getAznPeriods,
  getDefaultAznPeriod,
  resolveAznDataset,
  resolveAznPeriodFromData,
} from "./calculations";
import { aznRealData } from "./realData";
import type { AznValuationAssumptions } from "./types";

const aznValuationConfig: StockValuationConfig = {
  ticker: "AZN",
  modelType: "Pharma Therapy-Area / Patent Cliff / Pipeline rNPV / SOTP / DCF",
  priceMetadata: {
    ticker: "AZN.L",
    currentPrice: aznRealData.marketData.londonPriceGbp,
    currency: "GBP",
    unit: "share",
    asOfDate: aznRealData.marketData.priceDate,
    source: "actual",
    marketReference: aznRealData.marketData.londonPriceGbp,
    provenance: "market_data: Stooq AZN.UK close normalized from GBX to GBP; US NYSE ordinary share cross-check retained.",
  },
  assumptions: aznAssumptionDefinitions.filter((item) =>
    aznValuationAssumptionKeys.includes(item.key as (typeof aznValuationAssumptionKeys)[number]),
  ),
  scenarios: aznScenarioDefinitions.map((scenario) => ({
    name: scenario.name,
    assumptions: Object.fromEntries(aznValuationAssumptionKeys.map((key) => [key, scenario.assumptions[key]])),
  })),
  calculateValuation: (assumptions, data, scenario = "Base") => {
    const dataset = resolveAznDataset(data);
    const period = resolveAznPeriodFromData(data, getDefaultAznPeriod());
    return calculateAznValuation(
      dataset,
      period,
      scenario,
      { ...defaultAznValuationAssumptions, ...(assumptions as Partial<AznValuationAssumptions>) },
    );
  },
};

export const aznModule: StockModule = {
  ticker: "AZN",
  name: "AstraZeneca",
  sector: "Global Biopharmaceuticals / Oncology / Rare Disease / CVRM",
  currency: "GBP",
  description:
    "Pharma-specific buy-side cockpit focused on therapy areas, blockbuster durability, LOE risk, pipeline rNPV, oncology, rare disease, China exposure, financial quality, and valuation triangulation.",
  tabs: [
    { value: "overview", label: "Cockpit" },
    { value: "therapy", label: "Therapy Areas" },
    { value: "durability", label: "Drug Durability" },
    { value: "patent", label: "Patent Cliff" },
    { value: "pipeline", label: "Pipeline Lab" },
    { value: "earnings-call", label: "Earnings Calls" },
    { value: "oncology", label: "Oncology" },
    { value: "rare-cvrm", label: "Rare / CVRM" },
    { value: "china-financials", label: "China & Quality" },
    { value: "valuation", label: "Valuation" },
    { value: "evidence", label: "Evidence" },
  ],
  periods: getAznPeriods(),
  data: aznRealData,
  getDefaultPeriod: () => getDefaultAznPeriod(),
  calculateSummary: (data) => calculateAznSummary(resolveAznDataset(data), resolveAznPeriodFromData(data, getDefaultAznPeriod())),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateAznValuation(
      resolveAznDataset(data),
      resolveAznPeriodFromData(data, getDefaultAznPeriod()),
      scenario,
      assumptions as Partial<AznValuationAssumptions>,
    ),
  valuationConfig: aznValuationConfig,
  Dashboard: AznDashboard,
};
