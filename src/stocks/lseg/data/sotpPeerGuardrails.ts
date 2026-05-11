import type { LsegSegmentName } from "../model";

export type LsegSotpPeerGuardrail = {
  peerGroup: string;
  rangeLow: number;
  median: number;
  rangeHigh: number;
  dataDate: string;
  source: string;
  sourceUrlOptional?: string;
  lastReviewedDate: string;
  isPlaceholder: boolean;
  isStale: boolean;
  confidenceLevel: "high" | "medium" | "low";
  peerSetCompleteness: number;
  notes: string;
  supportingPeers: Array<{
    peer: string;
    ticker: string;
    forwardEVEbitda: number;
    forwardPe: number;
    fcfYield: number;
    revenueGrowth: number;
    ebitdaMargin: number;
    dataDate: string;
    source: string;
    sourceUrlOptional?: string;
    lastReviewedDate: string;
    isPlaceholder: boolean;
    isStale: boolean;
    confidenceLevel: "high" | "medium" | "low";
  }>;
  justification: string;
};

const peerDate = "2026-05-10";
const manualSource =
  "Manual SOTP guardrail calibration retained, but provenance was refreshed against the local yfinance peer multiples snapshot fetched 2026-05-10. Numeric guardrails remain manually underwritten.";

export const sotpPeerGuardrails: Record<LsegSegmentName, LsegSotpPeerGuardrail> = {
  "Data & Analytics": {
    peerGroup: "data_analytics",
    rangeLow: 18,
    median: 20,
    rangeHigh: 21,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "medium",
    peerSetCompleteness: 0.67,
    notes: "Only two recent manual peer points underpin this guardrail, so confidence is medium rather than high.",
    supportingPeers: [
      { peer: "FactSet", ticker: "FDS", forwardEVEbitda: 20, forwardPe: 29, fcfYield: 0.036, revenueGrowth: 0.07, ebitdaMargin: 0.37, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
      { peer: "Moody's", ticker: "MCO", forwardEVEbitda: 19, forwardPe: 27, fcfYield: 0.034, revenueGrowth: 0.09, ebitdaMargin: 0.49, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
    ],
    justification: "Desktop/data workflow businesses deserve recurring-data multiples, but not index-licensing peaks.",
  },
  "FTSE Russell": {
    peerGroup: "indices",
    rangeLow: 21,
    median: 24,
    rangeHigh: 27,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "medium",
    peerSetCompleteness: 0.67,
    notes: "Two manual peer points give a reasonable index-quality range but still cap confidence below a broader peer panel.",
    supportingPeers: [
      { peer: "S&P Global", ticker: "SPGI", forwardEVEbitda: 21, forwardPe: 28, fcfYield: 0.035, revenueGrowth: 0.08, ebitdaMargin: 0.5, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
      { peer: "MSCI", ticker: "MSCI", forwardEVEbitda: 26, forwardPe: 31, fcfYield: 0.031, revenueGrowth: 0.1, ebitdaMargin: 0.58, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
    ],
    justification: "Index licensing quality is the best asset in the portfolio and supports the highest operating multiple.",
  },
  "Risk Intelligence": {
    peerGroup: "risk_information",
    rangeLow: 17,
    median: 20,
    rangeHigh: 24,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "medium",
    peerSetCompleteness: 0.67,
    notes: "Risk Intelligence still relies on a narrow manually curated peer set.",
    supportingPeers: [
      { peer: "Moody's", ticker: "MCO", forwardEVEbitda: 19, forwardPe: 27, fcfYield: 0.034, revenueGrowth: 0.09, ebitdaMargin: 0.49, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
      { peer: "FactSet", ticker: "FDS", forwardEVEbitda: 20, forwardPe: 29, fcfYield: 0.036, revenueGrowth: 0.07, ebitdaMargin: 0.37, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
    ],
    justification: "High-growth information services can command a premium, but execution risk still matters.",
  },
  Markets: {
    peerGroup: "markets_mixed",
    rangeLow: 13,
    median: 16,
    rangeHigh: 20,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "high",
    peerSetCompleteness: 1,
    notes: "Broader peer set better captures the mixed structural and cyclical economics inside reported Markets.",
    supportingPeers: [
      { peer: "CME", ticker: "CME", forwardEVEbitda: 18, forwardPe: 24, fcfYield: 0.042, revenueGrowth: 0.06, ebitdaMargin: 0.62, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "high" },
      { peer: "ICE", ticker: "ICE", forwardEVEbitda: 17, forwardPe: 23, fcfYield: 0.041, revenueGrowth: 0.07, ebitdaMargin: 0.58, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "high" },
      { peer: "Nasdaq", ticker: "NDAQ", forwardEVEbitda: 18, forwardPe: 24, fcfYield: 0.039, revenueGrowth: 0.08, ebitdaMargin: 0.53, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "high" },
      { peer: "Euronext", ticker: "ENX.PA", forwardEVEbitda: 14, forwardPe: 20, fcfYield: 0.046, revenueGrowth: 0.06, ebitdaMargin: 0.55, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "high" },
    ],
    justification: "Reported Markets mixes structural infrastructure economics with cyclical trading and volume sensitivity.",
  },
  "Capital Markets": {
    peerGroup: "electronic_trading",
    rangeLow: 18,
    median: 22,
    rangeHigh: 25,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "medium",
    peerSetCompleteness: 0.67,
    notes: "Strategic-only peer set; not used as a base operating guardrail.",
    supportingPeers: [
      { peer: "Tradeweb", ticker: "TW", forwardEVEbitda: 25, forwardPe: 35, fcfYield: 0.032, revenueGrowth: 0.11, ebitdaMargin: 0.53, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
      { peer: "MarketAxess", ticker: "MKTX", forwardEVEbitda: 18, forwardPe: 26, fcfYield: 0.039, revenueGrowth: 0.03, ebitdaMargin: 0.43, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
    ],
    justification: "Standalone electronic trading can justify higher multiples in a strategic case.",
  },
  "Post Trade": {
    peerGroup: "post_trade",
    rangeLow: 14,
    median: 17,
    rangeHigh: 20,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "medium",
    peerSetCompleteness: 0.67,
    notes: "Strategic-only post-trade peer set; confidence remains medium because the panel is narrow.",
    supportingPeers: [
      { peer: "Deutsche Börse", ticker: "DB1.DE", forwardEVEbitda: 16, forwardPe: 22, fcfYield: 0.045, revenueGrowth: 0.05, ebitdaMargin: 0.54, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
      { peer: "CME", ticker: "CME", forwardEVEbitda: 18, forwardPe: 24, fcfYield: 0.042, revenueGrowth: 0.06, ebitdaMargin: 0.62, dataDate: peerDate, source: manualSource, lastReviewedDate: peerDate, isPlaceholder: false, isStale: false, confidenceLevel: "medium" },
    ],
    justification: "Post-trade / clearing can command infrastructure multiples when valued on a standalone basis.",
  },
  Other: {
    peerGroup: "corporate",
    rangeLow: -2,
    median: 0,
    rangeHigh: 2,
    dataDate: peerDate,
    source: manualSource,
    lastReviewedDate: peerDate,
    isPlaceholder: false,
    isStale: false,
    confidenceLevel: "high",
    peerSetCompleteness: 1,
    notes: "Other / Corporate should not attract a premium multiple; confidence is high because the policy is explicitly conservative.",
    supportingPeers: [],
    justification: "Other / Corporate should not receive a premium operating multiple without explicit asset value support.",
  },
};
