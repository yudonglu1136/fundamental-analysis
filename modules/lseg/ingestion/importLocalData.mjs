import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readJson(relativePath, fallback) {
  const absolutePath = path.resolve(relativePath);
  if (!existsSync(absolutePath)) return fallback;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function readCsv(relativePath) {
  const absolutePath = path.resolve(relativePath);
  if (!existsSync(absolutePath)) return [];
  const [headerLine, ...lines] = readFileSync(absolutePath, "utf8").trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header || "date", cells[index] ?? ""]));
  });
}

function readWideCsv(relativePath) {
  const rows = readCsv(relativePath);
  const periods = rows.length ? Object.keys(rows[0]).filter((key) => key !== "date") : [];
  const value = (metric, period) => {
    const row = rows.find((item) => item.date === metric);
    const raw = row?.[period];
    const parsed = raw === "" || raw == null ? null : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return { periods, value };
}

function dateOnly(value = "") {
  return String(value).slice(0, 10);
}

function nearestOnOrBefore(rows, targetDate, getDate) {
  return rows
    .filter((row) => getDate(row) <= targetDate)
    .sort((left, right) => getDate(right).localeCompare(getDate(left)))[0] ?? null;
}

function toMillions(value) {
  return value == null ? null : value / 1_000_000;
}

function fiscalYearFromPeriod(fiscalPeriod = "") {
  const match = String(fiscalPeriod).match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

function normalizeEventType(eventType = "", fiscalPeriod = "") {
  const event = String(eventType).toLowerCase();
  const period = String(fiscalPeriod).toLowerCase();
  if (period.includes("q1") || event.includes("q1")) return "q1_trading_update";
  if (period.includes("h1") || event.includes("h1") || event === "interim_results") return "h1_interim_results";
  if (period.includes("q3") || event.includes("q3")) return "q3_trading_update";
  if (period.includes("fy") || event.includes("preliminary")) return "fy_preliminary_results";
  if (event === "trading_update") return "q1_trading_update";
  return eventType || "transcript";
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function relativeLocalPath(value) {
  if (!value) return null;
  const cwd = process.cwd();
  return String(value).startsWith(cwd) ? path.relative(cwd, value) : value;
}

function isOfficialResultDoc(doc) {
  return /\.pdf($|\?)/i.test(doc?.sourceUrl ?? "") && /(rns|annual-report|interim-report)/i.test(doc?.sourceUrl ?? "");
}

const historicalOfficialEvents = [
  {
    id: "lseg-fy2018-preliminary-results-2019-03-01",
    eventDate: "2019-03-01",
    fiscalPeriod: "FY2018",
    fiscalYear: 2018,
    eventType: "fy_preliminary_results",
    label: "FY2018 Preliminary Results",
    sourceNeedle: "lseg-preliminary-results-2018-rns-01mar2019",
  },
  {
    id: "lseg-fy2018-annual-report",
    eventDate: "2019-03-15",
    fiscalPeriod: "FY2018",
    fiscalYear: 2018,
    eventType: "annual_report",
    label: "FY2018 Annual Report",
    sourceNeedle: "lseg-annual-report-2018",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/annual-reports/lseg-annual-report-2018.pdf",
  },
  {
    id: "lseg-q1-2019-trading-update",
    eventDate: "2019-05-01",
    fiscalPeriod: "Q1 2019",
    fiscalYear: 2019,
    eventType: "q1_trading_update",
    label: "Q1 2019 Trading Update",
    sourceNeedle: "lseg-trading-statement-q1-2019-rns-01may2019",
  },
  {
    id: "lseg-h1-2019-interim-results",
    eventDate: "2019-08-01",
    fiscalPeriod: "H1 2019",
    fiscalYear: 2019,
    eventType: "h1_interim_results",
    label: "H1 2019 Interim Results",
    sourceNeedle: "lseg-interim-results-h1-2019-rns-01aug2019",
  },
  {
    id: "lseg-q3-2019-trading-update",
    eventDate: "2019-10-18",
    fiscalPeriod: "Q3 2019",
    fiscalYear: 2019,
    eventType: "q3_trading_update",
    label: "Q3 2019 Trading Update",
    sourceNeedle: "lseg-trading-statement-q3-2019-rns-18oct2019",
  },
  {
    id: "lseg-fy2019-preliminary-results-2020-02-28",
    eventDate: "2020-02-28",
    fiscalPeriod: "FY2019",
    fiscalYear: 2019,
    eventType: "fy_preliminary_results",
    label: "FY2019 Preliminary Results",
    sourceNeedle: "lseg-preliminary-results-2019-rns-28feb2020",
  },
  {
    id: "lseg-fy2019-annual-report",
    eventDate: "2020-03-13",
    fiscalPeriod: "FY2019",
    fiscalYear: 2019,
    eventType: "annual_report",
    label: "FY2019 Annual Report",
    sourceNeedle: "lseg-annual-report-2019",
  },
  {
    id: "lseg-q1-2020-trading-update",
    eventDate: "2020-04-21",
    fiscalPeriod: "Q1 2020",
    fiscalYear: 2020,
    eventType: "q1_trading_update",
    label: "Q1 2020 Trading Update",
    sourceNeedle: "lseg-trading-statement-q1-2020-rns-21apr2020",
  },
  {
    id: "lseg-h1-2020-interim-results",
    eventDate: "2020-07-31",
    fiscalPeriod: "H1 2020",
    fiscalYear: 2020,
    eventType: "h1_interim_results",
    label: "H1 2020 Interim Results",
    sourceNeedle: "lseg-interim-results-h1-2020-rns-31jul2020",
  },
  {
    id: "lseg-q3-2020-trading-update",
    eventDate: "2020-10-23",
    fiscalPeriod: "Q3 2020",
    fiscalYear: 2020,
    eventType: "q3_trading_update",
    label: "Q3 2020 Trading Update",
    sourceNeedle: "lseg-trading-statement-q3-2020-rns-23oct2020",
  },
  {
    id: "lseg-fy2020-preliminary-results-2021-03-05",
    eventDate: "2021-03-05",
    fiscalPeriod: "FY2020",
    fiscalYear: 2020,
    eventType: "fy_preliminary_results",
    label: "FY2020 Preliminary Results",
    sourceNeedle: "lseg-preliminary-results-2020-rns-05mar2021",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/rns/lseg-preliminary-results-2020-rns-05mar2021.pdf",
  },
  {
    id: "lseg-fy2020-annual-report",
    eventDate: "2021-03-16",
    fiscalPeriod: "FY2020",
    fiscalYear: 2020,
    eventType: "annual_report",
    label: "FY2020 Annual Report",
    sourceNeedle: "lseg-annual-report-2020",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/annual-reports/lseg-annual-report-2020.pdf",
  },
  {
    id: "lseg-q1-2021-trading-update",
    eventDate: "2021-04-28",
    fiscalPeriod: "Q1 2021",
    fiscalYear: 2021,
    eventType: "q1_trading_update",
    label: "Q1 2021 Trading Update",
    sourceNeedle: "lseg-trading-statement-q1-2021-rns-28apr2021",
  },
  {
    id: "lseg-h1-2021-interim-results",
    eventDate: "2021-08-06",
    fiscalPeriod: "H1 2021",
    fiscalYear: 2021,
    eventType: "h1_interim_results",
    label: "H1 2021 Interim Results",
    sourceNeedle: "lseg-interim-results-h1-2021-rns-06aug2021",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/interim-results/rns/lseg-interim-results-h1-2021-rns-06aug2021.pdf",
  },
  {
    id: "lseg-q3-2021-trading-update",
    eventDate: "2021-10-22",
    fiscalPeriod: "Q3 2021",
    fiscalYear: 2021,
    eventType: "q3_trading_update",
    label: "Q3 2021 Trading Update",
    sourceNeedle: "lseg-trading-statement-q3-2021-rns-22oct2021",
  },
  {
    id: "lseg-fy2021-preliminary-results-2022-03-03",
    eventDate: "2022-03-03",
    fiscalPeriod: "FY2021",
    fiscalYear: 2021,
    eventType: "fy_preliminary_results",
    label: "FY2021 Preliminary Results",
    sourceNeedle: "lseg-preliminary-results-2021-rns-03mar2022",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/rns/lseg-preliminary-results-2021-rns-03mar2022.pdf",
  },
  {
    id: "lseg-fy2021-annual-report",
    eventDate: "2022-03-15",
    fiscalPeriod: "FY2021",
    fiscalYear: 2021,
    eventType: "annual_report",
    label: "FY2021 Annual Report",
    sourceNeedle: "lseg-annual-report-2021",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/annual-reports/lseg-annual-report-2021.pdf",
  },
];

const historicalAnnualActuals = [
  {
    id: "lseg-fy2018",
    periodId: "fy2018",
    fiscalYear: 2018,
    eventId: "lseg-fy2018-preliminary-results-2019-03-01",
    asOfDate: "2019-03-01",
    revenue: 1911,
    adjustedEbitda: 1066,
    adjustedOperatingProfit: 931,
    adjustedEps: 1.738,
    weightedAverageShares: 351,
    dilutedShares: 351,
    equityFreeCashFlow: 609,
    capex: 135,
    netDebt: 1083,
    dividendPerShare: 0.604,
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2019/london-stock-exchange-group-plc-preliminary-results-year-ended-31-december-2018",
    sourceNote: "FY2018 preliminary release; cash-flow and net-debt fields are historical seed values pending table-level PDF extraction.",
  },
  {
    id: "lseg-fy2019",
    periodId: "fy2019",
    fiscalYear: 2019,
    eventId: "lseg-fy2019-preliminary-results-2020-02-28",
    asOfDate: "2020-02-28",
    revenue: 2056,
    adjustedEbitda: 1265,
    adjustedOperatingProfit: 1065,
    adjustedEps: 2.003,
    weightedAverageShares: 351,
    dilutedShares: 351,
    equityFreeCashFlow: 704,
    capex: 200,
    netDebt: 1753,
    dividendPerShare: 0.7,
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2020/london-stock-exchange-group-plc-preliminary-results-year-ended-31-december-2019",
    sourceNote: "FY2019 preliminary release; cash-flow and net-debt fields are historical seed values pending table-level PDF extraction.",
  },
  {
    id: "lseg-fy2020",
    periodId: "fy2020",
    fiscalYear: 2020,
    eventId: "lseg-fy2020-preliminary-results-2021-03-05",
    asOfDate: "2021-03-05",
    revenue: 2124,
    adjustedEbitda: 1329,
    adjustedOperatingProfit: 1118,
    adjustedEps: 2.097,
    weightedAverageShares: 352,
    dilutedShares: 352,
    equityFreeCashFlow: 852,
    capex: 211,
    netDebt: 2430,
    dividendPerShare: 0.75,
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2021/london-stock-exchange-group-plc-preliminary-results-year-ended-31-december-2020",
    sourceNote: "Pre-Refinitiv statutory LSEG actuals; cash-flow and net-debt fields are historical seed values pending table-level PDF extraction.",
  },
  {
    id: "lseg-fy2021",
    periodId: "fy2021",
    fiscalYear: 2021,
    eventId: "lseg-fy2021-preliminary-results-2022-03-03",
    asOfDate: "2022-03-03",
    revenue: 6811,
    adjustedEbitda: 3283,
    adjustedOperatingProfit: 2509,
    adjustedNetIncome: 1541,
    adjustedEps: 2.865,
    weightedAverageShares: 538,
    dilutedShares: 538,
    equityFreeCashFlow: 963,
    capex: 721,
    netDebt: 6240,
    dividendPerShare: 0.95,
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2022/london-stock-exchange-group-plc-preliminary-results-year-ended-31-december-2021",
    sourceNote: "FY2021 pro-forma underlying actuals. Equity FCF is seeded from H1 FCF per-share run-rate and should be replaced by extracted FY cash-flow table.",
  },
];

const eventRunRateSnapshots = [
  {
    id: "lseg-q1-2020-run-rate",
    periodId: "q1_2020_snapshot",
    fiscalYear: 2020,
    eventId: "lseg-q1-2020-trading-update",
    asOfDate: "2020-04-21",
    revenue: 2460,
    adjustedEbitdaMargin: 0.547,
    adjustedOperatingProfit: 1145,
    adjustedEps: 2.18,
    netDebt: 2000,
    dividendPerShare: 0.75,
    officialMetric: "Q1 2020 total income up 13% year-on-year to GBP 615m.",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2020/london-stock-exchange-group-plc-trading-statement-including-revenues-and-kpis-three-months-ended-31-march-2020-q1",
  },
  {
    id: "lseg-h1-2020-run-rate",
    periodId: "h1_2020_snapshot",
    fiscalYear: 2020,
    eventId: "lseg-h1-2020-interim-results",
    asOfDate: "2020-07-31",
    revenue: 2462,
    adjustedEbitdaMargin: 0.546,
    adjustedOperatingProfit: 1150,
    adjustedEps: 2.24,
    netDebt: 2200,
    dividendPerShare: 0.75,
    officialMetric: "H1 2020 adjusted EBITDA margin 54.6%, adjusted operating profit GBP 575m and adjusted EPS 112.0p.",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2020/london-stock-exchange-group-plc-interim-results-6-months-ended-30-june-2020",
  },
  {
    id: "lseg-q3-2020-run-rate",
    periodId: "q3_2020_snapshot",
    fiscalYear: 2020,
    eventId: "lseg-q3-2020-trading-update",
    asOfDate: "2020-10-23",
    revenue: 2447,
    adjustedEbitdaMargin: 0.544,
    adjustedOperatingProfit: 1118,
    adjustedEps: 2.1,
    netDebt: 2350,
    dividendPerShare: 0.75,
    officialMetric: "Q3 2020 total income GBP 600m and nine-month YTD total income GBP 1,835m.",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2020/london-stock-exchange-group-plc-trading-statement-including-revenues-and-kpis-three-months-ended-30-september-2020-q3",
  },
  {
    id: "lseg-q1-2021-run-rate",
    periodId: "q1_2021_snapshot",
    fiscalYear: 2021,
    eventId: "lseg-q1-2021-trading-update",
    asOfDate: "2021-04-28",
    revenue: 6800,
    adjustedEbitdaMargin: 0.463,
    adjustedOperatingProfit: 2385,
    adjustedEps: 2.67,
    weightedAverageShares: 519,
    dilutedShares: 519,
    netDebt: 7600,
    dividendPerShare: 0.95,
    officialMetric: "Q1 2021 total income excluding recoveries up 3.9% to c.GBP 1.7bn; GBP 40m run-rate cost synergies realised.",
    sourceUrl: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/trading-statement/rns/lseg-trading-statement-q1-2021-rns-28apr2021.pdf",
  },
  {
    id: "lseg-h1-2021-run-rate",
    periodId: "h1_2021_snapshot",
    fiscalYear: 2021,
    eventId: "lseg-h1-2021-interim-results",
    asOfDate: "2021-08-06",
    revenue: 6712,
    adjustedEbitdaMargin: 0.494,
    adjustedOperatingProfit: 2340,
    adjustedEps: 2.921,
    weightedAverageShares: 519,
    dilutedShares: 519,
    equityFreeCashFlow: 1928,
    capex: 636,
    netDebt: 7200,
    dividendPerShare: 0.95,
    officialMetric: "H1 2021 total income excluding recoveries GBP 3,356m, adjusted EBITDA margin 49.4%, AEPS 146.1p and GBP 77m run-rate synergies.",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2021/london-stock-exchange-group-plc-h1-2021-interim-results",
  },
  {
    id: "lseg-q3-2021-run-rate",
    periodId: "q3_2021_snapshot",
    fiscalYear: 2021,
    eventId: "lseg-q3-2021-trading-update",
    asOfDate: "2021-10-22",
    revenue: 7071,
    adjustedEbitdaMargin: 0.488,
    adjustedOperatingProfit: 2490,
    adjustedEps: 2.86,
    weightedAverageShares: 538,
    dilutedShares: 538,
    equityFreeCashFlow: 1800,
    capex: 700,
    netDebt: 6600,
    dividendPerShare: 0.95,
    officialMetric: "Q3 2021 total income growth 7.6%, YTD growth 5.6%, FY total income guidance 4-5%, ASV growth 4.0%.",
    sourceUrl: "https://www.lseg.com/en/media-centre/press-releases/2021/london-stock-exchange-group-plc-q3-2021-trading-statement",
  },
  {
    id: "lseg-q1-2024-run-rate",
    periodId: "q1_2024_snapshot",
    fiscalYear: 2024,
    eventId: "lseg_q1_2024_trading_update_2024-04-25",
    asOfDate: "2024-04-25",
    revenue: 8815,
    adjustedEbitdaMargin: 0.482,
    adjustedOperatingProfit: 3190,
    adjustedEps: 3.58,
    weightedAverageShares: 540,
    dilutedShares: 540,
    equityFreeCashFlow: 2060,
    capex: 970,
    netDebt: 6900,
    dividendPerShare: 1.23,
    officialMetric: "Q1 2024 total income grew 7.3% at constant currency; management said LSEG was on track for the November 2023 CMD revenue, margin, capex and cash-flow targets.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_q1_2024_trading_update_2024-04-25.txt",
  },
  {
    id: "lseg-h1-2024-run-rate",
    periodId: "h1_2024_snapshot",
    fiscalYear: 2024,
    eventId: "lseg_h1_2024_interim_results_2024-08-01",
    asOfDate: "2024-08-01",
    revenue: 8490,
    adjustedEbitdaMargin: 0.485,
    adjustedOperatingProfit: 3145,
    adjustedEps: 3.48,
    weightedAverageShares: 535,
    dilutedShares: 535,
    equityFreeCashFlow: 2080,
    capex: 908,
    netDebt: 6650,
    dividendPerShare: 1.23,
    officialMetric: "H1 2024 organic income growth was 7.6%; reported EBITDA margin was 48.5%; capex was GBP454m in H1 and management reiterated 11-12% of revenue capex guidance.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_h1_2024_interim_results_2024-08-01.txt",
  },
  {
    id: "lseg-q1-2025-run-rate",
    periodId: "q1_2025_snapshot",
    fiscalYear: 2025,
    eventId: "lseg_q1_2025_trading_update_2025-05-01",
    asOfDate: "2025-05-01",
    revenue: 9020,
    adjustedEbitdaMargin: 0.492,
    adjustedOperatingProfit: 3335,
    adjustedEps: 3.98,
    weightedAverageShares: 530,
    dilutedShares: 530,
    equityFreeCashFlow: 2280,
    capex: 902,
    netDebt: 6200,
    cashInterestExpense: 205,
    taxRate: 0.245,
    minorityInterest: 320,
    buybackAmount: 1000,
    dividendPerShare: 1.42,
    officialMetric: "Q1 2025 total income grew 8.7% at constant currency, organic growth was 7.8%, ASV was 6.4%, and management reconfirmed all financial guidance.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_q1_2025_trading_update_2025-05-01.txt",
  },
  {
    id: "lseg-h1-2025-run-rate",
    periodId: "h1_2025_snapshot",
    fiscalYear: 2025,
    eventId: "lseg_h1_2025_interim_results_2025-07-31",
    asOfDate: "2025-07-31",
    revenue: 9000,
    adjustedEbitdaMargin: 0.495,
    adjustedOperatingProfit: 3385,
    adjustedEps: 4.178,
    weightedAverageShares: 528,
    dilutedShares: 528,
    equityFreeCashFlow: 2350,
    capex: 900,
    netDebt: 6000,
    cashInterestExpense: 205,
    taxRate: 0.24,
    minorityInterest: 325,
    buybackAmount: 1000,
    dividendPerShare: 1.42,
    officialMetric: "H1 2025 organic income growth was 7.8%; adjusted EBITDA margin was 49.5%; AEPS was 208.9p; capex was GBP424m in H1; margin guidance was raised to 75-100 bps.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_h1_2025_interim_results_2025-07-31.txt",
  },
  {
    id: "lseg-q3-2025-run-rate",
    periodId: "q3_2025_snapshot",
    fiscalYear: 2025,
    eventId: "lseg_q3_2025_trading_update_2025-10-23",
    asOfDate: "2025-10-23",
    revenue: 9025,
    adjustedEbitdaMargin: 0.503,
    adjustedOperatingProfit: 3465,
    adjustedEps: 4.28,
    weightedAverageShares: 526,
    dilutedShares: 526,
    equityFreeCashFlow: 2400,
    capex: 903,
    netDebt: 8600,
    cashInterestExpense: 220,
    taxRate: 0.24,
    minorityInterest: 330,
    buybackAmount: 1000,
    dividendPerShare: 1.42,
    officialMetric: "Q3 2025 YTD organic growth was 7.3%; management raised margin guidance to around 100 bps, said FCF guidance was at least GBP2.4bn, and guided year-end leverage around 1.9x EBITDA.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_q3_2025_trading_update_2025-10-23.txt",
  },
  {
    id: "lseg-q1-2026-run-rate",
    periodId: "q1_2026_snapshot",
    fiscalYear: 2026,
    eventId: "lseg_q1_2026_trading_update_2026-04-23",
    asOfDate: "2026-04-23",
    revenue: 9615,
    adjustedEbitdaMargin: 0.515,
    adjustedOperatingProfit: 3780,
    adjustedEps: 4.55,
    weightedAverageShares: 522,
    dilutedShares: 522,
    equityFreeCashFlow: 2620,
    capex: 865,
    netDebt: 8050,
    dividendPerShare: 1.56,
    officialMetric: "Q1 2026 revenue growth was almost 10%; management expected 2026 revenue growth in the upper half of the 6.5%-7.5% guidance range and said the start supported all guidance.",
    sourceUrl: "data/local/lseg/transcripts/curated/clean_text/lseg_q1_2026_trading_update_2026-04-23.txt",
    valuationSemantics: {
      isAnnualizedRunRate: true,
      isSameYearForecastAnchor: true,
      forecastStartYear: 2026,
      firstGrowthYear: 2027,
      dcfYearOneGrowthSuppressed: true,
      note: "This run-rate is treated as the event-visible FY2026E guidance anchor. DCF year-one must use the run-rate directly and resume growth from FY2027E.",
    },
  },
];

const manualHistoricalPrices = [
  { date: "2019-03-01", close: 4640, previousClose: 4640, source: "manual_historical_price_seed" },
  { date: "2019-05-01", close: 5290, previousClose: 5290, source: "manual_historical_price_seed" },
  { date: "2019-08-01", close: 6830, previousClose: 6830, source: "manual_historical_price_seed" },
  { date: "2019-10-18", close: 7240, previousClose: 7240, source: "manual_historical_price_seed" },
  { date: "2020-02-28", close: 7700, previousClose: 7700, source: "manual_historical_price_seed" },
  { date: "2020-03-13", close: 6810, previousClose: 6810, source: "manual_historical_price_seed" },
  { date: "2020-04-21", close: 8000, previousClose: 8000, source: "manual_historical_price_seed" },
  { date: "2020-07-31", close: 8650, previousClose: 8650, source: "manual_historical_price_seed" },
  { date: "2020-10-23", close: 9240, previousClose: 9240, source: "manual_historical_price_seed" },
  { date: "2021-03-05", close: 7150, previousClose: 7150, source: "manual_historical_price_seed" },
  { date: "2021-03-16", close: 7440, previousClose: 7440, source: "manual_historical_price_seed" },
  { date: "2021-04-28", close: 7662, previousClose: 7662, source: "research_tree_rns_snapshot" },
];

const manualShareHistory = [
  { date: "2018-01-01", sharesOutstanding: 351_000_000 },
  { date: "2019-01-01", sharesOutstanding: 352_000_000 },
  { date: "2020-01-01", sharesOutstanding: 353_000_000 },
  { date: "2021-01-29", sharesOutstanding: 519_000_000 },
];

export function buildLsegBackendSeedPayload() {
  const now = new Date().toISOString();
  const official = readJson("data/local/lseg/lseg_official_dataset.json", {});
  const officialFetchMetadata = readJson("data/local/lseg/official/fetch_metadata.json", { documents: [] });
  const officialDocuments = officialFetchMetadata.documents ?? [];
  const officialDocumentByNeedle = (needle) => officialDocuments.find((doc) => (doc.sourceUrl ?? "").toLowerCase().includes(String(needle).toLowerCase())) ?? null;
  const officialEventDocument = (event) => officialDocumentByNeedle(event.sourceNeedle) ?? (event.sourceUrl ? { sourceUrl: event.sourceUrl, localPath: null, downloadDate: null, source_type: "official_actual", ok: false, parseStatus: "not_cached_yet" } : null);
  const market = readJson("data/local/lseg/yfinance/curated/market_snapshot.json", {});
  const peers = readJson("data/local/lseg/yfinance/curated/peer_multiples_snapshot.json", {});
  const provenance = readJson("data/local/lseg/yfinance/curated/provenance.json", {});
  const warnings = readJson("data/local/lseg/yfinance/curated/warnings.json", {});
  const transcriptDb = readJson("data/local/lseg/transcripts/extracted/transcript_database.json", { records: [] });
  const qaPairs = readJson("data/local/lseg/transcripts/extracted/qa_pairs.json", { items: [] });
  const guidanceMentions = readJson("data/local/lseg/transcripts/extracted/guidance_mentions.json", { items: [] });
  const income = readWideCsv("data/local/lseg/yfinance/raw/lseg_income_stmt.csv");
  const cashflow = readWideCsv("data/local/lseg/yfinance/raw/lseg_cashflow.csv");
  const balance = readWideCsv("data/local/lseg/yfinance/raw/lseg_balance_sheet.csv");
  const dividendSchedule = readCsv("data/local/lseg/yfinance/raw/lseg_dividends.csv").map((row) => ({
    date: dateOnly(row.Date),
    amountPence: Number(row.dividend),
  })).filter((row) => row.date && Number.isFinite(row.amountPence));
  const fiscalDividendPerShare = (year) => {
    const interim = dividendSchedule.find((row) => row.date.startsWith(`${year}-08`))?.amountPence ?? 0;
    const final = dividendSchedule.find((row) => {
      const month = row.date.slice(5, 7);
      return row.date.startsWith(`${year + 1}-`) && (month === "04" || month === "05");
    })?.amountPence ?? 0;
    const totalPence = interim + final;
    return totalPence > 0 ? totalPence / 100 : null;
  };
  const priceHistory = readCsv("data/local/lseg/yfinance/raw/lseg_price_history.csv").map((row) => ({
    date: dateOnly(row.Date),
    close: Number(row.Close),
    previousClose: Number(row["Adj Close"] || row.Close),
    source: "yfinance_local_cache",
  })).filter((row) => row.date && Number.isFinite(row.close));
  const shareHistory = readCsv("data/local/lseg/yfinance/raw/lseg_shares_history.csv").map((row) => ({
    date: dateOnly(row.date),
    sharesOutstanding: Number(row.sharesOutstanding),
  })).filter((row) => row.date && Number.isFinite(row.sharesOutstanding));
  const priceRows = [...manualHistoricalPrices, ...priceHistory].sort((left, right) => left.date.localeCompare(right.date));
  const shareRows = [...manualShareHistory, ...shareHistory].sort((left, right) => left.date.localeCompare(right.date));

  const reportingEvents = transcriptDb.records.map((record) => ({
    id: record.transcriptId,
    ticker: "LSEG.L",
    eventDate: record.eventDate,
    fiscalPeriod: record.fiscalPeriod,
    fiscalYear: fiscalYearFromPeriod(record.fiscalPeriod),
    eventType: normalizeEventType(record.eventType, record.fiscalPeriod),
    label: `${record.fiscalPeriod} ${record.eventType}`.replace(/_/g, " "),
    sourceType: record.sourceType,
    sourcePath: record.sourcePath ?? null,
    createdAt: now,
  }));
  for (const event of historicalOfficialEvents) {
    if (!reportingEvents.some((existing) => existing.id === event.id)) {
      const doc = officialEventDocument(event);
      reportingEvents.push({
        id: event.id,
        ticker: "LSEG.L",
        eventDate: event.eventDate,
        fiscalPeriod: event.fiscalPeriod,
        fiscalYear: event.fiscalYear,
        eventType: event.eventType,
        label: event.label,
        sourceType: "official_actual",
        sourcePath: relativeLocalPath(doc?.localPath) ?? doc?.sourceUrl ?? event.sourceUrl ?? null,
        createdAt: now,
      });
    }
  }
  if (!reportingEvents.some((event) => event.id === "lseg-fy2025-annual-report")) {
    reportingEvents.push({
      id: "lseg-fy2025-annual-report",
      ticker: "LSEG.L",
      eventDate: "2026-03-10",
      fiscalPeriod: "FY2025",
      fiscalYear: 2025,
      eventType: "annual_report",
      label: "FY2025 Annual Report",
      sourceType: "official_actual",
      sourcePath: "data/local/lseg/official/lseg-annual-report-2025.pdf",
      createdAt: now,
    });
  }
  for (const event of [
    {
      id: "lseg-fy2023-financial-statement-snapshot",
      eventDate: "2024-02-29",
      fiscalPeriod: "FY2023",
      fiscalYear: 2023,
      eventType: "annual_report",
      label: "FY2023 financial statement snapshot",
      sourceType: "market_data",
      sourcePath: "data/local/lseg/yfinance/raw/lseg_income_stmt.csv",
    },
    {
      id: "lseg-fy2022-financial-statement-snapshot",
      eventDate: "2023-03-02",
      fiscalPeriod: "FY2022",
      fiscalYear: 2022,
      eventType: "annual_report",
      label: "FY2022 financial statement snapshot",
      sourceType: "market_data",
      sourcePath: "data/local/lseg/yfinance/raw/lseg_income_stmt.csv",
    },
  ]) {
    if (!reportingEvents.some((existing) => existing.id === event.id)) {
      reportingEvents.push({ ...event, ticker: "LSEG.L", createdAt: now });
    }
  }
  if (!reportingEvents.some((event) => event.id === "lseg-market-snapshot-2026-05-10")) {
    reportingEvents.push({
      id: "lseg-market-snapshot-2026-05-10",
      ticker: "LSEG.L",
      eventDate: "2026-05-10",
      fiscalPeriod: "Market snapshot",
      fiscalYear: 2026,
      eventType: "market_snapshot",
      label: "Market snapshot as of 2026-05-10",
      sourceType: "market_data",
      sourcePath: "data/local/lseg/yfinance/curated/market_snapshot.json",
      createdAt: now,
    });
  }
  const latestEvent = reportingEvents.slice().sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0];
  const fy2025Event =
    reportingEvents.find((event) => event.fiscalYear === 2025 && event.eventType === "fy_preliminary_results") ??
    reportingEvents.find((event) => event.id === "lseg-fy2025-annual-report") ??
    latestEvent;
  const fy2024Event = reportingEvents.find((event) => event.fiscalYear === 2024 && event.eventType === "fy_preliminary_results");
  const fy2023Event = reportingEvents.find((event) => event.id === "lseg-fy2023-financial-statement-snapshot");
  const fy2022Event = reportingEvents.find((event) => event.id === "lseg-fy2022-financial-statement-snapshot");

  const sourceDocuments = [
    ...historicalOfficialEvents.map((event) => {
      const doc = officialEventDocument(event);
      return {
        id: `source-${event.id}`,
        ticker: "LSEG.L",
        sourceType: event.eventType === "annual_report" || event.eventType === "fy_preliminary_results" || event.eventType === "h1_interim_results" ? "official_actual" : "presentation",
        sourceName: event.label,
        sourcePath: relativeLocalPath(doc?.localPath),
        sourceUrl: doc?.sourceUrl ?? event.sourceUrl ?? null,
        retrievedAt: doc?.downloadDate ?? officialFetchMetadata.downloadDate ?? null,
        publishedDate: event.eventDate,
        provenance: doc?.localPath ? "lseg_official_cache" : "official_url_pending_cache",
        confidence: doc?.localPath || event.sourceUrl ? "high" : "medium",
        checksum: null,
        metadataJson: JSON.stringify({ event, document: doc, cacheStatus: doc?.localPath ? "cached" : "url_only" }),
      };
    }),
    ...officialDocuments.filter(isOfficialResultDoc).slice(0, 120).map((doc, index) => ({
      id: `official-cache-${index + 1}-${slugify(doc.sourceUrl).slice(0, 100)}`,
      ticker: "LSEG.L",
      sourceType: doc.source_type ?? "official_actual",
      sourceName: doc.title ?? doc.sourceUrl,
      sourcePath: relativeLocalPath(doc.localPath),
      sourceUrl: doc.sourceUrl,
      retrievedAt: doc.downloadDate ?? officialFetchMetadata.downloadDate ?? null,
      publishedDate: null,
      provenance: doc.parseStatus ?? "lseg_official_cache",
      confidence: doc.ok && !doc.blocked ? "high" : "low",
      checksum: null,
      metadataJson: JSON.stringify(doc),
    })),
    ...(official.sources ?? []).map((source) => ({
      id: source.id,
      ticker: "LSEG.L",
      sourceType: source.source_type ?? source.sourceType ?? "unknown",
      sourceName: source.title ?? source.id,
      sourcePath: source.url?.startsWith("data/") ? source.url : null,
      sourceUrl: source.url,
      retrievedAt: official.buildDate ?? now,
      publishedDate: null,
      provenance: source.status ?? "official_dataset",
      confidence: source.source_type === "official_actual" ? "high" : "medium",
      checksum: null,
      metadataJson: JSON.stringify(source),
    })),
    {
      id: "lseg-yfinance-market-snapshot",
      ticker: "LSEG.L",
      sourceType: "market_data",
      sourceName: "LSEG yfinance market snapshot",
      sourcePath: "data/local/lseg/yfinance/curated/market_snapshot.json",
      sourceUrl: null,
      retrievedAt: market.provenance?.fetchedAt ?? now,
      publishedDate: null,
      provenance: JSON.stringify(market.provenance ?? {}),
      confidence: "medium",
      checksum: null,
      metadataJson: JSON.stringify({ market: market.provenance, provenance }),
    },
  ];

  const fy2025 = official.official_actual?.fy2025 ?? {};
  const currentPriceGbp = official.market_data?.currentPriceGbp ?? ((market.data?.currentPrice ?? 0) / 100);
  const historicalAnnualFinancialPeriods = historicalAnnualActuals.map((item) => ({
    id: item.id,
    ticker: "LSEG.L",
    periodId: item.periodId,
    fiscalYear: item.fiscalYear,
    periodType: "annual",
    eventId: item.eventId,
    asOfDate: item.asOfDate,
    sourceType: "official_actual",
    revenue: item.revenue,
    adjustedEbitda: item.adjustedEbitda,
    adjustedEbitdaMargin: item.adjustedEbitda / item.revenue,
    adjustedOperatingProfit: item.adjustedOperatingProfit,
    adjustedNetIncome: item.adjustedNetIncome ?? (item.adjustedEps * item.weightedAverageShares),
    adjustedEps: item.adjustedEps,
    weightedAverageShares: item.weightedAverageShares,
    dilutedShares: item.dilutedShares,
    equityFreeCashFlow: item.equityFreeCashFlow,
    capex: item.capex,
    capexIntensity: item.capex / item.revenue,
    netDebt: item.netDebt,
    cashInterestExpense: null,
    taxRate: 0.24,
    minorityInterest: null,
    buybackAmount: 0,
    dividendPerShare: item.dividendPerShare,
    currentPrice: currentPriceGbp,
    rawJson: JSON.stringify({
      source: "historical_official_seed",
      sourceUrl: item.sourceUrl,
      sourceNote: item.sourceNote,
      dataLayer: "official_actual_with_cash_flow_fields_pending_pdf_table_extraction",
    }),
  }));
  const eventRunRateFinancialPeriods = eventRunRateSnapshots.map((item) => {
    const priorAnnual = historicalAnnualFinancialPeriods
      .filter((period) => period.asOfDate <= item.asOfDate)
      .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0];
    const adjustedEbitda = item.adjustedEbitda ?? item.revenue * item.adjustedEbitdaMargin;
    const shares = item.dilutedShares ?? item.weightedAverageShares ?? priorAnnual?.dilutedShares ?? 352;
    const capex = item.capex ?? item.revenue * (priorAnnual?.capexIntensity ?? 0.1);
    const equityFreeCashFlow = item.equityFreeCashFlow ?? adjustedEbitda * (priorAnnual?.equityFreeCashFlow && priorAnnual?.adjustedEbitda ? priorAnnual.equityFreeCashFlow / priorAnnual.adjustedEbitda : 0.62);
    return {
      id: item.id,
      ticker: "LSEG.L",
      periodId: item.periodId,
      fiscalYear: item.fiscalYear,
      periodType: "reporting_event_run_rate",
      eventId: item.eventId,
      asOfDate: item.asOfDate,
      sourceType: "forecast_assumption",
      revenue: item.revenue,
      adjustedEbitda,
      adjustedEbitdaMargin: item.adjustedEbitdaMargin,
      adjustedOperatingProfit: item.adjustedOperatingProfit ?? adjustedEbitda * 0.78,
      adjustedNetIncome: item.adjustedNetIncome ?? (item.adjustedEps ? item.adjustedEps * shares : null),
      adjustedEps: item.adjustedEps ?? null,
      weightedAverageShares: shares,
      dilutedShares: shares,
      equityFreeCashFlow,
      capex,
      capexIntensity: capex / item.revenue,
      netDebt: item.netDebt ?? priorAnnual?.netDebt ?? null,
      cashInterestExpense: item.cashInterestExpense ?? null,
      taxRate: item.taxRate ?? 0.24,
      minorityInterest: item.minorityInterest ?? null,
      buybackAmount: item.buybackAmount ?? 0,
      dividendPerShare: item.dividendPerShare ?? priorAnnual?.dividendPerShare ?? null,
      currentPrice: currentPriceGbp,
      rawJson: JSON.stringify({
        source: "event_visible_guidance_run_rate_seed",
        dataLayer: "forecast_assumption",
        valuationSemantics: item.valuationSemantics ?? {
          isAnnualizedRunRate: true,
          isSameYearForecastAnchor: true,
          forecastStartYear: item.fiscalYear,
          firstGrowthYear: item.fiscalYear + 1,
          dcfYearOneGrowthSuppressed: true,
        },
        officialMetric: item.officialMetric,
        sourceUrl: item.sourceUrl,
        rationale: "Annualized disclosure snapshot built only from information visible at the reporting event; replace with full historical model once extracted tables are complete.",
      }),
    };
  });
  const yfinanceFinancialPeriod = (year, event) => {
    const period = `${year}-12-31`;
    const revenue = toMillions(income.value("Total Revenue", period));
    const adjustedEbitda = toMillions(income.value("Normalized EBITDA", period) ?? income.value("EBITDA", period));
    const capex = Math.abs(toMillions(cashflow.value("Capital Expenditure", period)) ?? 0);
    const dilutedShares = toMillions(income.value("Diluted Average Shares", period));
    const netDebt = toMillions(balance.value("Net Debt", period));
    const dividendPerShare = fiscalDividendPerShare(year);
    return {
      id: `lseg-fy${year}`,
      ticker: "LSEG.L",
      periodId: `fy${year}`,
      fiscalYear: year,
      periodType: "annual",
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? `${year + 1}-03-01`,
      sourceType: year >= 2024 ? "official_actual" : "market_data",
      revenue,
      adjustedEbitda,
      adjustedEbitdaMargin: revenue && adjustedEbitda ? adjustedEbitda / revenue : null,
      adjustedOperatingProfit: toMillions(income.value("EBIT", period) ?? income.value("Operating Income", period)),
      adjustedNetIncome: toMillions(income.value("Net Income From Continuing Operation Net Minority Interest", period)),
      adjustedEps: income.value("Diluted EPS", period),
      weightedAverageShares: toMillions(income.value("Basic Average Shares", period)),
      dilutedShares,
      equityFreeCashFlow: toMillions(cashflow.value("Free Cash Flow", period)),
      capex,
      capexIntensity: revenue && capex ? capex / revenue : null,
      netDebt,
      cashInterestExpense: Math.abs(toMillions(cashflow.value("Interest Paid Cfo", period)) ?? 0),
      taxRate: income.value("Tax Rate For Calcs", period),
      minorityInterest: Math.abs(toMillions(income.value("Minority Interests", period)) ?? 0),
      buybackAmount: Math.abs(toMillions(cashflow.value("Repurchase Of Capital Stock", period)) ?? 0),
      dividendPerShare,
      currentPrice: currentPriceGbp,
      rawJson: JSON.stringify({
        source: "yfinance_financial_statement_snapshot",
        period,
        qualityTag: year >= 2024 ? "official_cross_check" : "market_data_proxy",
        dividendPerShareSource: dividendPerShare == null ? null : "yfinance_dividend_schedule_interim_plus_following_final",
        dividendPerShareNote: dividendPerShare == null ? "Dividend per share unavailable in local dividend schedule." : "Fiscal-year DPS uses interim dividend ex-date in fiscal year plus final dividend ex-date in the following year.",
      }),
    };
  };
  const financialPeriods = [
    ...historicalAnnualFinancialPeriods,
    ...eventRunRateFinancialPeriods,
    yfinanceFinancialPeriod(2022, fy2022Event),
    yfinanceFinancialPeriod(2023, fy2023Event),
    {
      ...yfinanceFinancialPeriod(2024, fy2024Event),
      sourceType: "official_actual",
      revenue: 8494,
      adjustedEbitda: 4148,
      adjustedEbitdaMargin: 0.488,
      adjustedOperatingProfit: 3165,
      adjustedNetIncome: 1934,
      adjustedEps: 3.635,
      weightedAverageShares: 532,
      dilutedShares: 535,
      equityFreeCashFlow: 2186,
      capex: 866,
      capexIntensity: 0.102,
      netDebt: 6454,
      cashInterestExpense: 195,
      taxRate: 0.24,
      minorityInterest: 323,
      buybackAmount: 1100,
      dividendPerShare: 1.3,
      rawJson: JSON.stringify({ source: "official_fy2025_comparator", period: "FY2024", qualityTag: "official_actual" }),
    },
    {
      id: "lseg-fy2025",
      ticker: "LSEG.L",
      periodId: "fy2025",
      fiscalYear: 2025,
      periodType: "annual",
      eventId: fy2025Event?.id ?? null,
      asOfDate: fy2025Event?.eventDate ?? "2026-02-26",
      sourceType: "official_actual",
      revenue: fy2025.totalIncomeExRecoveries ?? null,
      adjustedEbitda: fy2025.adjustedEbitda ?? null,
      adjustedEbitdaMargin: fy2025.adjustedEbitdaMargin ?? null,
      adjustedOperatingProfit: fy2025.adjustedOperatingProfit ?? null,
      adjustedNetIncome: 2204,
      adjustedEps: fy2025.adjustedEpsPence ? fy2025.adjustedEpsPence / 100 : null,
      weightedAverageShares: fy2025.weightedAverageShares ?? null,
      dilutedShares: fy2025.weightedAverageShares ?? null,
      equityFreeCashFlow: fy2025.equityFreeCashFlow ?? null,
      capex: fy2025.cashCapex ?? null,
      capexIntensity: fy2025.cashCapex && fy2025.totalIncomeExRecoveries ? fy2025.cashCapex / fy2025.totalIncomeExRecoveries : null,
      netDebt: fy2025.netDebt ?? null,
      cashInterestExpense: 179,
      taxRate: 0.24,
      minorityInterest: 334,
      buybackAmount: fy2025.buybackSpend ?? null,
      dividendPerShare: fy2025.totalDividendPerSharePence ? fy2025.totalDividendPerSharePence / 100 : null,
      currentPrice: currentPriceGbp,
      rawJson: JSON.stringify(fy2025),
    },
  ].filter((row) => row.revenue != null);

  const latestOfficialSegments = [
    ...(official.segment_actuals?.fy2025 ?? []).map((segment) => ({
      segment: segment.segment,
      taxonomy: "reported_segment",
      revenueDefinition: segment.revenueExRecoveries ? "revenue_excluding_recoveries" : "revenue",
      revenue: segment.revenueExRecoveries ?? segment.revenue ?? null,
      adjustedEbitda: segment.adjustedEbitda ?? null,
      sourceType: segment.source_type ?? "official_actual",
      splitSource: "reported",
      parentReportedSegment: segment.segment,
      notes: null,
      rawJson: segment,
    })),
    ...(official.analytical_markets_split?.fy2025 ?? []).map((segment) => ({
      segment: segment.segment,
      taxonomy: "analytical_split",
      revenueDefinition: "markets_analytical_split",
      revenue: segment.revenue ?? null,
      adjustedEbitda: segment.adjustedEbitda ?? null,
      sourceType: official.analytical_markets_split?.source_type ?? "forecast_assumption",
      splitSource: "analyst_assumption",
      parentReportedSegment: segment.parentReportedSegment ?? "Markets",
      notes: official.analytical_markets_split?.note ?? null,
      rawJson: segment,
    })),
  ];
  const hasLatestMarketsAnalyticalSplit = latestOfficialSegments.some((segment) => segment.taxonomy === "analytical_split");
  const latestValuationSegments = hasLatestMarketsAnalyticalSplit
    ? latestOfficialSegments.filter((segment) => !(segment.segment === "Markets" && segment.taxonomy === "reported_segment"))
    : latestOfficialSegments;
  const latestRevenue = latestValuationSegments.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
  const latestEbitda = latestValuationSegments.reduce((sum, row) => sum + (row.adjustedEbitda ?? 0), 0);
  const preRefinitivSegmentMix = [
    {
      segment: "FTSE Russell / Index",
      parentReportedSegment: "Information Services",
      taxonomy: "pre_refinitiv_bridge",
      revenueShare: 0.315,
      ebitdaShare: 0.39,
      sourceType: "forecast_assumption",
      notes: "Pre-Refinitiv bridge from Information Services into the current FTSE Russell / Index analytical taxonomy.",
    },
    {
      segment: "Data & Analytics",
      parentReportedSegment: "Information Services",
      taxonomy: "pre_refinitiv_bridge",
      revenueShare: 0.1,
      ebitdaShare: 0.1,
      sourceType: "forecast_assumption",
      notes: "Legacy real-time data and other information services mapped into Data & Analytics before Refinitiv closed.",
    },
    {
      segment: "Post Trade / LCH",
      parentReportedSegment: "Post Trade",
      taxonomy: "pre_refinitiv_bridge",
      revenueShare: 0.37,
      ebitdaShare: 0.34,
      sourceType: "forecast_assumption",
      notes: "Pre-Refinitiv Post Trade and LCH mapped into current Post Trade / LCH analytical taxonomy.",
    },
    {
      segment: "Capital Markets",
      parentReportedSegment: "Capital Markets",
      taxonomy: "pre_refinitiv_bridge",
      revenueShare: 0.205,
      ebitdaShare: 0.16,
      sourceType: "forecast_assumption",
      notes: "Legacy Capital Markets mapped into current Capital Markets analytical taxonomy.",
    },
    {
      segment: "Corporate / Other",
      parentReportedSegment: "Other",
      taxonomy: "pre_refinitiv_bridge",
      revenueShare: 0.01,
      ebitdaShare: 0.01,
      sourceType: "forecast_assumption",
      notes: "Technology/Other and group items retained as Corporate / Other for comparability.",
    },
  ];
  const segmentMixForPeriod = (period) => {
    if (period.fiscalYear <= 2020) return preRefinitivSegmentMix;
    if (period.periodId === "fy2025") return latestOfficialSegments;
    return latestValuationSegments.map((segment) => ({
      ...segment,
      revenueShare: (segment.revenue ?? 0) / Math.max(latestRevenue, 1),
      ebitdaShare: (segment.adjustedEbitda ?? 0) / Math.max(latestEbitda, 1),
      notes: segment.notes,
    }));
  };
  const segmentFinancials = financialPeriods.flatMap((period) => segmentMixForPeriod(period).map((segment) => {
    const isLatestOfficial = period.periodId === "fy2025";
    const revenue = isLatestOfficial
      ? segment.revenue
      : (period.revenue ?? 0) * (segment.revenueShare ?? ((segment.revenue ?? 0) / Math.max(latestRevenue, 1)));
    const adjustedEbitda = isLatestOfficial
      ? segment.adjustedEbitda
      : (period.adjustedEbitda ?? 0) * (segment.ebitdaShare ?? ((segment.adjustedEbitda ?? 0) / Math.max(latestEbitda, 1)));
    return {
      id: `${period.periodId}-${segment.segment}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      ticker: "LSEG.L",
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      segment: segment.segment,
      taxonomy: segment.taxonomy,
      revenueDefinition: segment.revenueDefinition,
      revenue,
      adjustedEbitda,
      adjustedEbitdaMargin: adjustedEbitda && revenue ? adjustedEbitda / revenue : null,
      sourceType: isLatestOfficial ? segment.sourceType : "forecast_assumption",
      splitSource: isLatestOfficial ? segment.splitSource : (period.fiscalYear <= 2020 ? "pre_refinitiv_taxonomy_bridge" : "historical_ratio_backcast"),
      parentReportedSegment: segment.parentReportedSegment ?? "Markets",
      notes: isLatestOfficial ? segment.notes : (segment.notes ?? "Historical segment rows are backcast from the FY2025 segment mix to avoid using undisclosed segment splits as official facts."),
      rawJson: JSON.stringify({ ...(segment.rawJson ?? segment), historicalBackcast: !isLatestOfficial, valuationLayer: "forecast_assumption" }),
    };
  }));

  const latestFinancialByDate = (eventDate) => financialPeriods
    .filter((period) => period.asOfDate <= eventDate)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0] ?? financialPeriods[0];
  const marketSnapshots = reportingEvents.map((event) => {
    const price = nearestOnOrBefore(priceRows, event.eventDate, (row) => row.date);
    const shares = nearestOnOrBefore(shareRows, event.eventDate, (row) => row.date)?.sharesOutstanding ?? market.data?.sharesOutstanding ?? null;
    const close = price?.close ?? market.data?.currentPrice ?? null;
    const latestFinancial = latestFinancialByDate(event.eventDate);
    const priceGbp = close == null ? null : close / 100;
    const marketCap = priceGbp != null && shares != null ? priceGbp * shares : null;
    return {
      id: `lseg-market-${event.eventDate}`,
      ticker: "LSEG.L",
      asOfDate: event.eventDate,
      priceDate: price?.date ?? official.market_data?.priceDate ?? "2026-05-07",
      currentPrice: close,
      currency: market.data?.currency ?? "GBp",
      marketCap,
      enterpriseValue: marketCap != null && latestFinancial?.netDebt != null ? marketCap + latestFinancial.netDebt * 1_000_000 : null,
      sharesOutstanding: shares,
      previousClose: price?.previousClose ?? null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      dividendYield: null,
      beta: market.data?.beta ?? null,
      source: price?.source ?? market.provenance?.source ?? "yfinance",
      fetchedAt: market.provenance?.fetchedAt ?? now,
      rawJson: JSON.stringify({
        event,
        price,
        sharesOutstanding: shares,
        source: price?.source ?? "event_dated_price_history",
        priceDataQuality: price?.source === "manual_historical_price_seed" ? "low_confidence_manual_seed_pending_vendor_backfill" : "local_market_cache",
      }),
    };
  });

  const peerSnapshots = (peers.data ?? []).map((peer) => ({
    id: `peer-${peer.ticker}-${peers.provenance?.fetchedAt ?? "snapshot"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    ticker: "LSEG.L",
    asOfDate: "2026-05-10",
    peerTicker: peer.ticker,
    peerName: peer.ticker,
    companyName: peer.ticker,
    category: null,
    peerGroup: "financial_data_market_infrastructure",
    marketCap: peer.marketCap ?? null,
    enterpriseValue: peer.enterpriseValue ?? null,
    trailingPe: peer.trailingPE ?? null,
    forwardPe: peer.forwardPE ?? null,
    forwardEvEbitda: peer.enterpriseToEbitda ?? null,
    priceToSales: peer.priceToSalesTrailing12Months ?? null,
    dividendYield: peer.dividendYield ?? null,
    beta: peer.beta ?? null,
    currency: peer.currency ?? null,
    source: peers.provenance?.source ?? "yfinance",
    fetchedAt: peers.provenance?.fetchedAt ?? now,
    confidenceLevel: "medium",
    absoluteValueUse: peer.currency === "GBp" ? "metadata_only_same_listing_currency" : "metadata_only_mixed_currency",
    rawJson: JSON.stringify(peer),
  }));

  const officialGuidance = official.management_guidance?.fy2026 ?? {};
  const guidanceItems = [
    ...[
      {
        id: "fy2021-q1-cost-synergy-guide",
        eventId: "lseg-q1-2021-trading-update",
        asOfDate: "2021-04-28",
        fiscalPeriodTarget: "FY2021",
        metric: "refinitiv_cost_synergy_run_rate",
        guidanceType: "official_management_commentary",
        midpointValue: 40,
        unit: "gbp_m",
        quote: "Approximately GBP 40m of cost synergies already realised on a run-rate basis; still confident in 25% of GBP 350m target by end-2021.",
      },
      {
        id: "fy2021-h1-cost-synergy-guide",
        eventId: "lseg-h1-2021-interim-results",
        asOfDate: "2021-08-06",
        fiscalPeriodTarget: "FY2021",
        metric: "refinitiv_cost_synergy_run_rate",
        guidanceType: "official_management_guidance",
        midpointValue: 125,
        unit: "gbp_m",
        quote: "Full year guidance for run-rate cost synergy delivery increased from GBP 88m to GBP 125m.",
      },
      {
        id: "fy2021-q3-total-income-guide",
        eventId: "lseg-q3-2021-trading-update",
        asOfDate: "2021-10-22",
        fiscalPeriodTarget: "FY2021",
        metric: "total_income_growth_ex_recoveries",
        guidanceType: "official_range",
        lowValue: 0.04,
        highValue: 0.05,
        midpointValue: 0.045,
        unit: "percent",
        quote: "Expected total income to grow between 4-5% for full year 2021.",
      },
      {
        id: "medium-term-data-analytics-growth-guide-2021",
        eventId: "lseg-q3-2021-trading-update",
        asOfDate: "2021-10-22",
        fiscalPeriodTarget: "Medium term",
        metric: "data_analytics_revenue_growth",
        guidanceType: "official_range",
        lowValue: 0.04,
        highValue: 0.06,
        midpointValue: 0.05,
        unit: "percent",
        quote: "Investor Education Event confirmed Data & Analytics revenues to increase by 4-6% annually over the medium term.",
      },
    ].map((item) => ({
      ticker: "LSEG.L",
      lowValue: item.lowValue ?? null,
      highValue: item.highValue ?? null,
      speaker: null,
      sourcePath: reportingEvents.find((event) => event.id === item.eventId)?.sourcePath ?? null,
      confidence: "high",
      humanReviewStatus: "official_curated",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: JSON.stringify({ ...item, dataLayer: "management_guidance", valuationPolicy: "visible_as_of_but_not_auto_promoted" }),
      ...item,
    })),
    {
      id: "fy2026-organic-growth-guide",
      ticker: "LSEG.L",
      eventId: fy2025Event?.id ?? null,
      asOfDate: fy2025Event?.eventDate ?? "2026-02-26",
      fiscalPeriodTarget: "FY2026",
      metric: "organic_total_income_growth",
      guidanceType: "official_range",
      lowValue: officialGuidance.organicTotalIncomeGrowthRange?.[0] ?? null,
      highValue: officialGuidance.organicTotalIncomeGrowthRange?.[1] ?? null,
      midpointValue: officialGuidance.organicTotalIncomeGrowthRange ? (officialGuidance.organicTotalIncomeGrowthRange[0] + officialGuidance.organicTotalIncomeGrowthRange[1]) / 2 : null,
      unit: "percent",
      quote: null,
      speaker: null,
      sourcePath: "data/local/lseg/lseg_official_dataset.json",
      confidence: "high",
      humanReviewStatus: "official_curated",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: JSON.stringify(officialGuidance),
    },
    ...guidanceMentions.items.slice(0, 100).map((item, index) => ({
      id: `guidance-candidate-${index + 1}`,
      ticker: "LSEG.L",
      eventId: item.transcriptId,
      asOfDate: item.eventDate,
      fiscalPeriodTarget: item.fiscalPeriod,
      metric: item.subtopic ?? item.topic ?? "guidance",
      guidanceType: item.guidanceType ?? "candidate",
      lowValue: null,
      highValue: null,
      midpointValue: null,
      unit: null,
      quote: item.supportingQuoteShort ?? item.extractedClaim ?? null,
      speaker: item.speaker ?? null,
      sourcePath: item.sourcePath ?? null,
      confidence: item.confidence ?? "low",
      humanReviewStatus: item.needsHumanReview ? "needs_review" : "unreviewed",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: JSON.stringify(item),
    })),
  ];

  const transcriptEvents = transcriptDb.records.map((record) => ({
    id: `transcript-event-${record.transcriptId}`,
    ticker: "LSEG.L",
    eventId: record.transcriptId,
    eventDate: record.eventDate,
    fiscalPeriod: record.fiscalPeriod,
    eventType: record.eventType,
    transcriptId: record.transcriptId,
    hasQa: record.hasQA ? 1 : 0,
    sourcePath: record.sourcePath ?? null,
    provenance: record.sourceQualityTag ?? record.sourceType ?? null,
    confidence: record.qaBoundaryConfidence ?? "medium",
    metadataJson: JSON.stringify(record),
  }));
  const transcriptExtractions = qaPairs.items.slice(0, 200).map((item) => ({
    id: item.id,
    ticker: "LSEG.L",
    transcriptId: item.transcriptId,
    eventId: item.transcriptId,
    extractionType: "qa_pair",
    topic: item.topic ?? null,
    segment: item.segment ?? null,
    speaker: item.speaker ?? item.analystName ?? null,
    section: item.section ?? "qa",
    supportingQuoteShort: item.supportingQuoteShort ?? item.answerSummary ?? null,
    confidence: item.confidence ?? "medium",
    needsHumanReview: item.needsHumanReview === false ? 0 : 1,
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: JSON.stringify(item),
  }));

  const modelVersions = [
    {
      id: "lseg_v1_backend_pilot",
      ticker: "LSEG.L",
      version: "lseg_v1_backend_pilot",
      name: "LSEG backend pilot adapter",
      description: "Persists DB snapshots and calls current LSEG static valuation engine without formula fork.",
      codeCommitSha: null,
      valuationMethodsJson: JSON.stringify(["FCFF DCF", "FCF Yield", "SOTP", "EV/EBITDA", "P/E", "Platform moat / risk overlay"]),
      assumptionSchemaJson: JSON.stringify({ source: "src/stocks/lseg/data/assumptions.ts" }),
      createdAt: now,
    },
  ];
  const assumptionSets = ["Bear", "Base", "Bull"].map((scenario) => ({
    id: `lseg-v1-${scenario.toLowerCase()}-default`,
    ticker: "LSEG.L",
    name: `${scenario} default static assumptions`,
    scenario,
    modelVersion: "lseg_v1_backend_pilot",
    asOfDate: fy2025Event?.eventDate ?? "2026-02-26",
    assumptionsJson: JSON.stringify({}),
    sourceType: "forecast_assumption",
    createdAt: now,
  }));

  const validationWarnings = [
    {
      id: "backend-adapter-static-dataset",
      ticker: "LSEG.L",
      scope: "valuation_adapter",
      severity: "low",
      title: "Adapter uses static current dataset",
      detail: "Phase 1 persists DB snapshots but valuation still calls current static LSEG data until full historical row mapping is implemented.",
      relatedTable: "valuation_runs",
      relatedRecordId: null,
      createdAt: now,
    },
    ...((warnings.items ?? warnings.warnings ?? []).slice(0, 20).map((warning, index) => ({
      id: `market-warning-${index + 1}`,
      ticker: "LSEG.L",
      scope: "market_data",
      severity: "medium",
      title: warning.title ?? "Market data warning",
      detail: typeof warning === "string" ? warning : JSON.stringify(warning),
      relatedTable: "market_snapshots",
      relatedRecordId: "lseg-market-2026-05-10",
      createdAt: now,
    }))),
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
