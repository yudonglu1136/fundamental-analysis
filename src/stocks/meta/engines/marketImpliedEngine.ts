import type { MetaDataset, MetaMarketImpliedValuation, MetaValuationAssumptions } from "../model";
import { calculateMetaForecastEngine } from "./forecastEngine";
import { safeRatio } from "./helpers";
import { calculateMetaValuationEngine } from "./valuationEngine";

function solveForFairValue(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
  key: keyof MetaValuationAssumptions,
  low: number,
  high: number,
  targetPrice: number,
  method: "blend" | "dcf" = "blend",
) {
  let lower = low;
  let upper = high;
  let solution: number | null = null;

  for (let index = 0; index < 32; index += 1) {
    const mid = (lower + upper) / 2;
    const next = { ...assumptions, [key]: mid };
    const forecast = calculateMetaForecastEngine(data, next);
    const valuation = calculateMetaValuationEngine(data, "Base", next, forecast);
    const fairValue = method === "dcf" ? valuation.dcf.fairValuePerShare : valuation.blendedFairValue;
    if (!Number.isFinite(fairValue)) return null;
    solution = mid;
    if (fairValue < targetPrice) lower = mid;
    else upper = mid;
  }

  return solution;
}

export function calculateMetaMarketImpliedValuation(
  data: MetaDataset,
  assumptions: MetaValuationAssumptions,
): MetaMarketImpliedValuation {
  const forecast = calculateMetaForecastEngine(data, assumptions);
  const valuation = calculateMetaValuationEngine(data, "Base", assumptions, forecast);
  const currentPrice = assumptions.currentPrice;
  const forwardYear = forecast[1] ?? forecast[0];
  const normalizedYear = forecast[2] ?? forecast[forecast.length - 1];
  const terminalYear = forecast[forecast.length - 1] ?? forecast[0];
  const currentMarketCap = currentPrice * assumptions.dilutedShares;
  const currentEnterpriseValue = currentMarketCap - assumptions.netCash;
  const impliedTerminalGrowth = solveForFairValue(data, assumptions, "terminalGrowth", 0.005, Math.min(assumptions.wacc - 0.005, 0.055), currentPrice, "dcf");
  const impliedRevenueCagr2027To2030 = solveForFairValue(data, assumptions, "revenueCagr2027To2030", 0.01, 0.22, currentPrice, "blend");
  const impliedFoaOperatingMargin = solveForFairValue(data, assumptions, "foaOperatingMargin", 0.38, 0.58, currentPrice, "blend");
  const impliedAiRoic = terminalYear.aiRoic + safeRatio(currentPrice - valuation.blendedFairValue, Math.max(currentPrice, 1)) * 0.12;
  const impliedAiRoicSpread = impliedAiRoic - assumptions.wacc;
  const verdict =
    impliedAiRoicSpread > 0.08 && (impliedRevenueCagr2027To2030 ?? 0) > assumptions.revenueCagr2027To2030 + 0.03
      ? "Market prices heroic execution"
      : impliedAiRoicSpread < 0 || currentPrice < valuation.blendedFairValue * 0.85
        ? "Market prices disappointment"
        : "Market prices execution";

  return {
    currentPrice,
    currentMarketCap,
    currentEnterpriseValue,
    currentFcfYieldOnYearThree: safeRatio(normalizedYear.unleveredFreeCashFlow, Math.max(currentMarketCap, 1)),
    currentForwardPe: safeRatio(currentPrice, Math.max(forwardYear.eps, 0.01)),
    currentForwardEvEbit: safeRatio(currentEnterpriseValue, Math.max(forwardYear.operatingIncome, 0.01)),
    impliedTerminalGrowth,
    impliedRevenueCagr2027To2030,
    impliedFoaOperatingMargin,
    impliedAiRoic,
    impliedAiRoicSpread,
    verdict,
    notes: [
      "Reverse DCF solves the terminal growth needed for DCF fair value to equal the current price.",
      "Implied revenue CAGR and FoA margin solve the blended valuation against the current price.",
      "Market-implied AI ROIC is an underwriting diagnostic, not a separate premium added to fair value.",
    ],
  };
}
