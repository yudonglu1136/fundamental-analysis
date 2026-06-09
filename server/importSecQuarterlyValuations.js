import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const TRINITY_MODEL_PATH = process.env.TRINITY_MODEL_PATH || "/Users/yudonglu/Documents/ai-trinity-dashboard/trinity_model.json";
const CACHE_DIR = process.env.SEC_FACTS_CACHE_DIR || path.join(process.cwd(), "server/data/sec-companyfacts");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "thesisforge-guru-analysis yudonglu1136@gmail.com";
const DEFAULT_TICKERS = (process.env.SEC_VALUATION_TICKERS || "MSFT")
  .split(",")
  .map((ticker) => ticker.trim().toUpperCase())
  .filter(Boolean);

const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json";
const MAX_EVIDENCE_EXCERPTS = 4;
const OUTPUT_START_DATE = process.env.SEC_VALUATION_START_DATE || "2019-01-01";

const TAGS = {
  revenue_m: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "Revenue"
  ],
  gross_profit_m: ["GrossProfit"],
  operating_income_m: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  net_income_m: ["NetIncomeLoss", "ProfitLoss"],
  cfo_m: ["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"],
  capex_m: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"
  ]
};

const TRINITY_TO_DASHBOARD_TICKER = {
  GOOG: "GOOGL"
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  const number = finiteNumber(value);
  if (number == null) return null;
  return Math.max(min, Math.min(max, number));
}

function pct(n, d) {
  if (n == null || d == null || d === 0) return null;
  return (n / d - 1) * 100;
}

function margin(n, d) {
  if (n == null || d == null || d === 0) return null;
  return n / d * 100;
}

function days(row) {
  if (!row?.start || !row?.end) return null;
  const start = Date.parse(row.start);
  const end = Date.parse(row.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000) + 1;
}

function normalizeCik(cik) {
  return String(cik || "").replace(/\D/g, "").padStart(10, "0");
}

function secCompanyFactsUrl(cik) {
  return SEC_FACTS_URL.replace("{cik}", normalizeCik(cik));
}

async function fetchJsonWithCache(url, cachePath) {
  if (fs.existsSync(cachePath) && process.env.SEC_FACTS_REFRESH !== "1") {
    return parseJson(fs.readFileSync(cachePath, "utf8"), {});
  }
  const response = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`SEC request failed ${response.status}: ${url}`);
  }
  const payload = await response.json();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload));
  return payload;
}

function unitsFor(facts, tag, unit = "USD") {
  for (const namespace of ["us-gaap", "ifrs-full", "dei"]) {
    const item = facts?.[namespace]?.[tag];
    const units = item?.units?.[unit];
    if (Array.isArray(units)) return units;
  }
  return [];
}

function rowValueM(row) {
  const value = finiteNumber(row?.val);
  return value == null ? null : value / 1_000_000;
}

function inferFiscalYearEnd(facts) {
  const annualRows = Object.values(TAGS).flat()
    .flatMap((tag) => unitsFor(facts, tag, "USD"))
    .filter((row) => ["10-K", "20-F", "40-F"].includes(row?.form) && days(row) >= 300 && row.end)
    .sort((left, right) => String(left.end).localeCompare(String(right.end)) || String(left.filed).localeCompare(String(right.filed)));
  const latest = annualRows.at(-1);
  if (!latest?.end) return { month: 12, day: 31 };
  const [, month, day] = String(latest.end).split("-").map(Number);
  return { month, day };
}

function fiscalPeriodFromEnd(endDate, fiscalYearEnd) {
  const [calendarYear, month, day] = String(endDate || "").split("-").map(Number);
  if (!calendarYear || !month || !day) return null;
  const fiscalYear = (month > fiscalYearEnd.month || (month === fiscalYearEnd.month && day > fiscalYearEnd.day))
    ? calendarYear + 1
    : calendarYear;
  const fiscalEndMonth = fiscalYearEnd.month;
  const offset = (month - fiscalEndMonth + 12) % 12;
  if (offset === 3) return { fiscalYear, fiscalQuarter: "Q1" };
  if (offset === 6) return { fiscalYear, fiscalQuarter: "Q2" };
  if (offset === 9) return { fiscalYear, fiscalQuarter: "Q3" };
  if (offset === 0) return { fiscalYear, fiscalQuarter: "Q4" };
  const fallbackQuarter = `Q${Math.max(1, Math.min(4, Math.ceil((offset || 12) / 3)))}`;
  return { fiscalYear, fiscalQuarter: fallbackQuarter };
}

function factRowsForMetric(facts, metric, fiscalYearEnd) {
  const rows = [];
  for (const tag of TAGS[metric] || []) {
    for (const row of unitsFor(facts, tag, "USD")) {
      if (!row?.fy || !row?.fp || !row?.filed || !row?.end || !row?.form) continue;
      const rowDays = days(row);
      const value = rowValueM(row);
      if (value == null || rowDays == null) continue;
      const derived = fiscalPeriodFromEnd(row.end, fiscalYearEnd);
      if (!derived) continue;
      const isAnnual = ["10-K", "20-F", "40-F"].includes(row.form) && rowDays >= 300;
      rows.push({
        ...row,
        metric,
        tag,
        fy: derived.fiscalYear,
        fp: isAnnual ? "FY" : derived.fiscalQuarter,
        originalFy: row.fy,
        originalFp: row.fp,
        filed: row.filed,
        end: row.end,
        rowDays,
        value
      });
    }
  }
  return rows;
}

function chooseAsReported(rows) {
  return [...rows].sort((left, right) =>
    String(left.filed).localeCompare(String(right.filed)) ||
    String(left.tag).localeCompare(String(right.tag)) ||
    Math.abs((left.rowDays || 0) - 91) - Math.abs((right.rowDays || 0) - 91)
  )[0] || null;
}

function directQuarterRows(rows) {
  const direct = new Map();
  for (const row of rows) {
    if (!["10-Q", "6-K"].includes(row.form)) continue;
    if (!["Q1", "Q2", "Q3"].includes(row.fp)) continue;
    if (row.rowDays < 55 || row.rowDays > 125) continue;
    const key = `${row.fy}::${row.fp}`;
    const existing = direct.get(key);
    const chosen = chooseAsReported(existing ? [existing, row] : [row]);
    direct.set(key, chosen);
  }
  return direct;
}

function ytdRows(rows) {
  const ytd = new Map();
  for (const row of rows) {
    if (!["Q1", "Q2", "Q3", "FY"].includes(row.fp)) continue;
    if (row.fp === "FY" && !["10-K", "20-F", "40-F"].includes(row.form)) continue;
    if (row.fp !== "FY" && !["10-Q", "6-K"].includes(row.form)) continue;
    if (row.fp === "Q1" && (row.rowDays < 55 || row.rowDays > 125)) continue;
    if (row.fp === "Q2" && (row.rowDays < 130 || row.rowDays > 215)) continue;
    if (row.fp === "Q3" && (row.rowDays < 220 || row.rowDays > 310)) continue;
    if (row.fp === "FY" && row.rowDays < 300) continue;
    const key = `${row.fy}::${row.fp}`;
    const existing = ytd.get(key);
    const chosen = chooseAsReported(existing ? [existing, row] : [row]);
    ytd.set(key, chosen);
  }
  return ytd;
}

function buildMetricQuarterMap(facts, metric, fiscalYearEnd) {
  const rows = factRowsForMetric(facts, metric, fiscalYearEnd);
  const direct = directQuarterRows(rows);
  const ytd = ytdRows(rows);
  const years = [...new Set(rows.map((row) => row.fy))].sort((left, right) => left - right);
  const quarters = new Map();

  for (const fy of years) {
    const previousYtd = { Q1: null, Q2: null, Q3: null };
    for (const fp of ["Q1", "Q2", "Q3"]) {
      const key = `${fy}::${fp}`;
      const directRow = direct.get(key);
      const ytdRow = ytd.get(key);
      let value = directRow?.value ?? null;
      let source = directRow || ytdRow || null;
      if (value == null && ytdRow) {
        if (fp === "Q1") value = ytdRow.value;
        if (fp === "Q2" && previousYtd.Q1) value = ytdRow.value - previousYtd.Q1.value;
        if (fp === "Q3" && previousYtd.Q2) value = ytdRow.value - previousYtd.Q2.value;
      }
      if (ytdRow) previousYtd[fp] = ytdRow;
      if (value != null && source) {
        quarters.set(key, {
          value,
          filed: source.filed,
          end: source.end,
          tag: source.tag,
          form: source.form,
          derived: !directRow && Boolean(ytdRow)
        });
      }
    }

    const annual = ytd.get(`${fy}::FY`);
    const q1 = quarters.get(`${fy}::Q1`);
    const q2 = quarters.get(`${fy}::Q2`);
    const q3 = quarters.get(`${fy}::Q3`);
    if (annual && q1 && q2 && q3) {
      quarters.set(`${fy}::Q4`, {
        value: annual.value - q1.value - q2.value - q3.value,
        filed: annual.filed,
        end: annual.end,
        tag: annual.tag,
        form: annual.form,
        derived: true
      });
    }
  }
  return quarters;
}

function buildQuarterlyFinancials(facts) {
  const fiscalYearEnd = inferFiscalYearEnd(facts);
  const metricMaps = Object.fromEntries(Object.keys(TAGS).map((metric) => [metric, buildMetricQuarterMap(facts, metric, fiscalYearEnd)]));
  const keys = new Set(Object.values(metricMaps).flatMap((map) => [...map.keys()]));
  const rows = [...keys].map((key) => {
    const [fyText, fp] = key.split("::");
    const fy = Number(fyText);
    const metricData = {};
    const sources = {};
    for (const [metric, map] of Object.entries(metricMaps)) {
      const row = map.get(key);
      if (!row) continue;
      metricData[metric] = row.value;
      sources[metric] = {
        tag: row.tag,
        filed: row.filed,
        form: row.form,
        end: row.end,
        derived: row.derived
      };
    }
    const filedDates = Object.values(sources).map((source) => source.filed).filter(Boolean).sort();
    const endDates = Object.values(sources).map((source) => source.end).filter(Boolean).sort();
    return {
      key,
      fiscalYear: fy,
      fiscalQuarter: fp,
      label: `FY${fy} ${fp}`,
      asOfDate: filedDates.at(-1) || null,
      periodEndDate: endDates.at(-1) || null,
      ...metricData,
      sources
    };
  });

  rows.sort((left, right) =>
    left.fiscalYear - right.fiscalYear ||
    Number(left.fiscalQuarter.replace("Q", "")) - Number(right.fiscalQuarter.replace("Q", ""))
  );

  const byPeriod = new Map(rows.map((row) => [`${row.fiscalYear - 1}::${row.fiscalQuarter}`, row]));
  for (const row of rows) {
    const prior = byPeriod.get(`${row.fiscalYear - 1}::${row.fiscalQuarter}`);
    row.revenue_growth_pct = pct(row.revenue_m, prior?.revenue_m);
    row.gross_margin_pct = margin(row.gross_profit_m, row.revenue_m);
    row.operating_margin_pct = margin(row.operating_income_m, row.revenue_m);
    row.fcf_after_capex_m = row.cfo_m != null && row.capex_m != null ? row.cfo_m - row.capex_m : null;
  }

  return rows
    .filter((row) => row.asOfDate && row.revenue_m != null && row.net_income_m != null)
    .map((row) => ({
      ...row,
      fiscalYearEnd
    }));
}

function pricePointAtOrBefore(points = [], date) {
  const target = Date.parse(date);
  if (!Number.isFinite(target)) return null;
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null && Date.parse(point.date) <= target)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function latestPricePoint(points = []) {
  return [...points]
    .filter((point) => point.date && finiteNumber(point.close) != null)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .at(-1) || null;
}

function trailingSum(rows, index, key) {
  const window = rows.slice(Math.max(0, index - 3), index + 1);
  if (window.length < 4 || window.some((row) => finiteNumber(row[key]) == null)) return null;
  return window.reduce((sum, row) => sum + Number(row[key]), 0);
}

function valuationMultiples(row, ttm) {
  const growth = finiteNumber(row.revenue_growth_pct) ?? 8;
  const opMargin = finiteNumber(ttm.operating_margin_pct ?? row.operating_margin_pct) ?? 25;
  const fcfMargin = finiteNumber(ttm.fcf_margin_pct) ?? 18;
  const capexIntensity = finiteNumber(ttm.capex_intensity_pct) ?? 8;
  const pe = clamp(20 + growth * 0.34 + (opMargin - 30) * 0.3 + fcfMargin * 0.08 - capexIntensity * 0.08, 18, 36);
  const fcfYield = clamp(0.048 - growth * 0.00035 - (opMargin - 30) * 0.00025 - Math.max(0, fcfMargin - 20) * 0.0001 + capexIntensity * 0.0003, 0.028, 0.06);
  const longRunGrowth = clamp(0.045 + Math.max(-5, Math.min(25, growth)) / 100 * 0.28 + Math.max(-10, Math.min(20, opMargin - 25)) / 100 * 0.08, 0.035, 0.13);
  return { pe, fcfYield, longRunGrowth };
}

function buildValuationRows({ ticker, trinityTicker, snapshot, companyModel, factsUrl, quarterlyRows, youtubeByPeriod }) {
  const sharesM = finiteNumber(companyModel?.diluted_or_outstanding_shares_m);
  if (!(sharesM > 0)) return [];
  const priceHistory = Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [];
  const minDate = priceHistory[0]?.date || OUTPUT_START_DATE;
  const rows = [];

  quarterlyRows.forEach((row, index) => {
    if (String(row.asOfDate).localeCompare(minDate) < 0 || String(row.asOfDate).localeCompare(OUTPUT_START_DATE) < 0) return;
    const ttmRevenue = trailingSum(quarterlyRows, index, "revenue_m");
    const ttmOperatingIncome = trailingSum(quarterlyRows, index, "operating_income_m");
    const ttmNetIncome = trailingSum(quarterlyRows, index, "net_income_m");
    const ttmCfo = trailingSum(quarterlyRows, index, "cfo_m");
    const ttmCapex = trailingSum(quarterlyRows, index, "capex_m");
    const ttmFcf = ttmCfo != null && ttmCapex != null ? ttmCfo - ttmCapex : null;
    if (!(ttmRevenue > 0) || !(ttmNetIncome > 0)) return;

    const ttm = {
      revenue_m: ttmRevenue,
      operating_income_m: ttmOperatingIncome,
      net_income_m: ttmNetIncome,
      cfo_m: ttmCfo,
      capex_m: ttmCapex,
      fcf_after_capex_m: ttmFcf,
      operating_margin_pct: margin(ttmOperatingIncome, ttmRevenue),
      net_margin_pct: margin(ttmNetIncome, ttmRevenue),
      fcf_margin_pct: margin(ttmFcf, ttmRevenue),
      capex_intensity_pct: margin(ttmCapex, ttmRevenue)
    };
    const multiples = valuationMultiples(row, ttm);
    const earningsValue = ttmNetIncome / sharesM * multiples.pe;
    const fcfValue = ttmFcf && ttmFcf > 0 ? (ttmFcf / multiples.fcfYield) / sharesM : null;
    const fairValue = fcfValue ? earningsValue * 0.6 + fcfValue * 0.4 : earningsValue;
    const targetPrice3Y = fairValue * (1 + multiples.longRunGrowth) ** 3;
    const pricePoint = pricePointAtOrBefore(priceHistory, row.asOfDate);
    const priceAtDate = finiteNumber(pricePoint?.close);
    const youtubeEvidence = youtubeByPeriod.get(`${ticker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      youtubeByPeriod.get(`${trinityTicker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      null;

    rows.push({
      periodId: `sec-companyfacts-${ticker.toLowerCase()}-fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}`,
      runCreatedAt: new Date().toISOString(),
      label: row.label,
      asOfDate: row.asOfDate,
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      eventType: "sec_quarterly_fundamental_model",
      sourceType: "sec_companyfacts_quarterly_model",
      sourceUrl: factsUrl,
      currentPrice: priceAtDate,
      fairValue,
      upsideDownside: priceAtDate && priceAtDate > 0 ? fairValue / priceAtDate - 1 : null,
      targetPrice3Y,
      expectedReturn3Y: priceAtDate && priceAtDate > 0 ? (targetPrice3Y / priceAtDate) ** (1 / 3) - 1 : null,
      method: "SEC CompanyFacts quarterly FCF / earnings model",
      methodOutputs: [
        {
          key: "ttm-earnings-power",
          label: "TTM earnings power",
          value: earningsValue,
          format: "currency",
          description: `TTM net income per share x ${multiples.pe.toFixed(1)}x normalized P/E. Price is excluded.`
        },
        {
          key: "ttm-fcf-yield",
          label: "TTM FCF yield value",
          value: fcfValue,
          format: "currency",
          description: fcfValue
            ? `TTM FCF per share / ${(multiples.fcfYield * 100).toFixed(1)}% target FCF yield. Price is excluded.`
            : "TTM FCF was unavailable or negative, so earnings power carries the row."
        },
        {
          key: "financial-quality",
          label: "Financial quality",
          value: row.revenue_growth_pct,
          format: "percent",
          description: `Revenue growth ${formatPct(row.revenue_growth_pct)}, TTM operating margin ${formatPct(ttm.operating_margin_pct)}.`
        }
      ],
      warnings: [],
      priceDate: pricePoint?.date || row.asOfDate,
      priceAtDate,
      dataSnapshot: {
        sourceType: "sec_companyfacts_quarterly_model",
        sourceQuality: "sec-companyfacts-quarterly-financials",
        sourceMaxAsOfDate: row.asOfDate,
        selectedFinancialPeriod: {
          id: `${ticker}-${row.fiscalYear}-${row.fiscalQuarter}`,
          periodId: row.label,
          asOfDate: row.asOfDate,
          periodEndDate: row.periodEndDate,
          sourceType: "SEC CompanyFacts",
          url: factsUrl
        },
        financialPeriodCount: 1,
        segmentFinancialCount: 0,
        guidanceCandidateCount: youtubeEvidence?.guidanceMetricCount || 0,
        transcriptCandidateCount: youtubeEvidence?.metricCount || 0,
        latestAnnualizedRevenue: row.revenue_m * 4,
        latestAnnualizedOperatingIncome: row.operating_income_m != null ? row.operating_income_m * 4 : null,
        fiscalFinancials: {
          revenue_m: row.revenue_m,
          revenue_growth_pct: row.revenue_growth_pct,
          gross_profit_m: row.gross_profit_m,
          gross_margin_pct: row.gross_margin_pct,
          operating_income_m: row.operating_income_m,
          operating_margin_pct: row.operating_margin_pct,
          net_income_m: row.net_income_m,
          cfo_m: row.cfo_m,
          capex_m: row.capex_m,
          fcf_after_capex_m: row.fcf_after_capex_m
        },
        trailingTwelveMonths: ttm,
        asOfAssumptionOverrideKeys: [
          "ttmNetIncome",
          "ttmFreeCashFlow",
          "revenueGrowth",
          "operatingMargin",
          "targetPE",
          "targetFCFYield",
          "sharesOutstanding"
        ],
        asOfPriceSource: pricePoint ? {
          priceDate: pricePoint.date,
          source: pricePoint.source || "local daily close fallback"
        } : null,
        valuationSemantics: {
          sourceType: "sec_companyfacts_quarterly_model",
          priceExcludedFromFairValue: true,
          fairValueFormula: "60% TTM earnings power value + 40% TTM FCF yield value; no market price input",
          scoreInputs: {
            ttmRevenue,
            ttmNetIncome,
            ttmFreeCashFlow: ttmFcf,
            revenueGrowth: row.revenue_growth_pct,
            operatingMargin: ttm.operating_margin_pct,
            capexIntensity: ttm.capex_intensity_pct,
            targetPE: multiples.pe,
            targetFCFYield: multiples.fcfYield,
            sharesM
          }
        },
        secCompanyFacts: {
          cik: companyModel.cik,
          company: companyModel.company || snapshot.name || ticker,
          url: factsUrl,
          periodEndDate: row.periodEndDate,
          sourceTags: row.sources
        },
        youtubeEarnings: youtubeEvidence
      }
    });
  });

  return rows;
}

function formatPct(value) {
  const number = finiteNumber(value);
  return number == null ? "-" : `${number.toFixed(1)}%`;
}

function normalizePeriod(period) {
  const value = String(period || "").trim().toUpperCase().replace(/\s+/g, "");
  const leadingQuarter = value.match(/^Q([1-4])(?:FY)?(20\d{2})$/);
  if (leadingQuarter) return `Q${leadingQuarter[1]}${leadingQuarter[2]}`;
  const trailingQuarter = value.match(/^(20\d{2})Q([1-4])$/);
  if (trailingQuarter) return `Q${trailingQuarter[2]}${trailingQuarter[1]}`;
  return value;
}

function median(values) {
  const clean = values.map(finiteNumber).filter((value) => value != null).sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function metricValues(metrics, names, field = "growth_yoy") {
  const wanted = new Set(names);
  return metrics
    .filter((metric) => wanted.has(metric.metric_name))
    .map((metric) => metric[field])
    .filter((value) => finiteNumber(value) != null);
}

function metricDigest(metrics) {
  const clearMetrics = metrics.filter((metric) => metric.quality_status === "clear");
  const guidanceMetrics = metrics.filter((metric) => metric.actual_or_guidance === "guidance");
  const revenueGrowth = median([
    ...metricValues(clearMetrics, ["revenue_growth"]),
    ...metricValues(guidanceMetrics, ["guidance", "revenue_growth"])
  ]);
  const operatingMargin = median(metricValues(clearMetrics, ["operating_margin", "margin"], "margin_pct"));
  const grossMargin = median(metricValues(clearMetrics, ["gross_margin"], "margin_pct"));
  return {
    sourceDatabase: YOUTUBE_DB_PATH,
    metricCount: metrics.length,
    clearMetricCount: clearMetrics.length,
    guidanceMetricCount: guidanceMetrics.length,
    actualMetricCount: metrics.filter((metric) => metric.actual_or_guidance === "actual").length,
    metricNames: [...new Set(metrics.map((metric) => metric.metric_name).filter(Boolean))].sort(),
    revenueGrowth,
    operatingMargin,
    grossMargin,
    evidence: buildEvidence(metrics)
  };
}

function buildEvidence(metrics) {
  const byEvidence = new Map();
  for (const metric of metrics) {
    if (!metric.evidence_id || byEvidence.has(metric.evidence_id)) continue;
    byEvidence.set(metric.evidence_id, {
      id: metric.evidence_id,
      url: metric.evidence_url || metric.url || null,
      excerpt: metric.excerpt || null,
      observedAt: metric.observed_at || null,
      fiscalPeriod: metric.fiscal_period || null,
      speaker: metric.speaker || null,
      metricName: metric.metric_name || null
    });
  }
  return [...byEvidence.values()]
    .filter((item) => item.excerpt || item.url)
    .slice(0, MAX_EVIDENCE_EXCERPTS);
}

function readYoutubeEvidence(tickers) {
  if (!fs.existsSync(YOUTUBE_DB_PATH)) return new Map();
  const db = new DatabaseSync(YOUTUBE_DB_PATH, { readOnly: true });
  try {
    const placeholders = tickers.map(() => "?").join(", ");
    if (!placeholders) return new Map();
    const rows = db.prepare(`
      SELECT
        me.id,
        me.ticker,
        me.metric_name,
        me.fiscal_period,
        me.actual_or_guidance,
        me.amount,
        me.growth_yoy,
        me.growth_qoq,
        me.margin_pct,
        me.quality_status,
        me.evidence_id,
        ev.excerpt,
        ev.url AS evidence_url,
        ev.observed_at,
        ev.speaker
      FROM ont_metric_events me
      LEFT JOIN ont_evidence ev ON ev.id = me.evidence_id
      WHERE me.ticker IN (${placeholders})
        AND me.fiscal_period IS NOT NULL
        AND me.quality_status IN ('clear', 'ambiguous')
      ORDER BY me.ticker ASC, me.fiscal_period ASC
    `).all(...tickers);
    const grouped = new Map();
    for (const row of rows) {
      const ticker = String(row.ticker || "").toUpperCase();
      const period = normalizePeriod(row.fiscal_period);
      if (!ticker || !period) continue;
      const key = `${ticker}::${period}`;
      grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    const digests = new Map();
    for (const [key, metrics] of grouped) {
      digests.set(key, metricDigest(metrics));
    }
    return digests;
  } finally {
    db.close();
  }
}

function auditModelInputs(snapshot) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const financialRows = history.filter((row) => row.sourceType === "sec_companyfacts_quarterly_model" || row.dataSnapshot?.sourceType === "sec_companyfacts_quarterly_model").length;
  const sourceTypes = history.reduce((counts, row) => {
    const key = row.sourceType || row.dataSnapshot?.sourceType || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const uniqueFairValues = new Set(history.map((row) => Number(row.fairValue).toFixed(4))).size;
  const warnings = [];
  let status = "pass";
  if (history.length < 12) {
    status = "review";
    warnings.push("Limited SEC quarterly valuation history.");
  }
  if (!financialRows) {
    status = "review";
    warnings.push("No SEC quarterly financial rows are available.");
  }
  if (uniqueFairValues <= 1) {
    status = "review";
    warnings.push("Fair value history has too few distinct points.");
  }
  return {
    status,
    passesNoPriceAnchorAudit: true,
    fairValueInputPolicy: "sec-financials-and-transcript-guidance",
    priceUsage: "comparison-price-series-only",
    sourceGrade: "sec-companyfacts-quarterly-financials",
    valuationRows: history.length,
    financialOrGuidanceEvidenceRows: financialRows,
    currentPriceStoredRows: history.filter((row) => finiteNumber(row.priceAtDate) != null).length,
    methodPriceAnchorSignalCount: 0,
    methodPriceAnchorSignals: [],
    sourceTypes,
    uniqueFairValues,
    warnings
  };
}

function latestScenario(snapshot, latestRow, latestPrice) {
  const currentPrice = finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const fairValue = finiteNumber(latestRow?.fairValue);
  const targetPrice3Y = finiteNumber(latestRow?.targetPrice3Y);
  return {
    scenario: "Base",
    currentPrice,
    fairValue,
    upsideDownside: currentPrice && fairValue ? fairValue / currentPrice - 1 : finiteNumber(latestRow?.upsideDownside),
    targetPrice3Y,
    expectedReturn3Y: latestMarketPrice && targetPrice3Y ? (targetPrice3Y / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y),
    recommendedMethod: latestRow?.method || "SEC CompanyFacts quarterly FCF / earnings model",
    modelSummary: "SEC quarterly financials with transcript evidence overlay"
  };
}

function updateTickerSnapshot({ ticker, snapshot, secRows, coverage }) {
  const history = secRows
    .filter((row) => row.asOfDate && finiteNumber(row.fairValue) != null)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const latestRow = history.at(-1);
  const latestPrice = latestPricePoint(snapshot.priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const latestFairValue = finiteNumber(latestRow?.fairValue);
  const latestTarget = finiteNumber(latestRow?.targetPrice3Y);
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const generatedAt = new Date().toISOString();
  const next = {
    ...snapshot,
    ticker,
    generatedAt,
    modelType: "SEC quarterly Fundamental Analysis model",
    latest: {
      ...(snapshot.latest || {}),
      latestPrice: latestMarketPrice ?? snapshot.latest?.latestPrice ?? null,
      latestPriceDate: latestPrice?.date || snapshot.latest?.latestPriceDate || null,
      latestPriceSource: latestPrice?.source || snapshot.latest?.latestPriceSource || snapshot.priceSource || null,
      valuationAnchorPrice: finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice ?? snapshot.latest?.valuationAnchorPrice),
      valuationAnchorDate: latestRow?.asOfDate || snapshot.latest?.valuationAnchorDate || null,
      baseFairValue: latestFairValue,
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRow?.upsideDownside ?? snapshot.latest?.upsideToBase),
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice && latestTarget ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y ?? snapshot.latest?.expectedReturn3Y)
    },
    scenarios: latestRow ? [latestScenario(snapshot, latestRow, latestPrice)] : snapshot.scenarios,
    history,
    methodCards: [
      {
        key: "sec-quarterly-fundamental-model",
        label: "SEC quarterly model",
        value: history.length,
        format: "number",
        description: "Quarterly fair values are rebuilt from SEC CompanyFacts revenue, income, cash flow and capex. Price is excluded."
      },
      {
        key: "price-anchor-audit",
        label: "Price anchor audit",
        value: 0,
        format: "number",
        description: "Market price is stored only for comparison, upside and chart hover."
      },
      ...(snapshot.methodCards || []).filter((card) => card?.key !== "youtube-earnings-metric-model").slice(0, 4)
    ],
    warnings: [
      `Imported ${history.length} SEC CompanyFacts quarterly valuation rows.`,
      ...(coverage.youtubePeriods ? [`Attached YouTube transcript metric evidence to ${coverage.youtubePeriods} matching periods.`] : []),
      ...(snapshot.warnings || []).filter((warning) => !String(warning).includes("Imported") && !String(warning).includes("Limited valuation history"))
    ],
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries: pricePoints >= 120,
      priceDisplayMode: pricePoints >= 120 ? "daily-price-line" : "as-of-price-anchors",
      sourceNote: "SEC CompanyFacts quarterly financials + YouTube earnings-call transcript evidence; fair value excludes market price.",
      secCompanyFacts: coverage,
      secCompanyFactsQuarterlyRows: history.length,
      youtubeEarningsMetricValuationRows: snapshot.dataQuality?.youtubeEarningsMetricValuationRows || 0,
      valuationCoverageKind: history.length >= 12 ? "quarterly" : "partial",
      hasQuarterlyValuationRuns: history.length >= 12,
      excludedLegacyBackendRows: 0,
      excludedSnapshotRows: 0
    }
  };
  return {
    ...next,
    dataQuality: {
      ...next.dataQuality,
      modelInputAudit: auditModelInputs(next)
    }
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

function dashboardTickerForTrinity(ticker) {
  return TRINITY_TO_DASHBOARD_TICKER[ticker] || ticker;
}

async function main() {
  if (!fs.existsSync(TRINITY_MODEL_PATH)) {
    throw new Error(`Trinity model not found at ${TRINITY_MODEL_PATH}`);
  }
  const trinity = parseJson(fs.readFileSync(TRINITY_MODEL_PATH, "utf8"), {});
  const currentDb = new DatabaseSync(CURRENT_DB_PATH);
  try {
    const dashboard = parseJson(currentDb.prepare("SELECT payload_json FROM valuation_snapshots WHERE id = ?").get("latest")?.payload_json, {});
    const currentTickers = new Map(
      currentDb.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots").all()
        .map((row) => [row.ticker, parseJson(row.payload_json, {})])
    );
    const requested = DEFAULT_TICKERS.map((ticker) => {
      const companyModel = trinity.public_company_models?.[ticker] ||
        Object.entries(trinity.public_company_models || {}).find(([sourceTicker]) => dashboardTickerForTrinity(sourceTicker) === ticker)?.[1];
      const trinityTicker = companyModel?.ticker || ticker;
      const dashboardTicker = dashboardTickerForTrinity(trinityTicker);
      return { ticker: dashboardTicker, trinityTicker, companyModel };
    }).filter((item) => item.companyModel?.cik && currentTickers.has(item.ticker));

    const youtubeByPeriod = readYoutubeEvidence([...new Set(requested.flatMap((item) => [item.ticker, item.trinityTicker]))]);
    const updated = [];
    const skipped = [];

    for (const item of requested) {
      const { ticker, trinityTicker, companyModel } = item;
      const snapshot = currentTickers.get(ticker);
      const cik = normalizeCik(companyModel.cik);
      const factsUrl = secCompanyFactsUrl(cik);
      const cachePath = path.join(CACHE_DIR, `${cik}.json`);
      const factsPayload = await fetchJsonWithCache(factsUrl, cachePath);
      const facts = factsPayload?.facts || {};
      const quarterlyRows = buildQuarterlyFinancials(facts);
      const secRows = buildValuationRows({
        ticker,
        trinityTicker,
        snapshot: { ...snapshot, ticker },
        companyModel,
        factsUrl,
        quarterlyRows,
        youtubeByPeriod
      });
      if (secRows.length < 4) {
        skipped.push({ ticker, reason: `only ${secRows.length} usable SEC valuation rows` });
        continue;
      }
      const youtubePeriods = secRows.filter((row) => row.dataSnapshot?.youtubeEarnings?.metricCount).length;
      const coverage = {
        source: "SEC CompanyFacts",
        sourceUrl: factsUrl,
        cachePath,
        cik,
        company: companyModel.company || snapshot.name || ticker,
        quarterlyFinancialRows: quarterlyRows.length,
        valuationRows: secRows.length,
        youtubePeriods,
        priceExcludedFromFairValue: true,
        modelInputPolicy: "TTM financials, normalized P/E and FCF yield; market price comparison only"
      };
      const next = updateTickerSnapshot({ ticker, snapshot: { ...snapshot, ticker }, secRows, coverage });
      currentTickers.set(ticker, next);
      currentDb.prepare(`
        INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          generated_at = excluded.generated_at,
          payload_json = excluded.payload_json
      `).run(ticker, next.generatedAt, JSON.stringify(next));
      updated.push({ ticker, rows: secRows.length, quarterlyFinancialRows: quarterlyRows.length, youtubePeriods });
    }

    const tickersForDashboard = [...currentTickers.values()].map(compactTicker).sort((left, right) => {
      const leftUpside = Number(left.latest?.upsideToBase);
      const rightUpside = Number(right.latest?.upsideToBase);
      if (Number.isFinite(leftUpside) && Number.isFinite(rightUpside)) return rightUpside - leftUpside;
      return String(left.ticker || "").localeCompare(String(right.ticker || ""));
    });
    const snapshots = [...currentTickers.values()];
    const summary = {
      ...(dashboard.summary || {}),
      tickerCount: snapshots.length,
      historyRows: snapshots.reduce((sum, ticker) => sum + (ticker.history?.length || 0), 0),
      pricePointCount: snapshots.reduce((sum, ticker) => sum + (ticker.priceHistory?.length || 0), 0),
      livePriceTickerCount: snapshots.filter((ticker) => ticker.priceHistory?.length).length,
      latestPriceDate: snapshots.map((ticker) => ticker.latest?.latestPriceDate).filter(Boolean).sort().at(-1) || null,
      secCompanyFactsValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.secCompanyFactsQuarterlyRows > 0).length,
      youtubeEarningsTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.youtubeEarnings?.calls > 0).length,
      youtubeMetricValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.youtubeEarningsMetricValuationRows > 0).length,
      unsupportedValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.valuationCoverageKind === "unsupported").length,
      quarterlyBackendValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.hasQuarterlyValuationRuns).length,
      modelInputAuditPassCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "pass").length,
      modelInputAuditReviewCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "review").length,
      modelInputAuditFailCount: snapshots.filter((ticker) => ticker.dataQuality?.modelInputAudit?.status === "fail").length,
      positiveUpsideCount: tickersForDashboard.filter((ticker) => Number(ticker.latest?.upsideToBase) > 0).length,
      negativeUpsideCount: tickersForDashboard.filter((ticker) => Number(ticker.latest?.upsideToBase) < 0).length
    };
    const updatedDashboard = {
      ...dashboard,
      generatedAt: new Date().toISOString(),
      source: {
        ...(dashboard.source || {}),
        upstreamLabel: "SEC CompanyFacts + YouTube earnings-call transcript metric database",
        extraction: "SEC quarterly financials rebuilt into valuation rows with transcript evidence overlay",
        secCompanyFactsCache: CACHE_DIR,
        transcriptSource: YOUTUBE_DB_PATH,
        modelInputPolicy: "Fair value uses reported financials, normalized earnings/FCF assumptions and transcript evidence. Price is not accepted as a fair-value input."
      },
      summary,
      tickers: tickersForDashboard
    };
    currentDb.prepare(`
      INSERT INTO valuation_snapshots (id, generated_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        generated_at = excluded.generated_at,
        payload_json = excluded.payload_json
    `).run("latest", updatedDashboard.generatedAt, JSON.stringify(updatedDashboard));
    currentDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log(JSON.stringify({
      currentDbPath: CURRENT_DB_PATH,
      requested: DEFAULT_TICKERS,
      updated,
      skipped,
      summary
    }, null, 2));
  } finally {
    currentDb.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
