import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { GOOGL_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "GOOGL";
const COMPANYFACTS_PATH = path.resolve("data/local/googl/sec/companyfacts_CIK0001652044.json");
const LOCAL_OFFICIAL_DATASET_PATH = path.resolve("data/local/goog/goog_official_dataset.json");
const SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001652044.json";

function json(value) {
  return JSON.stringify(value ?? null);
}

function parseJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sourceLayer(status, fallback = "research_only") {
  if (status === "official_actual") return "official_actual";
  if (status === "management_guidance") return "management_guidance";
  if (status === "company_commentary") return "company_commentary";
  if (status === "third_party_secondary") return "transcript_commentary";
  if (status === "market_data") return "market_data";
  if (status === "forecast_assumption") return "forecast_assumption";
  if (status === "derived") return "derived";
  return fallback;
}

function periodEventDate(period) {
  if (period.id === "q1-26") return "2026-04-29";
  if (period.id === "fy25") return "2026-02-05";
  if (period.id === "fy24") return "2025-02-05";
  return `${period.fiscalYear}-12-31`;
}

function periodEventType(period) {
  if (period.periodType === "annual") return "annual_report";
  if (period.id.includes("q1")) return "q1_results";
  if (period.id.includes("q2")) return "q2_results";
  if (period.id.includes("q3")) return "q3_results";
  if (period.id.includes("q4")) return "q4_results";
  return "market_snapshot";
}

function fiscalPeriodFromTranscript(value = "") {
  const quarter = value.match(/Q([1-4])\s+(\d{4})/i);
  if (quarter) return `Q${quarter[1]} FY${quarter[2]}`;
  const year = value.match(/(\d{4})/);
  return year ? `FY${year[1]}` : value;
}

function fiscalYearFromText(value = "") {
  const year = value.match(/20\d{2}/);
  return year ? Number(year[0]) : null;
}

function secFacts() {
  return parseJsonFile(COMPANYFACTS_PATH)?.facts ?? null;
}

function secUnit(facts, tag, unit = "USD") {
  return facts?.["us-gaap"]?.[tag]?.units?.[unit] ?? [];
}

function daySpan(row) {
  if (!row?.start || !row?.end) return 0;
  return (new Date(row.end).getTime() - new Date(row.start).getTime()) / 86_400_000;
}

function addDaysIso(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function secDurationFact(facts, tags, fiscalYear, unit = "USD") {
  const end = `${fiscalYear}-12-31`;
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => row.form === "10-K" && row.fp === "FY" && row.fy === fiscalYear && row.end === end && daySpan(row) > 300)
      .sort((left, right) => left.filed.localeCompare(right.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function secInstantFact(facts, tags, fiscalYear, unit = "USD") {
  const end = `${fiscalYear}-12-31`;
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => row.form === "10-K" && row.fp === "FY" && row.fy === fiscalYear && row.end === end)
      .sort((left, right) => left.filed.localeCompare(right.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function secDurationByDates(facts, tags, start, end, forms = ["10-Q", "10-K"], unit = "USD", filedCutoff = "9999-12-31") {
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => forms.includes(row.form) && row.start === start && row.end === end && row.filed <= filedCutoff)
      .sort((left, right) => left.filed.localeCompare(right.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function secInstantByEnd(facts, tags, end, filedCutoff, unit = "USD") {
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => ["10-Q", "10-K"].includes(row.form) && row.end === end && row.filed <= filedCutoff)
      .sort((left, right) => right.filed.localeCompare(left.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function usdToMillions(fact) {
  return typeof fact?.val === "number" ? fact.val / 1_000_000 : null;
}

function sharesToMillions(fact) {
  return typeof fact?.val === "number" ? fact.val / 1_000_000 : null;
}

function addNumbers(...values) {
  const finite = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) : null;
}

function buildSecAnnualFinancials() {
  const facts = secFacts();
  if (!facts) return [];
  return Array.from({ length: 9 }, (_, index) => 2017 + index)
    .map((fiscalYear) => {
      const revenue = secDurationFact(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], fiscalYear);
      const costOfRevenue = secDurationFact(facts, ["CostOfRevenue"], fiscalYear);
      const operatingIncome = secDurationFact(facts, ["OperatingIncomeLoss"], fiscalYear);
      const netIncome = secDurationFact(facts, ["NetIncomeLoss"], fiscalYear);
      const operatingCashFlow = secDurationFact(facts, ["NetCashProvidedByUsedInOperatingActivities"], fiscalYear);
      const capex = secDurationFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"], fiscalYear);
      const depreciation = secDurationFact(facts, ["Depreciation", "DepreciationDepletionAndAmortization"], fiscalYear);
      const stockBasedCompensation = secDurationFact(facts, ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"], fiscalYear);
      const buybacks = secDurationFact(facts, ["PaymentsForRepurchaseOfCommonStock"], fiscalYear);
      const dividends = secDurationFact(facts, ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"], fiscalYear);
      const dilutedEps = secDurationFact(facts, ["EarningsPerShareDiluted"], fiscalYear, "USD/shares");
      const dilutedShares = secDurationFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], fiscalYear, "shares");
      const cashAndShortTermInvestments = secInstantFact(facts, ["CashCashEquivalentsAndShortTermInvestments"], fiscalYear);
      const cash = secInstantFact(facts, ["CashAndCashEquivalentsAtCarryingValue"], fiscalYear);
      const marketableCurrent = secInstantFact(facts, ["MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"], fiscalYear);
      const marketableNoncurrent = secInstantFact(facts, ["MarketableSecuritiesNoncurrent", "MarketableSecurities"], fiscalYear);
      const currentDebt = secInstantFact(facts, ["LongTermDebtCurrent", "DebtCurrent"], fiscalYear);
      const noncurrentDebt = secInstantFact(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], fiscalYear);
      const operatingLeaseCurrent = secInstantFact(facts, ["OperatingLeaseLiabilityCurrent"], fiscalYear);
      const operatingLeaseNoncurrent = secInstantFact(facts, ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiability"], fiscalYear);
      const financeLease = secInstantFact(facts, ["FinanceLeaseLiability"], fiscalYear);
      const ppeNet = secInstantFact(facts, ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization"], fiscalYear);
      const revenueValue = usdToMillions(revenue);
      const costValue = usdToMillions(costOfRevenue);
      const operatingIncomeValue = usdToMillions(operatingIncome);
      const ocfValue = usdToMillions(operatingCashFlow);
      const capexValue = usdToMillions(capex);
      const cashAndInvestments =
        usdToMillions(cashAndShortTermInvestments) ??
        addNumbers(usdToMillions(cash), usdToMillions(marketableCurrent), usdToMillions(marketableNoncurrent));
      const debt = addNumbers(usdToMillions(currentDebt), usdToMillions(noncurrentDebt));
      const filed = revenue?.filed ?? operatingIncome?.filed ?? `${fiscalYear + 1}-02-15`;
      return {
        id: `fy${String(fiscalYear).slice(2)}`,
        label: `FY${fiscalYear}A`,
        fiscalYear,
        periodType: "annual",
        sourceStatus: "official_actual",
        sourceId: `googl-sec-companyfacts-fy${fiscalYear}`,
        sourceUrl: SEC_COMPANYFACTS_URL,
        eventDate: filed,
        totalRevenue: revenueValue,
        costOfRevenue: costValue,
        grossProfit: revenueValue != null && costValue != null ? revenueValue - costValue : null,
        grossMargin: revenueValue && costValue != null ? (revenueValue - costValue) / revenueValue : null,
        operatingIncome: operatingIncomeValue,
        operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
        netIncome: usdToMillions(netIncome),
        dilutedEps: dilutedEps?.val ?? null,
        dilutedShares: sharesToMillions(dilutedShares),
        netCashProvidedByOperatingActivities: ocfValue,
        capex: capexValue,
        freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
        depreciation: usdToMillions(depreciation),
        stockBasedCompensation: usdToMillions(stockBasedCompensation),
        cashAndMarketableSecurities: cashAndInvestments,
        longTermDebt: debt,
        operatingLeaseLiabilities: addNumbers(usdToMillions(operatingLeaseCurrent), usdToMillions(operatingLeaseNoncurrent)),
        financeLeaseLiabilities: usdToMillions(financeLease),
        ppeNet: usdToMillions(ppeNet),
        dividendPayments: usdToMillions(dividends),
        shareRepurchases: usdToMillions(buybacks),
        notes: `SEC Companyfacts annual 10-K facts for FY${fiscalYear}; units converted to USDm/share counts in millions.`,
      };
    })
    .filter((row) => row.totalRevenue != null && row.operatingIncome != null);
}

const QUARTERS = {
  1: { fp: "Q1", start: "01-01", end: "03-31" },
  2: { fp: "Q2", start: "04-01", end: "06-30", ytdEnd: "06-30", priorYtdEnd: "03-31" },
  3: { fp: "Q3", start: "07-01", end: "09-30", ytdEnd: "09-30", priorYtdEnd: "06-30" },
  4: { fp: "Q4", start: "10-01", end: "12-31", ytdEnd: "12-31", priorYtdEnd: "09-30" },
};

function quarterDates(fiscalYear, quarter) {
  const spec = QUARTERS[quarter];
  return {
    start: `${fiscalYear}-${spec.start}`,
    end: `${fiscalYear}-${spec.end}`,
    ytdStart: `${fiscalYear}-01-01`,
    ytdEnd: `${fiscalYear}-${spec.ytdEnd ?? spec.end}`,
    priorYtdEnd: spec.priorYtdEnd ? `${fiscalYear}-${spec.priorYtdEnd}` : null,
  };
}

function secQuarterDurationFact(facts, tags, fiscalYear, quarter, unit = "USD") {
  const dates = quarterDates(fiscalYear, quarter);
  const timelyFiledCutoff = addDaysIso(dates.end, quarter === 4 ? 120 : 90);
  if (quarter < 4) {
    const direct = secDurationByDates(facts, tags, dates.start, dates.end, ["10-Q"], unit, timelyFiledCutoff);
    if (direct) return { ...direct, derivation: "direct_quarter" };
    const cumulative = secDurationByDates(facts, tags, dates.ytdStart, dates.ytdEnd, ["10-Q"], unit, timelyFiledCutoff);
    if (!cumulative) return null;
    if (quarter === 1) return { ...cumulative, derivation: "q1_ytd" };
    const prior = secDurationByDates(facts, tags, dates.ytdStart, dates.priorYtdEnd, ["10-Q"], unit, cumulative.filed);
    if (!prior || typeof cumulative.val !== "number" || typeof prior.val !== "number") return null;
    return { ...cumulative, val: cumulative.val - prior.val, derivation: "ytd_less_prior_ytd", priorFact: prior };
  }
  const annual = secDurationFact(facts, tags, fiscalYear, unit);
  if (!annual || annual.filed > timelyFiledCutoff) return null;
  const q3 = secDurationByDates(facts, tags, dates.ytdStart, `${fiscalYear}-09-30`, ["10-Q"], unit, annual.filed);
  if (!q3 || typeof annual.val !== "number" || typeof q3.val !== "number") return null;
  return { ...annual, val: annual.val - q3.val, derivation: "annual_less_q3_ytd", priorFact: q3 };
}

function secQuarterWeightedAverageFact(facts, tags, fiscalYear, quarter, unit = "shares") {
  const dates = quarterDates(fiscalYear, quarter);
  const timelyFiledCutoff = addDaysIso(dates.end, quarter === 4 ? 120 : 90);
  if (quarter < 4) {
    const direct = secDurationByDates(facts, tags, dates.start, dates.end, ["10-Q"], unit, timelyFiledCutoff);
    if (direct) return { ...direct, derivation: "direct_quarter_weighted_average" };
    if (quarter === 1) {
      const cumulative = secDurationByDates(facts, tags, dates.ytdStart, dates.ytdEnd, ["10-Q"], unit, timelyFiledCutoff);
      if (cumulative) return { ...cumulative, derivation: "q1_weighted_average" };
    }
    return null;
  }
  const annual = secDurationFact(facts, tags, fiscalYear, unit);
  if (!annual || annual.filed > timelyFiledCutoff) return null;
  return { ...annual, derivation: "annual_weighted_average_used_for_q4" };
}

function buildSecQuarterlyFinancials() {
  const facts = secFacts();
  if (!facts) return [];
  const rows = [];
  for (let fiscalYear = 2017; fiscalYear <= 2026; fiscalYear += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const dates = quarterDates(fiscalYear, quarter);
      const revenue = secQuarterDurationFact(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], fiscalYear, quarter);
      const costOfRevenue = secQuarterDurationFact(facts, ["CostOfRevenue"], fiscalYear, quarter);
      const operatingIncome = secQuarterDurationFact(facts, ["OperatingIncomeLoss"], fiscalYear, quarter);
      const netIncome = secQuarterDurationFact(facts, ["NetIncomeLoss"], fiscalYear, quarter);
      const operatingCashFlow = secQuarterDurationFact(facts, ["NetCashProvidedByUsedInOperatingActivities"], fiscalYear, quarter);
      const capex = secQuarterDurationFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"], fiscalYear, quarter);
      const depreciation = secQuarterDurationFact(facts, ["Depreciation", "DepreciationDepletionAndAmortization"], fiscalYear, quarter);
      const stockBasedCompensation = secQuarterDurationFact(facts, ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"], fiscalYear, quarter);
      const buybacks = secQuarterDurationFact(facts, ["PaymentsForRepurchaseOfCommonStock"], fiscalYear, quarter);
      const dividends = secQuarterDurationFact(facts, ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"], fiscalYear, quarter);
      const dilutedEps = secQuarterDurationFact(facts, ["EarningsPerShareDiluted"], fiscalYear, quarter, "USD/shares");
      const dilutedShares = secQuarterWeightedAverageFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], fiscalYear, quarter, "shares");
      const filed = revenue?.filed ?? operatingIncome?.filed ?? null;
      if (!filed) continue;
      const cashAndShortTermInvestments = secInstantByEnd(facts, ["CashCashEquivalentsAndShortTermInvestments"], dates.end, filed);
      const cash = secInstantByEnd(facts, ["CashAndCashEquivalentsAtCarryingValue"], dates.end, filed);
      const marketableCurrent = secInstantByEnd(facts, ["MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent"], dates.end, filed);
      const marketableNoncurrent = secInstantByEnd(facts, ["MarketableSecuritiesNoncurrent", "MarketableSecurities"], dates.end, filed);
      const currentDebt = secInstantByEnd(facts, ["LongTermDebtCurrent", "DebtCurrent"], dates.end, filed);
      const noncurrentDebt = secInstantByEnd(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], dates.end, filed);
      const operatingLeaseCurrent = secInstantByEnd(facts, ["OperatingLeaseLiabilityCurrent"], dates.end, filed);
      const operatingLeaseNoncurrent = secInstantByEnd(facts, ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiability"], dates.end, filed);
      const financeLease = secInstantByEnd(facts, ["FinanceLeaseLiability"], dates.end, filed);
      const ppeNet = secInstantByEnd(facts, ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization"], dates.end, filed);
      const revenueValue = usdToMillions(revenue);
      const costValue = usdToMillions(costOfRevenue);
      const operatingIncomeValue = usdToMillions(operatingIncome);
      const ocfValue = usdToMillions(operatingCashFlow);
      const capexValue = usdToMillions(capex);
      const cashAndInvestments =
        usdToMillions(cashAndShortTermInvestments) ??
        addNumbers(usdToMillions(cash), usdToMillions(marketableCurrent), usdToMillions(marketableNoncurrent));
      rows.push({
        id: `fy${String(fiscalYear).slice(2)}-q${quarter}`,
        label: `Q${quarter} FY${fiscalYear}A`,
        fiscalYear,
        fiscalQuarter: `Q${quarter}`,
        quarter,
        periodType: "quarterly",
        sourceStatus: "official_actual",
        sourceId: `googl-sec-companyfacts-fy${fiscalYear}-q${quarter}`,
        sourceUrl: SEC_COMPANYFACTS_URL,
        eventDate: filed,
        periodStart: dates.start,
        periodEnd: dates.end,
        totalRevenue: revenueValue,
        costOfRevenue: costValue,
        grossProfit: revenueValue != null && costValue != null ? revenueValue - costValue : null,
        grossMargin: revenueValue && costValue != null ? (revenueValue - costValue) / revenueValue : null,
        operatingIncome: operatingIncomeValue,
        operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
        netIncome: usdToMillions(netIncome),
        dilutedEps: dilutedEps?.val ?? null,
        dilutedShares: sharesToMillions(dilutedShares),
        netCashProvidedByOperatingActivities: ocfValue,
        capex: capexValue,
        freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
        depreciation: usdToMillions(depreciation),
        stockBasedCompensation: usdToMillions(stockBasedCompensation),
        cashAndMarketableSecurities: cashAndInvestments,
        longTermDebt: addNumbers(usdToMillions(currentDebt), usdToMillions(noncurrentDebt)),
        operatingLeaseLiabilities: addNumbers(usdToMillions(operatingLeaseCurrent), usdToMillions(operatingLeaseNoncurrent)),
        financeLeaseLiabilities: usdToMillions(financeLease),
        ppeNet: usdToMillions(ppeNet),
        dividendPayments: usdToMillions(dividends),
        shareRepurchases: usdToMillions(buybacks),
        notes: `SEC Companyfacts ${quarter === 4 ? "10-K-derived Q4" : "10-Q"} facts for Q${quarter} FY${fiscalYear}; Q4 and some cash-flow metrics are derived from YTD deltas where Companyfacts does not publish a discrete quarter row.`,
      });
    }
  }
  return rows.filter((row) => row.totalRevenue != null && row.operatingIncome != null);
}

function proxyPriceForDate(date, currentPrice) {
  const known = [
    ["2018-02-06", 55],
    ["2019-02-05", 58],
    ["2020-02-04", 73],
    ["2021-02-03", 103],
    ["2022-02-02", 148],
    ["2023-02-03", 105],
    ["2024-01-31", 143],
    ["2024-07-23", 181],
    ["2024-10-29", 170],
    ["2025-02-04", 191],
    ["2025-02-05", 191],
    ["2025-04-24", 161],
    ["2025-07-23", 185],
    ["2025-10-29", 275],
    ["2026-02-04", 385],
    ["2026-02-05", 385],
    ["2026-04-29", currentPrice],
    ["2026-05-07", currentPrice],
  ];
  const sorted = [...known].sort((left, right) => left[0].localeCompare(right[0]));
  return sorted
    .filter(([knownDate]) => knownDate <= date)
    .sort((left, right) => right[0].localeCompare(left[0]))[0]?.[1] ?? sorted[0]?.[1] ?? currentPrice;
}

async function loadGooglStaticModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/googl/data/index.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/googl/assumptions.ts");
    const transcriptModule = await server.ssrLoadModule("/src/stocks/googl/data/transcriptData.ts");
    return {
      dataset: dataModule.googlDataset,
      scenarioPresets: assumptionsModule.googlScenarioPresets,
      assumptionDefinitions: assumptionsModule.googlAssumptionDefinitions ?? [],
      transcriptEvents: transcriptModule.googlTranscriptEvents ?? [],
    };
  } finally {
    await server.close();
  }
}

export async function buildGooglBackendSeedPayload() {
  const now = new Date().toISOString();
  const localOfficialDataset = parseJsonFile(LOCAL_OFFICIAL_DATASET_PATH);
  const { dataset, scenarioPresets, assumptionDefinitions, transcriptEvents: staticTranscriptEvents } = await loadGooglStaticModules();
  const secAnnualFinancials = buildSecAnnualFinancials();
  const secQuarterlyFinancials = buildSecQuarterlyFinancials();
  const reportingEventMap = new Map();
  const addEvent = (event) => {
    if (!reportingEventMap.has(event.id)) reportingEventMap.set(event.id, event);
  };

  for (const period of secAnnualFinancials) {
    addEvent({
      id: `annual-report-fy${period.fiscalYear}`,
      ticker: TICKER,
      eventDate: period.eventDate,
      fiscalPeriod: period.label,
      fiscalYear: period.fiscalYear,
      eventType: "annual_report",
      label: `${period.label} SEC 10-K annual snapshot`,
      sourceType: "official_actual",
      sourcePath: period.sourceId,
      createdAt: now,
    });
  }

  for (const period of secQuarterlyFinancials) {
    addEvent({
      id: `quarterly-report-fy${period.fiscalYear}-q${period.quarter}`,
      ticker: TICKER,
      eventDate: period.eventDate,
      fiscalPeriod: period.label,
      fiscalYear: period.fiscalYear,
      eventType: `q${period.quarter}_results`,
      label: `${period.label} SEC ${period.quarter === 4 ? "10-K-derived" : "10-Q"} quarterly snapshot`,
      sourceType: "official_actual",
      sourcePath: period.sourceId,
      createdAt: now,
    });
  }

  for (const period of dataset.financials ?? []) {
    if (period.periodType !== "quarterly") continue;
    addEvent({
      id: `period-${period.id}`,
      ticker: TICKER,
      eventDate: periodEventDate(period),
      fiscalPeriod: period.label,
      fiscalYear: period.fiscalYear,
      eventType: periodEventType(period),
      label: `${period.label} financial snapshot`,
      sourceType: sourceLayer(period.sourceType),
      sourcePath: period.sourceId,
      createdAt: now,
    });
  }

  for (const transcript of staticTranscriptEvents) {
    addEvent({
      id: `transcript-${transcript.transcriptId}`,
      ticker: TICKER,
      eventDate: transcript.eventDate,
      fiscalPeriod: fiscalPeriodFromTranscript(transcript.shortLabel ?? transcript.fiscalPeriod),
      fiscalYear: fiscalYearFromText(transcript.fiscalPeriod),
      eventType: "earnings_transcript",
      label: transcript.label,
      sourceType: sourceLayer(transcript.sourceType, "transcript_commentary"),
      sourcePath: transcript.transcriptId,
      createdAt: now,
    });
  }

  addEvent({
    id: `market-snapshot-${dataset.marketData.priceDate}`,
    ticker: TICKER,
    eventDate: dataset.marketData.priceDate,
    fiscalPeriod: "Market snapshot",
    fiscalYear: fiscalYearFromText(dataset.marketData.priceDate),
    eventType: "market_snapshot",
    label: `GOOGL market snapshot ${dataset.marketData.priceDate}`,
    sourceType: "market_data",
    sourcePath: dataset.marketData.sourceId,
    createdAt: now,
  });

  const reportingEvents = [...reportingEventMap.values()].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const eventByPeriodId = new Map();
  for (const event of reportingEvents) {
    if (event.id.startsWith("annual-report-fy")) eventByPeriodId.set(`fy${String(event.fiscalYear).slice(2)}`, event);
    if (event.id.startsWith("quarterly-report-fy")) {
      const quarter = event.eventType.match(/q([1-4])_/)?.[1];
      if (quarter) eventByPeriodId.set(`fy${String(event.fiscalYear).slice(2)}-q${quarter}`, event);
    }
    if (event.id.startsWith("period-")) eventByPeriodId.set(event.id.replace("period-", ""), event);
  }
  const nearestEventForPeriod = (periodId) => eventByPeriodId.get(periodId) ?? reportingEvents[reportingEvents.length - 1];

  const sourceMap = new Map();
  for (const source of [...(dataset.sources ?? []), ...(localOfficialDataset?.sources ?? [])]) {
    if (!sourceMap.has(source.id)) sourceMap.set(source.id, source);
  }
  const sourceDocuments = [
    ...[...sourceMap.values()].map((source) => ({
      id: source.id,
      ticker: TICKER,
      sourceType: sourceLayer(source.sourceType, "research_only"),
      sourceName: source.title,
      sourcePath: source.url?.startsWith("local://") ? source.url : null,
      sourceUrl: source.url?.startsWith("http") ? source.url : null,
      retrievedAt: source.accessedDate ?? now,
      publishedDate: source.reportingPeriod ?? null,
      provenance: source.notes ?? null,
      confidence: source.sourceType === "official_actual" ? "high" : "medium",
      checksum: null,
      metadataJson: json(source),
    })),
    {
      id: "googl-sec-companyfacts-CIK0001652044",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Alphabet SEC Companyfacts CIK0001652044",
      sourcePath: "data/local/googl/sec/companyfacts_CIK0001652044.json",
      sourceUrl: SEC_COMPANYFACTS_URL,
      retrievedAt: now,
      publishedDate: null,
      provenance: "SEC Companyfacts API. Annual 10-K consolidated facts only; values converted to USDm.",
      confidence: "high",
      checksum: null,
      metadataJson: json({ cik: "0001652044", company: "Alphabet Inc.", source: SEC_COMPANYFACTS_URL }),
    },
    ...secAnnualFinancials.map((period) => ({
      id: period.sourceId,
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: `${period.label} SEC Companyfacts annual 10-K facts`,
      sourcePath: "data/local/googl/sec/companyfacts_CIK0001652044.json",
      sourceUrl: period.sourceUrl,
      retrievedAt: now,
      publishedDate: period.eventDate,
      provenance: "SEC Companyfacts annual 10-K facts; values converted to USDm.",
      confidence: "high",
      checksum: null,
      metadataJson: json(period),
    })),
    ...secQuarterlyFinancials.map((period) => ({
      id: period.sourceId,
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: `${period.label} SEC Companyfacts quarterly facts`,
      sourcePath: "data/local/googl/sec/companyfacts_CIK0001652044.json",
      sourceUrl: period.sourceUrl,
      retrievedAt: now,
      publishedDate: period.eventDate,
      provenance: "SEC Companyfacts quarterly 10-Q facts or 10-K-derived Q4 facts; values converted to USDm.",
      confidence: "high",
      checksum: null,
      metadataJson: json(period),
    })),
  ];

  const financialPeriods = [
    ...secQuarterlyFinancials.map((period) => ({
      id: `googl-sec-${period.id}`,
      ticker: TICKER,
      periodId: period.id,
      fiscalYear: period.fiscalYear,
      periodType: period.periodType,
      eventId: `quarterly-report-fy${period.fiscalYear}-q${period.quarter}`,
      asOfDate: period.eventDate,
      sourceType: "official_actual",
      revenue: period.totalRevenue,
      costOfRevenue: period.costOfRevenue,
      grossProfit: period.grossProfit,
      grossMargin: period.grossMargin,
      operatingIncome: period.operatingIncome,
      operatingMargin: period.operatingMargin,
      netIncome: period.netIncome,
      dilutedEps: period.dilutedEps,
      dilutedShares: period.dilutedShares,
      operatingCashFlow: period.netCashProvidedByOperatingActivities,
      capex: period.capex,
      freeCashFlow: period.freeCashFlow,
      depreciationAmortization: period.depreciation,
      stockBasedCompensation: period.stockBasedCompensation,
      cashAndShortTermInvestments: period.cashAndMarketableSecurities,
      debt: period.longTermDebt,
      operatingLeaseLiabilities: period.operatingLeaseLiabilities,
      ppeNet: period.ppeNet,
      dividendsPaid: period.dividendPayments,
      buybacks: period.shareRepurchases,
      currentPrice: proxyPriceForDate(period.eventDate, dataset.marketData.currentPrice),
      rawJson: json(period),
    })),
    ...secAnnualFinancials.map((period) => ({
      id: `googl-sec-${period.id}`,
      ticker: TICKER,
      periodId: period.id,
      fiscalYear: period.fiscalYear,
      periodType: period.periodType,
      eventId: `annual-report-fy${period.fiscalYear}`,
      asOfDate: period.eventDate,
      sourceType: "official_actual",
      revenue: period.totalRevenue,
      costOfRevenue: period.costOfRevenue,
      grossProfit: period.grossProfit,
      grossMargin: period.grossMargin,
      operatingIncome: period.operatingIncome,
      operatingMargin: period.operatingMargin,
      netIncome: period.netIncome,
      dilutedEps: period.dilutedEps,
      dilutedShares: period.dilutedShares,
      operatingCashFlow: period.netCashProvidedByOperatingActivities,
      capex: period.capex,
      freeCashFlow: period.freeCashFlow,
      depreciationAmortization: period.depreciation,
      stockBasedCompensation: period.stockBasedCompensation,
      cashAndShortTermInvestments: period.cashAndMarketableSecurities,
      debt: period.longTermDebt,
      operatingLeaseLiabilities: period.operatingLeaseLiabilities,
      ppeNet: period.ppeNet,
      dividendsPaid: period.dividendPayments,
      buybacks: period.shareRepurchases,
      currentPrice: proxyPriceForDate(period.eventDate, dataset.marketData.currentPrice),
      rawJson: json(period),
    })),
    ...(dataset.financials ?? [])
      .filter((period) => period.periodType === "quarterly")
      .map((period) => {
        const event = nearestEventForPeriod(period.id);
        return {
          id: `googl-${period.id}`,
          ticker: TICKER,
          periodId: period.id,
          fiscalYear: period.fiscalYear,
          periodType: period.periodType,
          eventId: event?.id ?? null,
          asOfDate: event?.eventDate ?? periodEventDate(period),
          sourceType: sourceLayer(period.sourceType),
          revenue: period.totalRevenue,
          costOfRevenue: null,
          grossProfit: null,
          grossMargin: null,
          operatingIncome: period.operatingIncome,
          operatingMargin: period.operatingMargin ?? (period.totalRevenue ? period.operatingIncome / period.totalRevenue : null),
          netIncome: period.netIncome ?? null,
          dilutedEps: period.dilutedEps ?? null,
          dilutedShares: period.dilutedShares ?? null,
          operatingCashFlow: period.netCashProvidedByOperatingActivities ?? null,
          capex: period.capex ?? null,
          freeCashFlow: period.freeCashFlow ?? null,
          depreciationAmortization: period.depreciation ?? null,
          stockBasedCompensation: null,
          cashAndShortTermInvestments: period.cashAndMarketableSecurities ?? null,
          debt: period.longTermDebt ?? null,
          operatingLeaseLiabilities: period.operatingLeaseLiabilities ?? null,
          ppeNet: null,
          dividendsPaid: period.dividendPayments ?? null,
          buybacks: period.shareRepurchases ?? null,
          currentPrice: proxyPriceForDate(event?.eventDate ?? periodEventDate(period), dataset.marketData.currentPrice),
          rawJson: json(period),
        };
      }),
  ];

  const segmentFinancials = (dataset.segments ?? []).map((segment, index) => {
    const event = nearestEventForPeriod(segment.periodId);
    return {
      id: `googl-segment-${segment.periodId}-${index}`,
      ticker: TICKER,
      periodId: segment.periodId,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? periodEventDate({ id: segment.periodId, fiscalYear: 2026, periodType: "quarterly" }),
      segment: segment.segment,
      taxonomy: "reported_segment",
      revenue: segment.revenue,
      costOfRevenue: null,
      operatingExpenses: null,
      operatingIncome: segment.operatingIncome,
      operatingMargin: segment.revenue ? segment.operatingIncome / segment.revenue : null,
      grossMargin: null,
      growth: null,
      constantCurrencyGrowth: null,
      sourceType: sourceLayer(segment.sourceType),
      notes: "Reported Alphabet segment revenue and operating income where available in static official-data module.",
      rawJson: json(segment),
    };
  });

  const latestQuarter = dataset.financials?.find((period) => period.id === "q1-26") ?? dataset.financials?.[dataset.financials.length - 1];
  const latestCloudSegment = dataset.segments?.find((segment) => segment.periodId === latestQuarter?.id && segment.segment === "Google Cloud");
  const latestServicesRevenueLine = dataset.revenueLines?.find((line) => line.periodId === latestQuarter?.id) ?? dataset.revenueLines?.[dataset.revenueLines.length - 1];
  const cloudAiKpis = [
    ...financialPeriods.map((period) => ({
      id: `googl-driver-${period.periodId}`,
      ticker: TICKER,
      periodId: period.periodId,
      eventId: period.eventId,
      asOfDate: period.asOfDate,
      sourceType: period.sourceType === "official_actual" ? "derived" : period.sourceType,
      googleCloudRevenue: period.periodId === latestQuarter?.id ? latestCloudSegment?.revenue ?? null : null,
      googleCloudRevenueGrowth: null,
      googleCloudOperatingIncome: period.periodId === latestQuarter?.id ? latestCloudSegment?.operatingIncome ?? null : null,
      googleCloudOperatingMargin:
        period.periodId === latestQuarter?.id && latestCloudSegment?.revenue ? latestCloudSegment.operatingIncome / latestCloudSegment.revenue : null,
      googleCloudBacklog: period.periodId === latestQuarter?.id ? dataset.cloudBacklog?.googleCloudBacklog ?? null : null,
      totalRevenueBacklog: period.periodId === latestQuarter?.id ? dataset.cloudBacklog?.totalRevenueBacklog ?? null : null,
      expectedRecognitionWithin24Months: period.periodId === latestQuarter?.id ? dataset.cloudBacklog?.expectedRecognitionWithin24Months ?? null : null,
      searchRevenueGrowth: period.rawJson ? JSON.parse(period.rawJson)?.revenueGrowth ?? null : null,
      youtubeAdsGrowth: null,
      subscriptionsGrowth: null,
      tacRatio: period.periodId === latestQuarter?.id && latestServicesRevenueLine?.googleAdvertising ? 15_228 / latestServicesRevenueLine.googleAdvertising : null,
      capexIntensity: period.revenue && period.capex ? period.capex / period.revenue : null,
      depreciationIntensity: period.revenue && period.depreciationAmortization ? period.depreciationAmortization / period.revenue : null,
      aiSearchRiskScore: null,
      geminiEnterprisePaidMauQoqGrowth: period.periodId === latestQuarter?.id ? dataset.aiOperatingSignals?.geminiEnterprisePaidMauQoqGrowth ?? null : null,
      firstPartyModelTokensPerMinute: period.periodId === latestQuarter?.id ? dataset.aiOperatingSignals?.firstPartyModelTokensPerMinute ?? null : null,
      cloudCustomersAboveOneTrillionTokens:
        period.periodId === latestQuarter?.id ? dataset.aiOperatingSignals?.cloudCustomersAboveOneTrillionTokens ?? null : null,
      cloudCustomersAboveTenTrillionTokens:
        period.periodId === latestQuarter?.id ? dataset.aiOperatingSignals?.cloudCustomersAboveTenTrillionTokens ?? null : null,
      tpuEfficiencyBenefit: period.periodId === latestQuarter?.id ? dataset.aiOperatingSignals?.tpu8iPerformancePerDollarImprovement ?? null : null,
      otherBetsOperatingLoss:
        period.periodId === latestQuarter?.id
          ? dataset.segments?.find((segment) => segment.periodId === latestQuarter?.id && segment.segment === "Other Bets")?.operatingIncome ?? null
          : null,
      regulatoryRiskScore: null,
      notes:
        period.periodId === latestQuarter?.id
          ? "Mixed official actual and company-commentary KPI row from existing GOOGL module; not valuation-impacting unless mapped through forecast assumptions."
          : "Derived driver row from SEC consolidated actuals; no historical Cloud/Search segment split is treated as official actual.",
      rawJson: json({ period, cloudBacklog: dataset.cloudBacklog, aiOperatingSignals: dataset.aiOperatingSignals }),
    })),
  ];

  const marketSnapshots = reportingEvents.map((event) => {
    const currentPrice = proxyPriceForDate(event.eventDate, dataset.marketData.currentPrice);
    const financial = financialPeriods
      .filter((period) => period.asOfDate <= event.eventDate)
      .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0];
    const shares = financial?.dilutedShares ?? dataset.marketData.sharesOut;
    const isCurrentMarketSnapshot = event.eventDate === dataset.marketData.priceDate;
    const netCash = (financial?.cashAndShortTermInvestments ?? 0) - (financial?.debt ?? 0);
    const priceQuality = isCurrentMarketSnapshot ? "adjusted_market_data" : "research_proxy";
    return {
      id: `googl-market-${event.id}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      currentPrice,
      currency: "USD",
      marketCap: currentPrice * shares,
      enterpriseValue: currentPrice * shares - netCash,
      sharesOutstanding: shares,
      previousClose: currentPrice,
      adjustedClose: isCurrentMarketSnapshot ? currentPrice : null,
      unadjustedClose: isCurrentMarketSnapshot ? currentPrice : null,
      splitAdjustment: isCurrentMarketSnapshot ? 1 : null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      dividendYield: isCurrentMarketSnapshot ? dataset.marketData.dividendPerShareAnnualized / currentPrice : null,
      beta: null,
      priceQuality,
      priceSource: isCurrentMarketSnapshot ? dataset.marketData.sourceId : "googl_backend_research_proxy_price_curve",
      signalBacktestAllowed: 0,
      source: isCurrentMarketSnapshot ? dataset.marketData.notes : "research_only proxy/backcast event price for GOOGL backend pilot",
      fetchedAt: now,
      rawJson: json({
        event,
        qualityTag: priceQuality,
        signalBacktestAllowed: false,
        limitation:
          "No audited GOOGL event-date adjusted price history was found in the repo. This row is not an investable backtest signal.",
      }),
    };
  });

  const peerSnapshots = ["MSFT", "META", "AMZN", "NFLX", "ORCL"].map((peerTicker, index) => ({
    id: `googl-peer-${peerTicker}`,
    ticker: TICKER,
    asOfDate: dataset.marketData.priceDate,
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: "mega_cap_ai_platform",
    peerGroup: "Search / ads / cloud / AI infrastructure peer set",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: [34, 28, 42, 35, 24][index],
    forwardPe: [30, 24, 35, 31, 20][index],
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: "research_only peer multiple placeholder",
    fetchedAt: now,
    confidenceLevel: "low",
    absoluteValueUse: "metadata_only_not_aggregated",
    rawJson: json({ note: "Peer absolute market cap / EV intentionally not seeded to avoid mixed-source aggregation." }),
  }));

  const q1Event = nearestEventForPeriod("q1-26");
  const guidanceItems = Object.entries(dataset.guidance ?? {}).map(([metric, value]) => ({
    id: `googl-guidance-${metric}`,
    ticker: TICKER,
    eventId: q1Event?.id ?? null,
    asOfDate: q1Event?.eventDate ?? "2026-04-29",
    fiscalPeriodTarget: metric.includes("2027") ? "FY2027" : metric.includes("2026") ? "FY2026" : "Forward period",
    metric,
    guidanceType: "candidate",
    lowValue: metric.endsWith("Low") && typeof value === "number" ? value : null,
    highValue: metric.endsWith("High") && typeof value === "number" ? value : null,
    midpointValue: typeof value === "number" ? value : null,
    unit: typeof value === "number" ? "USDm_or_ratio" : "text",
    quote: typeof value === "string" ? value : `${metric}: ${value}`,
    speaker: "Alphabet management",
    sourcePath: dataset.guidance.sourceId ?? null,
    confidence: "medium",
    humanReviewStatus: "needs_review",
    modelReady: 0,
    valuationImpactAllowed: 0,
    rawJson: json({ metric, value, source: dataset.guidance }),
  }));

  const transcriptEvents = staticTranscriptEvents.map((transcript) => ({
    id: `transcript-event-${transcript.transcriptId}`,
    ticker: TICKER,
    eventId: `transcript-${transcript.transcriptId}`,
    eventDate: transcript.eventDate,
    fiscalPeriod: transcript.fiscalPeriod,
    eventType: transcript.eventType,
    transcriptId: transcript.transcriptId,
    hasQa: transcript.qaPairs?.length ? 1 : 0,
    sourcePath: transcript.sourceUrl,
    provenance: transcript.sourceStatus,
    confidence: transcript.sourceType === "third_party_secondary" ? "medium" : "high",
    metadataJson: json(transcript),
  }));

  const transcriptExtractions = staticTranscriptEvents.flatMap((transcript) => [
    {
      id: `googl-transcript-summary-${transcript.transcriptId}`,
      ticker: TICKER,
      transcriptId: transcript.transcriptId,
      eventId: `transcript-${transcript.transcriptId}`,
      extractionType: "ai_summary",
      topic: "ai_search_cloud_capex",
      segment: null,
      speaker: "Management",
      section: "summary",
      supportingQuoteShort: transcript.aiSummary,
      confidence: "medium",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json(transcript),
    },
    ...(transcript.qaPairs ?? []).map((pair, index) => ({
      id: `googl-transcript-qa-${transcript.transcriptId}-${index}`,
      ticker: TICKER,
      transcriptId: transcript.transcriptId,
      eventId: `transcript-${transcript.transcriptId}`,
      extractionType: "qa_theme",
      topic: pair.topic,
      segment: null,
      speaker: pair.speaker,
      section: "Q&A",
      supportingQuoteShort: pair.answer,
      confidence: pair.sourceType === "third_party_secondary" ? "medium" : "high",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json(pair),
    })),
  ]);

  const modelVersions = [{
    id: GOOGL_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: GOOGL_BACKEND_MODEL_VERSION.version,
    name: GOOGL_BACKEND_MODEL_VERSION.name,
    description: GOOGL_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(GOOGL_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json({ ...GOOGL_BACKEND_MODEL_VERSION.assumptionSchema, assumptionDefinitions }),
    createdAt: now,
  }];

  const assumptionSets = Object.entries(scenarioPresets).map(([scenario, assumptions]) => ({
    id: `googl-${scenario.toLowerCase()}-${GOOGL_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    name: `${scenario} backend pilot assumptions`,
    scenario,
    modelVersion: GOOGL_BACKEND_MODEL_VERSION.version,
    asOfDate: dataset.marketData.priceDate,
    assumptionsJson: json(assumptions),
    sourceType: "forecast_assumption",
    createdAt: now,
  }));

  const validationWarnings = [
    {
      id: "googl-backend-proxy-market-prices",
      ticker: TICKER,
      scope: "market_snapshots",
      severity: "medium",
      title: "Historical market prices are proxy rows where local event-dated prices are unavailable",
      detail:
        "Seed uses explicit research_only proxy/backcast market snapshots for historical events until an audited market data import is connected. These are not official Alphabet actuals.",
      relatedTable: "market_snapshots",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "googl-backend-companyfacts-not-accession-pit",
      ticker: TICKER,
      scope: "sec_companyfacts",
      severity: "medium",
      title: "SEC Companyfacts is filtered by date but is not a full point-in-time filing database",
      detail:
        "The parser uses period dates, form type, and filed dates, but Companyfacts can include comparative rows from later filings. Future work should ingest accession-level filings with accepted timestamps.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "googl-backend-historical-segment-bridge",
      ticker: TICKER,
      scope: "valuation_adapter",
      severity: "medium",
      title: "Older historical segment splits are adapter bridges, not official segment actuals",
      detail:
        "SEC Companyfacts provides consolidated annual facts. The adapter derives older Search/YouTube/Cloud/Other Bets bridges for formula compatibility and keeps those assumptions out of official_actual financial_period rows.",
      relatedTable: "financial_periods",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "googl-backend-transcript-guidance-guardrail",
      ticker: TICKER,
      scope: "transcripts_guidance",
      severity: "low",
      title: "Transcript and guidance candidates are blocked from valuation impact",
      detail: "Transcript extractions and unpromoted guidance rows are modelReady=false and valuationImpactAllowed=false.",
      relatedTable: "transcript_extractions",
      relatedRecordId: null,
      createdAt: now,
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    cloudAiKpis,
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
