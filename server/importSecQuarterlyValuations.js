import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readTranscriptQaByTickerPeriod } from "./transcriptQaClient.js";

const CURRENT_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const YOUTUBE_DB_PATH = process.env.YOUTUBE_TRANSCRIPT_DB_PATH || "/Users/yudonglu/Documents/youtube_transcript_db/transcripts.sqlite";
const TRINITY_MODEL_PATH = process.env.TRINITY_MODEL_PATH || "/Users/yudonglu/Documents/ai-trinity-dashboard/trinity_model.json";
const TRINITY_MODEL_DIR = process.env.TRINITY_MODEL_DIR || "/Users/yudonglu/Documents/ai-trinity-dashboard";
const CACHE_DIR = process.env.SEC_FACTS_CACHE_DIR || path.join(process.cwd(), "server/data/sec-companyfacts");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || "thesisforge-guru-analysis yudonglu1136@gmail.com";
const DEFAULT_TICKERS = (process.env.SEC_VALUATION_TICKERS || "ALL")
  .split(",")
  .map((ticker) => ticker.trim().toUpperCase())
  .filter(Boolean);

const SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json";
const SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_TICKER_MAP_CACHE_PATH = path.join(CACHE_DIR, "company_tickers.json");
const MAX_EVIDENCE_EXCERPTS = 4;
const OUTPUT_START_DATE = process.env.SEC_VALUATION_START_DATE || "2019-01-01";

const TAGS = {
  revenue_m: [
    "RevenuesNetOfInterestExpense",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
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

const SHARE_TAGS = [
  "WeightedAverageNumberOfDilutedSharesOutstanding",
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"
];

const SHARE_POINT_TAGS = [
  "EntityCommonStockSharesOutstanding",
  "CommonStockSharesOutstanding",
  "CommonStockSharesIssued"
];

const POINT_TAGS = {
  equity_m: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "PartnersCapital"
  ],
  assets_m: ["Assets"],
  cash_m: [
    "CashAndCashEquivalents",
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "CashAndDueFromBanks",
    "Cash"
  ],
  debt_m: []
};

const CORE_DISCLOSURE_METRICS = [
  "revenue_m",
  "gross_profit_m",
  "operating_income_m",
  "net_income_m",
  "cfo_m",
  "capex_m"
];

const DEBT_TOTAL_TAGS = [
  "Debt",
  "DebtAndFinanceLeaseObligations",
  "LongTermDebtAndFinanceLeaseObligations",
  "Borrowings",
  "FinancialLiabilitiesAtAmortisedCost",
  "FinancialLiabilities"
];

const DEBT_COMPONENT_TAGS = [
  "LongTermDebtAndFinanceLeaseObligationsCurrent",
  "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
  "LongTermDebtCurrent",
  "LongTermDebtNoncurrent",
  "ShortTermBorrowings",
  "ShortTermDebtCurrent",
  "DebtCurrent",
  "LongTermDebt",
  "CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings",
  "CurrentPortionOfLongtermBorrowings",
  "LongtermBorrowings"
];

const TRINITY_TO_DASHBOARD_TICKER = {
  GOOG: "GOOGL"
};

const VALUATION_PROFILES = {
  AAPL: "mega_cap_platform",
  AMZN: "platform_reinvestment",
  ANET: "networking_hardware",
  ASML: "semiconductor_equipment",
  AUTL: "emerging_biotech",
  AVAV: "defense_growth",
  AXP: "card_network_lender",
  AZN: "biopharma",
  BAC: "bank",
  BE: "energy_technology",
  BMY: "biopharma",
  CB: "insurance",
  CEG: "power_utility",
  COST: "quality_consumer",
  DDOG: "software_growth",
  EQT: "energy_e_and_p",
  GILD: "biopharma",
  GOOGL: "ads_ai_platform",
  ISRG: "medtech_platform",
  JPM: "bank",
  KTOS: "defense_growth",
  LEGN: "emerging_biotech",
  LLY: "biopharma_growth",
  LIN: "industrial_gases_compounder",
  LMT: "defense_prime",
  LSEG: "information_services",
  MA: "payments_network",
  MCK: "healthcare_distribution",
  META: "mega_cap_platform",
  MRVL: "semiconductor_growth",
  MSFT: "mega_cap_platform",
  MSTR: "bitcoin_treasury_software",
  MU: "semiconductor_cyclical",
  NOC: "defense_prime",
  NOW: "software_growth",
  NTRA: "genetic_diagnostics_growth",
  NVDA: "semiconductor_growth",
  PLTR: "hypergrowth_ai_software",
  QCOM: "semiconductor_value",
  RKLB: "space_launch_growth",
  RTX: "defense_prime",
  SE: "platform_marketplace_reinvestment",
  SPCX: "space_platform_ipo",
  TEM: "emerging_health_ai",
  TRI: "information_services",
  TRV: "insurance",
  TSLA: "ev_autonomy_platform",
  TSM: "semiconductor_foundry",
  UNH: "managed_care",
  V: "payments_network"
};

const SHARE_COUNT_OVERRIDES = {
  V: {
    sharesM: 1945.5,
    source: "legacy Fundamental Analysis Visa FY2026 Q2 diluted share count"
  }
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

function clamp(value, min, max) {
  const number = finiteNumber(value);
  if (number == null) return null;
  return Math.max(min, Math.min(max, number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDays(dateText, daysToAdd) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
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

function sumFiniteValues(rows, key) {
  const values = rows
    .map((row) => finiteNumber(row?.[key]))
    .filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function buildSpacexTrinityModel(trinity) {
  const spacex = trinity?.spacex || {};
  const ipo = spacex.ipo_terms || {};
  const companyRow = (trinity?.companies || []).find((row) => String(row?.ticker || "").toUpperCase() === "SPCX") || {};
  const research = trinity?.investment_research || {};
  const quarterlyRows = (research.quarterly_financials || []).filter((row) => String(row?.company || "").toUpperCase() === "SPCX");
  const segmentRows = (research.segment_financials || []).filter((row) => String(row?.company || "").toUpperCase() === "SPCX");
  const sourceUrl = ipo.source_url || companyRow.source_url || quarterlyRows[0]?.source || null;
  const sharesM = finiteNumber(ipo.total_shares_post_offering) != null
    ? finiteNumber(ipo.total_shares_post_offering) / 1_000_000
    : null;
  if (!(sharesM > 0) || !sourceUrl) return null;

  const annualSegments = segmentRows.filter((row) =>
    Number(row?.fiscal_year) === 2025 &&
    String(row?.fiscal_quarter || "").trim() === "2025" &&
    String(row?.data_type || "").includes("reported")
  );
  const latestSegments = segmentRows.filter((row) =>
    Number(row?.fiscal_year) === 2026 &&
    /^Q1\b/i.test(String(row?.fiscal_quarter || "")) &&
    String(row?.data_type || "").includes("reported")
  );
  const latestReported = quarterlyRows.find((row) => Number(row?.fiscal_year) === 2026) || quarterlyRows[0] || {};
  const latestGrossProfit = sumFiniteValues(latestSegments, "gross_profit");
  const annualGrossProfit = sumFiniteValues(annualSegments, "gross_profit");
  const annualAdjustedEbitda = sumFiniteValues(annualSegments, "adjusted_ebitda");
  const annualCapex = sumFiniteValues(annualSegments, "capex");

  const annualFinancials = annualSegments.length ? [{
    period: "FY2025",
    source_url: sourceUrl,
    data_type: "SpaceX S-1/A reported segment total",
    revenue_m: sumFiniteValues(annualSegments, "revenue"),
    revenue_growth_pct: null,
    gross_profit_m: annualGrossProfit,
    gross_margin_pct: margin(annualGrossProfit, sumFiniteValues(annualSegments, "revenue")),
    operating_income_m: sumFiniteValues(annualSegments, "operating_income"),
    operating_margin_pct: margin(sumFiniteValues(annualSegments, "operating_income"), sumFiniteValues(annualSegments, "revenue")),
    net_income_m: null,
    cfo_m: null,
    capex_m: annualCapex,
    fcf_after_capex_m: annualAdjustedEbitda != null && annualCapex != null ? annualAdjustedEbitda - annualCapex : null,
    cash_m: finiteNumber(ipo.actual_cash_m_at_2026_03_31),
    debt_m: finiteNumber(ipo.total_long_term_debt_m)
  }] : [];

  const latestRevenue = finiteNumber(latestReported.revenue);
  const latestOperatingIncome = finiteNumber(latestReported.operating_income);
  return {
    ticker: "SPCX",
    cik: normalizeCik(ipo.cik || "1181412"),
    company: companyRow.company || ipo.issuer || "SpaceX",
    category: companyRow.category || "space / connectivity / AI data center",
    sector: "Space platform IPO",
    latest_reported_period: "Q1 2026 S-1/A",
    diluted_or_outstanding_shares_m: sharesM,
    sources: [{ label: ipo.filing || "SpaceX S-1/A", url: sourceUrl }],
    annual_financials: annualFinancials,
    latest_quarter: {
      period: "Q1 FY2026",
      end_date: "2026-03-31",
      source_url: sourceUrl,
      data_type: latestReported.data_type || "SpaceX S-1/A reported latest quarter",
      revenue_m: latestRevenue,
      revenue_growth_pct: finiteNumber(latestReported.revenue_growth_pct ?? companyRow.latest_revenue_growth_pct),
      gross_profit_m: latestGrossProfit,
      gross_margin_pct: margin(latestGrossProfit, latestRevenue),
      operating_income_m: latestOperatingIncome,
      operating_margin_pct: finiteNumber(latestReported.operating_margin_pct) ?? margin(latestOperatingIncome, latestRevenue),
      net_income_m: finiteNumber(latestReported.net_income),
      cfo_m: null,
      capex_m: sumFiniteValues(latestSegments, "capex"),
      fcf_after_capex_m: finiteNumber(latestReported.fcf),
      cash_m: finiteNumber(ipo.pro_forma_as_adjusted_cash_m) ?? finiteNumber(ipo.actual_cash_m_at_2026_03_31),
      debt_m: finiteNumber(ipo.total_long_term_debt_m)
    }
  };
}

function readTrinityCompanyModels(trinity) {
  const models = new Map();
  for (const [sourceTicker, model] of Object.entries(trinity.public_company_models || {})) {
    const ticker = String(model?.ticker || sourceTicker).toUpperCase();
    const dashboardTicker = dashboardTickerForTrinity(ticker);
    models.set(dashboardTicker, { ...model, ticker });
    models.set(ticker, { ...model, ticker });
  }

  if (!fs.existsSync(TRINITY_MODEL_DIR)) return models;
  for (const file of fs.readdirSync(TRINITY_MODEL_DIR)) {
    if (!file.endsWith("_model.json")) continue;
    const model = parseJson(fs.readFileSync(path.join(TRINITY_MODEL_DIR, file), "utf8"), null);
    if (!model?.ticker) continue;
    const ticker = String(model.ticker).toUpperCase();
    const dashboardTicker = dashboardTickerForTrinity(ticker);
    models.set(dashboardTicker, { ...model, ticker });
    models.set(ticker, { ...model, ticker });
  }

  const spacexModel = buildSpacexTrinityModel(trinity);
  if (spacexModel?.ticker) {
    models.set(spacexModel.ticker, spacexModel);
  }

  return models;
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

async function readSecTickerMap() {
  const payload = await fetchJsonWithCache(SEC_TICKER_MAP_URL, SEC_TICKER_MAP_CACHE_PATH);
  const byTicker = new Map();
  for (const item of Object.values(payload || {})) {
    const ticker = String(item.ticker || "").toUpperCase();
    if (!ticker) continue;
    byTicker.set(ticker, item);
  }
  return byTicker;
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

function shareValueM(row) {
  const value = finiteNumber(row?.val);
  if (value == null) return null;
  // Some newer filers report share counts in thousands even though the XBRL unit is "shares".
  if (value >= 10_000 && value < 1_000_000) return value / 1_000;
  return value / 1_000_000;
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

function dateUtc(dateText) {
  const [year, month, day] = String(dateText || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function monthEndCandidate(year, month, day) {
  const monthIndex = month - 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, monthIndex, Math.min(day, lastDay));
}

function expectedFiscalPeriodEndDate(fiscalYear, fiscalQuarter, fiscalYearEnd) {
  const year = finiteNumber(fiscalYear);
  const fp = String(fiscalQuarter || "").toUpperCase();
  if (!year || !fiscalYearEnd?.month || !fiscalYearEnd?.day) return null;
  const quartersBeforeYearEnd = { Q1: 3, Q2: 2, Q3: 1, Q4: 0, FY: 0 }[fp];
  if (quartersBeforeYearEnd == null) return null;
  let month = fiscalYearEnd.month - quartersBeforeYearEnd * 3;
  let calendarYear = year;
  while (month <= 0) {
    month += 12;
    calendarYear -= 1;
  }
  return monthEndCandidate(calendarYear, month, fiscalYearEnd.day);
}

function reportedPeriodMatchesEndDate(row, fiscalYearEnd, reportedFy, reportedFp) {
  const rowEnd = dateUtc(row?.end);
  const expectedEnd = expectedFiscalPeriodEndDate(reportedFy, reportedFp, fiscalYearEnd);
  if (rowEnd == null || expectedEnd == null) return false;
  const toleranceDays = reportedFp === "FY" ? 65 : 45;
  return Math.abs(rowEnd - expectedEnd) / 86_400_000 <= toleranceDays;
}

function matchesReportedFiscalYear(row, derived) {
  const reportedFy = finiteNumber(row?.fy);
  const fiscalYear = finiteNumber(derived?.fiscalYear);
  if (reportedFy == null || fiscalYear == null) return true;
  return reportedFy === fiscalYear;
}

function filingLagDays(row) {
  const filed = dateUtc(row?.filed);
  const end = dateUtc(row?.end);
  if (filed == null || end == null) return null;
  return (filed - end) / 86_400_000;
}

function isLikelyCurrentDisclosure(row, derived) {
  const lag = filingLagDays(row);
  if (lag == null || lag < -5) return false;
  const form = String(row?.form || "").toUpperCase();
  const isAnnualForm = ["10-K", "20-F", "40-F"].includes(form);
  const threshold = isAnnualForm || derived?.fiscalQuarter === "FY" ? 185 : 140;
  return lag <= threshold;
}

function reportedFiscalPeriod(row, derived, fiscalYearEnd) {
  const reportedFy = finiteNumber(row?.fy);
  const reportedFp = String(row?.fp || "").toUpperCase();
  if (reportedFy != null && ["Q1", "Q2", "Q3", "Q4"].includes(reportedFp)) {
    if (reportedPeriodMatchesEndDate(row, fiscalYearEnd, reportedFy, reportedFp)) {
      return { fiscalYear: reportedFy, fiscalQuarter: reportedFp, source: "reported" };
    }
    if (derived && isLikelyCurrentDisclosure(row, derived)) return { ...derived, source: "filed-derived" };
    if (derived) return { ...derived, source: "comparative-derived" };
    return null;
  }
  if (reportedFy != null && reportedFp === "FY") {
    if (reportedPeriodMatchesEndDate(row, fiscalYearEnd, reportedFy, "FY")) {
      return { fiscalYear: reportedFy, fiscalQuarter: "FY", source: "reported" };
    }
    if (derived && isLikelyCurrentDisclosure(row, derived)) return { ...derived, source: "filed-derived" };
    if (derived) return { ...derived, source: "comparative-derived" };
    return null;
  }
  if (!derived) return null;
  return { ...derived, source: "derived" };
}

function factRowsForMetric(facts, metric, fiscalYearEnd, options = {}) {
  const tags = options.tags || TAGS[metric] || [];
  const unit = options.unit || "USD";
  const rows = [];
  for (const tag of tags) {
    for (const row of unitsFor(facts, tag, unit)) {
      if (!row?.fy || !row?.fp || !row?.filed || !row?.end || !row?.form) continue;
      const rowDays = days(row);
      const value = options.valueTransform ? options.valueTransform(row) : rowValueM(row);
      if (value == null || rowDays == null) continue;
      const derived = fiscalPeriodFromEnd(row.end, fiscalYearEnd);
      const period = reportedFiscalPeriod(row, derived, fiscalYearEnd);
      if (!period) continue;
      if (period.source === "comparative-derived") continue;
      if (period.source === "derived" && !matchesReportedFiscalYear(row, derived)) continue;
      const isAnnual = ["10-K", "20-F", "40-F"].includes(row.form) && rowDays >= 300;
      rows.push({
        ...row,
        metric,
        tag,
        fy: period.fiscalYear,
        fp: isAnnual ? "FY" : period.fiscalQuarter,
        originalFy: row.fy,
        originalFp: row.fp,
        fiscalPeriodSource: period.source,
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

function buildMetricQuarterMap(facts, metric, fiscalYearEnd, options = {}) {
  const rows = factRowsForMetric(facts, metric, fiscalYearEnd, options);
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
    if (options.deriveAnnualQ4 !== false && annual && q1 && q2 && q3) {
      quarters.set(`${fy}::Q4`, {
        value: annual.value - q1.value - q2.value - q3.value,
        filed: annual.filed,
        end: annual.end,
        tag: annual.tag,
        form: annual.form,
        derived: true
      });
    } else if ((options.deriveAnnualQ4 !== false || options.annualOnlyAsQ4) && annual && !q1 && !q2 && !q3) {
      quarters.set(`${fy}::Q4`, {
        value: annual.value,
        filed: annual.filed,
        end: annual.end,
        tag: annual.tag,
        form: annual.form,
        derived: false,
        annualOnly: true
      });
    }
  }
  return quarters;
}

function choosePointRow(rows) {
  return [...rows].sort((left, right) =>
    (left.priority || 0) - (right.priority || 0) ||
    String(left.filed).localeCompare(String(right.filed)) ||
    String(left.tag).localeCompare(String(right.tag))
  )[0] || null;
}

function buildPointMetricMap(facts, metric, fiscalYearEnd, options = {}) {
  const tags = options.tags || POINT_TAGS[metric] || [];
  const unit = options.unit || "USD";
  const scale = options.scale || 1_000_000;
  const rows = [];
  for (const tag of tags) {
    for (const row of unitsFor(facts, tag, unit)) {
      const rawValue = finiteNumber(row?.val);
      const value = options.valueTransform ? options.valueTransform(row) : rawValue;
      if (value == null || !row?.filed || !row?.end || !row?.form) continue;
      const derived = fiscalPeriodFromEnd(row.end, fiscalYearEnd);
      const period = reportedFiscalPeriod(row, derived, fiscalYearEnd);
      if (!period || period.fiscalQuarter === "FY") continue;
      if (period.source === "comparative-derived") continue;
      if (period.source === "derived" && !matchesReportedFiscalYear(row, derived)) continue;
      rows.push({
        ...row,
        metric,
        tag,
        priority: tags.indexOf(tag),
        fy: period.fiscalYear,
        fp: period.fiscalQuarter,
        originalFy: row.fy,
        originalFp: row.fp,
        fiscalPeriodSource: period.source,
        filed: row.filed,
        end: row.end,
        value: options.valueTransform ? value : value / scale
      });
    }
  }

  const points = new Map();
  for (const row of rows) {
    const key = `${row.fy}::${row.fp}`;
    const existing = points.get(key);
    points.set(key, choosePointRow(existing ? [existing, row] : [row]));
  }
  return points;
}

function sumPointMaps(maps, key) {
  const rows = maps.map((map) => map.get(key)).filter(Boolean);
  if (!rows.length) return null;
  return {
    value: rows.reduce((sum, row) => sum + (finiteNumber(row.value) || 0), 0),
    filed: rows.map((row) => row.filed).filter(Boolean).sort().at(-1),
    end: rows.map((row) => row.end).filter(Boolean).sort().at(-1),
    tag: rows.map((row) => row.tag).join("+"),
    form: rows.map((row) => row.form).filter(Boolean).sort().at(-1),
    derived: false
  };
}

function buildDebtMetricMap(facts, fiscalYearEnd) {
  const totalMap = buildPointMetricMap(facts, "debt_m", fiscalYearEnd, { tags: DEBT_TOTAL_TAGS });
  const componentMaps = DEBT_COMPONENT_TAGS.map((tag) => buildPointMetricMap(facts, "debt_m", fiscalYearEnd, { tags: [tag] }));
  const keys = new Set([
    ...totalMap.keys(),
    ...componentMaps.flatMap((map) => [...map.keys()])
  ]);
  const debt = new Map();
  for (const key of keys) {
    const componentRow = sumPointMaps(componentMaps, key);
    const totalRow = totalMap.get(key);
    const row = componentRow || totalRow;
    if (row) debt.set(key, row);
  }
  return debt;
}

function buildQuarterlyFinancials(facts) {
  const fiscalYearEnd = inferFiscalYearEnd(facts);
  const metricMaps = Object.fromEntries(Object.keys(TAGS).map((metric) => [metric, buildMetricQuarterMap(facts, metric, fiscalYearEnd)]));
  const pointMaps = Object.fromEntries(Object.keys(POINT_TAGS).map((metric) => [metric, buildPointMetricMap(facts, metric, fiscalYearEnd)]));
  const debtMap = buildDebtMetricMap(facts, fiscalYearEnd);
  const sharesFlowMap = buildMetricQuarterMap(facts, "shares_m", fiscalYearEnd, {
    tags: SHARE_TAGS,
    unit: "shares",
    deriveAnnualQ4: false,
    annualOnlyAsQ4: true,
    valueTransform: shareValueM
  });
  const sharesPointMap = buildPointMetricMap(facts, "shares_m", fiscalYearEnd, {
    tags: SHARE_POINT_TAGS,
    unit: "shares",
    scale: 1_000_000,
    valueTransform: shareValueM
  });
  const keys = new Set([
    ...Object.values(metricMaps).flatMap((map) => [...map.keys()]),
    ...Object.values(pointMaps).flatMap((map) => [...map.keys()]),
    ...debtMap.keys(),
    ...sharesFlowMap.keys(),
    ...sharesPointMap.keys()
  ]);
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
        derived: row.derived,
        annualOnly: Boolean(row.annualOnly)
      };
    }
    const debtRow = debtMap.get(key);
    if (debtRow) {
      metricData.debt_m = debtRow.value;
      sources.debt_m = {
        tag: debtRow.tag,
        filed: debtRow.filed,
        form: debtRow.form,
        end: debtRow.end,
        derived: debtRow.derived
      };
    }
    for (const [metric, map] of Object.entries(pointMaps)) {
      if (metric === "debt_m") continue;
      const row = map.get(key);
      if (!row) continue;
      metricData[metric] = row.value;
      sources[metric] = {
        tag: row.tag,
        filed: row.filed,
        form: row.form,
        end: row.end,
        derived: false
      };
    }
    const shareRow = sharesFlowMap.get(key) || sharesPointMap.get(key);
    if (shareRow) {
      metricData.shares_m = shareRow.value;
      sources.shares_m = {
        tag: shareRow.tag,
        filed: shareRow.filed,
        form: shareRow.form,
        end: shareRow.end,
        derived: shareRow.derived,
        annualOnly: Boolean(shareRow.annualOnly)
      };
    }
    const filedDates = Object.values(sources).map((source) => source.filed).filter(Boolean).sort();
    const coreFiledDates = CORE_DISCLOSURE_METRICS
      .map((metric) => sources[metric]?.filed)
      .filter(Boolean)
      .sort();
    const endDates = Object.values(sources).map((source) => source.end).filter(Boolean).sort();
    return {
      key,
      fiscalYear: fy,
      fiscalQuarter: fp,
      label: `FY${fy} ${fp}`,
      asOfDate: coreFiledDates.at(-1) || filedDates.at(-1) || null,
      periodEndDate: endDates.at(-1) || null,
      ...metricData,
      sources
    };
  });

  rows.sort((left, right) =>
    left.fiscalYear - right.fiscalYear ||
    Number(left.fiscalQuarter.replace("Q", "")) - Number(right.fiscalQuarter.replace("Q", ""))
  );

  const byPeriod = new Map(rows.map((row) => [`${row.fiscalYear}::${row.fiscalQuarter}`, row]));
  for (const row of rows) {
    const prior = byPeriod.get(`${row.fiscalYear - 1}::${row.fiscalQuarter}`);
    row.revenue_growth_pct = pct(row.revenue_m, prior?.revenue_m);
    row.gross_margin_pct = margin(row.gross_profit_m, row.revenue_m);
    row.operating_margin_pct = margin(row.operating_income_m, row.revenue_m);
    row.fcf_after_capex_m = row.cfo_m != null && row.capex_m != null ? row.cfo_m - row.capex_m : null;
  }

  return rows
    .filter((row) => row.asOfDate && row.net_income_m != null && (row.revenue_m != null || row.equity_m != null))
    .map((row) => ({
      ...row,
      fiscalYearEnd
    }));
}

function attachMstrCryptoMetrics(facts, rows) {
  const fiscalYearEnd = inferFiscalYearEnd(facts);
  const cryptoMetricMap = ({ tag, unit, scale }) => {
    const points = new Map();
    for (const row of unitsFor(facts, tag, unit)) {
      const rawValue = finiteNumber(row?.val);
      const period = fiscalPeriodFromEnd(row?.end, fiscalYearEnd);
      if (rawValue == null || !period || period.fiscalQuarter === "FY" || !row?.filed || !row?.form) continue;
      const key = `${period.fiscalYear}::${period.fiscalQuarter}`;
      const value = rawValue / scale;
      const candidate = {
        value,
        filed: row.filed,
        form: row.form,
        end: row.end,
        tag,
        derived: false
      };
      const existing = points.get(key);
      if (!existing || String(candidate.filed).localeCompare(String(existing.filed)) > 0) {
        points.set(key, candidate);
      }
    }
    return points;
  };
  const fairValueMap = cryptoMetricMap({ tag: "CryptoAssetFairValue", unit: "USD", scale: 1_000_000 });
  const costMap = cryptoMetricMap({ tag: "CryptoAssetCost", unit: "USD", scale: 1_000_000 });
  const unitMap = cryptoMetricMap({ tag: "CryptoAssetNumberOfUnits", unit: "Bitcoin", scale: 1 });

  return rows.map((row) => {
    const key = `${row.fiscalYear}::${row.fiscalQuarter}`;
    const fairValue = fairValueMap.get(key);
    const cost = costMap.get(key);
    const units = unitMap.get(key);
    if (!fairValue && !cost && !units) return row;
    return {
      ...row,
      crypto_asset_fair_value_m: fairValue?.value ?? row.crypto_asset_fair_value_m,
      crypto_asset_cost_m: cost?.value ?? row.crypto_asset_cost_m,
      crypto_asset_units: units?.value ?? row.crypto_asset_units,
      sources: {
        ...(row.sources || {}),
        ...(fairValue ? {
          crypto_asset_fair_value_m: {
            tag: fairValue.tag,
            filed: fairValue.filed,
            form: fairValue.form,
            end: fairValue.end,
            derived: false
          }
        } : {}),
        ...(cost ? {
          crypto_asset_cost_m: {
            tag: cost.tag,
            filed: cost.filed,
            form: cost.form,
            end: cost.end,
            derived: false
          }
        } : {}),
        ...(units ? {
          crypto_asset_units: {
            tag: units.tag,
            filed: units.filed,
            form: units.form,
            end: units.end,
            derived: false,
            unit: "Bitcoin"
          }
        } : {})
      }
    };
  });
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

function readPriceHistoryFromDb(db, ticker, limit = 1800) {
  try {
    const rows = db.prepare(`
      SELECT date, open, high, low, close, volume, source
      FROM price_points
      WHERE symbol = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(ticker, limit);
    return rows
      .reverse()
      .map((row) => ({
        date: row.date,
        open: finiteNumber(row.open),
        high: finiteNumber(row.high),
        low: finiteNumber(row.low),
        close: finiteNumber(row.close),
        volume: finiteNumber(row.volume),
        source: row.source || "local price_points"
      }))
      .filter((row) => row.date && row.close != null);
  } catch {
    return [];
  }
}

function baseValuationSnapshot({ ticker, companyModel, secInfo, priceHistory }) {
  const latestPrice = latestPricePoint(priceHistory);
  const generatedAt = new Date().toISOString();
  const name = companyModel?.company || secInfo?.title || ticker;
  return {
    generatedAt,
    ticker,
    key: ticker.toLowerCase(),
    name,
    sector: companyModel?.sector || profileSettings(ticker).label || "Public equity",
    currency: "USD",
    description: `${name} valuation snapshot generated from SEC CompanyFacts and local price history.`,
    modelType: "SEC quarterly Fundamental Analysis model",
    latest: {
      latestPrice: finiteNumber(latestPrice?.close),
      latestPriceDate: latestPrice?.date || null,
      latestPriceSource: latestPrice?.source || null,
      valuationAnchorPrice: null,
      valuationAnchorDate: null,
      baseFairValue: null,
      upsideToBase: null,
      targetPrice3Y: null,
      expectedReturn3Y: null,
      fairValueSource: "SEC CompanyFacts financials + transcript guidance model",
      fairValueInputPolicy: "reported financials / guidance only; price excluded"
    },
    scenarios: [],
    history: [],
    methodCards: [],
    assumptions: [],
    warnings: ["Initialized valuation snapshot from local price history so SEC import can add the ticker."],
    priceHistory,
    priceSource: latestPrice?.source || "local price_points",
    dataQuality: {
      pricePoints: priceHistory.length,
      hasLivePriceSeries: priceHistory.length >= 120,
      priceDisplayMode: priceHistory.length >= 120 ? "daily-price-line" : "as-of-price-anchors",
      valuationCoverageKind: "unsupported",
      hasQuarterlyValuationRuns: false,
      sourceNote: "Initialized from local price_points; fair values are added by the SEC quarterly importer.",
      fairValueSource: "pending SEC CompanyFacts import",
      secCompanyFacts: {
        cik: secInfo?.cik_str || companyModel?.cik || null,
        company: name,
        pendingImport: true
      }
    }
  };
}

function trailingSum(rows, index, key) {
  const window = rows.slice(Math.max(0, index - 3), index + 1);
  if (window.length < 4 || window.some((row) => finiteNumber(row[key]) == null)) return null;
  return window.reduce((sum, row) => sum + Number(row[key]), 0);
}

function isAnnualOnlyFinancialRow(row) {
  return row?.fiscalQuarter === "Q4" && CORE_DISCLOSURE_METRICS.some((metric) =>
    Boolean(row?.sources?.[metric]?.annualOnly)
  );
}

function isSecCompanyFactsModelSource(sourceType) {
  return String(sourceType || "").startsWith("sec_companyfacts_");
}

function trailingOrAnnualValue(rows, index, key, annualizationFactor) {
  const row = rows[index];
  if (isAnnualOnlyFinancialRow(row)) return finiteNumber(row?.[key]);
  const ttmValue = trailingSum(rows, index, key);
  if (ttmValue != null) return ttmValue;
  const currentValue = finiteNumber(row?.[key]);
  return currentValue == null ? null : currentValue * annualizationFactor;
}

function latestKnownValue(rows, index, key) {
  for (let i = index; i >= 0; i -= 1) {
    const value = finiteNumber(rows[i]?.[key]);
    if (value != null) return value;
  }
  return null;
}

function latestKnownValueWithin(rows, index, key, maxRows) {
  const floor = Math.max(0, index - maxRows);
  for (let i = index; i >= floor; i -= 1) {
    const value = finiteNumber(rows[i]?.[key]);
    if (value != null) return value;
  }
  return null;
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

const PROFILE_SETTINGS = {
  mega_cap_platform: {
    label: "Mega-cap platform",
    method: "TTM earnings power + FCF yield",
    normalizedGrowthWindow: 8,
    peRange: [20, 36],
    peBase: 24,
    fcfYieldRange: [0.032, 0.055],
    fcfYieldBase: 0.042,
    targetMargin: 0.29,
    fcfWeight: 0.42
  },
  ads_ai_platform: {
    label: "Search / ads AI platform",
    method: "Owner earnings + normalized platform EPS",
    normalizedGrowthWindow: 8,
    peRange: [22, 38],
    peBase: 25,
    fcfYieldRange: [0.032, 0.055],
    fcfYieldBase: 0.041,
    targetMargin: 0.31,
    fcfWeight: 0.26,
    maintenanceCapexIntensityPct: 0.14
  },
  platform_reinvestment: {
    label: "Platform reinvestment",
    method: "Normalized earnings power + FCF yield",
    peRange: [20, 38],
    peBase: 25,
    fcfYieldRange: [0.035, 0.06],
    fcfYieldBase: 0.046,
    targetMargin: 0.16,
    fcfWeight: 0.36
  },
  platform_marketplace_reinvestment: {
    label: "Platform reinvestment",
    method: "Marketplace EV/sales + normalized earnings + FCF yield",
    allowLossMakingStage: true,
    normalizedGrowthWindow: 4,
    normalizedGrowthCapPct: 65,
    forwardRevenueYears: 0,
    peRange: [20, 44],
    peBase: 25,
    peGrowthCoefficient: 0.26,
    peMarginCoefficient: 0.18,
    fcfYieldRange: [0.032, 0.075],
    fcfYieldBase: 0.052,
    fcfYieldGrowthCoefficient: 0.00025,
    fcfYieldMarginCoefficient: 0.00018,
    evSalesRange: [1.2, 8.0],
    evSalesBase: 2.5,
    evSalesGrowthCoefficient: 0.07,
    evSalesGrossMarginCoefficient: 0.035,
    evSalesFcfMarginCoefficient: 0.035,
    targetMargin: 0.14,
    marginActualWeight: 0.55,
    salesWeight: 0.48,
    earningsWeight: 0.30,
    fcfWeight: 0.22,
    defaultGrossMarginPct: 42
  },
  payments_network: {
    label: "Payments network",
    method: "High-ROIC EPS + FCF yield",
    peRange: [24, 40],
    peBase: 29,
    fcfYieldRange: [0.028, 0.046],
    fcfYieldBase: 0.035,
    targetMargin: 0.52,
    fcfWeight: 0.45
  },
  card_network_lender: {
    label: "Closed-loop card network / lender",
    method: "Premium ROE-implied P/B + EPS power",
    costOfEquity: 0.105,
    terminalGrowth: 0.035,
    pbRange: [2.0, 6.5],
    peRange: [12, 22],
    peBase: 15.5,
    bookWeight: 0.35,
    epsWeight: 0.65
  },
  software_growth: {
    label: "Enterprise software growth",
    method: "Rule-of-40 EV/sales + FCF yield + normalized earnings",
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.55,
    peRange: [28, 56],
    peBase: 34,
    fcfYieldRange: [0.026, 0.052],
    fcfYieldBase: 0.035,
    evSalesRange: [6.0, 28.0],
    evSalesBase: 10.0,
    evSalesGrowthCoefficient: 0.16,
    evSalesGrossMarginCoefficient: 0.06,
    evSalesFcfMarginCoefficient: 0.05,
    targetMargin: 0.28,
    fcfWeight: 0.32,
    salesWeight: 0.43,
    earningsWeight: 0.25,
    defaultGrossMarginPct: 76
  },
  hypergrowth_ai_software: {
    label: "Hypergrowth AI software",
    method: "Forward Rule-of-X EV/sales + FCF yield + normalized earnings",
    allowLossMakingStage: true,
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.75,
    forwardGrowthCapPct: 75,
    forwardScaleCap: 2.1,
    normalizedGrowthCapPct: 75,
    guidanceRevenueMaxScale: 2.2,
    guidanceOperatingMarginHaircut: 0.86,
    peRange: [42, 96],
    peBase: 48,
    peGrowthCoefficient: 0.42,
    peMarginCoefficient: 0.22,
    fcfYieldRange: [0.018, 0.045],
    fcfYieldBase: 0.028,
    fcfYieldGrowthCoefficient: 0.0003,
    fcfYieldMarginCoefficient: 0.00022,
    evSalesRange: [18.0, 70.0],
    evSalesBase: 27.0,
    evSalesGrowthCoefficient: 0.30,
    evSalesGrossMarginCoefficient: 0.09,
    evSalesFcfMarginCoefficient: 0.08,
    targetMargin: 0.42,
    fcfWeight: 0.22,
    salesWeight: 0.56,
    earningsWeight: 0.22,
    defaultGrossMarginPct: 80,
    optionalityMultiplier: 1.15
  },
  semiconductor_growth: {
    label: "AI semiconductor growth",
    method: "AI semiconductor EV/sales + FCF yield + cycle-adjusted EPS",
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.6,
    peRange: [22, 52],
    peBase: 30,
    fcfYieldRange: [0.026, 0.06],
    fcfYieldBase: 0.04,
    evSalesRange: [5.5, 24.0],
    evSalesBase: 8.5,
    evSalesGrowthCoefficient: 0.16,
    targetMargin: 0.34,
    fcfWeight: 0.32,
    salesWeight: 0.36,
    earningsWeight: 0.32,
    defaultGrossMarginPct: 52,
    cycleHaircut: 0.96
  },
  semiconductor_cyclical: {
    label: "Cyclical semiconductor",
    method: "AI-cycle normalized earnings power",
    forwardRevenueYears: 0.5,
    forwardFcfScaleCap: 1.35,
    peRange: [12, 32],
    peBase: 18,
    fcfYieldRange: [0.038, 0.085],
    fcfYieldBase: 0.058,
    targetMargin: 0.18,
    fcfWeight: 0.25,
    cycleHaircut: 0.95
  },
  semiconductor_value: {
    label: "Semiconductor value",
    method: "Normalized EPS + FCF yield",
    peRange: [12, 24],
    peBase: 16,
    fcfYieldRange: [0.045, 0.075],
    fcfYieldBase: 0.058,
    targetMargin: 0.25,
    fcfWeight: 0.38
  },
  semiconductor_foundry: {
    label: "Advanced foundry",
    method: "Foundry earnings power + FCF yield",
    peRange: [18, 32],
    peBase: 23,
    fcfYieldRange: [0.035, 0.065],
    fcfYieldBase: 0.048,
    targetMargin: 0.42,
    fcfWeight: 0.32,
    cycleHaircut: 0.9
  },
  semiconductor_equipment: {
    label: "Semiconductor equipment",
    method: "Backlog-cycle normalized EPS + FCF yield",
    peRange: [18, 34],
    peBase: 24,
    fcfYieldRange: [0.035, 0.065],
    fcfYieldBase: 0.048,
    targetMargin: 0.3,
    fcfWeight: 0.34,
    cycleHaircut: 0.92
  },
  networking_hardware: {
    label: "AI networking hardware",
    method: "Normalized EPS + FCF yield",
    peRange: [20, 36],
    peBase: 25,
    fcfYieldRange: [0.035, 0.06],
    fcfYieldBase: 0.045,
    targetMargin: 0.32,
    fcfWeight: 0.36
  },
  bank: {
    label: "Large-cap bank",
    method: "ROE-implied P/B + EPS cross-check",
    costOfEquity: 0.105,
    terminalGrowth: 0.025,
    pbRange: [0.75, 2.25],
    peRange: [8, 14],
    peBase: 10.5
  },
  insurance: {
    label: "P&C insurance",
    method: "ROE-implied P/B + normalized EPS",
    costOfEquity: 0.095,
    terminalGrowth: 0.025,
    pbRange: [1.0, 2.8],
    peRange: [9, 16],
    peBase: 12
  },
  biopharma: {
    label: "Large-cap biopharma",
    method: "Pipeline-aware EPS + FCF yield",
    peRange: [10, 22],
    peBase: 14,
    fcfYieldRange: [0.05, 0.085],
    fcfYieldBase: 0.064,
    targetMargin: 0.27,
    fcfWeight: 0.4
  },
  biopharma_growth: {
    label: "Growth biopharma",
    method: "Growth-adjusted EPS power",
    peRange: [18, 34],
    peBase: 23,
    fcfYieldRange: [0.035, 0.065],
    fcfYieldBase: 0.048,
    targetMargin: 0.33,
    fcfWeight: 0.32
  },
  medtech_platform: {
    label: "Medtech platform",
    method: "Quality EPS + FCF yield",
    forwardRevenueYears: 1,
    normalizedGrowthWindow: 8,
    forwardFcfScaleCap: 1.4,
    peRange: [30, 62],
    peBase: 41,
    peGrowthCoefficient: 0.30,
    peMarginCoefficient: 0.18,
    fcfYieldRange: [0.022, 0.048],
    fcfYieldBase: 0.032,
    targetMargin: 0.34,
    marginActualWeight: 0.42,
    fcfWeight: 0.34
  },
  healthcare_distribution: {
    label: "Healthcare distribution",
    method: "Low-margin EPS + FCF yield",
    peRange: [10, 18],
    peBase: 13,
    fcfYieldRange: [0.055, 0.085],
    fcfYieldBase: 0.068,
    targetMargin: 0.025,
    fcfWeight: 0.45
  },
  managed_care: {
    label: "Managed care",
    method: "Normalized EPS + FCF yield",
    peRange: [12, 22],
    peBase: 16,
    fcfYieldRange: [0.045, 0.075],
    fcfYieldBase: 0.058,
    targetMargin: 0.075,
    fcfWeight: 0.42
  },
  genetic_diagnostics_growth: {
    label: "Genetic diagnostics growth",
    method: "Diagnostics platform EV/sales + normalized margin earnings power",
    allowLossMakingStage: true,
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.35,
    forwardScaleCap: 1.85,
    normalizedGrowthWindow: 6,
    normalizedGrowthCapPct: 60,
    peRange: [22, 52],
    peBase: 30,
    peGrowthCoefficient: 0.28,
    peMarginCoefficient: 0.16,
    fcfYieldRange: [0.03, 0.075],
    fcfYieldBase: 0.048,
    fcfYieldGrowthCoefficient: 0.00024,
    fcfYieldMarginCoefficient: 0.00018,
    evSalesRange: [3.5, 18.0],
    evSalesBase: 6.5,
    evSalesGrowthCoefficient: 0.12,
    evSalesGrossMarginCoefficient: 0.05,
    evSalesFcfMarginCoefficient: 0.035,
    targetMargin: 0.24,
    marginActualWeight: 0.45,
    salesWeight: 0.55,
    earningsWeight: 0.30,
    fcfWeight: 0.15,
    defaultGrossMarginPct: 53,
    optionalityMultiplier: 1.04
  },
  defense_prime: {
    label: "Defense prime",
    method: "Backlog-quality EPS + FCF yield",
    peRange: [13, 22],
    peBase: 16,
    fcfYieldRange: [0.045, 0.075],
    fcfYieldBase: 0.058,
    targetMargin: 0.12,
    fcfWeight: 0.38
  },
  defense_growth: {
    label: "Defense growth",
    method: "Backlog proxy EV/sales + normalized margin earnings power",
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.35,
    peRange: [20, 42],
    peBase: 26,
    fcfYieldRange: [0.035, 0.07],
    fcfYieldBase: 0.05,
    evSalesRange: [3.0, 10.5],
    evSalesBase: 4.4,
    evSalesGrowthCoefficient: 0.08,
    targetMargin: 0.16,
    fcfWeight: 0.15,
    salesWeight: 0.55,
    earningsWeight: 0.30,
    defaultGrossMarginPct: 36
  },
  space_launch_growth: {
    label: "Space launch growth",
    method: "Launch cadence EV/sales + normalized margin earnings power",
    allowLossMakingStage: true,
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.25,
    forwardScaleCap: 1.8,
    normalizedGrowthWindow: 6,
    normalizedGrowthCapPct: 70,
    peRange: [22, 52],
    peBase: 30,
    peGrowthCoefficient: 0.28,
    peMarginCoefficient: 0.14,
    fcfYieldRange: [0.04, 0.09],
    fcfYieldBase: 0.06,
    evSalesRange: [2.5, 16.0],
    evSalesBase: 5.2,
    evSalesGrowthCoefficient: 0.12,
    evSalesGrossMarginCoefficient: 0.035,
    evSalesFcfMarginCoefficient: 0.025,
    targetMargin: 0.16,
    marginActualWeight: 0.45,
    fcfWeight: 0.10,
    salesWeight: 0.64,
    earningsWeight: 0.26,
    defaultGrossMarginPct: 32,
    cycleHaircut: 0.93
  },
  space_platform_ipo: {
    label: "Space platform IPO",
    method: "S-1/A revenue-stage SOTP proxy + post-IPO net cash bridge",
    allowLossMakingStage: true,
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.2,
    forwardScaleCap: 1.75,
    normalizedGrowthCapPct: 60,
    peRange: [28, 72],
    peBase: 38,
    peGrowthCoefficient: 0.34,
    peMarginCoefficient: 0.16,
    fcfYieldRange: [0.03, 0.08],
    fcfYieldBase: 0.052,
    evSalesRange: [8.0, 45.0],
    evSalesBase: 16.0,
    evSalesGrowthCoefficient: 0.18,
    evSalesGrossMarginCoefficient: 0.055,
    evSalesFcfMarginCoefficient: 0.025,
    targetMargin: 0.18,
    marginActualWeight: 0.35,
    fcfWeight: 0.08,
    salesWeight: 0.72,
    earningsWeight: 0.20,
    defaultGrossMarginPct: 50,
    optionalityMultiplier: 1.08
  },
  bitcoin_treasury_software: {
    label: "Bitcoin treasury / software",
    method: "BTC treasury NAV + software business value",
    allowLossMakingStage: true,
    treasuryHaircut: 0.98,
    softwareRevenueMultiple: 2.2,
    longRunGrowth: 0.08,
    peRange: [10, 26],
    peBase: 16,
    fcfYieldRange: [0.05, 0.11],
    fcfYieldBase: 0.075,
    targetMargin: 0.24,
    marginActualWeight: 0.35,
    fcfWeight: 0.20
  },
  energy_e_and_p: {
    label: "Natural gas E&P",
    method: "Cycle-normalized FCF yield",
    peRange: [7, 14],
    peBase: 9,
    fcfYieldRange: [0.075, 0.14],
    fcfYieldBase: 0.095,
    targetMargin: 0.2,
    fcfWeight: 0.55,
    cycleHaircut: 0.78
  },
  power_utility: {
    label: "Power utility / generation",
    method: "Regulated/infrastructure EPS power",
    peRange: [14, 24],
    peBase: 17,
    fcfYieldRange: [0.055, 0.09],
    fcfYieldBase: 0.068,
    targetMargin: 0.18,
    fcfWeight: 0.25
  },
  quality_consumer: {
    label: "Quality consumer compounder",
    method: "Quality EPS + FCF yield",
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.25,
    peRange: [28, 52],
    peBase: 36,
    fcfYieldRange: [0.022, 0.044],
    fcfYieldBase: 0.031,
    targetMargin: 0.04,
    fcfWeight: 0.4
  },
  information_services: {
    label: "Information services",
    method: "Subscription data EPS + FCF yield",
    peRange: [18, 32],
    peBase: 23,
    fcfYieldRange: [0.038, 0.065],
    fcfYieldBase: 0.048,
    targetMargin: 0.26,
    fcfWeight: 0.44
  },
  industrial_growth: {
    label: "Industrial growth",
    method: "Normalized industrial earnings power",
    peRange: [18, 38],
    peBase: 24,
    fcfYieldRange: [0.04, 0.075],
    fcfYieldBase: 0.055,
    targetMargin: 0.12,
    fcfWeight: 0.25
  },
  industrial_gases_compounder: {
    label: "Industrial gases compounder",
    method: "Adjusted EPS guidance + owner-earnings yield",
    historicalMethod: "Normalized industrial gas earnings + owner-earnings yield",
    peRange: [26, 34],
    peBase: 27.5,
    peGrowthCoefficient: 0.22,
    peMarginCoefficient: 0.12,
    fcfYieldRange: [0.035, 0.055],
    fcfYieldBase: 0.044,
    fcfYieldGrowthCoefficient: 0.0002,
    fcfYieldMarginCoefficient: 0.00015,
    targetMargin: 0.23,
    marginActualWeight: 0.75,
    maintenanceCapexIntensityPct: 0.08,
    fcfWeight: 0.10,
    adjustedEpsGuidance: 17.75,
    adjustedEpsGuidanceRange: [17.60, 17.90],
    adjustedEpsGuidanceYear: 2026,
    adjustedEpsGuidanceVisibleFrom: "2026-02-06",
    adjustedOperatingMarginPct: 30.0,
    adjustedAfterTaxRocPct: 23.8,
    projectBacklogM: 10000,
    saleOfGasBacklogM: 7100
  },
  ev_autonomy_platform: {
    label: "EV / energy / autonomy platform",
    method: "Forward revenue power + autonomy/energy option value",
    forwardRevenueYears: 1,
    forwardFcfScaleCap: 1.35,
    peRange: [32, 72],
    peBase: 44,
    fcfYieldRange: [0.026, 0.065],
    fcfYieldBase: 0.045,
    evSalesRange: [3.5, 16.0],
    evSalesBase: 7.0,
    evSalesGrowthCoefficient: 0.12,
    evSalesGrossMarginCoefficient: 0.025,
    evSalesFcfMarginCoefficient: 0.035,
    targetMargin: 0.22,
    fcfWeight: 0.18,
    salesWeight: 0.52,
    earningsWeight: 0.30,
    optionalityMultiplier: 1.55
  },
  energy_technology: {
    label: "Energy technology",
    method: "EV/sales + FCF yield + normalized margin revenue power",
    peRange: [16, 30],
    peBase: 21,
    fcfYieldRange: [0.05, 0.085],
    fcfYieldBase: 0.065,
    evSalesRange: [1.0, 4.0],
    evSalesBase: 1.8,
    targetMargin: 0.1,
    fcfWeight: 0.30,
    salesWeight: 0.45,
    earningsWeight: 0.25,
    defaultGrossMarginPct: 28
  },
  emerging_biotech: {
    label: "Emerging biotech",
    method: "Revenue-stage biotech EV/sales + net cash",
    evSalesRange: [1.5, 7.0],
    evSalesBase: 2.8,
    targetMargin: 0,
    longRunGrowthRange: [0.0, 0.08],
    defaultGrossMarginPct: 68
  },
  emerging_health_ai: {
    label: "Emerging healthcare AI",
    method: "Revenue-stage healthcare AI EV/sales + net cash",
    evSalesRange: [2.0, 9.0],
    evSalesBase: 4.0,
    targetMargin: 0,
    longRunGrowthRange: [0.02, 0.12]
  }
};

function profileForTicker(ticker) {
  return VALUATION_PROFILES[ticker] || "mega_cap_platform";
}

function profileSettings(ticker) {
  const profile = profileForTicker(ticker);
  return {
    profile,
    ...(PROFILE_SETTINGS[profile] || PROFILE_SETTINGS.mega_cap_platform)
  };
}

function normalizedGrowthPct(row, youtubeEvidence, settings = {}) {
  const fundamentalGrowth = finiteNumber(row.normalized_revenue_growth_pct) ?? finiteNumber(row.revenue_growth_pct);
  const candidates = [
    fundamentalGrowth,
    finiteNumber(youtubeEvidence?.revenueGrowth)
  ].filter((value) => value != null && value > -50 && value < 100);
  return clamp(median(candidates) ?? 5, -20, settings.normalizedGrowthCapPct ?? 45);
}

function normalizedRevenueGrowthForRows(rows, index, windowSize) {
  if (!windowSize) return null;
  const values = rows
    .slice(Math.max(0, index - windowSize + 1), index + 1)
    .map((row) => finiteNumber(row.revenue_growth_pct))
    .filter((value) => value != null && value > -50 && value < 100)
    .sort((left, right) => left - right);
  if (!values.length) return null;
  const floor = Math.floor(values.length * 0.15);
  const ceiling = Math.ceil(values.length * 0.85);
  const trimmed = values.slice(floor, Math.max(floor + 1, ceiling));
  return median(trimmed);
}

function normalizedMarginRatio(ttm, settings) {
  const opMargin = finiteNumber(ttm.operating_margin_pct);
  const target = finiteNumber(settings.targetMargin) ?? 0.2;
  if (opMargin == null) return target;
  const actualWeight = clamp(settings.marginActualWeight ?? 0.7, 0.25, 0.9);
  return clamp(opMargin / 100 * actualWeight + target * (1 - actualWeight), target * 0.55, Math.max(target * 1.45, target + 0.04));
}

function adjustedPe(settings, growthPct, marginPct) {
  const [minPe, maxPe] = settings.peRange || [12, 30];
  const marginLift = finiteNumber(marginPct) != null ? (marginPct - 20) * (settings.peMarginCoefficient ?? 0.12) : 0;
  const pe = (settings.peBase || 18) + growthPct * (settings.peGrowthCoefficient ?? 0.22) + marginLift;
  return clamp(pe, minPe, maxPe);
}

function adjustedFcfYield(settings, growthPct, fcfMarginPct) {
  const [minYield, maxYield] = settings.fcfYieldRange || [0.04, 0.08];
  const fcfLift = finiteNumber(fcfMarginPct) != null ? (fcfMarginPct - 15) * (settings.fcfYieldMarginCoefficient ?? 0.00015) : 0;
  const yieldValue = (settings.fcfYieldBase || 0.055) - growthPct * (settings.fcfYieldGrowthCoefficient ?? 0.00022) - fcfLift;
  return clamp(yieldValue, minYield, maxYield);
}

function adjustedEvSales(settings, growthPct, grossMarginPct) {
  const [minMultiple, maxMultiple] = settings.evSalesRange || [1, 6];
  const normalizedGrossMargin = finiteNumber(grossMarginPct) ?? finiteNumber(settings.defaultGrossMarginPct);
  const marginLift = normalizedGrossMargin != null ? (normalizedGrossMargin - 55) * (settings.evSalesGrossMarginCoefficient ?? 0.035) : 0;
  const multiple = (settings.evSalesBase || 2.5) + growthPct * (settings.evSalesGrowthCoefficient ?? 0.045) + marginLift;
  return clamp(multiple, minMultiple, maxMultiple);
}

function forwardScaleFromGrowth(growthPct, settings) {
  const years = clamp(settings.forwardRevenueYears || 0, 0, 2) || 0;
  if (!years) return 1;
  const growth = clamp(growthPct, -30, settings.forwardGrowthCapPct ?? 65) / 100;
  return Math.max(0.55, Math.min(settings.forwardScaleCap || 2.4, (1 + growth) ** years));
}

function forwardMetric(value, scale) {
  const number = finiteNumber(value);
  if (number == null) return null;
  return number * scale;
}

function netCashM(ttm) {
  const cashM = finiteNumber(ttm.cash_m) || 0;
  const debtM = finiteNumber(ttm.debt_m) || 0;
  return cashM - debtM;
}

function plausibleGuidanceAmount(value, base, minScale, maxScale) {
  const amount = finiteNumber(value);
  const baseValue = finiteNumber(base);
  if (!(amount > 0) || !(baseValue > 0)) return null;
  const minValue = baseValue * minScale;
  const maxValue = baseValue * maxScale;
  if (amount < minValue || amount > maxValue) return null;
  return amount;
}

function forwardGuidanceVisibleForRow(row, settings) {
  const visibleFrom = settings.adjustedEpsGuidanceVisibleFrom;
  if (visibleFrom && row?.asOfDate) {
    return String(row.asOfDate).localeCompare(String(visibleFrom)) >= 0;
  }
  const guidanceYear = finiteNumber(settings.adjustedEpsGuidanceYear);
  const fiscalYear = finiteNumber(row?.fiscalYear);
  return guidanceYear != null && fiscalYear != null && fiscalYear >= guidanceYear;
}

function valuationFreeCashFlow(ttm, settings) {
  const ttmFcf = finiteNumber(ttm.fcf_after_capex_m);
  const ttmCfo = finiteNumber(ttm.cfo_m);
  const ttmRevenue = finiteNumber(ttm.revenue_m);
  const ttmCapex = finiteNumber(ttm.capex_m);
  const maintenanceIntensity = finiteNumber(settings.maintenanceCapexIntensityPct);
  if (!(maintenanceIntensity > 0) || !(ttmCfo > 0) || !(ttmRevenue > 0) || !(ttmCapex > 0)) {
    return {
      reportedFcf: ttmFcf,
      normalizedFcf: ttmFcf,
      maintenanceCapexM: null,
      growthCapexM: null,
      capexIntensityPct: margin(ttmCapex, ttmRevenue),
      usesOwnerEarnings: false
    };
  }
  const maintenanceCapexM = ttmRevenue * maintenanceIntensity;
  const normalizedFcf = ttmCfo - Math.min(ttmCapex, maintenanceCapexM);
  return {
    reportedFcf: ttmFcf,
    normalizedFcf,
    maintenanceCapexM,
    growthCapexM: Math.max(0, ttmCapex - maintenanceCapexM),
    capexIntensityPct: margin(ttmCapex, ttmRevenue),
    usesOwnerEarnings: ttmCapex > maintenanceCapexM * 1.15 && normalizedFcf > (ttmFcf || 0)
  };
}

function blendValuationComponents(components) {
  const valid = components.filter((component) => component && finiteNumber(component.value) != null && component.value > 0 && component.weight > 0);
  const totalWeight = valid.reduce((sum, component) => sum + component.weight, 0);
  if (!totalWeight) return { fairValue: null, components: [] };
  return {
    fairValue: valid.reduce((sum, component) => sum + component.value * component.weight / totalWeight, 0),
    components: valid.map((component) => ({
      ...component,
      normalizedWeight: component.weight / totalWeight
    }))
  };
}

function growthEvSalesMultiple(settings, growthPct, grossMarginPct, fcfMarginPct) {
  const [minMultiple, maxMultiple] = settings.evSalesRange || [2, 10];
  const grossMargin = finiteNumber(grossMarginPct) ?? finiteNumber(settings.defaultGrossMarginPct) ?? 55;
  const fcfMargin = finiteNumber(fcfMarginPct) ?? 0;
  const base = settings.evSalesBase || 4;
  const multiple = base +
    growthPct * (settings.evSalesGrowthCoefficient ?? 0.12) +
    (grossMargin - 55) * (settings.evSalesGrossMarginCoefficient ?? 0.055) +
    Math.max(-10, Math.min(35, fcfMargin)) * (settings.evSalesFcfMarginCoefficient ?? 0.045);
  return clamp(multiple, minMultiple, maxMultiple);
}

function buildMultiMethodGrowthModel({ row, ttm, settings, youtubeEvidence }) {
  const sharesM = finiteNumber(ttm.shares_m);
  const ttmRevenue = finiteNumber(ttm.revenue_m);
  if (!(sharesM > 0) || !(ttmRevenue > 0)) return null;

  const growthPct = normalizedGrowthPct(row, youtubeEvidence, settings);
  const formulaForwardScale = forwardScaleFromGrowth(growthPct, settings);
  const revenueGuidanceM = plausibleGuidanceAmount(
    youtubeEvidence?.revenueGuidanceM,
    ttmRevenue,
    0.65,
    settings.guidanceRevenueMaxScale || Math.max(1.5, settings.forwardScaleCap || 2.1)
  );
  const valuationRevenue = revenueGuidanceM || ttmRevenue * formulaForwardScale;
  const forwardScale = valuationRevenue / ttmRevenue;
  const grossMarginPct = finiteNumber(ttm.gross_margin_pct ?? row.gross_margin_pct) ?? finiteNumber(settings.defaultGrossMarginPct);
  const baseNormalizedMargin = normalizedMarginRatio(ttm, settings);
  const guidanceOperatingIncomeM = plausibleGuidanceAmount(youtubeEvidence?.operatingIncomeGuidanceM, valuationRevenue, 0.05, 0.85);
  const guidanceOperatingMargin = guidanceOperatingIncomeM && valuationRevenue
    ? guidanceOperatingIncomeM / valuationRevenue * (settings.guidanceOperatingMarginHaircut || 0.85)
    : null;
  const normalizedMargin = guidanceOperatingMargin
    ? clamp(Math.max(baseNormalizedMargin, guidanceOperatingMargin), baseNormalizedMargin * 0.85, Math.max(baseNormalizedMargin * 1.55, baseNormalizedMargin + 0.08))
    : baseNormalizedMargin;
  const taxRate = 0.19;
  const normalizedNetIncome = Math.max(
    finiteNumber(ttm.net_income_m) ?? -Infinity,
    valuationRevenue * normalizedMargin * (1 - taxRate)
  );
  const pe = adjustedPe(settings, growthPct, ttm.operating_margin_pct);
  const fcfYield = adjustedFcfYield(settings, growthPct, ttm.fcf_margin_pct);
  const evSales = growthEvSalesMultiple(settings, growthPct, grossMarginPct, ttm.fcf_margin_pct);
  const cycleHaircut = settings.cycleHaircut || 1;
  const optionalityMultiplier = settings.optionalityMultiplier || 1;
  const netCash = netCashM(ttm);
  const salesValue = Math.max(0, valuationRevenue * evSales + netCash) / sharesM * cycleHaircut;
  const earningsValue = normalizedNetIncome > 0 ? normalizedNetIncome / sharesM * pe * cycleHaircut : null;
  const ttmFcf = finiteNumber(ttm.fcf_after_capex_m);
  const fcfGuidanceM = plausibleGuidanceAmount(youtubeEvidence?.fcfGuidanceM, valuationRevenue, 0.03, 0.85);
  const valuationFcf = fcfGuidanceM || (ttmFcf && ttmFcf > 0 ? forwardMetric(ttmFcf, Math.min(forwardScale, settings.forwardFcfScaleCap || 1.65)) : null);
  const fcfValue = valuationFcf && valuationFcf > 0 ? (valuationFcf / fcfYield) / sharesM * cycleHaircut : null;
  const blended = blendValuationComponents([
    { key: "ev-sales-equity-value", value: salesValue, weight: settings.salesWeight ?? 0.4 },
    { key: "normalized-earnings-power", value: earningsValue, weight: settings.earningsWeight ?? 0.3 },
    { key: "ttm-fcf-yield", value: fcfValue, weight: settings.fcfWeight ?? 0.3 }
  ]);
  if (!(blended.fairValue > 0)) return null;
  const fairValue = blended.fairValue * optionalityMultiplier;
  const longRunGrowth = clamp(0.035 + growthPct / 100 * 0.26 + Math.max(0, normalizedMargin) * 0.08, 0.025, 0.14);
  const componentWeight = (key) => blended.components.find((component) => component.key === key)?.normalizedWeight || 0;
  return {
    fairValue,
    targetPrice3Y: fairValue * (1 + longRunGrowth) ** 3,
    method: settings.method,
    longRunGrowth,
    methodOutputs: [
      {
        key: "ev-sales-equity-value",
        label: "EV/sales equity value",
        value: salesValue,
        format: "currency",
        description: `${revenueGuidanceM ? "FY guidance" : settings.forwardRevenueYears ? "Forward" : "TTM"} revenue x ${evSales.toFixed(1)}x EV/sales plus ${netCash >= 0 ? "net cash" : "net debt"} bridge, divided by shares.`
      },
      {
        key: "normalized-earnings-power",
        label: "Normalized earnings power",
        value: earningsValue,
        format: "currency",
        description: earningsValue
          ? `${revenueGuidanceM ? "FY guidance" : settings.forwardRevenueYears ? "Forward" : "TTM"} revenue x ${(normalizedMargin * 100).toFixed(1)}% normalized margin x after-tax conversion / shares x ${pe.toFixed(1)}x P/E.`
          : "Normalized earnings were not usable, so the row relies on sales and/or FCF value."
      },
      {
        key: "ttm-fcf-yield",
        label: "TTM FCF yield value",
        value: fcfValue,
        format: "currency",
        description: fcfValue
          ? `${fcfGuidanceM ? "FY guidance" : settings.forwardRevenueYears ? "Forward-scaled" : "TTM"} FCF per share / ${(fcfYield * 100).toFixed(1)}% target FCF yield.`
          : "FCF was unavailable or negative."
      },
      {
        key: "method-weighting",
        label: "Method weighting",
        value: componentWeight("ev-sales-equity-value") * 100,
        format: "percent",
        description: `${Math.round(componentWeight("ev-sales-equity-value") * 100)}% EV/sales / ${Math.round(componentWeight("normalized-earnings-power") * 100)}% earnings / ${Math.round(componentWeight("ttm-fcf-yield") * 100)}% FCF based on usable inputs.`
      }
    ],
    scoreInputs: {
      profile: settings.profile,
      ttmRevenue,
      valuationRevenue,
      forwardScale,
      formulaForwardScale,
      forwardRevenueYears: settings.forwardRevenueYears || 0,
      revenueGuidanceM,
      ttmNetIncome: finiteNumber(ttm.net_income_m),
      normalizedNetIncome,
      ttmFreeCashFlow: ttmFcf,
      valuationFreeCashFlow: valuationFcf,
      fcfGuidanceM,
      guidanceOperatingIncomeM,
      guidanceOperatingMargin: guidanceOperatingMargin != null ? guidanceOperatingMargin * 100 : null,
      revenueGrowth: growthPct,
      grossMargin: grossMarginPct,
      operatingMargin: ttm.operating_margin_pct,
      normalizedMargin: normalizedMargin * 100,
      evSalesMultiple: evSales,
      targetPE: pe,
      targetFCFYield: fcfYield,
      netCashM: netCash,
      cashM: finiteNumber(ttm.cash_m),
      debtM: finiteNumber(ttm.debt_m),
      cycleHaircut,
      optionalityMultiplier,
      methodWeights: Object.fromEntries(blended.components.map((component) => [component.key, component.normalizedWeight])),
      sharesM
    },
    formula: `${Math.round(componentWeight("ev-sales-equity-value") * 100)}% EV/sales + ${Math.round(componentWeight("normalized-earnings-power") * 100)}% normalized earnings + ${Math.round(componentWeight("ttm-fcf-yield") * 100)}% FCF yield${optionalityMultiplier !== 1 ? `, then x${optionalityMultiplier.toFixed(2)} platform optionality` : ""}; no market price input`
  };
}

function buildFinancialInstitutionModel({ ticker, row, ttm, settings }) {
  const sharesM = finiteNumber(ttm.shares_m);
  const equityM = finiteNumber(row.equity_m) ?? finiteNumber(ttm.equity_m);
  const netIncomeM = finiteNumber(ttm.net_income_m);
  if (!(sharesM > 0) || !(equityM > 0) || !(netIncomeM > 0)) return null;
  const roe = netIncomeM / equityM;
  const bvps = equityM / sharesM;
  const costOfEquity = settings.costOfEquity || 0.1;
  const terminalGrowth = settings.terminalGrowth || 0.025;
  const pbRaw = (roe - terminalGrowth) / Math.max(0.01, costOfEquity - terminalGrowth);
  const pb = clamp(pbRaw, settings.pbRange[0], settings.pbRange[1]);
  const pe = clamp(settings.peBase + (roe - 0.11) * 18, settings.peRange[0], settings.peRange[1]);
  const epsValue = netIncomeM / sharesM * pe;
  const bookValue = bvps * pb;
  const bookWeight = clamp(settings.bookWeight ?? 0.68, 0, 1);
  const epsWeight = settings.epsWeight != null
    ? clamp(settings.epsWeight, 0, 1)
    : 1 - bookWeight;
  const totalWeight = bookWeight + epsWeight || 1;
  const fairValue = (bookValue * bookWeight + epsValue * epsWeight) / totalWeight;
  const longRunGrowth = clamp(terminalGrowth + Math.max(-0.03, Math.min(0.08, roe - costOfEquity)) * 0.35, 0.015, 0.07);
  return {
    fairValue,
    targetPrice3Y: fairValue * (1 + longRunGrowth) ** 3,
    method: settings.method,
    longRunGrowth,
    methodOutputs: [
      {
        key: "roe-implied-book-value",
        label: "ROE-implied P/B value",
        value: bookValue,
        format: "currency",
        description: `Book value per share x ${pb.toFixed(2)}x implied P/B from ${(roe * 100).toFixed(1)}% ROE and ${(costOfEquity * 100).toFixed(1)}% cost of equity.`
      },
      {
        key: "eps-cross-check",
        label: "EPS cross-check",
        value: epsValue,
        format: "currency",
        description: `TTM EPS x ${pe.toFixed(1)}x normalized P/E.`
      },
      {
        key: "financial-method-weighting",
        label: "Method weighting",
        value: bookWeight / totalWeight * 100,
        format: "percent",
        description: `${Math.round(bookWeight / totalWeight * 100)}% ROE-implied book value / ${Math.round(epsWeight / totalWeight * 100)}% EPS power.`
      },
      {
        key: "reported-equity",
        label: "Reported equity",
        value: equityM,
        format: "number",
        description: "SEC reported shareholders' equity, in USD millions."
      }
    ],
    scoreInputs: {
      profile: settings.profile,
      ttmNetIncome: netIncomeM,
      equityM,
      sharesM,
      roe,
      targetPB: pb,
      targetPE: pe,
      costOfEquity,
      terminalGrowth
    },
    formula: `${Math.round(bookWeight / totalWeight * 100)}% ROE-implied book value + ${Math.round(epsWeight / totalWeight * 100)}% EPS cross-check; no market price input`
  };
}

function buildRevenueStageModel({ row, ttm, settings, youtubeEvidence }) {
  const sharesM = finiteNumber(ttm.shares_m);
  const ttmRevenue = finiteNumber(ttm.revenue_m);
  if (!(sharesM > 0) || !(ttmRevenue > 0)) return null;
  const growthPct = normalizedGrowthPct(row, youtubeEvidence, settings);
  const forwardScale = forwardScaleFromGrowth(growthPct, settings);
  const valuationRevenue = ttmRevenue * forwardScale;
  const grossMarginPct = finiteNumber(ttm.gross_margin_pct ?? row.gross_margin_pct) ?? finiteNumber(settings.defaultGrossMarginPct);
  const evSales = adjustedEvSales(settings, growthPct, grossMarginPct);
  const cashM = finiteNumber(ttm.cash_m) || 0;
  const debtM = finiteNumber(ttm.debt_m) || 0;
  const enterpriseValueM = valuationRevenue * evSales;
  const equityValueM = Math.max(0, enterpriseValueM + cashM - debtM);
  const fairValue = equityValueM / sharesM;
  const [minGrowth, maxGrowth] = settings.longRunGrowthRange || [0.0, 0.1];
  const longRunGrowth = clamp(0.02 + growthPct / 100 * 0.18, minGrowth, maxGrowth);
  return {
    fairValue,
    targetPrice3Y: fairValue * (1 + longRunGrowth) ** 3,
    method: settings.method,
    longRunGrowth,
    methodOutputs: [
      {
        key: "revenue-stage-enterprise-value",
        label: "Revenue-stage enterprise value",
        value: enterpriseValueM,
        format: "number",
        description: `${settings.forwardRevenueYears ? "Forward" : "TTM"} revenue x ${evSales.toFixed(1)}x EV/sales, based on revenue growth and gross-margin quality.`
      },
      {
        key: "net-cash-bridge",
        label: "Net cash bridge",
        value: cashM - debtM,
        format: "number",
        description: "Reported cash less debt, added to enterprise value before dividing by shares."
      }
    ],
    scoreInputs: {
      profile: settings.profile,
      ttmRevenue,
      valuationRevenue,
      forwardScale,
      forwardRevenueYears: settings.forwardRevenueYears || 0,
      revenueGrowth: growthPct,
      grossMargin: grossMarginPct,
      evSalesMultiple: evSales,
      cashM,
      debtM,
      sharesM
    },
    formula: "TTM revenue x EV/sales + net cash, divided by shares; no market price input"
  };
}

function buildBitcoinTreasuryModel({ row, ttm, settings }) {
  const sharesM = finiteNumber(ttm.shares_m);
  const cryptoFairValueM = finiteNumber(row.crypto_asset_fair_value_m) ?? finiteNumber(ttm.crypto_asset_fair_value_m);
  const cryptoCostM = finiteNumber(row.crypto_asset_cost_m) ?? finiteNumber(ttm.crypto_asset_cost_m);
  const cryptoUnits = finiteNumber(row.crypto_asset_units) ?? finiteNumber(ttm.crypto_asset_units);
  if (!(sharesM > 0) || !(cryptoFairValueM > 0)) return null;

  const ttmRevenue = finiteNumber(ttm.revenue_m);
  const cashM = finiteNumber(ttm.cash_m) || 0;
  const debtM = finiteNumber(ttm.debt_m) || 0;
  const softwareRevenueMultiple = settings.softwareRevenueMultiple || 2.2;
  const treasuryHaircut = settings.treasuryHaircut || 0.98;
  const softwareValueM = ttmRevenue && ttmRevenue > 0 ? ttmRevenue * softwareRevenueMultiple : 0;
  const treasuryValueM = cryptoFairValueM * treasuryHaircut;
  const netCashMValue = cashM - debtM;
  const equityValueM = treasuryValueM + softwareValueM + netCashMValue;
  const fairValue = equityValueM / sharesM;
  if (!(fairValue > 0)) return null;

  const btcPerShare = cryptoUnits && sharesM ? cryptoUnits / (sharesM * 1_000_000) : null;
  const impliedBtcPrice = cryptoUnits && cryptoUnits > 0 ? cryptoFairValueM * 1_000_000 / cryptoUnits : null;
  const longRunGrowth = settings.longRunGrowth || 0.08;
  return {
    fairValue,
    targetPrice3Y: fairValue * (1 + longRunGrowth) ** 3,
    method: settings.method,
    longRunGrowth,
    methodOutputs: [
      {
        key: "btc-treasury-nav",
        label: "BTC treasury NAV",
        value: treasuryValueM / sharesM,
        format: "currency",
        description: `SEC reported crypto asset fair value x ${(treasuryHaircut * 100).toFixed(0)}% treasury haircut, divided by diluted shares.`
      },
      {
        key: "software-business-value",
        label: "Software business value",
        value: softwareValueM / sharesM,
        format: "currency",
        description: `${ttmRevenue ? "TTM" : "Reported"} software revenue x ${softwareRevenueMultiple.toFixed(1)}x EV/sales.`
      },
      {
        key: "net-cash-debt-bridge",
        label: "Net cash / debt bridge",
        value: netCashMValue / sharesM,
        format: "currency",
        description: "Reported cash less debt, divided by diluted shares."
      },
      {
        key: "btc-per-share",
        label: "BTC per share",
        value: btcPerShare,
        format: "number",
        description: "Reported BTC units divided by diluted share count."
      }
    ],
    scoreInputs: {
      profile: settings.profile,
      cryptoFairValueM,
      cryptoCostM,
      cryptoUnits,
      impliedBtcPrice,
      btcPerShare,
      ttmRevenue,
      softwareRevenueMultiple,
      softwareValueM,
      treasuryHaircut,
      treasuryValueM,
      cashM,
      debtM,
      netCashM: netCashMValue,
      sharesM
    },
    formula: "SEC reported BTC fair value x treasury haircut + software EV/sales value + cash - debt, divided by shares; no market price input"
  };
}

function buildOperatingCompanyModel({ ticker, row, ttm, settings, youtubeEvidence }) {
  const sharesM = finiteNumber(ttm.shares_m);
  const ttmRevenue = finiteNumber(ttm.revenue_m);
  const ttmNetIncome = finiteNumber(ttm.net_income_m);
  if (!(sharesM > 0) || !(ttmRevenue > 0)) return null;
  if (settings.profile === "bitcoin_treasury_software") {
    return buildBitcoinTreasuryModel({ row, ttm, settings });
  }
  if (["emerging_biotech", "emerging_health_ai"].includes(settings.profile)) {
    return buildRevenueStageModel({ row, ttm, settings, youtubeEvidence });
  }
  if ([
    "software_growth",
    "hypergrowth_ai_software",
    "defense_growth",
    "space_launch_growth",
    "space_platform_ipo",
    "genetic_diagnostics_growth",
    "semiconductor_growth",
    "energy_technology",
    "ev_autonomy_platform",
    "platform_marketplace_reinvestment"
  ].includes(settings.profile)) {
    return buildMultiMethodGrowthModel({ row, ttm, settings, youtubeEvidence });
  }

  const growthPct = normalizedGrowthPct(row, youtubeEvidence, settings);
  const forwardScale = forwardScaleFromGrowth(growthPct, settings);
  const valuationRevenue = ttmRevenue * forwardScale;
  const normalizedMargin = normalizedMarginRatio(ttm, settings);
  const taxRate = 0.19;
  const guidanceVisible = forwardGuidanceVisibleForRow(row, settings);
  const adjustedEpsGuidance = guidanceVisible ? finiteNumber(settings.adjustedEpsGuidance) : null;
  const guidedAdjustedNetIncome = adjustedEpsGuidance && sharesM > 0
    ? adjustedEpsGuidance * sharesM
    : null;
  const marginBasedNetIncome = valuationRevenue * normalizedMargin * (1 - taxRate);
  const normalizedNetIncome = Math.max(
    finiteNumber(ttmNetIncome) ?? -Infinity,
    marginBasedNetIncome,
    finiteNumber(guidedAdjustedNetIncome) ?? -Infinity
  );
  const usesAdjustedEpsGuidance = guidedAdjustedNetIncome != null && Math.abs(normalizedNetIncome - guidedAdjustedNetIncome) < 0.01;
  if (!(normalizedNetIncome > 0)) return null;
  const pe = adjustedPe(settings, growthPct, ttm.operating_margin_pct);
  const fcfYield = adjustedFcfYield(settings, growthPct, ttm.fcf_margin_pct);
  const cycleHaircut = settings.cycleHaircut || 1;
  const earningsValue = normalizedNetIncome / sharesM * pe * cycleHaircut;
  const fcf = valuationFreeCashFlow(ttm, settings);
  const ttmFcf = fcf.reportedFcf;
  const fcfBase = fcf.usesOwnerEarnings ? fcf.normalizedFcf : ttmFcf;
  const valuationFcf = fcfBase && fcfBase > 0 ? forwardMetric(fcfBase, Math.min(forwardScale, settings.forwardFcfScaleCap || 1.65)) : null;
  const fcfValue = valuationFcf && valuationFcf > 0 ? (valuationFcf / fcfYield) / sharesM * cycleHaircut : null;
  const fcfWeight = fcfValue ? (settings.fcfWeight ?? 0.35) : 0;
  const optionalityMultiplier = settings.optionalityMultiplier || 1;
  const fairValue = (earningsValue * (1 - fcfWeight) + (fcfValue || 0) * fcfWeight) * optionalityMultiplier;
  const longRunGrowth = clamp(0.035 + growthPct / 100 * 0.3 + normalizedMargin * 0.08, 0.025, 0.14);
  return {
    fairValue,
    targetPrice3Y: fairValue * (1 + longRunGrowth) ** 3,
    method: usesAdjustedEpsGuidance ? settings.method : (settings.historicalMethod || settings.method),
    longRunGrowth,
    methodOutputs: [
      {
        key: "normalized-earnings-power",
        label: usesAdjustedEpsGuidance ? "Adjusted EPS power" : "Normalized earnings power",
        value: earningsValue,
        format: "currency",
        description: usesAdjustedEpsGuidance
          ? `${settings.adjustedEpsGuidanceYear || "Forward"} adjusted EPS guidance midpoint $${adjustedEpsGuidance.toFixed(2)} x ${pe.toFixed(1)}x P/E.`
          : `${settings.forwardRevenueYears ? "Forward" : "TTM"} revenue x ${(normalizedMargin * 100).toFixed(1)}% normalized margin x after-tax conversion / shares x ${pe.toFixed(1)}x P/E.`
      },
      {
        key: "ttm-fcf-yield",
        label: fcf.usesOwnerEarnings ? "Owner earnings FCF value" : "TTM FCF yield value",
        value: fcfValue,
        format: "currency",
        description: fcfValue
          ? `${settings.forwardRevenueYears ? "Forward-scaled" : "TTM"} ${fcf.usesOwnerEarnings ? "owner earnings FCF" : "FCF"} per share / ${(fcfYield * 100).toFixed(1)}% target FCF yield.`
          : "FCF was unavailable or negative, so earnings power carries the row."
      },
      ...(fcf.usesOwnerEarnings ? [{
        key: "growth-capex-normalization",
        label: "Growth capex normalization",
        value: fcf.growthCapexM,
        format: "number",
        description: `Reported capex intensity ${formatPct(fcf.capexIntensityPct)}; model treats ${(settings.maintenanceCapexIntensityPct * 100).toFixed(1)}% of revenue as maintenance capex and the excess as AI/growth reinvestment.`
      }] : []),
      {
        key: "growth-margin-inputs",
        label: "Growth / margin input",
        value: growthPct,
        format: "percent",
        description: `Revenue growth input ${growthPct.toFixed(1)}%, TTM operating margin ${formatPct(ttm.operating_margin_pct)}.`
      },
      ...(guidanceVisible && settings.projectBacklogM ? [{
        key: "contracted-project-backlog",
        label: "Contracted project backlog",
        value: settings.projectBacklogM,
        format: "number",
        description: settings.saleOfGasBacklogM
          ? `$${(settings.projectBacklogM / 1000).toFixed(1)}B project backlog, including $${(settings.saleOfGasBacklogM / 1000).toFixed(1)}B sale-of-gas backlog. Growth capex is not treated like ordinary maintenance capex.`
          : `$${(settings.projectBacklogM / 1000).toFixed(1)}B project backlog. Growth capex is not treated like ordinary maintenance capex.`
      }] : []),
      ...(optionalityMultiplier !== 1 ? [{
        key: "platform-optionality",
        label: "Platform optionality",
        value: optionalityMultiplier,
        format: "multiple",
        description: "Explicit buy-side option value for businesses where current earnings do not fully reflect storage/autonomy/platform reinvestment."
      }] : [])
    ],
    scoreInputs: {
      profile: settings.profile,
      ttmRevenue,
      valuationRevenue,
      forwardScale,
      forwardRevenueYears: settings.forwardRevenueYears || 0,
      ttmNetIncome,
      forwardGuidanceVisible: guidanceVisible,
      adjustedEpsGuidance,
      adjustedEpsGuidanceRange: settings.adjustedEpsGuidanceRange || null,
      adjustedEpsGuidanceYear: settings.adjustedEpsGuidanceYear || null,
      adjustedEpsGuidanceVisibleFrom: settings.adjustedEpsGuidanceVisibleFrom || null,
      guidedAdjustedNetIncome,
      marginBasedNetIncome,
      normalizedNetIncome,
      ttmFreeCashFlow: ttmFcf,
      valuationFreeCashFlow: valuationFcf,
      normalizedFreeCashFlow: fcf.normalizedFcf,
      maintenanceCapexM: fcf.maintenanceCapexM,
      growthCapexM: fcf.growthCapexM,
      capexIntensity: fcf.capexIntensityPct,
      revenueGrowth: growthPct,
      operatingMargin: ttm.operating_margin_pct,
      normalizedMargin: normalizedMargin * 100,
      targetPE: pe,
      targetFCFYield: fcfYield,
      adjustedOperatingMargin: guidanceVisible ? settings.adjustedOperatingMarginPct : null,
      adjustedAfterTaxRoc: guidanceVisible ? settings.adjustedAfterTaxRocPct : null,
      projectBacklogM: guidanceVisible ? settings.projectBacklogM : null,
      saleOfGasBacklogM: guidanceVisible ? settings.saleOfGasBacklogM : null,
      cycleHaircut,
      optionalityMultiplier,
      sharesM
    },
    formula: `${Math.round((1 - fcfWeight) * 100)}% ${usesAdjustedEpsGuidance ? "adjusted EPS guidance power" : "normalized earnings power"} + ${Math.round(fcfWeight * 100)}% FCF yield value${optionalityMultiplier !== 1 ? `, then x${optionalityMultiplier.toFixed(2)} platform optionality` : ""}; no market price input`
  };
}

function buildBuySideValuationModel({ ticker, row, ttm, youtubeEvidence }) {
  const settings = profileSettings(ticker);
  if (["bank", "insurance", "card_network_lender"].includes(settings.profile)) {
    return buildFinancialInstitutionModel({ ticker, row, ttm, settings });
  }
  return buildOperatingCompanyModel({ ticker, row, ttm, settings, youtubeEvidence });
}

function splitAdjustmentFactors(rows) {
  const factors = Array(rows.length).fill(1);
  let factor = 1;
  for (let index = rows.length - 2; index >= 0; index -= 1) {
    const currentShares = finiteNumber(rows[index]?.dataSnapshot?.valuationSemantics?.scoreInputs?.sharesM);
    const nextShares = finiteNumber(rows[index + 1]?.dataSnapshot?.valuationSemantics?.scoreInputs?.sharesM);
    if (currentShares > 0 && nextShares > 0) {
      const ratio = nextShares / currentShares;
      if (ratio > 1.5 || ratio < 0.67) {
        factor *= currentShares / nextShares;
      }
    }
    factors[index] = factor;
  }
  return factors;
}

function applySplitBasisAdjustments(rows) {
  const factors = splitAdjustmentFactors(rows);
  return rows.map((row, index) => {
    const factor = factors[index];
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.0001) return row;
    const adjustedFairValue = row.fairValue * factor;
    const adjustedTarget = row.targetPrice3Y * factor;
    const priceAtDate = finiteNumber(row.priceAtDate);
    return {
      ...row,
      fairValue: adjustedFairValue,
      upsideDownside: priceAtDate && priceAtDate > 0 ? adjustedFairValue / priceAtDate - 1 : row.upsideDownside,
      targetPrice3Y: adjustedTarget,
      expectedReturn3Y: priceAtDate && priceAtDate > 0 ? (adjustedTarget / priceAtDate) ** (1 / 3) - 1 : row.expectedReturn3Y,
      methodOutputs: (row.methodOutputs || []).map((output) => output.format === "currency" && finiteNumber(output.value) != null
        ? { ...output, value: output.value * factor }
        : output),
      dataSnapshot: {
        ...(row.dataSnapshot || {}),
        valuationSemantics: {
          ...(row.dataSnapshot?.valuationSemantics || {}),
          shareBasisAdjustmentFactor: factor,
          fairValueFormula: `${row.dataSnapshot?.valuationSemantics?.fairValueFormula || "fundamental model"}; historical fair value adjusted to split-adjusted price basis`
        }
      },
      warnings: [
        ...(row.warnings || []),
        `Applied ${factor.toFixed(4)} split/share-basis adjustment so fair value matches the adjusted price series.`
      ]
    };
  });
}

function buildValuationRows({ ticker, trinityTicker, snapshot, companyModel, factsUrl, quarterlyRows, youtubeByPeriod }) {
  const fallbackSharesM = finiteNumber(companyModel?.diluted_or_outstanding_shares_m);
  const priceHistory = Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [];
  const minDate = priceHistory[0]?.date || OUTPUT_START_DATE;
  const rows = [];

  quarterlyRows.forEach((row, index) => {
    if (String(row.asOfDate).localeCompare(minDate) < 0 || String(row.asOfDate).localeCompare(OUTPUT_START_DATE) < 0) return;
    const settings = profileSettings(ticker);
    const isRevenueStage = ["emerging_biotech", "emerging_health_ai"].includes(settings.profile);
    const allowsLossMakingStage = isRevenueStage || Boolean(settings.allowLossMakingStage);
    const rowAnnualizationFactor = row.fiscalQuarter === "Q4" && ["10-K", "20-F", "40-F"].includes(row.sources?.revenue_m?.form)
      ? 1
      : 4;
    const annualOnlyFinancialRow = isAnnualOnlyFinancialRow(row);
    const ttmRevenue = trailingOrAnnualValue(quarterlyRows, index, "revenue_m", rowAnnualizationFactor);
    const ttmGrossProfit = trailingOrAnnualValue(quarterlyRows, index, "gross_profit_m", rowAnnualizationFactor);
    const ttmOperatingIncome = trailingOrAnnualValue(quarterlyRows, index, "operating_income_m", rowAnnualizationFactor);
    const ttmNetIncome = trailingOrAnnualValue(quarterlyRows, index, "net_income_m", rowAnnualizationFactor);
    const ttmCfo = trailingOrAnnualValue(quarterlyRows, index, "cfo_m", rowAnnualizationFactor);
    const ttmCapex = trailingOrAnnualValue(quarterlyRows, index, "capex_m", rowAnnualizationFactor);
    const ttmFcf = ttmCfo != null && ttmCapex != null ? ttmCfo - ttmCapex : null;
    const ttmEquity = latestKnownValue(quarterlyRows, index, "equity_m");
    const ttmAssets = latestKnownValue(quarterlyRows, index, "assets_m");
    const ttmCash = latestKnownValue(quarterlyRows, index, "cash_m");
    const ttmDebt = latestKnownValue(quarterlyRows, index, "debt_m");
    const ttmCryptoFairValue = latestKnownValue(quarterlyRows, index, "crypto_asset_fair_value_m");
    const ttmCryptoCost = latestKnownValue(quarterlyRows, index, "crypto_asset_cost_m");
    const ttmCryptoUnits = latestKnownValue(quarterlyRows, index, "crypto_asset_units");
    if (!allowsLossMakingStage && !(ttmNetIncome > 0)) return;
    const shareOverride = SHARE_COUNT_OVERRIDES[ticker];
    const sharesM = finiteNumber(row.shares_m) ??
      latestKnownValueWithin(quarterlyRows, index, "shares_m", 8) ??
      fallbackSharesM ??
      finiteNumber(shareOverride?.sharesM);
    if (!(sharesM > 0)) return;

    const ttm = {
      revenue_m: ttmRevenue,
      gross_profit_m: ttmGrossProfit,
      operating_income_m: ttmOperatingIncome,
      net_income_m: ttmNetIncome,
      cfo_m: ttmCfo,
      capex_m: ttmCapex,
      shares_m: sharesM,
      equity_m: ttmEquity,
      assets_m: ttmAssets,
      cash_m: ttmCash,
      debt_m: ttmDebt,
      crypto_asset_fair_value_m: ttmCryptoFairValue,
      crypto_asset_cost_m: ttmCryptoCost,
      crypto_asset_units: ttmCryptoUnits,
      fcf_after_capex_m: ttmFcf,
      gross_margin_pct: margin(ttmGrossProfit, ttmRevenue),
      operating_margin_pct: margin(ttmOperatingIncome, ttmRevenue),
      net_margin_pct: margin(ttmNetIncome, ttmRevenue),
      fcf_margin_pct: margin(ttmFcf, ttmRevenue),
      capex_intensity_pct: margin(ttmCapex, ttmRevenue)
    };
    const normalizedRevenueGrowthPct = normalizedRevenueGrowthForRows(quarterlyRows, index, settings.normalizedGrowthWindow);
    const pricePoint = pricePointAtOrBefore(priceHistory, row.asOfDate);
    const priceAtDate = finiteNumber(pricePoint?.close);
    const youtubeEvidence = youtubeByPeriod.get(`${ticker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      youtubeByPeriod.get(`${trinityTicker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      null;
    const modelRow = normalizedRevenueGrowthPct == null
      ? row
      : { ...row, normalized_revenue_growth_pct: normalizedRevenueGrowthPct };
    const model = buildBuySideValuationModel({ ticker, row: modelRow, ttm, youtubeEvidence });
    if (!model || !(model.fairValue > 0)) return;
    const fairValue = model.fairValue;
    const targetPrice3Y = model.targetPrice3Y;

    rows.push({
      periodId: `sec-companyfacts-${ticker.toLowerCase()}-fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}`,
      runCreatedAt: new Date().toISOString(),
      label: row.label,
      asOfDate: row.asOfDate,
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      eventType: "sec_quarterly_fundamental_model",
      sourceType: annualOnlyFinancialRow ? "sec_companyfacts_annual_model" : "sec_companyfacts_quarterly_model",
      sourceUrl: factsUrl,
      currentPrice: priceAtDate,
      fairValue,
      upsideDownside: priceAtDate && priceAtDate > 0 ? fairValue / priceAtDate - 1 : null,
      targetPrice3Y,
      expectedReturn3Y: priceAtDate && priceAtDate > 0 ? (targetPrice3Y / priceAtDate) ** (1 / 3) - 1 : null,
      method: `Buy-side ${settings.label}: ${model.method}`,
      methodOutputs: model.methodOutputs,
      warnings: [],
      priceDate: pricePoint?.date || row.asOfDate,
      priceAtDate,
      dataSnapshot: {
        sourceType: annualOnlyFinancialRow ? "sec_companyfacts_annual_model" : "sec_companyfacts_quarterly_model",
        sourceQuality: annualOnlyFinancialRow ? "sec-companyfacts-annual-financials" : "sec-companyfacts-quarterly-financials",
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
        latestAnnualizedRevenue: row.revenue_m != null ? row.revenue_m * rowAnnualizationFactor : null,
        latestAnnualizedOperatingIncome: row.operating_income_m != null ? row.operating_income_m * rowAnnualizationFactor : null,
        fiscalFinancials: {
          revenue_m: row.revenue_m,
          revenue_growth_pct: row.revenue_growth_pct,
          normalized_revenue_growth_pct: normalizedRevenueGrowthPct,
          gross_profit_m: row.gross_profit_m,
          gross_margin_pct: row.gross_margin_pct,
          operating_income_m: row.operating_income_m,
          operating_margin_pct: row.operating_margin_pct,
          net_income_m: row.net_income_m,
          cfo_m: row.cfo_m,
          capex_m: row.capex_m,
          shares_m: row.shares_m,
          equity_m: row.equity_m,
          assets_m: row.assets_m,
          cash_m: row.cash_m,
          debt_m: row.debt_m,
          crypto_asset_fair_value_m: row.crypto_asset_fair_value_m,
          crypto_asset_cost_m: row.crypto_asset_cost_m,
          crypto_asset_units: row.crypto_asset_units,
          fcf_after_capex_m: row.fcf_after_capex_m
        },
        trailingTwelveMonths: ttm,
        annualizedFromSinglePeriod: annualOnlyFinancialRow
          ? 1
          : trailingSum(quarterlyRows, index, "revenue_m") == null ? rowAnnualizationFactor : null,
        asOfAssumptionOverrideKeys: [
          ...Object.keys(model.scoreInputs || {})
        ],
        asOfPriceSource: pricePoint ? {
          priceDate: pricePoint.date,
          source: pricePoint.source || "local daily close fallback"
        } : null,
        valuationSemantics: {
          sourceType: annualOnlyFinancialRow ? "sec_companyfacts_annual_model" : "sec_companyfacts_quarterly_model",
          priceExcludedFromFairValue: true,
          fairValueFormula: model.formula,
          scoreInputs: model.scoreInputs
        },
        secCompanyFacts: {
          cik: companyModel.cik,
          company: companyModel.company || snapshot.name || ticker,
          url: factsUrl,
          periodEndDate: row.periodEndDate,
          sourceTags: row.sources,
          shareCountOverride: shareOverride || null
        },
        youtubeEarnings: youtubeEvidence
      }
    });
  });

  return applySplitBasisAdjustments(rows);
}

function parseTrinityPeriod(period, fallbackDate = null) {
  const text = String(period || "").toUpperCase();
  const qFirst = text.match(/Q([1-4])\s*(?:FY)?\s*(20\d{2})/);
  const fyFirst = text.match(/(?:FY)?\s*(20\d{2})\s*Q([1-4])/);
  const yearOnly = text.match(/\b(20\d{2})\b/);
  if (qFirst) return { fiscalYear: Number(qFirst[2]), fiscalQuarter: `Q${qFirst[1]}` };
  if (fyFirst) return { fiscalYear: Number(fyFirst[1]), fiscalQuarter: `Q${fyFirst[2]}` };
  if (yearOnly) return { fiscalYear: Number(yearOnly[1]), fiscalQuarter: "Q4" };
  if (fallbackDate) {
    const [year, month] = String(fallbackDate).split("-").map(Number);
    if (year && month) return { fiscalYear: year, fiscalQuarter: `Q${Math.max(1, Math.min(4, Math.ceil(month / 3)))}` };
  }
  return null;
}

function trinityAnnualReportDate(year) {
  return `${Number(year) + 1}-03-01`;
}

function metricFromMargin(revenueM, marginPctValue) {
  const revenue = finiteNumber(revenueM);
  const marginValue = finiteNumber(marginPctValue);
  return revenue != null && marginValue != null ? revenue * marginValue / 100 : null;
}

function annualizedTrinityMetric(value, multiplier) {
  const number = finiteNumber(value);
  return number == null ? null : number * multiplier;
}

function trinityAnnualizationMultiplier(row) {
  if (!row || row.sourceKind !== "quarter") return 1;
  const raw = row.raw || {};
  const text = `${raw.period || ""} ${raw.data_note || ""} ${raw.notes || ""} ${raw.data_type || ""}`.toLowerCase();
  if (text.includes("fy2025 total") || text.includes("annual") || text.includes("full year") || /fy20\d{2}\s*\//i.test(String(raw.period || ""))) {
    return 1;
  }
  return 4;
}

function buildTrinityFinancialRows(companyModel) {
  const rows = [];
  for (const annual of companyModel?.annual_financials || []) {
    const parsed = parseTrinityPeriod(annual.period);
    if (!parsed?.fiscalYear) continue;
    rows.push({
      sourceKind: "annual",
      fiscalYear: parsed.fiscalYear,
      fiscalQuarter: "Q4",
      label: `FY${parsed.fiscalYear}`,
      asOfDate: trinityAnnualReportDate(parsed.fiscalYear),
      periodEndDate: `${parsed.fiscalYear}-12-31`,
      sourceUrl: annual.source_url || companyModel.sources?.[0]?.url || null,
      raw: annual
    });
  }

  if (companyModel?.latest_quarter?.revenue_m != null) {
    const latest = companyModel.latest_quarter;
    const parsed = parseTrinityPeriod(latest.period, latest.end_date);
    if (parsed?.fiscalYear && parsed?.fiscalQuarter) {
      rows.push({
        sourceKind: "quarter",
        fiscalYear: parsed.fiscalYear,
        fiscalQuarter: parsed.fiscalQuarter,
        label: `FY${parsed.fiscalYear} ${parsed.fiscalQuarter}`,
        asOfDate: addDays(latest.end_date, 30) || latest.end_date || trinityAnnualReportDate(parsed.fiscalYear),
        periodEndDate: latest.end_date || null,
        sourceUrl: latest.source_url || companyModel.sources?.[0]?.url || null,
        raw: latest
      });
    }
  }

  return rows
    .filter((row) => row.asOfDate && String(row.asOfDate).localeCompare(OUTPUT_START_DATE) >= 0)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
}

function buildTrinityValuationRows({ ticker, trinityTicker, snapshot, companyModel, youtubeByPeriod }) {
  const priceHistory = Array.isArray(snapshot.priceHistory) ? snapshot.priceHistory : [];
  const sharesM = finiteNumber(companyModel?.diluted_or_outstanding_shares_m);
  if (!(sharesM > 0)) return [];
  const settings = profileSettings(ticker);
  const rows = [];

  for (const row of buildTrinityFinancialRows(companyModel)) {
    const multiplier = trinityAnnualizationMultiplier(row);
    const raw = row.raw || {};
    const revenueM = annualizedTrinityMetric(raw.revenue_m, multiplier);
    const grossProfitM = annualizedTrinityMetric(raw.gross_profit_m, multiplier) ??
      metricFromMargin(revenueM, raw.gross_margin_pct);
    const operatingIncomeM = annualizedTrinityMetric(raw.operating_income_m, multiplier) ??
      metricFromMargin(revenueM, raw.operating_margin_pct);
    const netIncomeM = annualizedTrinityMetric(raw.net_income_m, multiplier);
    const cfoM = annualizedTrinityMetric(raw.cfo_m, multiplier);
    const capexM = annualizedTrinityMetric(raw.capex_m, multiplier);
    const fcfM = annualizedTrinityMetric(raw.fcf_after_capex_m, multiplier) ??
      (cfoM != null && capexM != null ? cfoM - capexM : null);
    const ttm = {
      revenue_m: revenueM,
      gross_profit_m: grossProfitM,
      operating_income_m: operatingIncomeM,
      net_income_m: netIncomeM,
      cfo_m: cfoM,
      capex_m: capexM,
      shares_m: sharesM,
      cash_m: annualizedTrinityMetric(raw.cash_m, 1),
      debt_m: annualizedTrinityMetric(raw.debt_m, 1),
      fcf_after_capex_m: fcfM,
      gross_margin_pct: raw.gross_margin_pct ?? margin(grossProfitM, revenueM),
      operating_margin_pct: raw.operating_margin_pct ?? margin(operatingIncomeM, revenueM),
      net_margin_pct: margin(netIncomeM, revenueM),
      fcf_margin_pct: margin(fcfM, revenueM),
      capex_intensity_pct: margin(capexM, revenueM)
    };
    const youtubeEvidence = youtubeByPeriod.get(`${ticker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      youtubeByPeriod.get(`${trinityTicker}::Q${row.fiscalQuarter.replace("Q", "")}${row.fiscalYear}`) ||
      null;
    const model = buildBuySideValuationModel({
      ticker,
      row: {
        ...row,
        revenue_m: revenueM,
        revenue_growth_pct: raw.revenue_growth_pct,
        gross_margin_pct: ttm.gross_margin_pct,
        operating_margin_pct: ttm.operating_margin_pct
      },
      ttm,
      youtubeEvidence
    });
    if (!model || !(model.fairValue > 0)) continue;
    const pricePoint = pricePointAtOrBefore(priceHistory, row.asOfDate);
    const priceAtDate = finiteNumber(pricePoint?.close);
    rows.push({
      periodId: `trinity-financial-${ticker.toLowerCase()}-fy${row.fiscalYear}-${row.fiscalQuarter.toLowerCase()}-${row.sourceKind}`,
      runCreatedAt: new Date().toISOString(),
      label: row.label,
      asOfDate: row.asOfDate,
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      eventType: "trinity_official_financial_model",
      sourceType: "trinity_official_financial_model",
      sourceUrl: row.sourceUrl,
      currentPrice: priceAtDate,
      fairValue: model.fairValue,
      upsideDownside: priceAtDate && priceAtDate > 0 ? model.fairValue / priceAtDate - 1 : null,
      targetPrice3Y: model.targetPrice3Y,
      expectedReturn3Y: priceAtDate && model.targetPrice3Y > 0 ? (model.targetPrice3Y / priceAtDate) ** (1 / 3) - 1 : null,
      method: `Buy-side ${settings.label}: ${model.method}`,
      methodOutputs: model.methodOutputs,
      warnings: row.sourceKind === "quarter"
        ? ["Latest-quarter Trinity row annualizes quarter metrics when full TTM history is unavailable."]
        : [],
      priceDate: pricePoint?.date || row.asOfDate,
      priceAtDate,
      dataSnapshot: {
        sourceType: "trinity_official_financial_model",
        sourceQuality: "ai-trinity-official-ir-financials",
        sourceMaxAsOfDate: row.asOfDate,
        selectedFinancialPeriod: {
          id: `${ticker}-${row.fiscalYear}-${row.fiscalQuarter}-${row.sourceKind}`,
          periodId: row.label,
          asOfDate: row.asOfDate,
          periodEndDate: row.periodEndDate,
          sourceType: row.sourceKind === "annual" ? "AI Trinity annual financials" : "AI Trinity latest-quarter financials",
          url: row.sourceUrl
        },
        financialPeriodCount: 1,
        segmentFinancialCount: 0,
        guidanceCandidateCount: youtubeEvidence?.guidanceMetricCount || 0,
        transcriptCandidateCount: youtubeEvidence?.metricCount || 0,
        latestAnnualizedRevenue: revenueM,
        latestAnnualizedOperatingIncome: operatingIncomeM,
        fiscalFinancials: {
          sourceKind: row.sourceKind,
          revenue_m: raw.revenue_m,
          revenue_growth_pct: raw.revenue_growth_pct,
          gross_profit_m: raw.gross_profit_m,
          gross_margin_pct: raw.gross_margin_pct,
          operating_income_m: raw.operating_income_m,
          operating_margin_pct: raw.operating_margin_pct,
          net_income_m: raw.net_income_m,
          cfo_m: raw.cfo_m,
          capex_m: raw.capex_m,
          shares_m: sharesM,
          cash_m: raw.cash_m,
          debt_m: raw.debt_m,
          fcf_after_capex_m: raw.fcf_after_capex_m
        },
        trailingTwelveMonths: ttm,
        asOfAssumptionOverrideKeys: Object.keys(model.scoreInputs || {}),
        asOfPriceSource: pricePoint ? {
          priceDate: pricePoint.date,
          source: pricePoint.source || "local daily close fallback"
        } : null,
        valuationSemantics: {
          sourceType: "trinity_official_financial_model",
          priceExcludedFromFairValue: true,
          fairValueFormula: model.formula,
          scoreInputs: model.scoreInputs
        },
        trinityModel: {
          sourcePath: TRINITY_MODEL_DIR,
          ticker: trinityTicker,
          company: companyModel.company || snapshot.name || ticker,
          latestReportedPeriod: companyModel.latest_reported_period,
          category: companyModel.category,
          sourceUrl: row.sourceUrl
        },
        youtubeEarnings: youtubeEvidence
      }
    });
  }

  return applySplitBasisAdjustments(rows);
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

function metricText(metric) {
  return `${metric?.metric_name || ""} ${metric?.value_text || ""} ${metric?.excerpt || ""}`.toLowerCase();
}

function metricAmountM(metric) {
  const amount = finiteNumber(metric?.amount);
  if (amount == null) return null;
  const unit = String(metric?.unit || "").toLowerCase();
  const text = metricText(metric);
  if (unit.includes("billion") || /\bbillions?\b/.test(text)) return amount * 1_000;
  if (unit.includes("million") || /\bmillions?\b/.test(text)) return amount;
  if (unit.includes("thousand") || /\bthousands?\b/.test(text)) return amount / 1_000;
  if (String(metric?.currency || "").toUpperCase() === "USD" && amount > 0 && amount < 100) return amount * 1_000;
  return amount;
}

function guidanceAmountM(metrics, includePatterns, excludePatterns = []) {
  const includes = includePatterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(pattern, "i"));
  const excludes = excludePatterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(pattern, "i"));
  const values = metrics
    .filter((metric) => metric.actual_or_guidance === "guidance")
    .filter((metric) => {
      const text = metricText(metric);
      return includes.some((pattern) => pattern.test(text)) && !excludes.some((pattern) => pattern.test(text));
    })
    .map(metricAmountM)
    .filter((value) => value != null && value > 0);
  return median(values);
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
  const guidanceSourceMetrics = metrics.filter((metric) => ["clear", "ambiguous"].includes(metric.quality_status));
  const revenueGuidanceM = guidanceAmountM(guidanceSourceMetrics, [/full year.*revenue|revenue guidance|revenue.*guidance/]);
  const operatingIncomeGuidanceM = guidanceAmountM(guidanceSourceMetrics, [/income from operations|operating income/], [/net income/]);
  const fcfGuidanceM = guidanceAmountM(guidanceSourceMetrics, [/free cash flow|fcf/]);
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
    revenueGuidanceM,
    operatingIncomeGuidanceM,
    fcfGuidanceM,
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
    const transcriptQaByPeriod = readTranscriptQaByTickerPeriod(db, new Set(tickers));
    const rows = db.prepare(`
      SELECT
        me.id,
        me.ticker,
        me.metric_name,
        me.fiscal_period,
        me.actual_or_guidance,
        me.amount,
        me.unit,
        me.currency,
        me.growth_yoy,
        me.growth_qoq,
        me.margin_pct,
        me.value_text,
        me.quality_status,
        me.extraction_confidence,
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
      digests.set(key, {
        ...metricDigest(metrics),
        qa: transcriptQaByPeriod.get(key) || []
      });
    }
    for (const [key, qa] of transcriptQaByPeriod.entries()) {
      if (digests.has(key)) continue;
      digests.set(key, {
        sourceDatabase: YOUTUBE_DB_PATH,
        metricCount: 0,
        clearMetricCount: 0,
        guidanceMetricCount: 0,
        actualMetricCount: 0,
        metricNames: [],
        evidence: [],
        qa
      });
    }
    return digests;
  } finally {
    db.close();
  }
}

function auditModelInputs(snapshot) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const secRows = history.filter((row) =>
    isSecCompanyFactsModelSource(row.sourceType) ||
    isSecCompanyFactsModelSource(row.dataSnapshot?.sourceType) ||
    isSecCompanyFactsModelSource(row.dataSnapshot?.valuationSemantics?.sourceType)
  ).length;
  const trinityRows = history.filter((row) => row.sourceType === "trinity_official_financial_model" || row.dataSnapshot?.sourceType === "trinity_official_financial_model").length;
  const financialRows = secRows + trinityRows;
  const sourceTypes = history.reduce((counts, row) => {
    const key = row.sourceType || row.dataSnapshot?.sourceType || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const uniqueFairValues = new Set(history.map((row) => Number(row.fairValue).toFixed(4))).size;
  const warnings = [];
  const coverageNotes = [];
  let status = "pass";
  if (!history.length) {
    status = "fail";
    warnings.push("No usable financial/guidance valuation history.");
  } else if (history.length < 4 && financialRows === 0) {
    status = "review";
    warnings.push("Limited valuation history and no verified financial/guidance rows.");
  } else if (history.length < 8) {
    coverageNotes.push("Limited valuation history; read as a point-in-time model until more quarters are available.");
  }
  if (!financialRows) {
    status = "review";
    warnings.push("No financial/guidance valuation rows are available.");
  }
  if (history.length > 1 && uniqueFairValues <= 1) {
    status = "review";
    warnings.push("Fair value history has too few distinct points.");
  } else if (history.length === 1) {
    coverageNotes.push("Single verified valuation snapshot available.");
  }
  const latestFairValue = finiteNumber(snapshot.latest?.baseFairValue);
  const latestPrice = finiteNumber(snapshot.latest?.latestPrice);
  const latestFairToPrice = latestFairValue && latestPrice ? latestFairValue / latestPrice : null;
  return {
    status,
    passesNoPriceAnchorAudit: true,
    fairValueInputPolicy: "reported-financials-guidance-and-scenario-assumptions",
    priceUsage: "comparison-price-series-only",
    sourceGrade: secRows ? "sec-companyfacts-financials" : "ai-trinity-official-ir-financials",
    valuationRows: history.length,
    financialOrGuidanceEvidenceRows: financialRows,
    secCompanyFactsRows: secRows,
    trinityOfficialFinancialRows: trinityRows,
    currentPriceStoredRows: history.filter((row) => finiteNumber(row.priceAtDate) != null).length,
    methodPriceAnchorSignalCount: 0,
    methodPriceAnchorSignals: [],
    sourceTypes,
    uniqueFairValues,
    latestFairToPrice,
    warnings,
    coverageNotes
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

function updateTickerSnapshot({ ticker, snapshot, valuationRows, coverage }) {
  const history = valuationRows
    .filter((row) => row.asOfDate && finiteNumber(row.fairValue) != null)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const latestRow = history.at(-1);
  const latestPrice = latestPricePoint(snapshot.priceHistory);
  const latestMarketPrice = finiteNumber(latestPrice?.close ?? snapshot.latest?.latestPrice);
  const latestFairValue = finiteNumber(latestRow?.fairValue);
  const latestTarget = finiteNumber(latestRow?.targetPrice3Y);
  const pricePoints = snapshot.priceHistory?.length || snapshot.dataQuality?.pricePoints || 0;
  const generatedAt = new Date().toISOString();
  const sourceLabel = coverage?.sourceLabel || "SEC CompanyFacts financials + transcript guidance model";
  const sourceNote = coverage?.sourceNote || "SEC CompanyFacts quarterly financials + YouTube earnings-call transcript evidence; fair value excludes market price.";
  const modelType = coverage?.modelType || "SEC quarterly Fundamental Analysis model";
  const profileLabel = profileSettings(ticker).label;
  const next = {
    ...snapshot,
    ticker,
    generatedAt,
    modelType,
    sector: profileLabel || snapshot.sector,
    latest: {
      ...(snapshot.latest || {}),
      latestPrice: latestMarketPrice ?? snapshot.latest?.latestPrice ?? null,
      latestPriceDate: latestPrice?.date || snapshot.latest?.latestPriceDate || null,
      latestPriceSource: latestPrice?.source || snapshot.latest?.latestPriceSource || snapshot.priceSource || null,
      valuationAnchorPrice: finiteNumber(latestRow?.priceAtDate ?? latestRow?.currentPrice ?? snapshot.latest?.valuationAnchorPrice),
      valuationAnchorDate: latestRow?.asOfDate || snapshot.latest?.valuationAnchorDate || null,
      baseFairValue: latestFairValue,
      fairValueSource: sourceLabel,
      fairValueInputPolicy: "reported financials / guidance only; price excluded",
      upsideToBase: latestMarketPrice && latestFairValue ? latestFairValue / latestMarketPrice - 1 : finiteNumber(latestRow?.upsideDownside ?? snapshot.latest?.upsideToBase),
      targetPrice3Y: latestTarget,
      expectedReturn3Y: latestMarketPrice && latestTarget ? (latestTarget / latestMarketPrice) ** (1 / 3) - 1 : finiteNumber(latestRow?.expectedReturn3Y ?? snapshot.latest?.expectedReturn3Y)
    },
    scenarios: latestRow ? [latestScenario(snapshot, latestRow, latestPrice)] : snapshot.scenarios,
    history,
    methodCards: [
      {
        key: "sec-quarterly-fundamental-model",
        label: coverage?.methodCardLabel || "AI Trinity-style financial model",
        value: history.length,
        format: "number",
        description: coverage?.methodCardDescription || "Fair values are rebuilt from reported financials, guidance evidence and buy-side scenario assumptions. Price is excluded."
      },
      {
        key: "price-anchor-audit",
        label: "Price anchor audit",
        value: 0,
        format: "number",
        description: "Market price is stored only for comparison, upside and chart hover."
      },
      ...(snapshot.methodCards || [])
        .filter((card) => !["sec-quarterly-fundamental-model", "price-anchor-audit", "youtube-earnings-metric-model"].includes(card?.key))
        .slice(0, 4)
    ],
    warnings: [
      `Imported ${history.length} ${coverage?.source || "financial"} valuation rows.`,
      ...(coverage.youtubePeriods ? [`Attached YouTube transcript metric evidence to ${coverage.youtubePeriods} matching periods.`] : []),
      ...(snapshot.warnings || []).filter((warning) =>
        !String(warning).includes("Imported") &&
        !String(warning).includes("Attached YouTube transcript") &&
        !String(warning).includes("Limited valuation history")
      )
    ],
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      pricePoints,
      hasLivePriceSeries: pricePoints >= 120,
      priceDisplayMode: pricePoints >= 120 ? "daily-price-line" : "as-of-price-anchors",
      sourceNote,
      fairValueSource: sourceLabel,
      secCompanyFacts: coverage,
      secCompanyFactsQuarterlyRows: coverage?.secRows ?? history.filter((row) =>
        isSecCompanyFactsModelSource(row.sourceType) ||
        isSecCompanyFactsModelSource(row.dataSnapshot?.sourceType) ||
        isSecCompanyFactsModelSource(row.dataSnapshot?.valuationSemantics?.sourceType)
      ).length,
      trinityOfficialFinancialValuationRows: coverage?.trinityFinancialRows || 0,
      youtubeEarningsMetricValuationRows: 0,
      valuationCoverageKind: history.length >= 12 ? "quarterly" : history.length >= 4 ? "partial" : history.length ? "limited" : "unsupported",
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

function legacyValuationScoreInputs(snapshot, row) {
  const assumptions = Array.isArray(snapshot.assumptions) ? snapshot.assumptions : [];
  const methodCards = Array.isArray(snapshot.methodCards) ? snapshot.methodCards : [];
  const isMarketAssumption = (assumption) => {
    const text = `${assumption?.key || ""} ${assumption?.label || ""} ${assumption?.category || ""}`.toLowerCase();
    return assumption?.category === "Market" || /current\s*price|market\s*price|share\s*price|price|gbp\s*usd|fx/.test(text);
  };
  const financialAssumptions = assumptions
    .filter((assumption) => !isMarketAssumption(assumption))
    .map((assumption) => ({
      key: assumption.key,
      label: assumption.label,
      value: assumption.value,
      source: assumption.source,
      category: assumption.category
    }));
  const marketComparisonInputsExcluded = assumptions
    .filter(isMarketAssumption)
    .map((assumption) => ({
      key: assumption.key,
      label: assumption.label,
      value: assumption.value,
      source: assumption.source,
      category: assumption.category
    }));
  const methodOutputs = methodCards
    .filter((card) => finiteNumber(card?.value) != null)
    .map((card) => ({
      key: card.key,
      label: card.label,
      value: card.value,
      format: card.format
    }));
  return {
    legacyModel: true,
    method: row.method || snapshot.modelType || "legacy financial/guidance model",
    financialAssumptions,
    methodOutputs,
    marketComparisonInputsExcluded,
    priceExcludedFromFairValue: true
  };
}

function normalizeLegacyFinancialSnapshot({ ticker, snapshot }) {
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  if (!history.length || finiteNumber(snapshot.latest?.baseFairValue) == null) return null;
  const generatedAt = new Date().toISOString();
  const normalizedHistory = history.map((row) => {
    const sourceType = row.sourceType || row.dataSnapshot?.sourceType || row.dataSnapshot?.valuationSemantics?.sourceType || "legacy_fundamental_analysis";
    return {
      ...row,
      sourceType,
      dataSnapshot: {
        ...(row.dataSnapshot || {}),
        sourceType,
        valuationSemantics: {
          ...(row.dataSnapshot?.valuationSemantics || {}),
          sourceType,
          priceExcludedFromFairValue: true,
          fairValueFormula: row.dataSnapshot?.valuationSemantics?.fairValueFormula || `${row.method || snapshot.modelType || "Legacy Fundamental Analysis valuation model"}; no market price input`,
          scoreInputs: row.dataSnapshot?.valuationSemantics?.scoreInputs?.financialAssumptions
            ? row.dataSnapshot.valuationSemantics.scoreInputs
            : legacyValuationScoreInputs(snapshot, row)
        }
      }
    };
  });
  const next = {
    ...snapshot,
    ticker,
    generatedAt,
    latest: {
      ...(snapshot.latest || {}),
      fairValueSource: snapshot.latest?.fairValueSource || "Legacy Fundamental Analysis financial/guidance model",
      fairValueInputPolicy: snapshot.latest?.fairValueInputPolicy || "legacy financial/guidance model; price excluded from fair-value input"
    },
    history: normalizedHistory,
    dataQuality: {
      ...(snapshot.dataQuality || {}),
      sourceNote: snapshot.dataQuality?.sourceNote || "Legacy Fundamental Analysis valuation runs retained because SEC/Trinity inputs are unavailable.",
      fairValueSource: snapshot.dataQuality?.fairValueSource || "Legacy Fundamental Analysis financial/guidance model",
      valuationCoverageKind: snapshot.dataQuality?.valuationCoverageKind || (history.length >= 12 ? "quarterly" : "partial"),
      modelInputAudit: snapshot.dataQuality?.modelInputAudit || {
        status: history.length >= 12 ? "pass" : "review",
        passesNoPriceAnchorAudit: true,
        fairValueInputPolicy: "legacy-financial-guidance-model",
        priceUsage: "comparison-price-series-only",
        sourceGrade: "legacy-fundamental-analysis",
        valuationRows: history.length,
        financialOrGuidanceEvidenceRows: history.length,
        methodPriceAnchorSignalCount: 0,
        methodPriceAnchorSignals: [],
        warnings: ["Retained legacy Fundamental Analysis valuation because SEC/Trinity inputs were unavailable."]
      }
    }
  };
  return next;
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

function secLookupTicker(ticker) {
  return String(ticker || "").toUpperCase().replace(".", "-");
}

function shouldPreserveLegacyBackendSnapshot(snapshot, valuationRows, sourceIsTrinity) {
  if (!sourceIsTrinity) return false;
  const legacyBackendRows = Number(snapshot?.dataQuality?.legacyBackendValuationRows || 0);
  const history = Array.isArray(snapshot?.history) ? snapshot.history : [];
  const distinctFairValues = new Set(
    history
      .map((row) => finiteNumber(row?.fairValue))
      .filter((value) => value != null)
      .map((value) => value.toFixed(4))
  ).size;
  const hasLegacyHistory = history.some((row) => {
    const sourceText = `${row?.sourceType || ""} ${row?.dataSnapshot?.sourceType || ""} ${row?.dataSnapshot?.valuationSemantics?.sourceType || ""}`.toLowerCase();
    return sourceText && !sourceText.includes("trinity_official_financial_model") && !sourceText.includes("sec_companyfacts_");
  });
  return legacyBackendRows >= 8 &&
    history.length >= 8 &&
    history.length > valuationRows.length &&
    distinctFairValues > 1 &&
    hasLegacyHistory;
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
    const trinityModels = readTrinityCompanyModels(trinity);
    const secTickerMap = await readSecTickerMap();
    const requestedTickers = DEFAULT_TICKERS.includes("ALL") ? [...currentTickers.keys()] : DEFAULT_TICKERS;
    const requested = requestedTickers.map((ticker) => {
      const companyModel = trinityModels.get(ticker);
      const secInfo = secTickerMap.get(secLookupTicker(ticker));
      const trinityTicker = companyModel?.ticker || ticker;
      const dashboardTicker = dashboardTickerForTrinity(trinityTicker);
      const normalizedTicker = currentTickers.has(dashboardTicker) ? dashboardTicker : ticker;
      const snapshot = currentTickers.get(normalizedTicker) ||
        baseValuationSnapshot({
          ticker: normalizedTicker,
          companyModel,
          secInfo,
          priceHistory: readPriceHistoryFromDb(currentDb, normalizedTicker)
        });
      const cik = companyModel?.cik || snapshot?.cik || snapshot?.dataQuality?.secCompanyFacts?.cik || secInfo?.cik_str;
      return {
        ticker: normalizedTicker,
        trinityTicker,
        snapshot,
        companyModel: {
          ...(companyModel || {}),
          ticker: trinityTicker,
          cik,
          company: companyModel?.company || secInfo?.title || snapshot?.name || ticker
        }
      };
    }).filter((item) => item.snapshot);

    const youtubeByPeriod = readYoutubeEvidence([...new Set(requested.flatMap((item) => [item.ticker, item.trinityTicker]))]);
    const updated = [];
    const skipped = [];

    for (const item of requested) {
      const { ticker, trinityTicker, companyModel } = item;
      const snapshot = item.snapshot;
      if (!currentTickers.has(ticker)) currentTickers.set(ticker, snapshot);
      let quarterlyRows = [];
      let secRows = [];
      let factsUrl = null;
      let cachePath = null;
      let cik = companyModel?.cik ? normalizeCik(companyModel.cik) : null;
      if (cik && cik !== "0000000000") {
        factsUrl = secCompanyFactsUrl(cik);
        cachePath = path.join(CACHE_DIR, `${cik}.json`);
        const factsPayload = await fetchJsonWithCache(factsUrl, cachePath);
        await sleep(140);
        const facts = factsPayload?.facts || {};
        quarterlyRows = buildQuarterlyFinancials(facts);
        if (ticker === "MSTR") {
          quarterlyRows = attachMstrCryptoMetrics(facts, quarterlyRows);
        }
        if (process.env.DEBUG_SEC_VALUATION_TICKER === ticker) {
          console.error(JSON.stringify({
            ticker,
            quarterlyRows: quarterlyRows.slice(-8).map((row) => ({
              key: row.key,
              label: row.label,
              asOfDate: row.asOfDate,
              revenue_m: row.revenue_m,
              net_income_m: row.net_income_m,
              crypto_asset_fair_value_m: row.crypto_asset_fair_value_m,
              crypto_asset_units: row.crypto_asset_units,
              shares_m: row.shares_m,
              sources: row.sources
            }))
          }, null, 2));
        }
        secRows = buildValuationRows({
          ticker,
          trinityTicker,
          snapshot: { ...snapshot, ticker },
          companyModel,
          factsUrl,
          quarterlyRows,
          youtubeByPeriod
        });
      }

      const trinityRows = secRows.length >= 4 ? [] : buildTrinityValuationRows({
        ticker,
        trinityTicker,
        snapshot: { ...snapshot, ticker },
        companyModel,
        youtubeByPeriod
      });
      const valuationRows = secRows.length >= 4 || !trinityRows.length ? secRows : trinityRows;
      const sourceIsTrinity = valuationRows === trinityRows;
      if (shouldPreserveLegacyBackendSnapshot(snapshot, valuationRows, sourceIsTrinity)) {
        const legacySourceLabel = "Legacy Fundamental Analysis financial/guidance model";
        const legacySourceNote = "Legacy Fundamental Analysis backend valuation runs: each fair-value bar is recomputed from event-visible financials/guidance and scenario assumptions; market price is used only for comparison, upside/downside, and return math.";
        const preserved = {
          ...snapshot,
          ticker,
          modelType: /ai trinity/i.test(String(snapshot.modelType || ""))
            ? "Fundamental Analysis backend valuation model"
            : snapshot.modelType || "Fundamental Analysis backend valuation model",
          generatedAt: new Date().toISOString(),
          latest: {
            ...(snapshot.latest || {}),
            fairValueSource: legacySourceLabel,
            fairValueInputPolicy: "event-visible financials/guidance and scenario assumptions; price excluded from fair-value input"
          },
          dataQuality: {
            ...(snapshot.dataQuality || {}),
            legacyValuationRows: snapshot.history?.length || snapshot.dataQuality?.legacyBackendValuationRows || 0,
            sourceNote: legacySourceNote,
            fairValueSource: legacySourceLabel,
            secCompanyFacts: snapshot.dataQuality?.secCompanyFacts
              ? {
                  ...snapshot.dataQuality.secCompanyFacts,
                  usedForFairValue: false,
                  supersededBy: "Legacy Fundamental Analysis backend valuation history"
                }
              : snapshot.dataQuality?.secCompanyFacts,
            trinityCandidateRowsSkipped: valuationRows.length,
            trinityCandidateSkipReason: "Preserved richer legacy backend valuation history over sparse AI Trinity proxy rows."
          },
          warnings: [
            "Preserved richer legacy backend valuation history over sparse AI Trinity proxy rows.",
            ...(snapshot.warnings || []).filter((warning) => !String(warning).includes("Preserved richer legacy backend"))
          ]
        };
        currentTickers.set(ticker, preserved);
        currentDb.prepare(`
          INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
          VALUES (?, ?, ?)
          ON CONFLICT(ticker) DO UPDATE SET
            generated_at = excluded.generated_at,
            payload_json = excluded.payload_json
        `).run(ticker, preserved.generatedAt, JSON.stringify(preserved));
        updated.push({
          ticker,
          source: "Preserved Legacy Fundamental Analysis",
          rows: preserved.history?.length || 0,
          secRows: secRows.length,
          trinityRows: valuationRows.length,
          quarterlyFinancialRows: quarterlyRows.length,
          youtubePeriods: 0
        });
        continue;
      }
      if (valuationRows.length < 1) {
        const legacy = normalizeLegacyFinancialSnapshot({ ticker, snapshot: { ...snapshot, ticker } });
        if (legacy) {
          currentTickers.set(ticker, legacy);
          currentDb.prepare(`
            INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
            VALUES (?, ?, ?)
            ON CONFLICT(ticker) DO UPDATE SET
              generated_at = excluded.generated_at,
              payload_json = excluded.payload_json
          `).run(ticker, legacy.generatedAt, JSON.stringify(legacy));
          updated.push({
            ticker,
            source: "Legacy Fundamental Analysis",
            rows: legacy.history?.length || 0,
            secRows: 0,
            trinityRows: 0,
            quarterlyFinancialRows: quarterlyRows.length,
            youtubePeriods: 0
          });
        } else {
          skipped.push({ ticker, reason: `no usable SEC or Trinity valuation rows` });
        }
        continue;
      }
      const youtubePeriods = valuationRows.filter((row) => row.dataSnapshot?.youtubeEarnings?.metricCount).length;
      const coverage = sourceIsTrinity ? {
        source: "AI Trinity official financials",
        sourceLabel: "AI Trinity official IR financial model",
        sourceNote: "AI Trinity single-stock financial model plus YouTube transcript evidence; fair value excludes market price.",
        modelType: "AI Trinity Fundamental Analysis model",
        methodCardLabel: "AI Trinity official financial model",
        methodCardDescription: "Fair values are rebuilt from AI Trinity annual/latest-quarter financials, official IR fields, transcript evidence and buy-side scenario assumptions. Price is excluded.",
        sourceUrl: companyModel.latest_quarter?.source_url || companyModel.sources?.[0]?.url || null,
        sourcePath: TRINITY_MODEL_DIR,
        cik,
        company: companyModel.company || snapshot.name || ticker,
        quarterlyFinancialRows: quarterlyRows.length,
        secRows: secRows.length,
        trinityFinancialRows: valuationRows.length,
        valuationRows: valuationRows.length,
        youtubePeriods,
        priceExcludedFromFairValue: true,
        modelInputPolicy: "AI Trinity official financials, normalized earnings/FCF or EV/sales assumptions; market price comparison only"
      } : {
        source: "SEC CompanyFacts",
        sourceLabel: "SEC CompanyFacts financials + transcript guidance model",
        sourceNote: "SEC CompanyFacts quarterly financials + YouTube earnings-call transcript evidence; fair value excludes market price.",
        sourceUrl: factsUrl,
        cachePath,
        cik,
        company: companyModel.company || snapshot.name || ticker,
        quarterlyFinancialRows: quarterlyRows.length,
        secRows: valuationRows.length,
        trinityFinancialRows: 0,
        valuationRows: valuationRows.length,
        youtubePeriods,
        priceExcludedFromFairValue: true,
        modelInputPolicy: "AI Trinity-style TTM financials, normalized P/E and FCF yield; market price comparison only"
      };
      const next = updateTickerSnapshot({ ticker, snapshot: { ...snapshot, ticker }, valuationRows, coverage });
      currentTickers.set(ticker, next);
      currentDb.prepare(`
        INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          generated_at = excluded.generated_at,
          payload_json = excluded.payload_json
      `).run(ticker, next.generatedAt, JSON.stringify(next));
      updated.push({
        ticker,
        source: coverage.source,
        rows: valuationRows.length,
        secRows: secRows.length,
        trinityRows: sourceIsTrinity ? valuationRows.length : 0,
        quarterlyFinancialRows: quarterlyRows.length,
        youtubePeriods
      });
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
      trinityOfficialFinancialValuationTickerCount: snapshots.filter((ticker) => ticker.dataQuality?.trinityOfficialFinancialValuationRows > 0).length,
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
