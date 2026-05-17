#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SEC_DIR = path.resolve("data/local/aapl/sec");
const FILING_DIR = path.join(SEC_DIR, "filings");
const MARKET_DIR = path.resolve("data/local/aapl/market");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis research-contact@example.com";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function filingRows(submissions) {
  const recent = submissions.filings?.recent;
  if (!recent) return [];
  return recent.accessionNumber
    .map((accession, index) => ({
      accession,
      compactAccession: accession.replace(/-/g, ""),
      form: recent.form[index],
      filingDate: recent.filingDate[index],
      reportDate: recent.reportDate[index],
      primaryDocument: recent.primaryDocument[index],
    }))
    .filter((row) => ["10-Q", "10-K"].includes(row.form))
    .filter((row) => row.filingDate >= "2018-01-01")
    .sort((left, right) => left.filingDate.localeCompare(right.filingDate));
}

function yahooChartUrl(ticker) {
  const period1 = Math.floor(Date.parse("2018-01-01T00:00:00Z") / 1000);
  const period2 = Math.floor(Date.parse("2026-05-13T00:00:00Z") / 1000);
  return `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history%7Cdiv%7Csplit&includeAdjustedClose=true`;
}

async function main() {
  ensureDir(SEC_DIR);
  ensureDir(FILING_DIR);
  ensureDir(MARKET_DIR);

  const secHeaders = { "User-Agent": SEC_USER_AGENT, Accept: "application/json,text/html" };
  const companyfactsUrl = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json";
  const submissionsUrl = "https://data.sec.gov/submissions/CIK0000320193.json";

  const companyfacts = await fetchJson(companyfactsUrl, secHeaders);
  writeJson(path.join(SEC_DIR, "companyfacts_CIK0000320193.json"), companyfacts);
  await sleep(150);

  const submissions = await fetchJson(submissionsUrl, secHeaders);
  writeJson(path.join(SEC_DIR, "submissions_CIK0000320193.json"), submissions);

  const filings = filingRows(submissions);
  const fetchedFilings = [];
  for (const filing of filings) {
    const url = `https://www.sec.gov/Archives/edgar/data/320193/${filing.compactAccession}/${filing.primaryDocument}`;
    const filePath = path.join(FILING_DIR, filing.compactAccession, filing.primaryDocument);
    ensureDir(path.dirname(filePath));
    const html = await fetchText(url, secHeaders);
    fs.writeFileSync(filePath, html);
    fetchedFilings.push({ ...filing, filePath, url });
    await sleep(150);
  }

  const market = [];
  for (const ticker of ["AAPL", "SPY"]) {
    const chart = await fetchJson(yahooChartUrl(ticker));
    const filePath = path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`);
    writeJson(filePath, chart);
    market.push({
      ticker,
      filePath,
      rows: chart.chart?.result?.[0]?.timestamp?.length ?? 0,
      firstTimestamp: chart.chart?.result?.[0]?.timestamp?.[0] ?? null,
      lastTimestamp: chart.chart?.result?.[0]?.timestamp?.at(-1) ?? null,
    });
  }

  console.log(JSON.stringify({
    status: "completed",
    sources: {
      companyfacts: companyfactsUrl,
      submissions: submissionsUrl,
      secUserAgent: SEC_USER_AGENT,
    },
    filings: fetchedFilings.length,
    market,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
