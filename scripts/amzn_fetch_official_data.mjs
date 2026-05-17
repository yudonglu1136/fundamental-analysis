#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const CIK = "0001018724";
const SEC_DIR = path.resolve("data/local/amzn/sec");
const MARKET_DIR = path.resolve("data/local/amzn/market");
const attemptedAt = new Date().toISOString();

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "fundamental-analysis-amzn-backend/1.0 yudonglu@example.com",
      accept: "application/json,text/plain,*/*",
      ...headers,
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(url, headers = {}) {
  try {
    return { ok: true, data: await fetchJson(url, headers) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

const companyfactsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`;
const submissionsUrl = `https://data.sec.gov/submissions/CIK${CIK}.json`;
const companyfacts = await fetchJson(companyfactsUrl);
const submissions = await fetchJson(submissionsUrl);
await writeJson(path.join(SEC_DIR, `companyfacts_CIK${CIK}.json`), companyfacts);
await writeJson(path.join(SEC_DIR, `submissions_CIK${CIK}.json`), submissions);

const period1 = Math.floor(Date.parse("2018-01-01T00:00:00.000Z") / 1000);
const period2 = Math.floor(Date.parse("2026-05-13T00:00:00.000Z") / 1000);
const marketResults = [];
for (const ticker of ["AMZN", "SPY"]) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true`;
  const result = await fetchOptionalJson(url, { "user-agent": "Mozilla/5.0 fundamental-analysis-amzn-backend/1.0" });
  marketResults.push({ ticker, url, ok: result.ok, error: result.error ?? null });
  if (result.ok) {
    await writeJson(path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`), result.data);
  }
}

const metadata = {
  ticker: "AMZN",
  cik: CIK,
  attemptedAt,
  officialSources: [
    { name: "SEC Companyfacts", url: companyfactsUrl, path: path.join(SEC_DIR, `companyfacts_CIK${CIK}.json`), ok: true },
    { name: "SEC Submissions", url: submissionsUrl, path: path.join(SEC_DIR, `submissions_CIK${CIK}.json`), ok: true },
  ],
  marketSources: marketResults,
  sourceLayering: ["official_actual", "market_data"],
  notes: [
    "SEC Companyfacts is used for consolidated quarterly actuals.",
    "Yahoo chart cache is used for daily adjusted prices when available; importDailyPrices falls back to Stooq or research-only proxy rows with warnings.",
  ],
};
await writeJson(path.join(SEC_DIR, "fetch_metadata.json"), metadata);
console.log(JSON.stringify(metadata, null, 2));
