import yfinanceMarketSnapshot from "../../../../data/local/lseg/yfinance/curated/market_snapshot.json";
import yfinancePeerMultiplesSnapshot from "../../../../data/local/lseg/yfinance/curated/peer_multiples_snapshot.json";
import yfinanceProvenanceManifest from "../../../../data/local/lseg/yfinance/curated/provenance.json";
import yfinanceWarningManifest from "../../../../data/local/lseg/yfinance/curated/warnings.json";

type YfinanceDataset<T> = {
  provenance?: {
    datasetId?: string;
    source?: string;
    sourceType?: string;
    fetchedAt?: string | null;
    ticker?: string | null;
    currency?: string | null;
    qualityTag?: "Actual" | "Derived" | "Assumption" | "Placeholder";
    notes?: string | null;
  };
  data?: T;
};

type RawPeerMultipleRow = {
  ticker?: string | null;
  currency?: string | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  enterpriseToEbitda?: number | null;
  priceToSalesTrailing12Months?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
};

export type LsegYfinancePeerMultiple = {
  ticker: string;
  currency: string;
  forwardPe: number | null;
  evToEbitda: number | null;
  trailingPe: number | null;
  priceToSales: number | null;
  dividendYield: number | null;
  beta: number | null;
  dataDate: string | null;
  source: "yfinance";
  useFor: "ratio_multiples_only";
  absoluteValueAggregationAllowed: false;
  marketCap: number | null;
  enterpriseValue: number | null;
  absoluteValueCurrency: string;
  absoluteValueUse: "metadata_only";
};

export type LsegYfinancePeerAudit = {
  expectedTickers: string[];
  fetchedTickers: string[];
  missingTickers: string[];
  rowCount: number;
  rowsWithNullRequiredRatios: string[];
  currencies: string[];
  hasMixedCurrencies: boolean;
  ratioMultiplesUsable: boolean;
  absoluteMarketCapAggregationAllowed: false;
  note: string;
};

export const lsegYfinanceMarketSnapshot = yfinanceMarketSnapshot;
export const lsegYfinanceProvenanceManifest = yfinanceProvenanceManifest;
export const lsegYfinanceWarningManifest = yfinanceWarningManifest;
// Raw Yahoo Finance dumps are intentionally optional local artifacts and may be
// excluded from Git. The live LSEG data layer must compile without them.
export const lsegRawInfoSnapshot = {
  provenance: {
    datasetId: "raw_lseg_info_optional",
    source: "yfinance",
    sourceType: "yahoo_finance_snapshot",
    fetchedAt: null,
    ticker: "LSEG.L",
    currency: null,
    qualityTag: "Placeholder" as const,
    notes: "Optional raw Yahoo Finance info snapshot not committed in clean checkouts.",
  },
  data: {},
};

export const LSEG_YFINANCE_EXPECTED_PEER_TICKERS = [
  "ICE",
  "CME",
  "SPGI",
  "MCO",
  "TRI",
  "RELX",
  "EXPN.L",
  "NDAQ",
  "DB1.DE",
  "ENX.PA",
] as const;

const peerSnapshot = yfinancePeerMultiplesSnapshot as YfinanceDataset<RawPeerMultipleRow[]>;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function datePart(isoString: string | null | undefined): string | null {
  if (!isoString || typeof isoString !== "string") {
    return null;
  }
  return isoString.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

const rawPeerRows = peerSnapshot.data ?? [];

export const lsegYfinancePeerMultiples: LsegYfinancePeerMultiple[] = rawPeerRows.map((row) => ({
  ticker: row.ticker ?? "UNKNOWN",
  currency: row.currency ?? "UNKNOWN",
  forwardPe: asFiniteNumber(row.forwardPE),
  evToEbitda: asFiniteNumber(row.enterpriseToEbitda),
  trailingPe: asFiniteNumber(row.trailingPE),
  priceToSales: asFiniteNumber(row.priceToSalesTrailing12Months),
  dividendYield: asFiniteNumber(row.dividendYield),
  beta: asFiniteNumber(row.beta),
  dataDate: datePart(peerSnapshot.provenance?.fetchedAt),
  source: "yfinance",
  useFor: "ratio_multiples_only",
  absoluteValueAggregationAllowed: false,
  marketCap: asFiniteNumber(row.marketCap),
  enterpriseValue: asFiniteNumber(row.enterpriseValue),
  absoluteValueCurrency: row.currency ?? "UNKNOWN",
  absoluteValueUse: "metadata_only",
}));

const fetchedTickerSet = new Set(lsegYfinancePeerMultiples.map((row) => row.ticker));
const missingTickers = LSEG_YFINANCE_EXPECTED_PEER_TICKERS.filter((ticker) => !fetchedTickerSet.has(ticker));
const rowsWithNullRequiredRatios = rawPeerRows
  .filter((row) =>
    row.forwardPE == null ||
    row.enterpriseToEbitda == null ||
    row.trailingPE == null ||
    row.priceToSalesTrailing12Months == null ||
    row.dividendYield == null ||
    row.beta == null,
  )
  .map((row) => row.ticker ?? "UNKNOWN");
const currencies = [...new Set(lsegYfinancePeerMultiples.map((row) => row.currency))];

export const lsegYfinancePeerAudit: LsegYfinancePeerAudit = {
  expectedTickers: [...LSEG_YFINANCE_EXPECTED_PEER_TICKERS],
  fetchedTickers: lsegYfinancePeerMultiples.map((row) => row.ticker),
  missingTickers,
  rowCount: lsegYfinancePeerMultiples.length,
  rowsWithNullRequiredRatios,
  currencies,
  hasMixedCurrencies: currencies.length > 1,
  ratioMultiplesUsable:
    lsegYfinancePeerMultiples.length === LSEG_YFINANCE_EXPECTED_PEER_TICKERS.length &&
    missingTickers.length === 0 &&
    rowsWithNullRequiredRatios.length === 0,
  absoluteMarketCapAggregationAllowed: false,
  note:
    "Peer currencies are mixed across USD, EUR, and GBp. Use forward P/E, EV/EBITDA, trailing P/E, P/S, dividend yield, and beta as ratio guardrails only; do not aggregate peer marketCap or enterpriseValue across currencies.",
};
