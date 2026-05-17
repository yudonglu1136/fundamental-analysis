import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OFFICIAL_DIR = path.join(ROOT, "data/local/pltr/official");
const METRIC_DIR = path.join(ROOT, "data/local/pltr/metrics");
const YFINANCE_DIR = path.join(ROOT, "data/local/pltr/yfinance");
const COMPANYFACTS_PATH = path.join(OFFICIAL_DIR, "sec_companyfacts.json");
const SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001321655.json";
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-pltr-module contact@example.com";

const concepts = [
  { key: "revenue", label: "Revenue", taxonomy: "us-gaap", tag: "RevenueFromContractWithCustomerExcludingAssessedTax", unit: "USD" },
  { key: "gaapOperatingIncome", label: "GAAP operating income", taxonomy: "us-gaap", tag: "OperatingIncomeLoss", unit: "USD" },
  { key: "netIncome", label: "Net income", taxonomy: "us-gaap", tag: "NetIncomeLoss", unit: "USD" },
  { key: "eps", label: "Diluted EPS", taxonomy: "us-gaap", tag: "EarningsPerShareDiluted", unit: "USD/shares" },
  { key: "dilutedShareCount", label: "Diluted share count", taxonomy: "us-gaap", tag: "WeightedAverageNumberOfDilutedSharesOutstanding", unit: "shares" },
  { key: "operatingCashFlow", label: "Operating cash flow", taxonomy: "us-gaap", tag: "NetCashProvidedByUsedInOperatingActivities", unit: "USD" },
  { key: "capex", label: "Capital expenditures", taxonomy: "us-gaap", tag: "PaymentsToAcquirePropertyPlantAndEquipment", unit: "USD" },
  { key: "sbcExpense", label: "Stock-based compensation expense", taxonomy: "us-gaap", tag: "ShareBasedCompensation", unit: "USD" },
  { key: "cashAndEquivalents", label: "Cash and cash equivalents", taxonomy: "us-gaap", tag: "CashAndCashEquivalentsAtCarryingValue", unit: "USD" },
  { key: "marketableSecuritiesCurrent", label: "Current marketable securities", taxonomy: "us-gaap", tag: "MarketableSecuritiesCurrent", unit: "USD" },
  { key: "longTermDebt", label: "Long-term debt", taxonomy: "us-gaap", tag: "LongTermDebt", unit: "USD" },
  { key: "currentDebt", label: "Current debt", taxonomy: "us-gaap", tag: "ShortTermBorrowings", unit: "USD" },
];

function periodFromFact(fact) {
  if (fact.frame && /CY\d{4}Q[1-4]/.test(fact.frame)) {
    const match = fact.frame.match(/CY(\d{4})Q([1-4])/);
    return match ? `q${match[2]}-${match[1]}` : fact.frame.toLowerCase();
  }
  if (fact.fy && fact.fp && /^Q[1-4]$/.test(fact.fp)) return `${fact.fp.toLowerCase()}-${fact.fy}`;
  if (fact.fy && fact.fp === "FY") return `fy-${fact.fy}`;
  return fact.frame ?? `${fact.fy ?? "unknown"}-${fact.fp ?? "unknown"}`.toLowerCase();
}

function sourceUrlFromFact(fact) {
  if (!fact.accn) return SEC_COMPANYFACTS_URL;
  return `https://www.sec.gov/Archives/edgar/data/1321655/${fact.accn.replace(/-/g, "")}/${fact.accn}.txt`;
}

async function loadCompanyFacts() {
  try {
    return JSON.parse(await fs.readFile(COMPANYFACTS_PATH, "utf8"));
  } catch {
    const response = await fetch(SEC_COMPANYFACTS_URL, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`SEC companyfacts returned ${response.status}`);
    const json = await response.json();
    await fs.mkdir(OFFICIAL_DIR, { recursive: true });
    await fs.writeFile(COMPANYFACTS_PATH, JSON.stringify(json, null, 2));
    return json;
  }
}

function extractConceptFacts(companyFacts, concept) {
  const units = companyFacts?.facts?.[concept.taxonomy]?.[concept.tag]?.units?.[concept.unit] ?? [];
  return units
    .filter((fact) => fact.form === "10-Q" || fact.form === "10-K")
    .map((fact) => ({
      key: concept.key,
      label: concept.label,
      value: typeof fact.val === "number" ? (concept.unit === "USD" ? fact.val / 1_000_000 : fact.val / (concept.unit === "shares" ? 1_000_000 : 1)) : null,
      unit: concept.unit === "USD" ? "USDm" : concept.unit === "shares" ? "shares_m" : "USD",
      period: periodFromFact(fact),
      fiscalYear: fact.fy ?? null,
      fiscalPeriod: fact.fp ?? null,
      end: fact.end ?? null,
      sourceUrl: sourceUrlFromFact(fact),
      sourceType: "sec_filing",
      sourceConfidence: fact.frame ? "high" : "medium",
      notes: `${concept.taxonomy}:${concept.tag} from SEC companyfacts. Review duration and frame before promotion into curated actuals.`,
    }));
}

function latestByMetricPeriod(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.key}-${row.period}`;
    const existing = byKey.get(key);
    if (!existing || String(row.end ?? "") > String(existing.end ?? "")) byKey.set(key, row);
  }
  return Array.from(byKey.values()).sort((a, b) => `${a.period}-${a.key}`.localeCompare(`${b.period}-${b.key}`));
}

async function fetchYfinanceSnapshot() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/PLTR?range=5d&interval=1d";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "fundamental-analysis-pltr-module" } });
    if (!response.ok) throw new Error(`Yahoo chart returned ${response.status}`);
    const json = await response.json();
    await fs.mkdir(YFINANCE_DIR, { recursive: true });
    await fs.writeFile(path.join(YFINANCE_DIR, "pltr_chart_snapshot.json"), JSON.stringify(json, null, 2));
    const result = json.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result?.timestamp ?? [];
    const lastIndex = closes.map((value, index) => ({ value, index })).filter((item) => Number.isFinite(item.value)).at(-1);
    return lastIndex
      ? {
          ticker: "PLTR",
          currentPrice: lastIndex.value,
          priceDate: new Date(timestamps[lastIndex.index] * 1000).toISOString().slice(0, 10),
          sourceUrl: url,
          sourceType: "yfinance",
          sourceConfidence: "medium",
          notes: "Unofficial Yahoo Finance chart endpoint snapshot. Use for market cross-check only.",
        }
      : null;
  } catch (error) {
    return {
      ticker: "PLTR",
      currentPrice: null,
      priceDate: null,
      sourceUrl: url,
      sourceType: "yfinance",
      sourceConfidence: "low",
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

await fs.mkdir(METRIC_DIR, { recursive: true });
const companyFacts = await loadCompanyFacts();
const secMetrics = latestByMetricPeriod(concepts.flatMap((concept) => extractConceptFacts(companyFacts, concept)));
const yfinance = await fetchYfinanceSnapshot();

const metricDatabase = {
  ticker: "PLTR",
  builtAt: new Date().toISOString(),
  rules: [
    "Every metric carries value, unit, period, sourceUrl, sourceType, sourceConfidence, and notes.",
    "Missing metrics must remain null in curated data until sourced.",
    "SEC companyfacts can include YTD values; review frames before promotion.",
  ],
  secMetrics,
  yfinance,
};

await fs.writeFile(path.join(METRIC_DIR, "metric_database.json"), JSON.stringify(metricDatabase, null, 2));
console.log(`PLTR metric database built: ${secMetrics.length} SEC metric rows.`);
if (yfinance?.currentPrice) console.log(`Yfinance snapshot: PLTR ${yfinance.currentPrice} on ${yfinance.priceDate}.`);
else console.log("Yfinance snapshot unavailable.");
