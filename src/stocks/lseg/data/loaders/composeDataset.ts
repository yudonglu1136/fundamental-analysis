import type { LsegDashboardDataset } from "../../model";
import { lsegConsensus } from "../lsegConsensus";
import { lsegCorporateReconciliation } from "../lsegCorporateReconciliation";
import { lsegKpis } from "../lsegKpis";
import { lsegMacro } from "../lsegMacro";
import { lsegMarketData } from "../lsegMarketData";
import { lsegOwnership } from "../lsegOwnership";
import { lsegPeers } from "../lsegPeers";
import { lsegSotpInputs } from "../lsegSotpInputs";
import { tradewebMonthly } from "../tradewebMonthly";
import { lsegActualFinancials, lsegActualSegmentFinancials } from "../actuals";
import { lsegForecastFinancials, lsegForecastReportedSegments, lsegAnalyticalSplitSegments } from "../forecastAnchors";
import { lsegGuidance } from "../guidance";

export function composeLsegDataset(): LsegDashboardDataset {
  return {
    periods: [...lsegActualFinancials, ...lsegForecastFinancials],
    segmentFinancials: [
      ...lsegActualSegmentFinancials,
      ...lsegForecastReportedSegments,
      ...lsegAnalyticalSplitSegments,
    ],
    kpis: lsegKpis,
    tradewebMonthly,
    peers: lsegPeers,
    macro: lsegMacro,
    guidance: lsegGuidance,
    consensus: lsegConsensus,
    marketData: lsegMarketData,
    sotpInputs: lsegSotpInputs,
    ownership: lsegOwnership,
    corporateReconciliation: lsegCorporateReconciliation,
  };
}
