import type { MetaDataset, MetaThesisBreakpoint, MetaValuationAssumptions } from "../model";
import { calculateMetaForecastEngine } from "./forecastEngine";
import { calculateMetaValuationEngine } from "./valuationEngine";

type BreakpointSpec = {
  id: string;
  driver: string;
  assumptionKey: keyof MetaValuationAssumptions;
  floor: number;
  ceiling: number;
  direction: MetaThesisBreakpoint["direction"];
  units: MetaThesisBreakpoint["units"];
  thesisQuestion: string;
};

function fairValueFor(data: MetaDataset, assumptions: MetaValuationAssumptions) {
  const forecast = calculateMetaForecastEngine(data, assumptions);
  return calculateMetaValuationEngine(data, "Base", assumptions, forecast).blendedFairValue;
}

function solveBreakpoint(data: MetaDataset, assumptions: MetaValuationAssumptions, spec: BreakpointSpec) {
  const baseValue = assumptions[spec.assumptionKey];
  const target = assumptions.currentPrice;
  const steps = 80;
  let breakValue: number | null = null;
  let fairValueAtBreak: number | null = null;

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const candidate = spec.direction === "below"
      ? Number(baseValue) + (spec.floor - Number(baseValue)) * progress
      : Number(baseValue) + (spec.ceiling - Number(baseValue)) * progress;
    const next = { ...assumptions, [spec.assumptionKey]: candidate };
    const fairValue = fairValueFor(data, next);
    if (Number.isFinite(fairValue) && fairValue <= target) {
      breakValue = candidate;
      fairValueAtBreak = fairValue;
      break;
    }
  }

  const severity: MetaThesisBreakpoint["severity"] =
    breakValue == null ? "low"
      : Math.abs(Number(baseValue) - breakValue) / Math.max(Math.abs(Number(baseValue)), 0.01) < 0.2 ? "high"
        : "medium";

  return {
    id: spec.id,
    driver: spec.driver,
    assumptionKey: spec.assumptionKey,
    baseValue: Number(baseValue),
    breakValue,
    units: spec.units,
    fairValueAtBreak,
    direction: spec.direction,
    severity,
    thesisQuestion: spec.thesisQuestion,
  };
}

export function calculateMetaThesisBreakpoints(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): MetaThesisBreakpoint[] {
  const specs: BreakpointSpec[] = [
    {
      id: "price-per-ad-breakpoint",
      driver: "Average price per ad CAGR",
      assumptionKey: "pricePerAdCagr",
      floor: -0.12,
      ceiling: assumptions.pricePerAdCagr,
      direction: "below",
      units: "percent",
      thesisQuestion: "Does AI ad automation still improve advertiser ROAS enough to sustain pricing?",
    },
    {
      id: "capex-breakpoint",
      driver: "FY2026 capex",
      assumptionKey: "capex2026",
      floor: assumptions.capex2026,
      ceiling: 260,
      direction: "above",
      units: "USD billions",
      thesisQuestion: "How much extra infrastructure spend can the ad engine fund before FCF/share breaks?",
    },
    {
      id: "foa-margin-breakpoint",
      driver: "Family of Apps operating margin",
      assumptionKey: "foaOperatingMargin",
      floor: 0.32,
      ceiling: assumptions.foaOperatingMargin,
      direction: "below",
      units: "percent",
      thesisQuestion: "Is core FoA margin resilient after AI infrastructure and product investment?",
    },
    {
      id: "wacc-breakpoint",
      driver: "WACC",
      assumptionKey: "wacc",
      floor: assumptions.wacc,
      ceiling: 0.16,
      direction: "above",
      units: "percent",
      thesisQuestion: "Does the stock still work if the market applies a higher duration/risk premium?",
    },
    {
      id: "regulatory-haircut-breakpoint",
      driver: "Regulatory revenue haircut",
      assumptionKey: "regulatoryRevenueHaircut",
      floor: assumptions.regulatoryRevenueHaircut,
      ceiling: 0.2,
      direction: "above",
      units: "percent",
      thesisQuestion: "How much EU/privacy pressure can ad revenue absorb before upside disappears?",
    },
    {
      id: "reality-labs-loss-breakpoint",
      driver: "Reality Labs annual loss",
      assumptionKey: "realityLabsAnnualLoss",
      floor: assumptions.realityLabsAnnualLoss,
      ceiling: 80,
      direction: "above",
      units: "USD billions",
      thesisQuestion: "At what loss level does Reality Labs stop being a tolerable call option?",
    },
    {
      id: "ai-uplift-breakpoint",
      driver: "AI revenue uplift",
      assumptionKey: "aiRevenueUpliftPct",
      floor: 0,
      ceiling: assumptions.aiRevenueUpliftPct,
      direction: "below",
      units: "percent",
      thesisQuestion: "How much monetization can disappear before AI capex no longer clears the bar?",
    },
  ];

  return specs.map((spec) => solveBreakpoint(data, assumptions, spec));
}
