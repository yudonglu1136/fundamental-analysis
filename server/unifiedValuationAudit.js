import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const CACHE_PATH = process.env.VALUATION_CONSENSUS_CACHE || path.join(process.cwd(), "server/cache/valuation-consensus/google-finance.json");
const CONSENSUS_REFRESH = process.env.VALUATION_CONSENSUS_REFRESH === "1" || process.argv.includes("--refresh-consensus");
const CONSENSUS_DISABLED = process.env.VALUATION_CONSENSUS_DISABLE === "1" || process.argv.includes("--no-consensus");
const USER_AGENT = process.env.VALUATION_CONSENSUS_USER_AGENT || "Mozilla/5.0 thesisforge valuation sanity check";
const GOOGLE_FINANCE_URL = "https://www.google.com/finance/quote/{symbol}:{exchange}";

const GOOGLE_FINANCE_LISTINGS = {
  AAPL: ["AAPL", "NASDAQ"],
  AMZN: ["AMZN", "NASDAQ"],
  ANET: ["ANET", "NYSE"],
  ASML: ["ASML", "NASDAQ"],
  AUTL: ["AUTL", "NASDAQ"],
  AVAV: ["AVAV", "NASDAQ"],
  AZN: ["AZN", "NASDAQ"],
  BAC: ["BAC", "NYSE"],
  "BA.L": ["BA", "LON"],
  BE: ["BE", "NYSE"],
  BMY: ["BMY", "NYSE"],
  CB: ["CB", "NYSE"],
  CEG: ["CEG", "NASDAQ"],
  COST: ["COST", "NASDAQ"],
  "DGE.L": ["DGE", "LON"],
  DDOG: ["DDOG", "NASDAQ"],
  EQT: ["EQT", "NYSE"],
  GILD: ["GILD", "NASDAQ"],
  GOOGL: ["GOOGL", "NASDAQ"],
  ISRG: ["ISRG", "NASDAQ"],
  JPM: ["JPM", "NYSE"],
  KTOS: ["KTOS", "NASDAQ"],
  LEGN: ["LEGN", "NASDAQ"],
  LLY: ["LLY", "NYSE"],
  LMT: ["LMT", "NYSE"],
  LSEG: ["LSEG", "LON"],
  MA: ["MA", "NYSE"],
  MCK: ["MCK", "NYSE"],
  META: ["META", "NASDAQ"],
  MRVL: ["MRVL", "NASDAQ"],
  MSFT: ["MSFT", "NASDAQ"],
  MU: ["MU", "NASDAQ"],
  NOC: ["NOC", "NYSE"],
  NOW: ["NOW", "NYSE"],
  NVDA: ["NVDA", "NASDAQ"],
  PLTR: ["PLTR", "NASDAQ"],
  QCOM: ["QCOM", "NASDAQ"],
  RTX: ["RTX", "NYSE"],
  TEM: ["TEM", "NASDAQ"],
  TRI: ["TRI", "NYSE"],
  TRV: ["TRV", "NYSE"],
  TSLA: ["TSLA", "NASDAQ"],
  TSM: ["TSM", "NYSE"],
  UNH: ["UNH", "NYSE"],
  V: ["V", "NYSE"]
};

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const clean = values.map(finiteNumber).filter((value) => value != null).sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function standardDeviation(values) {
  const clean = values.map(finiteNumber).filter((value) => value != null);
  if (clean.length < 2) return null;
  const avg = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function safeRatio(numerator, denominator) {
  const n = finiteNumber(numerator);
  const d = finiteNumber(denominator);
  if (n == null || d == null || d === 0) return null;
  return n / d;
}

function htmlToTokens(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/\s+/g, " ")
    .replace(/\|+/g, "|")
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseMoney(token) {
  const match = String(token || "").replace(/,/g, "").match(/([$£])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return {
    currency: match[1] === "£" ? "GBP" : "USD",
    value: Number(match[2])
  };
}

function parsePercent(token) {
  const match = String(token || "").replace(/,/g, "").match(/([+-]?\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) / 100 : null;
}

function parseGoogleFinanceForecast(html, url) {
  const marker = "12 month forecast";
  const start = String(html || "").indexOf(marker);
  if (start < 0) return null;
  const block = String(html).slice(start, start + 9000);
  const tokens = htmlToTokens(block);
  const analystText = tokens.find((token) => /Based on \d+ Wall Street analysts/i.test(token));
  const analystCount = analystText?.match(/Based on\s+(\d+)\s+Wall Street analysts/i)?.[1];
  const readMoneyAfter = (label) => {
    const index = tokens.findIndex((token) => token.toLowerCase() === label.toLowerCase());
    if (index < 0) return null;
    for (const token of tokens.slice(index + 1, index + 8)) {
      const parsed = parseMoney(token);
      if (parsed) return parsed;
    }
    return null;
  };
  const current = readMoneyAfter("Current");
  const high = readMoneyAfter("Highest");
  const average = readMoneyAfter("Average");
  const low = readMoneyAfter("Lowest");
  if (!average?.value) return null;
  const averageIndex = tokens.findIndex((token) => token.toLowerCase() === "average");
  const upsideText = averageIndex >= 0 ? tokens.slice(averageIndex + 1, averageIndex + 8).find((token) => /%/.test(token)) : null;
  return {
    source: "Google Finance analyst forecast",
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    analystCount: analystCount ? Number(analystCount) : null,
    currency: average.currency,
    currentPrice: current?.value ?? null,
    averageTarget: average.value,
    highTarget: high?.value ?? null,
    lowTarget: low?.value ?? null,
    impliedUpside: parsePercent(upsideText)
  };
}

function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return parseJson(fs.readFileSync(CACHE_PATH, "utf8"), {});
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function fetchConsensus(ticker, cache) {
  if (CONSENSUS_DISABLED) return null;
  const cached = cache[ticker];
  if (cached && !CONSENSUS_REFRESH) return cached;
  const listing = GOOGLE_FINANCE_LISTINGS[ticker];
  if (!listing) return cached || null;
  const [symbol, exchange] = listing;
  const url = GOOGLE_FINANCE_URL
    .replace("{symbol}", encodeURIComponent(symbol))
    .replace("{exchange}", encodeURIComponent(exchange));
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const parsed = parseGoogleFinanceForecast(html, url);
    if (!parsed) {
      cache[ticker] = {
        source: "Google Finance analyst forecast",
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        unavailableReason: "No 12-month forecast block found"
      };
      return cache[ticker];
    }
    cache[ticker] = parsed;
    return parsed;
  } catch (error) {
    cache[ticker] = {
      ...(cached || {}),
      source: "Google Finance analyst forecast",
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      unavailableReason: error.message
    };
    return cache[ticker];
  }
}

function valuationChangeStats(history) {
  const rows = [...history]
    .filter((row) => row.asOfDate && finiteNumber(row.fairValue) != null)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const changes = [];
  const ratios = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = finiteNumber(rows[index - 1].fairValue);
    const current = finiteNumber(rows[index].fairValue);
    if (previous > 0 && current > 0) changes.push(current / previous - 1);
  }
  for (const row of rows) {
    const ratio = safeRatio(row.fairValue, row.priceAtDate ?? row.currentPrice);
    if (ratio != null && Number.isFinite(ratio)) ratios.push(ratio);
  }
  return {
    rows: rows.length,
    uniqueFairValues: new Set(rows.map((row) => Number(row.fairValue).toFixed(4))).size,
    maxAbsFairValueStep: changes.length ? Math.max(...changes.map((value) => Math.abs(value))) : null,
    medianAbsFairValueStep: changes.length ? median(changes.map((value) => Math.abs(value))) : null,
    fairToPriceStdDev: standardDeviation(ratios),
    fairToPriceMedian: median(ratios)
  };
}

function consensusStatus({ latestFairValue, latestPrice, consensus }) {
  if (!consensus?.averageTarget) return {
    status: "no_external_consensus",
    fairToConsensus: null,
    priceToConsensus: null,
    message: consensus?.unavailableReason || "No external 12-month target available."
  };
  const fairToConsensus = safeRatio(latestFairValue, consensus.averageTarget);
  const priceToConsensus = safeRatio(latestPrice, consensus.averageTarget);
  const low = finiteNumber(consensus.lowTarget);
  const high = finiteNumber(consensus.highTarget);
  const insideRange = latestFairValue != null && low != null && high != null && latestFairValue >= low && latestFairValue <= high;
  if (fairToConsensus != null && (fairToConsensus < 0.55 || fairToConsensus > 1.65)) {
    return {
      status: "divergent",
      fairToConsensus,
      priceToConsensus,
      insideRange,
      message: "Base fair value is materially outside current Wall Street 12-month target guardrails."
    };
  }
  if (insideRange || (fairToConsensus != null && fairToConsensus >= 0.7 && fairToConsensus <= 1.35)) {
    return {
      status: "aligned",
      fairToConsensus,
      priceToConsensus,
      insideRange,
      message: "Base fair value is broadly near external 12-month consensus guardrails."
    };
  }
  return {
    status: "watch",
    fairToConsensus,
    priceToConsensus,
    insideRange,
    message: "Base fair value is outside the soft consensus band but not an automatic failure."
  };
}

const HIGH_VARIANCE_PROFILES = new Set([
  "defense_growth",
  "emerging_biotech",
  "emerging_health_ai",
  "energy_e_and_p",
  "energy_technology",
  "ev_autonomy_platform",
  "hypergrowth_ai_software",
  "semiconductor_cyclical",
  "semiconductor_growth",
  "software_growth"
]);

function latestModelProfile(history) {
  return history
    .filter((row) => row?.dataSnapshot?.valuationSemantics?.scoreInputs?.profile)
    .at(-1)?.dataSnapshot?.valuationSemantics?.scoreInputs?.profile || null;
}

function inputEvidenceRows(inputAudit) {
  return finiteNumber(inputAudit?.financialOrGuidanceEvidenceRows) ??
    finiteNumber(inputAudit?.valuationRows) ??
    0;
}

function hasVerifiedFinancialInputs(inputAudit, history) {
  if ((inputAudit?.methodPriceAnchorSignalCount || 0) > 0) return false;
  if (inputAudit?.status === "fail") return false;
  if (inputAudit?.status === "pass") return true;
  return inputEvidenceRows(inputAudit) > 0 && history.length > 0;
}

function hasCoverageForHardModelRead(snapshot, history, inputAudit) {
  if (history.length >= 8) return true;
  if (inputEvidenceRows(inputAudit) >= 4) return true;
  if (finiteNumber(snapshot.dataQuality?.legacyBackendValuationRows) >= 8) return true;
  return history.length === 1 && hasVerifiedFinancialInputs(inputAudit, history);
}

function unifiedAuditForTicker(snapshot, consensus) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const latestFairValue = finiteNumber(snapshot.latest?.baseFairValue);
  const latestPrice = finiteNumber(snapshot.latest?.latestPrice);
  const inputAudit = snapshot.dataQuality?.modelInputAudit || {};
  const stability = valuationChangeStats(history);
  const external = consensusStatus({ latestFairValue, latestPrice, consensus });
  const warnings = [];
  const watchNotes = [];
  const coverageNotes = [];
  const profile = latestModelProfile(history);
  const verifiedInputs = hasVerifiedFinancialInputs(inputAudit, history);
  const adequateCoverage = hasCoverageForHardModelRead(snapshot, history, inputAudit);
  const highVarianceProfile = HIGH_VARIANCE_PROFILES.has(profile);
  let status = "pass";

  const mark = (nextStatus, message) => {
    warnings.push(message);
    if (nextStatus === "fail" || status !== "fail" && nextStatus === "review") status = nextStatus;
  };

  const note = (message) => {
    if (message) watchNotes.push(message);
  };

  const coverageNote = (message) => {
    if (message) coverageNotes.push(message);
  };

  if (!history.length || latestFairValue == null) mark("fail", "Missing usable valuation history or latest fair value.");
  if (inputAudit.status === "fail" || (inputAudit.methodPriceAnchorSignalCount || 0) > 0) mark("fail", "Input audit detected price-anchor risk.");
  if (inputAudit.status === "review" && !verifiedInputs) mark("review", "Model input audit lacks verified financial/guidance evidence.");
  if (!adequateCoverage) coverageNote("Limited valuation history; read the latest fair value as a point-in-time model, not a full quarterly history.");
  if (history.length > 1 && stability.uniqueFairValues <= 2 && !verifiedInputs) mark("review", "Fair-value history has too few distinct observations.");
  if (stability.maxAbsFairValueStep != null && stability.maxAbsFairValueStep > 0.85) {
    const message = "Fair-value series has a very large step change; check split basis, share count, or one-off financials.";
    if (!verifiedInputs || (!highVarianceProfile && stability.medianAbsFairValueStep != null && stability.medianAbsFairValueStep > 0.35)) {
      mark("review", message);
    } else {
      note(message);
    }
  }
  if (stability.fairToPriceStdDev != null && stability.fairToPriceStdDev > 0.75) {
    const message = "Fair/price ratio is unusually unstable through time.";
    if (!verifiedInputs && !highVarianceProfile) mark("review", message);
    else note(message);
  }
  const fairToPrice = safeRatio(latestFairValue, latestPrice);
  if (fairToPrice != null && (fairToPrice < 0.2 || fairToPrice > 3)) {
    const message = "Latest fair value / price is extreme; this is a valuation conclusion unless input coverage or price-anchor audit also fails.";
    if (!verifiedInputs) mark("review", message);
    else note(message);
  }
  if (external.status === "divergent" || external.status === "watch" || external.status === "no_external_consensus") {
    note(external.message);
  }

  return {
    status,
    generatedAt: new Date().toISOString(),
    framework: "Unified valuation sanity loop v2",
    policy: "Fair value remains generated from company financials/guidance/scenario assumptions. Market price and external analyst consensus are comparison guardrails only; they are not model inputs and do not create data-quality failures by themselves.",
    latestFairToPrice: fairToPrice,
    profile,
    verifiedInputs,
    adequateCoverage,
    stability,
    externalConsensus: consensus || null,
    externalConsensusCheck: external,
    warnings,
    watchNotes,
    coverageNotes
  };
}

function compactTicker(snapshot) {
  const { priceHistory, ...compact } = snapshot;
  return {
    ...compact,
    history: (snapshot.history || []).slice(-12),
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      fullHistoryRowsAvailable: snapshot.history?.length || 0
    }
  };
}

async function main() {
  const db = new DatabaseSync(DB_PATH);
  const cache = readCache();
  try {
    const rows = db.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots ORDER BY ticker").all();
    const updated = [];
    for (const row of rows) {
      const snapshot = parseJson(row.payload_json, {});
      const consensus = await fetchConsensus(row.ticker, cache);
      const unified = unifiedAuditForTicker(snapshot, consensus);
      const next = {
        ...snapshot,
        generatedAt: new Date().toISOString(),
        dataQuality: {
          ...(snapshot.dataQuality || {}),
          unifiedValuationAudit: unified
        }
      };
      db.prepare(`
        INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          generated_at = excluded.generated_at,
          payload_json = excluded.payload_json
      `).run(row.ticker, next.generatedAt, JSON.stringify(next));
      updated.push(next);
      if (!CONSENSUS_DISABLED && CONSENSUS_REFRESH) {
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }

    const dashboard = parseJson(db.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest")?.payload_json, {});
    const tickers = updated.map(compactTicker).sort((left, right) => {
      const leftUpside = Number(left.latest?.upsideToBase);
      const rightUpside = Number(right.latest?.upsideToBase);
      if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
      return String(left.ticker || "").localeCompare(String(right.ticker || ""));
    });
    const summary = {
      ...(dashboard.summary || {}),
      unifiedValuationAuditPassCount: updated.filter((ticker) => ticker.dataQuality?.unifiedValuationAudit?.status === "pass").length,
      unifiedValuationAuditReviewCount: updated.filter((ticker) => ticker.dataQuality?.unifiedValuationAudit?.status === "review").length,
      unifiedValuationAuditFailCount: updated.filter((ticker) => ticker.dataQuality?.unifiedValuationAudit?.status === "fail").length,
      externalConsensusTickerCount: updated.filter((ticker) => ticker.dataQuality?.unifiedValuationAudit?.externalConsensus?.averageTarget).length,
      externalConsensusDivergentCount: updated.filter((ticker) => ticker.dataQuality?.unifiedValuationAudit?.externalConsensusCheck?.status === "divergent").length
    };
    const updatedDashboard = {
      ...dashboard,
      generatedAt: new Date().toISOString(),
      tickers,
      summary,
      source: {
        ...(dashboard.source || {}),
        unifiedValuationAudit: "Unified valuation sanity loop compares model output with input coverage, stability, price-anchor audit, and cached external analyst consensus guardrails."
      }
    };
    db.prepare(`
      INSERT INTO valuation_snapshots (id, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
    `).run("latest", updatedDashboard.generatedAt, JSON.stringify(updatedDashboard));

    writeCache(cache);
    const report = {
      dbPath: DB_PATH,
      cachePath: CACHE_PATH,
      summary,
      issues: updated
        .map((ticker) => ({
          ticker: ticker.ticker,
          status: ticker.dataQuality?.unifiedValuationAudit?.status,
          latestFairToPrice: ticker.dataQuality?.unifiedValuationAudit?.latestFairToPrice,
          fairToConsensus: ticker.dataQuality?.unifiedValuationAudit?.externalConsensusCheck?.fairToConsensus,
          consensusStatus: ticker.dataQuality?.unifiedValuationAudit?.externalConsensusCheck?.status,
          rows: ticker.history?.length || 0,
          warnings: ticker.dataQuality?.unifiedValuationAudit?.warnings || []
        }))
        .filter((item) => item.status !== "pass")
        .sort((left, right) => {
          if (left.status === "fail" && right.status !== "fail") return -1;
          if (right.status === "fail" && left.status !== "fail") return 1;
          return Math.abs((left.fairToConsensus || 1) - 1) - Math.abs((right.fairToConsensus || 1) - 1);
        })
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
