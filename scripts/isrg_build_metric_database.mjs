import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEC_DIR = path.join(ROOT, "data/local/isrg/sec");
const OFFICIAL_DIR = path.join(ROOT, "data/local/isrg/official");
const EXTRACTED_DIR = path.join(ROOT, "data/local/isrg/extracted");
const MARKET_DIR = path.join(ROOT, "data/local/isrg/market");
const COMPANYFACTS_PATH = path.join(SEC_DIR, "sec_companyfacts.json");
const SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001035267.json";
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-isrg-module contact@example.com";

const concepts = [
  { key: "revenue", label: "Revenue", taxonomy: "us-gaap", tag: "RevenueFromContractWithCustomerExcludingAssessedTax", unit: "USD" },
  { key: "grossProfit", label: "Gross profit", taxonomy: "us-gaap", tag: "GrossProfit", unit: "USD" },
  { key: "operatingIncome", label: "Operating income", taxonomy: "us-gaap", tag: "OperatingIncomeLoss", unit: "USD" },
  { key: "netIncome", label: "Net income", taxonomy: "us-gaap", tag: "NetIncomeLoss", unit: "USD" },
  { key: "eps", label: "Diluted EPS", taxonomy: "us-gaap", tag: "EarningsPerShareDiluted", unit: "USD/shares" },
  { key: "dilutedShareCount", label: "Diluted share count", taxonomy: "us-gaap", tag: "WeightedAverageNumberOfDilutedSharesOutstanding", unit: "shares" },
  { key: "operatingCashFlow", label: "Operating cash flow", taxonomy: "us-gaap", tag: "NetCashProvidedByUsedInOperatingActivities", unit: "USD" },
  { key: "capex", label: "Capital expenditures", taxonomy: "us-gaap", tag: "PaymentsToAcquirePropertyPlantAndEquipment", unit: "USD" },
  { key: "sbcExpense", label: "Share-based compensation", taxonomy: "us-gaap", tag: "ShareBasedCompensation", unit: "USD" },
  { key: "cashAndEquivalents", label: "Cash and cash equivalents", taxonomy: "us-gaap", tag: "CashAndCashEquivalentsAtCarryingValue", unit: "USD" },
  { key: "marketableSecuritiesCurrent", label: "Current marketable securities", taxonomy: "us-gaap", tag: "MarketableSecuritiesCurrent", unit: "USD" },
  { key: "longTermDebt", label: "Long-term debt", taxonomy: "us-gaap", tag: "LongTermDebt", unit: "USD" },
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
  return `https://www.sec.gov/Archives/edgar/data/1035267/${fact.accn.replace(/-/g, "")}/${fact.accn}.txt`;
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
    await fs.mkdir(SEC_DIR, { recursive: true });
    await fs.writeFile(COMPANYFACTS_PATH, JSON.stringify(json, null, 2));
    return json;
  }
}

function extractConceptFacts(companyFacts, concept) {
  const units = companyFacts?.facts?.[concept.taxonomy]?.[concept.tag]?.units?.[concept.unit] ?? [];
  return units
    .filter((fact) => fact.form === "10-Q" || fact.form === "10-K")
    .map((fact) => ({
      metricName: concept.key,
      label: concept.label,
      value: typeof fact.val === "number" ? (concept.unit === "USD" ? fact.val / 1_000_000 : fact.val / (concept.unit === "shares" ? 1_000_000 : 1)) : null,
      rawValue: fact.val ?? null,
      unit: concept.unit === "USD" ? "USDm" : concept.unit === "shares" ? "shares_m" : "USD",
      period: periodFromFact(fact),
      fiscalYear: fact.fy ?? null,
      fiscalPeriod: fact.fp ?? null,
      end: fact.end ?? null,
      sourceUrl: sourceUrlFromFact(fact),
      sourceType: "sec_filing",
      sourceConfidence: fact.frame ? "high" : "medium",
      usedInValuation: false,
      researchOnly: false,
      notes: `${concept.taxonomy}:${concept.tag} from SEC companyfacts. Review duration and frame before promotion into curated actuals.`,
    }));
}

function latestByMetricPeriod(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.metricName}-${row.period}`;
    const existing = byKey.get(key);
    if (!existing || String(row.end ?? "") > String(existing.end ?? "")) byKey.set(key, row);
  }
  return Array.from(byKey.values()).sort((a, b) => `${a.period}-${a.metricName}`.localeCompare(`${b.period}-${b.metricName}`));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractOfficialTextMetrics() {
  const rows = [];
  const files = [
    {
      file: "q1_2026_earnings_release.html",
      period: "Q1 2026",
      sourceUrl:
        "https://www.globenewswire.com/de/news-release/2026/04/21/3278489/7637/en/intuitive-announces-first-quarter-earnings.html",
    },
    {
      file: "q4_2025_earnings_release.html",
      period: "FY 2025",
      sourceUrl: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-fourth-quarter-earnings-5/",
    },
    {
      file: "fy2025_preliminary_metrics.html",
      period: "FY 2025",
      sourceUrl:
        "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-preliminary-fourth-quarter-and-full-year-5",
    },
  ];
  for (const item of files) {
    try {
      const html = await fs.readFile(path.join(OFFICIAL_DIR, item.file), "utf8");
      const text = stripHtml(html);
      const patterns = [
        {
          key: "daVinciProcedureGrowth",
          patterns: [/da Vinci procedures (?:grew|increased) approximately ([0-9.]+)%/i],
          unit: "percent",
        },
        {
          key: "combinedProcedureGrowth",
          patterns: [/worldwide procedures \(da Vinci and Ion combined\) grew approximately ([0-9.]+)%/i, /combined da Vinci and Ion procedures (?:grew|increased) approximately ([0-9.]+)%/i],
          unit: "percent",
        },
        {
          key: "ionProcedureGrowth",
          patterns: [/Ion procedures (?:grew|increased) approximately ([0-9.]+)%/i],
          unit: "percent",
        },
        {
          key: "daVinciInstalledBase",
          patterns: [
            /grew its da Vinci surgical system installed base to ([0-9,]+) systems/i,
            /da Vinci surgical system installed base to ([0-9,]+) systems/i,
            /installed base of da Vinci surgical systems (?:to|of|reached|increased to|grew to)\s*([0-9,]+)/i,
          ],
          unit: "systems",
          plausibleMin: 5000,
          plausibleMax: 20000,
        },
        {
          key: "ionInstalledBase",
          patterns: [
            /grew its Ion endoluminal system installed base to ([0-9,]+) systems/i,
            /Ion endoluminal system installed base to ([0-9,]+) systems/i,
            /installed base of Ion systems (?:to|of|reached|increased to|grew to)\s*([0-9,]+)/i,
          ],
          unit: "systems",
          plausibleMin: 100,
          plausibleMax: 3000,
        },
      ];
      for (const pattern of patterns) {
        const match = pattern.patterns.map((candidate) => text.match(candidate)).find(Boolean);
        const rawValue = match?.[1] ?? null;
        const value = rawValue ? Number(rawValue.replace(/,/g, "")) / (pattern.unit === "percent" ? 100 : 1) : null;
        const plausible =
          value == null ||
          pattern.unit === "percent" ||
          ((pattern.plausibleMin == null || value >= pattern.plausibleMin) &&
            (pattern.plausibleMax == null || value <= pattern.plausibleMax));
        rows.push({
          metricName: pattern.key,
          period: item.period,
          rawValue,
          value: plausible ? value : null,
          unit: pattern.unit,
          sourceType: "earnings_release",
          sourceUrl: item.sourceUrl,
          sourceConfidence: match && plausible ? "medium" : "low",
          usedInValuation: false,
          researchOnly: false,
          sourcePath: path.join("data/local/isrg/official", item.file),
          notes: match
            ? plausible
              ? "Regex extraction from official earnings release; review before promotion."
              : `Rejected implausible installed-base candidate ${rawValue}; likely wrong field mapping or accumulated/corrupted extraction.`
            : "Pattern not found.",
        });
      }
    } catch {
      // Missing official files are allowed; run isrg_fetch_official_data first.
    }
  }
  return rows;
}

async function fetchYfinanceSnapshot() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/ISRG?range=5d&interval=1d";
  try {
    const response = await fetch(url, { headers: { "User-Agent": "fundamental-analysis-isrg-module" } });
    if (!response.ok) throw new Error(`Yahoo chart returned ${response.status}`);
    const json = await response.json();
    await fs.mkdir(MARKET_DIR, { recursive: true });
    await fs.writeFile(path.join(MARKET_DIR, "isrg_chart_snapshot.json"), JSON.stringify(json, null, 2));
    const result = json.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result?.timestamp ?? [];
    const lastIndex = closes.map((value, index) => ({ value, index })).filter((item) => Number.isFinite(item.value)).at(-1);
    return lastIndex
      ? {
          ticker: "ISRG",
          currentPrice: lastIndex.value,
          priceDate: new Date(timestamps[lastIndex.index] * 1000).toISOString().slice(0, 10),
          sourceUrl: url,
          sourceType: "yfinance",
          sourceConfidence: "medium",
          usedInValuation: true,
          researchOnly: false,
          notes: "Unofficial Yahoo Finance chart endpoint snapshot. Use for market cross-check only.",
        }
      : null;
  } catch (error) {
    return {
      ticker: "ISRG",
      currentPrice: null,
      priceDate: null,
      sourceUrl: url,
      sourceType: "yfinance",
      sourceConfidence: "low",
      usedInValuation: false,
      researchOnly: false,
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

await fs.mkdir(EXTRACTED_DIR, { recursive: true });
await fs.mkdir(MARKET_DIR, { recursive: true });
const companyFacts = await loadCompanyFacts();
const secMetrics = latestByMetricPeriod(concepts.flatMap((concept) => extractConceptFacts(companyFacts, concept)));
const officialTextMetrics = await extractOfficialTextMetrics();
const yfinance = await fetchYfinanceSnapshot();

const metricDatabase = {
  ticker: "ISRG",
  builtAt: new Date().toISOString(),
  rules: [
    "Every extracted row must carry sourceUrl/sourcePath, sourceType, period, rawValue, normalized value, confidence, usedInValuation, and researchOnly flags.",
    "SEC companyfacts can include YTD values; review frames before promotion.",
    "Official HTML regex extraction is a candidate layer until reviewed against original release text.",
    "Yfinance is market data only and must not overwrite official fundamental actuals.",
  ],
  secMetrics,
  officialTextMetrics,
  yfinance,
};

await fs.writeFile(path.join(EXTRACTED_DIR, "metric_database.json"), JSON.stringify(metricDatabase, null, 2));
console.log(`ISRG metric database built: ${secMetrics.length} SEC metric rows, ${officialTextMetrics.length} official text candidate rows.`);
if (yfinance?.currentPrice) console.log(`Yfinance snapshot: ISRG ${yfinance.currentPrice} on ${yfinance.priceDate}.`);
else console.log("Yfinance snapshot unavailable.");
