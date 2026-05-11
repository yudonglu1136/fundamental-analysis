import type { LsegConfidenceLevel, LsegPeerPoint } from "../model";
import {
  lsegYfinancePeerAudit,
  lsegYfinancePeerMultiples,
  lsegYfinanceProvenanceManifest,
  lsegYfinanceWarningManifest,
} from "./marketData";

const manualPeerSnapshot = "Manual peer guardrails retained and cross-checked against local yfinance multiple snapshot fetched 2026-05-10. Use yfinance rows as dated external ratio references, not as a replacement for valuation guardrails.";
const peerDate = "2026-05-10";
const staleThresholdDays = 7;

type ManualPeerSeed = Omit<LsegPeerPoint, "source" | "dataDate" | "lastReviewedDate" | "isStale" | "isPlaceholder" | "sourceType" | "confidenceLevel"> & {
  confidenceLevel: LsegConfidenceLevel;
};

type PeerLayerWarning = {
  id: string;
  message: string;
  severity: "low" | "medium" | "high";
};

type WarningManifestItem = string | { warning?: string; message?: string };

const fetchedAt = lsegYfinanceProvenanceManifest?.provenance?.fetchedAt ?? null;
const fetchedDate = fetchedAt?.slice(0, 10) ?? peerDate;
const fetchedTickerSet = new Set(lsegYfinancePeerMultiples.map((row) => row.ticker));
const yfinancePeerMap = new Map(lsegYfinancePeerMultiples.map((row) => [row.ticker, row]));

function daysBetweenIso(fromDate: string | null | undefined, toDate: string) {
  if (!fromDate) return Number.POSITIVE_INFINITY;
  const from = Date.parse(fromDate);
  const to = Date.parse(toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY;
  return Math.floor(Math.abs(to - from) / (1000 * 60 * 60 * 24));
}

function confidenceFromSnapshot(ticker: string, currency: string | undefined): LsegConfidenceLevel {
  if (!fetchedTickerSet.has(ticker)) return "low";
  if (currency === "GBp" || currency === "EUR") return "medium";
  return "high";
}

function sourceLabel(ticker: string, currency: string | undefined, hasSnapshot: boolean, missingFields: string[]) {
  if (!hasSnapshot) {
    return `${manualPeerSnapshot} No matching yfinance peer row was available for ${ticker}; manual peer fields remain in force.`;
  }
  const listingWarning = currency === "GBp" || currency === "EUR"
    ? ` Snapshot currency/listing is ${currency}; use ratio multiples only and do not aggregate absolute values across currencies.`
    : "";
  const fieldWarning = missingFields.length
    ? ` Missing yfinance fields kept from manual layer: ${missingFields.join(", ")}.`
    : "";
  return `yfinance peer multiples snapshot fetched ${fetchedAt ?? fetchedDate}.${listingWarning}${fieldWarning}`;
}

function mergePeer(seed: ManualPeerSeed): LsegPeerPoint {
  const snapshot = seed.ticker ? yfinancePeerMap.get(seed.ticker) : undefined;
  const missingFields: string[] = [];
  const forwardPe = snapshot?.forwardPe ?? seed.forwardPe;
  if (!snapshot?.forwardPe) missingFields.push("forwardPE");
  const forwardEVEbitda = snapshot?.evToEbitda ?? seed.forwardEVEbitda ?? seed.ebitdaMultiple;
  if (!snapshot?.evToEbitda) missingFields.push("enterpriseToEbitda");
  const trailingPe = snapshot?.trailingPe ?? undefined;
  if (snapshot && snapshot.trailingPe == null) missingFields.push("trailingPE");
  const priceToSales = snapshot?.priceToSales ?? undefined;
  if (snapshot && snapshot.priceToSales == null) missingFields.push("priceToSalesTrailing12Months");
  const dividendYield = snapshot?.dividendYield != null ? snapshot.dividendYield / 100 : undefined;
  if (snapshot && snapshot.dividendYield == null) missingFields.push("dividendYield");
  const beta = snapshot?.beta ?? undefined;
  if (snapshot && snapshot.beta == null) missingFields.push("beta");
  const currency = snapshot?.currency;
  const isStale = daysBetweenIso(snapshot?.dataDate ?? fetchedDate, peerDate) > staleThresholdDays;

  return {
    ...seed,
    marketCap: snapshot?.marketCap ?? undefined,
    enterpriseValue: snapshot?.enterpriseValue ?? undefined,
    trailingPe,
    forwardPe,
    forwardEVEbitda,
    ebitdaMultiple: forwardEVEbitda,
    priceToSales,
    dividendYield,
    beta,
    currency,
    fetchedAt: fetchedAt ?? undefined,
    absoluteValueAggregationAllowed: false,
    absoluteValueCurrency: currency,
    absoluteValueUse: snapshot ? "metadata_only" : undefined,
    dataDate: snapshot?.dataDate ?? fetchedDate,
    source: sourceLabel(seed.ticker ?? seed.peer, currency, Boolean(snapshot), missingFields),
    lastReviewedDate: fetchedDate,
    isPlaceholder: !snapshot,
    isStale,
    confidenceLevel: snapshot ? confidenceFromSnapshot(seed.ticker ?? "", currency) : "low",
    sourceType: snapshot ? "derived" : "assumption",
    qualityNotes: [
      seed.qualityNotes,
      snapshot
        ? `External yfinance snapshot supplies market multiples and metadata on ${snapshot.dataDate ?? fetchedDate}; growth, margin, FCF yield, signal, and commentary remain manually underwritten.`
        : "No external yfinance peer row matched; manual seed retained.",
    ].filter(Boolean).join(" "),
    commentary: [
      seed.commentary,
      missingFields.length ? `Manual values retained for: ${missingFields.join(", ")}.` : undefined,
    ].filter(Boolean).join(" "),
  };
}

const manualPeers: ManualPeerSeed[] = [
  {
    ticker: "FDS",
    peer: "FactSet",
    companyName: "FactSet Research Systems",
    category: "Financial Data / Analytics",
    peerGroup: "data_analytics",
    revenueGrowth: 0.07,
    ebitdaMargin: 0.37,
    fcfYield: 0.036,
    forwardPe: 29,
    forwardEVEbitda: 20,
    ebitdaMultiple: 20,
    peerSetCompleteness: 1,
    qualityNotes: "High recurring mix and sticky desktop workflows.",
    commentary: "Useful multiple guardrail for desktop/data workflow businesses.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "SPGI",
    peer: "S&P Global",
    companyName: "S&P Global",
    category: "Financial Data / Indices",
    peerGroup: "indices",
    revenueGrowth: 0.08,
    ebitdaMargin: 0.5,
    fcfYield: 0.035,
    forwardPe: 28,
    forwardEVEbitda: 21,
    ebitdaMultiple: 21,
    peerSetCompleteness: 1,
    qualityNotes: "Recurring data and index mix supports durable pricing.",
    commentary: "Anchor for high-quality financial data and benchmarks.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "MSCI",
    peer: "MSCI",
    companyName: "MSCI",
    category: "Financial Data / Indices",
    peerGroup: "indices",
    revenueGrowth: 0.1,
    ebitdaMargin: 0.58,
    fcfYield: 0.031,
    forwardPe: 31,
    forwardEVEbitda: 26,
    ebitdaMultiple: 26,
    peerSetCompleteness: 1,
    qualityNotes: "Very high index licensing quality and low capital intensity.",
    commentary: "Upper-end index and licensing multiple reference.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "MCO",
    peer: "Moody's",
    companyName: "Moody's",
    category: "Financial Data / Analytics",
    peerGroup: "risk_information",
    revenueGrowth: 0.09,
    ebitdaMargin: 0.49,
    fcfYield: 0.034,
    forwardPe: 27,
    forwardEVEbitda: 19,
    ebitdaMultiple: 19,
    peerSetCompleteness: 1,
    qualityNotes: "Ratings cyclicality offset by high-quality analytics economics.",
    commentary: "Useful analog for information-services quality with some cyclicality.",
    signal: "Neutral",
    confidenceLevel: "medium",
  },
  {
    ticker: "TRI",
    peer: "Thomson Reuters",
    companyName: "Thomson Reuters",
    category: "Information Services / Legal Data",
    peerGroup: "risk_information",
    revenueGrowth: 0.07,
    ebitdaMargin: 0.39,
    fcfYield: 0.033,
    forwardPe: 22,
    forwardEVEbitda: 18,
    ebitdaMultiple: 18,
    peerSetCompleteness: 1,
    qualityNotes: "High recurring content and workflow distribution with legal / tax end-market exposure.",
    commentary: "Useful risk-information and workflow peer with strong recurring quality.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "RELX",
    peer: "RELX",
    companyName: "RELX",
    category: "Information Services / Analytics",
    peerGroup: "data_analytics",
    revenueGrowth: 0.06,
    ebitdaMargin: 0.35,
    fcfYield: 0.038,
    forwardPe: 21,
    forwardEVEbitda: 17,
    ebitdaMultiple: 17,
    peerSetCompleteness: 1,
    qualityNotes: "Global analytics and exhibitions mix with strong legal/risk data assets.",
    commentary: "Broad information-services comparator that helps widen the data analytics peer panel.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "EXPN.L",
    peer: "Experian",
    companyName: "Experian",
    category: "Information Services / Credit Data",
    peerGroup: "risk_information",
    revenueGrowth: 0.07,
    ebitdaMargin: 0.31,
    fcfYield: 0.034,
    forwardPe: 24,
    forwardEVEbitda: 12,
    ebitdaMultiple: 12,
    peerSetCompleteness: 1,
    qualityNotes: "Consumer and business credit-information asset with recurring database economics.",
    commentary: "Adds a London-listed information-services peer, but listing currency must be treated carefully.",
    signal: "Neutral",
    confidenceLevel: "medium",
  },
  {
    ticker: "CME",
    peer: "CME",
    companyName: "CME Group",
    category: "Exchange / Clearing",
    peerGroup: "market_infrastructure",
    revenueGrowth: 0.06,
    ebitdaMargin: 0.62,
    fcfYield: 0.042,
    forwardPe: 24,
    forwardEVEbitda: 18,
    ebitdaMultiple: 18,
    peerSetCompleteness: 1,
    qualityNotes: "High-margin clearing and market data infrastructure.",
    commentary: "Core market infrastructure and clearing guardrail.",
    signal: "Positive",
    confidenceLevel: "high",
  },
  {
    ticker: "ICE",
    peer: "ICE",
    companyName: "Intercontinental Exchange",
    category: "Exchange / Clearing",
    peerGroup: "market_infrastructure",
    revenueGrowth: 0.07,
    ebitdaMargin: 0.58,
    fcfYield: 0.041,
    forwardPe: 23,
    forwardEVEbitda: 17,
    ebitdaMultiple: 17,
    peerSetCompleteness: 1,
    qualityNotes: "Diversified exchange, clearing, and data mix.",
    commentary: "Useful clearing/data mix reference for LSEG Markets.",
    signal: "Positive",
    confidenceLevel: "high",
  },
  {
    ticker: "NDAQ",
    peer: "Nasdaq",
    companyName: "Nasdaq",
    category: "Exchange / Market Infrastructure",
    peerGroup: "market_infrastructure",
    revenueGrowth: 0.08,
    ebitdaMargin: 0.53,
    fcfYield: 0.039,
    forwardPe: 24,
    forwardEVEbitda: 18,
    ebitdaMultiple: 18,
    peerSetCompleteness: 1,
    qualityNotes: "Index, software, and market infrastructure mix is more recurring than classic exchange revenues.",
    commentary: "Useful reference for recurring infrastructure plus software.",
    signal: "Positive",
    confidenceLevel: "high",
  },
  {
    ticker: "DB1.DE",
    peer: "Deutsche Börse",
    companyName: "Deutsche Börse",
    category: "Exchange / Clearing",
    peerGroup: "post_trade",
    revenueGrowth: 0.05,
    ebitdaMargin: 0.54,
    fcfYield: 0.045,
    forwardPe: 22,
    forwardEVEbitda: 16,
    ebitdaMultiple: 16,
    peerSetCompleteness: 1,
    qualityNotes: "European post-trade and fund services analog.",
    commentary: "European clearing and post-trade multiple guardrail.",
    signal: "Neutral",
    confidenceLevel: "medium",
  },
  {
    ticker: "ENX.PA",
    peer: "Euronext",
    companyName: "Euronext",
    category: "Exchange / Market Infrastructure",
    peerGroup: "market_infrastructure",
    revenueGrowth: 0.06,
    ebitdaMargin: 0.55,
    fcfYield: 0.046,
    forwardPe: 20,
    forwardEVEbitda: 14,
    ebitdaMultiple: 14,
    peerSetCompleteness: 1,
    qualityNotes: "More cyclical cash equities exposure lowers the multiple range.",
    commentary: "Lower-end exchange cyclicality guardrail.",
    signal: "Neutral",
    confidenceLevel: "high",
  },
  {
    ticker: "TW",
    peer: "Tradeweb",
    companyName: "Tradeweb Markets",
    category: "Electronic Trading",
    peerGroup: "electronic_trading",
    revenueGrowth: 0.11,
    ebitdaMargin: 0.53,
    fcfYield: 0.032,
    forwardPe: 35,
    forwardEVEbitda: 25,
    ebitdaMultiple: 25,
    peerSetCompleteness: 1,
    qualityNotes: "High structural e-trading growth, but short-term volume can be cyclical.",
    commentary: "Structural e-trading upside reference; do not fully import into base Markets multiple.",
    signal: "Positive",
    confidenceLevel: "medium",
  },
  {
    ticker: "MKTX",
    peer: "MarketAxess",
    companyName: "MarketAxess",
    category: "Electronic Trading",
    peerGroup: "electronic_trading",
    revenueGrowth: 0.03,
    ebitdaMargin: 0.43,
    fcfYield: 0.039,
    forwardPe: 26,
    forwardEVEbitda: 18,
    ebitdaMultiple: 18,
    peerSetCompleteness: 1,
    qualityNotes: "Credit execution growth can fade sharply when market conditions normalize.",
    commentary: "Lower-quality e-trading guardrail when cyclicality rises.",
    signal: "Negative",
    confidenceLevel: "medium",
  },
];

export const lsegPeers: LsegPeerPoint[] = manualPeers.map(mergePeer);

const peerGroupValidCounts = lsegPeers.reduce<Record<string, number>>((acc, peer) => {
  const key = peer.peerGroup ?? "unknown";
  acc[key] = (acc[key] ?? 0) + (peer.isPlaceholder ? 0 : 1);
  return acc;
}, {});

export const lsegPeerLayerWarnings: PeerLayerWarning[] = [
  ...((lsegYfinancePeerAudit.missingTickers.length > 0)
    ? [{
        id: "lseg-peer-missing-yfinance-rows",
        message: `Missing yfinance peer rows: ${lsegYfinancePeerAudit.missingTickers.join(", ")}. Manual peer seeds are retained for those names.`,
        severity: "medium" as const,
      }]
    : []),
  ...((lsegYfinancePeerAudit.rowsWithNullRequiredRatios.length > 0)
    ? [{
        id: "lseg-peer-missing-yfinance-fields",
        message: `Some yfinance peer rows are missing required ratio fields: ${lsegYfinancePeerAudit.rowsWithNullRequiredRatios.join(", ")}. Manual fallbacks remain in place where needed.`,
        severity: "medium" as const,
      }]
    : []),
  ...((daysBetweenIso(fetchedDate, peerDate) > staleThresholdDays)
    ? [{
        id: "lseg-peer-snapshot-stale",
        message: `yfinance peer snapshot is stale as of ${fetchedDate}. Review before leaning on peer-derived commentary or guardrails.`,
        severity: "medium" as const,
      }]
    : []),
  ...((lsegYfinancePeerAudit.hasMixedCurrencies)
    ? [{
        id: "lseg-peer-currency-mismatch",
        message: `Peer snapshot mixes currencies (${lsegYfinancePeerAudit.currencies.join(", ")}). Use ratio multiples only and treat EXPN.L / DB1.DE / ENX.PA listing differences carefully.`,
        severity: "low" as const,
      }]
    : []),
  ...Object.entries(peerGroupValidCounts)
    .filter(([, count]) => count < 3)
    .map(([peerGroup, count]) => ({
      id: `lseg-peer-group-${peerGroup}-insufficient`,
      message: `Peer group ${peerGroup} has only ${count} valid external peers. Guardrails remain manual and confidence should stay capped.`,
      severity: "medium" as const,
    })),
  ...lsegPeers.flatMap((peer) => {
    const missing: string[] = [];
    if (!Number.isFinite(peer.forwardPe)) missing.push("forwardPe");
    if (!Number.isFinite(peer.forwardEVEbitda ?? peer.ebitdaMultiple)) missing.push("enterpriseToEbitda");
    if (missing.length === 0) return [];
    return [{
      id: `lseg-peer-final-missing-${peer.ticker ?? peer.peer}`.toLowerCase(),
      message: `Peer ${peer.ticker ?? peer.peer} is still missing final ratio values after fallback: ${missing.join(", ")}.`,
      severity: "high" as const,
    }];
  }),
  ...(((lsegYfinanceWarningManifest.data ?? []) as WarningManifestItem[]).flatMap((item, index) => {
    const message = typeof item === "string" ? item : item.warning ?? item.message;
    return message ? [{ id: `lseg-peer-manifest-${index + 1}`, message, severity: "low" as const }] : [];
  })),
];

export const lsegPeerPopulationSummary = {
  fetchedAt,
  fetchedDate,
  populatedTickers: lsegPeers.filter((peer) => !peer.isPlaceholder).map((peer) => peer.ticker ?? peer.peer),
  manualFallbackTickers: lsegPeers.filter((peer) => peer.isPlaceholder).map((peer) => peer.ticker ?? peer.peer),
};
