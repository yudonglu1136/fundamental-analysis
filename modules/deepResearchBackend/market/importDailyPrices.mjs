import { spawnSync } from "node:child_process";
import { buildProxyDailyPriceBars } from "../ingestion/importLocalData.mjs";
import { getDeepResearchBackendProfile } from "../config.mjs";

const importPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    for ticker in payload["tickersToReplace"]:
        conn.execute("DELETE FROM daily_price_bars WHERE ticker = ?", [ticker])
    def insert(row):
        keys = list(row.keys())
        placeholders = ",".join(["?"] * len(keys))
        sql = f"INSERT INTO daily_price_bars ({','.join(keys)}) VALUES ({placeholders})"
        conn.execute(sql, [row.get(key) for key in keys])
    for row in payload["rows"]:
        insert(row)
    conn.commit()
    counts = {ticker: conn.execute("SELECT COUNT(*) FROM daily_price_bars WHERE ticker = ?", [ticker]).fetchone()[0] for ticker in payload["tickersToReplace"]}
    print(json.dumps({"dbPath": payload["dbPath"], "counts": counts, "source": payload["source"]}, indent=2))
finally:
    conn.close()
`;

function toUnix(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

function yahooChartUrl(ticker, startDate, endDate) {
  const period1 = toUnix(startDate);
  const period2 = toUnix(endDate) + 86400;
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`;
}

async function fetchYahooBars(ticker, { startDate, endDate }) {
  const response = await fetch(yahooChartUrl(ticker, startDate, endDate), {
    headers: { "user-agent": "fundamental-analysis-backend/1.0" },
  });
  if (!response.ok) throw new Error(`Yahoo chart returned ${response.status} for ${ticker}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`Yahoo chart returned no timestamps for ${ticker}`);
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const dividendsByDate = new Map((result.events?.dividends ? Object.values(result.events.dividends) : []).map((event) => [new Date(event.date * 1000).toISOString().slice(0, 10), event.amount ?? 0]));
  const splitsByDate = new Map((result.events?.splits ? Object.values(result.events.splits) : []).map((event) => [new Date(event.date * 1000).toISOString().slice(0, 10), event.splitRatio ?? `${event.numerator ?? 1}:${event.denominator ?? 1}`]));
  const fetchedAt = new Date().toISOString();
  return result.timestamp.map((timestamp, index) => {
    const priceDate = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const close = quote.close?.[index] ?? null;
    const adjustedClose = adjclose[index] ?? close;
    return {
      id: `${String(ticker).toLowerCase()}-yahoo-${priceDate}`,
      ticker,
      priceDate,
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close,
      adjustedClose,
      volume: quote.volume?.[index] ?? null,
      dividendAmount: dividendsByDate.get(priceDate) ?? 0,
      splitCoefficient: splitsByDate.get(priceDate) ?? 1,
      source: "Yahoo Finance chart API",
      sourceType: adjustedClose === close ? "market_data_close_fallback" : "market_data_yahoo_adjusted",
      fetchedAt,
      rawJson: JSON.stringify({ chartTicker: ticker }),
    };
  }).filter((row) => Number.isFinite(Number(row.adjustedClose)));
}

function writeRows(profile, rows, tickersToReplace, source) {
  const result = spawnSync("python3", ["-c", importPython], {
    input: JSON.stringify({
      dbPath: profile.dbPath,
      tickersToReplace,
      rows,
      source,
    }),
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

export async function importDeepResearchDailyPrices(slugOrTicker, {
  startDate,
  endDate,
  benchmarkTicker = "SPY",
  allowProxyFallback = true,
} = {}) {
  const profile = getDeepResearchBackendProfile(slugOrTicker);
  if (!profile) throw new Error(`Unknown deep research backend ticker: ${slugOrTicker}`);
  const effectiveStartDate = startDate ?? profile.historyStartDate;
  const effectiveEndDate = endDate ?? profile.latestDate;
  const tickersToReplace = [profile.ticker, benchmarkTicker];
  try {
    const [stockRows, benchmarkRows] = await Promise.all([
      fetchYahooBars(profile.ticker, { startDate: effectiveStartDate, endDate: effectiveEndDate }),
      fetchYahooBars(benchmarkTicker, { startDate: effectiveStartDate, endDate: effectiveEndDate }),
    ]);
    return writeRows(profile, [...stockRows, ...benchmarkRows], tickersToReplace, "Yahoo Finance chart API");
  } catch (error) {
    if (!allowProxyFallback) throw error;
    const rows = buildProxyDailyPriceBars(profile, { startDate: effectiveStartDate, endDate: effectiveEndDate, benchmarkTicker });
    const result = writeRows(profile, rows, tickersToReplace, "generated_proxy_price_curve");
    return {
      ...result,
      warning: `Yahoo daily price import failed; generated proxy bars were inserted instead. Reason: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
