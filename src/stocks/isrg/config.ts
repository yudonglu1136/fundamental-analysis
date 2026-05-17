import type { StockModule, StockValuationConfig } from "../types";
import { IsrgDashboard } from "./dashboard";
import {
  calculateIsrgSummary,
  calculateIsrgValuation,
  defaultIsrgValuationAssumptions,
  getDefaultIsrgPeriod,
  getIsrgPeriods,
  resolveIsrgDataset,
} from "./calculations";
import { isrgAssumptionDefinitions, isrgScenarioPresets } from "./assumptions";
import { isrgData } from "./data";

const isrgPriceMetadata = {
  ticker: "ISRG",
  currentPrice: isrgData.marketData.currentPrice,
  currency: "USD" as const,
  unit: "share" as const,
  asOfDate: isrgData.marketData.priceDate,
  source: "placeholder" as const,
  marketReference: isrgData.marketData.currentPrice,
  provenance: isrgData.marketData.notes,
};

const isrgValuationConfig: StockValuationConfig = {
  ticker: "ISRG",
  modelType: "Procedure / Installed Base / Recurring Revenue / Product Cycle Valuation",
  priceMetadata: isrgPriceMetadata,
  assumptions: isrgAssumptionDefinitions,
  scenarios: (["Bear", "Base", "Bull"] as const).map((scenario) => ({
    name: scenario,
    assumptions: isrgScenarioPresets[scenario],
  })),
  calculateValuation: (assumptions, data, scenario = "Base") =>
    calculateIsrgValuation(
      data,
      {
        ...defaultIsrgValuationAssumptions,
        ...(assumptions as Partial<typeof defaultIsrgValuationAssumptions>),
      },
      scenario,
    ),
};

export const isrgModule: StockModule = {
  ticker: "ISRG",
  name: "Intuitive Surgical",
  sector: "Medical Devices / Robotic Surgery Platform",
  currency: "USD",
  description:
    "ISRG-specific buy-side research module focused on procedure growth, installed base, utilization, instruments and accessories recurring revenue, da Vinci 5, Ion/SP optionality, leases, margins, competition, and valuation red-team risk.",
  tabs: [
    { value: "executive", label: "Cockpit" },
    { value: "flywheel", label: "Flywheel" },
    { value: "procedures", label: "Procedure Engine" },
    { value: "installed-base", label: "Installed Base" },
    { value: "revenue-quality", label: "Revenue Quality" },
    { value: "product-cycle", label: "DV5 / Ion / SP" },
    { value: "hospital-roi", label: "Hospital ROI" },
    { value: "regulatory", label: "FDA / Safety" },
    { value: "valuation", label: "Valuation Lab" },
    { value: "competition-risk", label: "Competition & Risk" },
    { value: "transcripts", label: "Transcript Lab" },
    { value: "sources", label: "Data Boundary" },
  ],
  periods: getIsrgPeriods(),
  data: isrgData,
  getDefaultPeriod: () => getDefaultIsrgPeriod(),
  calculateSummary: (data) => calculateIsrgSummary(resolveIsrgDataset(data)),
  calculateValuation: (data, assumptions, scenario = "Base") =>
    calculateIsrgValuation(data, assumptions as Partial<typeof defaultIsrgValuationAssumptions>, scenario),
  valuationConfig: isrgValuationConfig,
  Dashboard: IsrgDashboard,
};
