import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const officialDir = path.join(root, "data/local/azn/official/raw");
const marketRawDir = path.join(root, "data/local/azn/yfinance/raw");
const marketCuratedDir = path.join(root, "data/local/azn/yfinance/curated");

const officialSources = [
  {
    fileName: "Q1-2026-results-announcement.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/PDF/2026/eq1/Q1-2026-results-announcement.pdf",
    sourceName: "AstraZeneca Q1 2026 results announcement",
    sourceQuality: "official",
  },
  {
    fileName: "Q1-2026-results-clinical-trials-appendix.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/PDF/2026/eq1/Q1-2026-results-clinical-trials-appendix.pdf",
    sourceName: "AstraZeneca Q1 2026 clinical trials appendix",
    sourceQuality: "official",
  },
  {
    fileName: "AstraZeneca_Development_Pipeline_2025.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/Investor_Relations/annual-report-2025/pdf/AstraZeneca_Development_Pipeline_2025.pdf",
    sourceName: "AstraZeneca 2025 development pipeline supplement",
    sourceQuality: "official",
  },
  {
    fileName: "AstraZeneca_Patent_Expiries_of_Key_Marketed_Products_2025.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/Investor_Relations/annual-report-2025/pdf/AstraZeneca_Patent_Expiries_of_Key_Marketed_Products_2025.pdf",
    sourceName: "AstraZeneca 2025 patent expiries supplement",
    sourceQuality: "official",
  },
  {
    fileName: "AstraZeneca_Risk_Supplement_2025.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/Investor_Relations/annual-report-2025/pdf/AstraZeneca_Risk_Supplement_2025.pdf",
    sourceName: "AstraZeneca 2025 risk supplement",
    sourceQuality: "official",
  },
  {
    fileName: "Full-year-Q4-2025-results-announcement.pdf",
    url: "https://www.astrazeneca.com/content/dam/az/PDF/2025/Q4-FY/Full-year-Q4-2025-results-announcement.pdf",
    sourceName: "AstraZeneca FY 2025 results announcement",
    sourceQuality: "official",
  },
];

const marketSources = [
  {
    fileName: "AZN.L-stooq.csv",
    url: "https://stooq.com/q/l/?s=azn.uk&i=d",
    label: "AZN.L London ordinary share, Stooq fallback for public market snapshot",
  },
  {
    fileName: "AZN-US-stooq.csv",
    url: "https://stooq.com/q/l/?s=azn.us&i=d",
    label: "AZN US ordinary share, Stooq fallback for public market snapshot",
  },
  {
    fileName: "GBPUSD-stooq.csv",
    url: "https://stooq.com/q/l/?s=gbpusd&i=d",
    label: "GBP/USD FX, Stooq fallback for public market snapshot",
  },
];

async function ensureDirs() {
  await Promise.all([officialDir, marketRawDir, marketCuratedDir].map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function downloadBinary(source, dir) {
  const response = await fetch(source.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${source.url} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const filePath = path.join(dir, source.fileName);
  await fs.writeFile(filePath, bytes);
  return { ...source, filePath, bytes: bytes.length, fetchedAt: new Date().toISOString() };
}

function parseStooqCsv(raw) {
  const [headerLine, valueLine] = raw.trim().split(/\r?\n/);
  if (!headerLine || !valueLine) return null;
  const headers = headerLine.split(",");
  const values = valueLine.split(",");
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  return {
    symbol: row.Symbol,
    date: row.Date,
    time: row.Time,
    open: Number(row.Open),
    high: Number(row.High),
    low: Number(row.Low),
    close: Number(row.Close),
    volume: Number(row.Volume || 0),
  };
}

async function downloadMarketSource(source) {
  const result = await downloadBinary(source, marketRawDir);
  const raw = await fs.readFile(result.filePath, "utf8");
  return { ...result, parsed: parseStooqCsv(raw) };
}

await ensureDirs();

const officialManifest = [];
for (const source of officialSources) {
  try {
    officialManifest.push(await downloadBinary(source, officialDir));
  } catch (error) {
    officialManifest.push({ ...source, error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() });
  }
}

const marketManifest = [];
for (const source of marketSources) {
  try {
    marketManifest.push(await downloadMarketSource(source));
  } catch (error) {
    marketManifest.push({ ...source, error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() });
  }
}

const london = marketManifest.find((item) => item.fileName === "AZN.L-stooq.csv")?.parsed;
const us = marketManifest.find((item) => item.fileName === "AZN-US-stooq.csv")?.parsed;
const fx = marketManifest.find((item) => item.fileName === "GBPUSD-stooq.csv")?.parsed;
const marketSnapshot = {
  fetchedAt: new Date().toISOString(),
  sourceQuality: "market_data",
  note: "Stooq CSV is used as the public fallback when Yahoo/yfinance is rate-limited. London AZN close is GBX and must be divided by 100 for GBP valuation.",
  londonPriceGbx: london?.close ?? null,
  londonPriceGbp: london?.close ? london.close / 100 : null,
  nyseOrdinaryPriceUsd: us?.close ?? null,
  gbpUsd: fx?.close ?? null,
  rawSources: marketManifest,
};

await fs.writeFile(path.join(officialDir, "source_manifest.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), officialSources: officialManifest }, null, 2));
await fs.writeFile(path.join(marketCuratedDir, "market_snapshot.json"), JSON.stringify(marketSnapshot, null, 2));

console.log(`AZN official sources processed: ${officialManifest.length}`);
console.log(`AZN market sources processed: ${marketManifest.length}`);
console.log(`Market snapshot written to ${path.join(marketCuratedDir, "market_snapshot.json")}`);
