import type { ValidationWarning } from "../../types";
import type { LsegMarketData } from "../model";
import {
  lsegRawInfoSnapshot as rawLsegInfoSnapshot,
  lsegYfinanceMarketSnapshot as yfinanceMarketSnapshot,
  lsegYfinanceProvenanceManifest as yfinanceProvenanceManifest,
  lsegYfinanceWarningManifest as yfinanceWarningManifest,
} from "./marketData";

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

type YfinanceMarketSnapshot = {
  ticker?: string | null;
  currency?: string | null;
  currentPrice?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  sharesOutstanding?: number | null;
  beta?: number | null;
  previousClose?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
};

type YfinanceInfoSnapshot = {
  dividendYield?: number | null;
  beta?: number | null;
  marketCap?: number | null;
  enterpriseValue?: number | null;
  sharesOutstanding?: number | null;
  previousClose?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  regularMarketPrice?: number | null;
  currentPrice?: number | null;
  currency?: string | null;
};

type YfinanceWarningManifest = {
  data?: Array<string | { warning?: string; message?: string }>;
};

const YFINANCE_STALE_DAYS = 7;

export const manualLsegMarketDataFallback: LsegMarketData = {
  currentPrice: 92.26,
  currentPriceCurrency: "GBP",
  priceDate: "2026-05-07",
  source:
    "Manual market snapshot sourced from public market data reference on 2026-05-07. This remains the fallback if the local Yahoo Finance snapshot is missing, stale, or fails unit sanity checks.",
  manualOverride: null,
  previousClose: 91.88,
  fiftyTwoWeekHigh: 111.95,
  fiftyTwoWeekLow: 86.12,
  marketCap: 45917,
  enterpriseValue: 54317,
  sharesOutstanding: 497.7,
  dilutedShares: 499.2,
  netDebt: 8400,
  sourceType: "actual",
  ticker: "LSEG.L",
  rawCurrency: "GBP",
  fetchedAt: null,
  asOfDate: "2026-05-07",
  providerSourceType: "manual_snapshot",
  qualityTag: "Actual",
  currentPriceGbp: 92.26,
  previousCloseGbp: 91.88,
  fiftyTwoWeekHighGbp: 111.95,
  fiftyTwoWeekLowGbp: 86.12,
  marketCapGbp: 45_917_000_000,
  enterpriseValueGbp: 54_317_000_000,
  sharesOutstandingRaw: 497_700_000,
  beta: null,
  dividendYield: null,
  validationWarnings: [],
};

const marketSnapshot = yfinanceMarketSnapshot as YfinanceDataset<YfinanceMarketSnapshot>;
const rawInfo = rawLsegInfoSnapshot as YfinanceDataset<YfinanceInfoSnapshot>;
const provenanceManifest = yfinanceProvenanceManifest as YfinanceDataset<Array<{ file?: string; provenance?: { fetchedAt?: string } }>>;
const warningManifest = yfinanceWarningManifest as YfinanceWarningManifest;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function datePart(isoString: string | null | undefined): string | null {
  if (!isoString || typeof isoString !== "string") {
    return null;
  }
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function daysBetweenIso(dateA: string | null | undefined, dateB: string): number {
  if (!dateA) {
    return Number.POSITIVE_INFINITY;
  }
  const left = Date.parse(dateA);
  const right = Date.parse(dateB);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(Math.abs(right - left) / (1000 * 60 * 60 * 24));
}

function normalizePriceFromCurrency(value: number | null, rawCurrency: string | null): number | null {
  if (value == null) {
    return null;
  }
  if (rawCurrency === "GBp") {
    return value / 100;
  }
  return value;
}

function buildYfinanceWarnings(
  rawCurrency: string | null,
  fetchedAt: string | null,
  currentPriceGbp: number | null,
  marketCapGbp: number | null,
  enterpriseValueGbp: number | null,
  sharesOutstandingRaw: number | null,
  dividendYield: number | null,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const staleDays = daysBetweenIso(datePart(fetchedAt), todayIso);

  if (rawCurrency === "GBp") {
    warnings.push({
      id: "lseg-yahoo-gbp-normalization",
      title: "GBp Price Fields Normalized",
      detail:
        "LSEG.L Yahoo Finance price fields are quoted in GBp/pence. currentPrice, previousClose, and 52-week range are normalized to GBP inside lsegMarketData.ts. Market cap and enterprise value are not divided by 100.",
      severity: "low",
    });
  }

  if (staleDays > YFINANCE_STALE_DAYS) {
    warnings.push({
      id: "lseg-yahoo-market-data-stale",
      title: "Yahoo Finance Snapshot Is Stale",
      detail: `Local Yahoo Finance market snapshot is dated ${datePart(fetchedAt) ?? "unknown"} and exceeds the ${YFINANCE_STALE_DAYS}-day freshness threshold.`,
      severity: "medium",
    });
  }

  if (marketCapGbp != null || enterpriseValueGbp != null) {
    warnings.push({
      id: "lseg-yahoo-market-cap-unit-risk",
      title: "Market Cap / EV Unit Risk",
      detail:
        "Yahoo Finance marketCap and enterpriseValue are stored as absolute GBP values in marketCapGbp / enterpriseValueGbp. Legacy marketCap / enterpriseValue compatibility aliases remain in GBP millions for the existing LSEG model.",
      severity: "low",
    });
  }

  if (dividendYield == null) {
    warnings.push({
      id: "lseg-yahoo-dividend-yield-missing",
      title: "Dividend Yield Missing",
      detail: "Dividend yield is missing from the local Yahoo Finance market snapshot and raw info fallback.",
      severity: "medium",
    });
  }

  if (sharesOutstandingRaw == null) {
    warnings.push({
      id: "lseg-yahoo-shares-outstanding-missing",
      title: "Shares Outstanding Missing",
      detail: "Yahoo Finance sharesOutstanding is missing, so the module falls back to the manual share-count anchor for legacy compatibility fields.",
      severity: "medium",
    });
  }

  if (currentPriceGbp == null) {
    warnings.push({
      id: "lseg-yahoo-current-price-missing",
      title: "Current Price Missing",
      detail: "Yahoo Finance current price is missing or non-finite; the module falls back to the manual market snapshot.",
      severity: "high",
    });
  }

  for (const item of warningManifest.data ?? []) {
    const message = typeof item === "string" ? item : item?.warning ?? item?.message;
    if (message) {
      warnings.push({
        id: "lseg-yahoo-pipeline-warning",
        title: "Yahoo Finance Pipeline Warning",
        detail: message,
        severity: "medium",
      });
    }
  }

  return warnings;
}

function resolveLsegMarketData(): LsegMarketData {
  const snapshot = marketSnapshot.data ?? {};
  const raw = rawInfo.data ?? {};
  const fetchedAt = marketSnapshot.provenance?.fetchedAt ?? provenanceManifest.provenance?.fetchedAt ?? null;
  const priceDate = datePart(fetchedAt);
  const rawCurrency = snapshot.currency ?? marketSnapshot.provenance?.currency ?? raw.currency ?? rawInfo.provenance?.currency ?? null;

  const currentPriceGbp = normalizePriceFromCurrency(asFiniteNumber(snapshot.currentPrice ?? raw.regularMarketPrice ?? raw.currentPrice), rawCurrency);
  const previousCloseGbp = normalizePriceFromCurrency(asFiniteNumber(snapshot.previousClose ?? raw.previousClose), rawCurrency);
  const fiftyTwoWeekHighGbp = normalizePriceFromCurrency(asFiniteNumber(snapshot.fiftyTwoWeekHigh ?? raw.fiftyTwoWeekHigh), rawCurrency);
  const fiftyTwoWeekLowGbp = normalizePriceFromCurrency(asFiniteNumber(snapshot.fiftyTwoWeekLow ?? raw.fiftyTwoWeekLow), rawCurrency);

  const marketCapGbp = asFiniteNumber(snapshot.marketCap ?? raw.marketCap);
  const enterpriseValueGbp = asFiniteNumber(snapshot.enterpriseValue ?? raw.enterpriseValue);
  const sharesOutstandingRaw = asFiniteNumber(snapshot.sharesOutstanding ?? raw.sharesOutstanding);
  const beta = asFiniteNumber(snapshot.beta ?? raw.beta);
  const rawDividendYield = asFiniteNumber(raw.dividendYield);
  const dividendYield = rawDividendYield != null ? rawDividendYield / 100 : null;

  const yfinanceWarnings = buildYfinanceWarnings(
    rawCurrency,
    fetchedAt,
    currentPriceGbp,
    marketCapGbp,
    enterpriseValueGbp,
    sharesOutstandingRaw,
    dividendYield,
  );

  const shouldFallbackToManual =
    currentPriceGbp == null ||
    priceDate == null ||
    daysBetweenIso(priceDate, new Date().toISOString().slice(0, 10)) > YFINANCE_STALE_DAYS ||
    rawCurrency == null;

  if (shouldFallbackToManual) {
    return {
      ...manualLsegMarketDataFallback,
      source:
        `${manualLsegMarketDataFallback.source} Local Yahoo Finance snapshot was not used directly because it was missing required fields, lacked a usable as-of date, or was stale.`,
      validationWarnings: [
        ...yfinanceWarnings,
        {
          id: "lseg-yahoo-market-data-fallback",
          title: "Manual Market Snapshot Fallback Active",
          detail:
            "The module is using the manual LSEG market snapshot fallback because the local Yahoo Finance snapshot failed required-field or freshness checks.",
          severity: "medium",
        },
      ],
    };
  }

  return {
    currentPrice: manualLsegMarketDataFallback.currentPrice,
    currentPriceCurrency: "GBP",
    priceDate: manualLsegMarketDataFallback.priceDate,
    source:
      `Local Yahoo Finance snapshot fetched at ${fetchedAt}. Raw LSEG.L price fields were quoted in ${rawCurrency ?? "unknown"} and normalized to GBP where needed. marketCapGbp and enterpriseValueGbp are absolute GBP values; legacy marketCap and enterpriseValue compatibility aliases remain in GBP millions for the existing model. Step 1 preserves the manual currentPrice / priceDate compatibility alias so valuation outputs do not change before the market-data migration is explicitly approved.`,
    manualOverride: manualLsegMarketDataFallback.manualOverride ?? null,
    previousClose: previousCloseGbp ?? manualLsegMarketDataFallback.previousClose,
    fiftyTwoWeekHigh: fiftyTwoWeekHighGbp ?? manualLsegMarketDataFallback.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: fiftyTwoWeekLowGbp ?? manualLsegMarketDataFallback.fiftyTwoWeekLow,
    marketCap: marketCapGbp != null ? marketCapGbp / 1_000_000 : manualLsegMarketDataFallback.marketCap,
    enterpriseValue: enterpriseValueGbp != null ? enterpriseValueGbp / 1_000_000 : manualLsegMarketDataFallback.enterpriseValue,
    sharesOutstanding: sharesOutstandingRaw != null ? sharesOutstandingRaw / 1_000_000 : manualLsegMarketDataFallback.sharesOutstanding,
    dilutedShares: manualLsegMarketDataFallback.dilutedShares,
    netDebt: manualLsegMarketDataFallback.netDebt,
    sourceType: "actual",
    ticker: snapshot.ticker ?? marketSnapshot.provenance?.ticker ?? "LSEG.L",
    rawCurrency,
    fetchedAt,
    asOfDate: priceDate,
    providerSourceType: marketSnapshot.provenance?.sourceType === "yahoo_finance_snapshot" ? "yahoo_finance_snapshot" : "unknown",
    qualityTag: marketSnapshot.provenance?.qualityTag ?? "Actual",
    currentPriceGbp,
    previousCloseGbp,
    fiftyTwoWeekHighGbp,
    fiftyTwoWeekLowGbp,
    marketCapGbp,
    enterpriseValueGbp,
    sharesOutstandingRaw,
    beta,
    dividendYield,
    validationWarnings: [
      ...yfinanceWarnings,
      {
        id: "lseg-yahoo-current-price-compatibility-alias",
        title: "Current Price Compatibility Alias Preserved",
        detail:
          `currentPriceGbp is populated from the local Yahoo Finance snapshot (£${(currentPriceGbp ?? 0).toFixed(2)}), but currentPrice remains on the manual £${manualLsegMarketDataFallback.currentPrice.toFixed(2)} anchor in Step 1 so fair-value outputs and valuation assumptions do not change yet.`,
        severity: "low",
      },
    ],
  };
}

export const lsegMarketData: LsegMarketData = resolveLsegMarketData();
