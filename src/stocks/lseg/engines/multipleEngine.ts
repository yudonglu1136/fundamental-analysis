import type { LsegCockpitDataset, LsegFcffDcfOutput, LsegMultipleOutput, LsegScenarioAssumption, LsegValuationAssumptions } from "../types";
import { getLatestAuditedLsegActual, resolveLsegValuationSemantics } from "./valuationSemantics";

export function calculateLsegMultipleEngine(
  data: LsegCockpitDataset,
  scenario: LsegScenarioAssumption,
  assumptions: LsegValuationAssumptions,
  dcf: LsegFcffDcfOutput,
): LsegMultipleOutput {
  const semantics = resolveLsegValuationSemantics(data);
  const latest = getLatestAuditedLsegActual(data);
  const yearOne = dcf.forecast[0];
  const postTradeAepsAccretionPence = yearOne.postTradeIncrementalEbitda * (1 - assumptions.taxRate) / Math.max(assumptions.dilutedShares, 1) * 100;
  const baseForwardEps = ((yearOne.adjustedEbit - yearOne.postTradeIncrementalEbitda - latest.adjustedNetFinanceExpense) * (1 - assumptions.taxRate) - latest.nonControllingInterest) /
    Math.max(assumptions.dilutedShares, 1);
  const forwardEps = baseForwardEps + postTradeAepsAccretionPence / 100;
  const forwardEbitda = yearOne.adjustedEbitda;
  const forwardEbit = yearOne.adjustedEbit;
  const blendedEvEbitdaMultiple =
    scenario.evEbitdaMultiples["Data & Analytics"] * 0.35 +
    (scenario.evEbitdaMultiples["Post Trade / LCH"] + scenario.postTradeEconomics.segmentMultiplePremium) * 0.25 +
    16 * 0.4;
  const evEbitdaFairValue =
    (forwardEbitda * blendedEvEbitdaMultiple -
      assumptions.netDebt -
      assumptions.leaseLiabilities +
      assumptions.associatesAndInvestments) /
    Math.max(assumptions.dilutedShares, 1);
  const peFairValue = forwardEps * scenario.targetPe;

  return {
    valuationBases: {
      evEbitda: semantics.methodBases.evEbitda,
      pe: semantics.methodBases.pe,
    },
    currentPe: data.marketData.currentPriceGbp / Math.max(latest.adjustedEpsPence / 100, 0.01),
    currentEvEbitda: data.marketData.enterpriseValueGbp / Math.max(latest.adjustedEbitda, 1),
    currentEvEbit: data.marketData.enterpriseValueGbp / Math.max(latest.adjustedOperatingProfit, 1),
    fcfYield: latest.equityFreeCashFlow / Math.max(data.marketData.marketCapGbp, 1),
    dividendYield: (latest.totalDividendPerSharePence / 100) / Math.max(data.marketData.currentPriceGbp, 1),
    evEbitdaFairValue,
    peFairValue,
    postTradeForwardEbitdaUplift: yearOne.postTradeIncrementalEbitda,
    postTradeAepsAccretionPence,
    peerRows: [
      {
        peer: "Bloomberg",
        category: "Qualitative workflow benchmark",
        sourceType: "research_only",
        sourceDate: data.marketData.priceDate,
        notes: "Private company; not valued directly. Used only as qualitative Workspace lock-in benchmark.",
      },
      { peer: "FactSet", category: "Financial data/workflow", forwardPe: 25, evEbitda: 20, fcfYield: 0.04, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "S&P Global", category: "Data/index/ratings", forwardPe: 27, evEbitda: 22, fcfYield: 0.035, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "MSCI", category: "Index IP", forwardPe: 31, evEbitda: 25, fcfYield: 0.032, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "ICE", category: "Exchange / data / clearing", forwardPe: 21, evEbitda: 17, fcfYield: 0.045, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "CME", category: "Exchange / clearing", forwardPe: 23, evEbitda: 18, fcfYield: 0.04, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "Nasdaq", category: "Exchange / data", forwardPe: 22, evEbitda: 18, fcfYield: 0.042, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "Deutsche Boerse", category: "European exchange / clearing", forwardPe: 21, evEbitda: 16, fcfYield: 0.043, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
      { peer: "Euronext", category: "European exchange", forwardPe: 16, evEbitda: 12, fcfYield: 0.06, sourceType: "research_only", sourceDate: data.marketData.priceDate, notes: "Placeholder peer multiple; not official actual." },
    ],
  };
}
