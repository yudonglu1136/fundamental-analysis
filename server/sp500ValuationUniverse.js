import fs from "node:fs";
import path from "node:path";

const manifestPath = process.env.SP500_VALUATION_UNIVERSE_PATH ||
  path.join(process.cwd(), "server/config/sp500-valuation-universe.json");

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { companies: [] };
  }
}

const manifest = loadManifest();
const companies = Array.isArray(manifest.companies) ? manifest.companies : [];
const companyByTicker = new Map();
const canonicalByAlias = new Map();
const priceTickerByCusip = new Map();

function normalizedCusip(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizedTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function registerCusip(cusip, ticker) {
  const key = normalizedCusip(cusip);
  const priceTicker = normalizedTicker(ticker);
  if (!key || !priceTicker) return;
  const existing = priceTickerByCusip.get(key);
  if (existing && existing !== priceTicker) {
    throw new Error(
      `Conflicting S&P 500 CUSIP mapping for ${key}: ${existing} versus ${priceTicker}`
    );
  }
  priceTickerByCusip.set(key, priceTicker);
}

for (const company of companies) {
  const canonical = normalizedTicker(company?.ticker);
  if (!canonical) continue;
  companyByTicker.set(canonical, company);
  canonicalByAlias.set(canonical, canonical);
  for (const alias of company.aliases || []) {
    canonicalByAlias.set(normalizedTicker(alias), canonical);
  }
  registerCusip(
    company.cusip,
    company.priceTicker || company.sourceTicker || company.ticker
  );
  for (const shareClass of company.shareClasses || []) {
    registerCusip(
      shareClass.cusip,
      shareClass.priceTicker || shareClass.sourceTicker || shareClass.ticker
    );
  }
}

export function sp500CompanyForTicker(value) {
  const ticker = String(value || "").toUpperCase();
  return companyByTicker.get(canonicalByAlias.get(ticker) || ticker) || null;
}

export function sp500CanonicalTicker(value) {
  const ticker = String(value || "").toUpperCase();
  return canonicalByAlias.get(ticker) || ticker;
}

export function sp500ValuationProfile(value) {
  return sp500CompanyForTicker(value)?.valuationProfile || null;
}

export function sp500AliasEntries() {
  return [...canonicalByAlias.entries()].filter(([alias, canonical]) => alias !== canonical);
}

export function sp500CompanyTickers() {
  return companies.map((company) => String(company.ticker).toUpperCase());
}

export function sp500PriceTickerForCusip(value) {
  return priceTickerByCusip.get(normalizedCusip(value)) || "";
}

export function sp500CusipEntries() {
  return [...priceTickerByCusip.entries()];
}

export function sp500UniverseSummary() {
  return {
    asOf: manifest.asOf || null,
    securityCount: manifest.securityCount || 0,
    companyCount: companies.length,
    cusipCount: priceTickerByCusip.size,
    manifestPath
  };
}
