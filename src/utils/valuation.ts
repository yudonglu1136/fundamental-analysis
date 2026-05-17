import type { PriceMetadata, ValidationWarning } from "../stocks/types";
import { safeDivide } from "./financialMath";

export const priceMetadataByTicker: Record<string, PriceMetadata> = {
  MCK: {
    ticker: "MCK",
    currentPrice: 650,
    currency: "USD",
    unit: "share",
    asOfDate: "2026-05-09",
    source: "placeholder",
    marketReference: 650,
    provenance: "Placeholder model anchor from local workbook snapshot.",
  },
  LSEG: {
    ticker: "LSEG",
    currentPrice: 92.26,
    currency: "GBP",
    unit: "share",
    asOfDate: "2026-05-07",
    source: "actual",
    marketReference: 92.26,
    provenance: "Dated local LSEG market snapshot in GBP.",
  },
  MSFT: {
    ticker: "MSFT",
    currentPrice: 430,
    currency: "USD",
    unit: "share",
    asOfDate: "2026-05-09",
    source: "actual",
    marketReference: 430,
    provenance: "Local Microsoft valuation anchor in USD.",
  },
  META: {
    ticker: "META",
    currentPrice: 609.63,
    currency: "USD",
    unit: "share",
    asOfDate: "2026-05-08",
    source: "actual",
    marketReference: 609.63,
    provenance: "Dated META market snapshot saved in data/local/meta/market/market_snapshot.json.",
  },
  GOOGL: {
    ticker: "GOOGL",
    currentPrice: 400.8,
    currency: "USD",
    unit: "share",
    asOfDate: "2026-05-09",
    source: "actual",
    marketReference: 400.8,
    provenance: "Local Alphabet valuation anchor in USD.",
  },
  PLTR: {
    ticker: "PLTR",
    currentPrice: 134.88499450683594,
    currency: "USD",
    unit: "share",
    asOfDate: "2026-05-11",
    source: "actual",
    marketReference: 134.88499450683594,
    provenance: "Unofficial yfinance snapshot saved in data/local/pltr/yfinance/pltr_chart_snapshot.json.",
  },
};

export function getCanonicalCurrentPrice(ticker: string, fallback = 0) {
  return priceMetadataByTicker[ticker]?.currentPrice ?? fallback;
}

export function computeUpsideDownside(fairValue: number, currentPrice: number) {
  return safeDivide(fairValue, currentPrice) - 1;
}

export function computeExpectedShareholderCagr(targetPrice3Y: number, currentPrice: number, cumulativeDividends: number) {
  if (currentPrice <= 0) return 0;
  return Math.pow((targetPrice3Y + cumulativeDividends) / currentPrice, 1 / 3) - 1;
}

export function daysBetweenIso(fromDate: string, toDate: string) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildPriceValidationWarnings(ticker: string, currentPrice: number, todayIso: string): ValidationWarning[] {
  const metadata = priceMetadataByTicker[ticker];
  if (!metadata) return [];
  const warnings: ValidationWarning[] = [];
  if (daysBetweenIso(metadata.asOfDate, todayIso) > 7) {
    warnings.push({
      id: `${ticker.toLowerCase()}-stale-price`,
      title: "Current price anchor is stale",
      detail: `Price anchor is older than 7 days (${metadata.asOfDate}) and may distort upside/downside.`,
      severity: "medium",
    });
  }
  if (metadata.marketReference > 0) {
    const deviation = Math.abs(safeDivide(currentPrice, metadata.marketReference) - 1);
    if (deviation > 0.1) {
      warnings.push({
        id: `${ticker.toLowerCase()}-price-deviation`,
        title: "Current price deviates from market reference",
        detail: `Current price differs materially from the stored market reference of ${metadata.marketReference.toFixed(2)} ${metadata.currency}.`,
        severity: "medium",
      });
    }
  }
  return warnings;
}

export function buildPeriodictyWarning(label: string, periodicity: string, expected: string): ValidationWarning[] {
  return periodicity !== expected
    ? [
        {
          id: `${label.toLowerCase().replace(/\s+/g, "-")}-periodicity`,
          title: `${label} periodicity mismatch`,
          detail: `${label} is tagged as ${periodicity} but valuation expects ${expected}.`,
          severity: "high",
        },
      ]
    : [];
}
