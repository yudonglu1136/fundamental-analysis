import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { MSFT_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "MSFT";

function json(value) {
  return JSON.stringify(value ?? null);
}

function eventTypeFromQuarter(fiscalQuarter = "") {
  if (fiscalQuarter.includes("Q1")) return "q1_results";
  if (fiscalQuarter.includes("Q2")) return "q2_results";
  if (fiscalQuarter.includes("Q3")) return "q3_results";
  if (fiscalQuarter.includes("Q4")) return "q4_results";
  return "earnings_transcript";
}

function fiscalYearFromQuarter(fiscalQuarter = "") {
  const match = fiscalQuarter.match(/FY(\d{2,4})/);
  if (!match) return null;
  const raw = Number(match[1]);
  return raw < 100 ? 2000 + raw : raw;
}

function periodEventType(period) {
  if (period.periodType === "annual") return "annual_report";
  if (period.periodType === "forecast") return "investor_presentation";
  if (period.id.includes("q1")) return "q1_results";
  if (period.id.includes("q2")) return "q2_results";
  if (period.id.includes("q3")) return "q3_results";
  if (period.id.includes("q4")) return "q4_results";
  return "market_snapshot";
}

function periodEventDate(period) {
  if (period.id === "fy25") return "2025-07-30";
  if (period.id === "q3-fy26") return "2026-04-29";
  if (period.id === "ytd-q3-fy26") return "2026-04-29";
  if (period.id === "fy26e") return "2026-04-29";
  return `${period.fiscalYear}-12-31`;
}

function sourceLayer(status, fallback = "research_only") {
  if (status === "official_actual") return "official_actual";
  if (status === "management_guidance") return "management_guidance";
  if (status === "management_commentary") return "transcript_commentary";
  if (status === "market_data") return "market_data";
  if (status === "scenario_assumption") return "forecast_assumption";
  return fallback;
}

function proxyPriceForDate(date, currentPrice) {
  const known = [
    ["2017-10-26", 84],
    ["2018-01-31", 95],
    ["2018-04-26", 94],
    ["2018-08-03", 108],
    ["2018-10-24", 103],
    ["2019-01-30", 106],
    ["2019-04-24", 125],
    ["2019-08-01", 138],
    ["2019-10-23", 137],
    ["2020-01-29", 168],
    ["2020-04-29", 177],
    ["2020-07-30", 204],
    ["2020-10-27", 213],
    ["2021-01-26", 232],
    ["2021-04-27", 262],
    ["2021-07-29", 286],
    ["2021-10-26", 310],
    ["2022-01-25", 288],
    ["2022-04-26", 270],
    ["2022-07-28", 276],
    ["2022-10-25", 250],
    ["2023-01-24", 242],
    ["2023-04-25", 275],
    ["2023-07-27", 331],
    ["2023-10-24", 331],
    ["2024-01-30", 409],
    ["2024-04-25", 400],
    ["2024-07-30", 425],
    ["2024-10-30", 432],
    ["2025-01-29", 442],
    ["2025-04-30", 395],
    ["2025-07-30", 515],
    ["2025-10-29", 530],
    ["2026-01-28", 505],
    ["2026-04-29", currentPrice],
    ["2026-05-09", currentPrice],
  ];
  return known
    .filter(([knownDate]) => knownDate <= date)
    .sort((left, right) => right[0].localeCompare(left[0]))[0]?.[1] ?? currentPrice;
}

function readSecCompanyfactsJson() {
  const filePath = path.resolve("data/local/msft/sec/companyfacts_CIK0000789019.json");
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function secUnit(facts, tag, unit = "USD") {
  return facts?.["us-gaap"]?.[tag]?.units?.[unit] ?? [];
}

function secDurationFact(facts, tags, fiscalYear, unit = "USD") {
  const end = `${fiscalYear}-06-30`;
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => row.form === "10-K" && row.fp === "FY" && row.end === end && row.start)
      .filter((row) => (new Date(row.end).getTime() - new Date(row.start).getTime()) / 86_400_000 > 300)
      .sort((left, right) => left.filed.localeCompare(right.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function secInstantFact(facts, tags, fiscalYear, unit = "USD") {
  const end = `${fiscalYear}-06-30`;
  for (const tag of tags) {
    const rows = secUnit(facts, tag, unit)
      .filter((row) => row.form === "10-K" && row.end === end)
      .sort((left, right) => left.filed.localeCompare(right.filed));
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

function fiscalQuarterConfig(fiscalYear, quarterNumber) {
  const previousYear = fiscalYear - 1;
  const quarter = `Q${quarterNumber}`;
  const ranges = {
    Q1: { start: `${previousYear}-07-01`, end: `${previousYear}-09-30`, filedFallback: `${previousYear}-10-26` },
    Q2: { start: `${previousYear}-10-01`, end: `${previousYear}-12-31`, filedFallback: `${fiscalYear}-01-30` },
    Q3: { start: `${fiscalYear}-01-01`, end: `${fiscalYear}-03-31`, filedFallback: `${fiscalYear}-04-26` },
    Q4: { start: `${fiscalYear}-04-01`, end: `${fiscalYear}-06-30`, filedFallback: `${fiscalYear}-07-30` },
  }[quarter];
  return {
    id: `q${quarterNumber}-fy${String(fiscalYear).slice(2)}`,
    label: `${quarter} FY${fiscalYear}A`,
    fiscalYear,
    quarter,
    ...ranges,
  };
}

function buildFiscalQuarterConfigs() {
  const quarters = [];
  for (let fiscalYear = 2018; fiscalYear <= 2026; fiscalYear += 1) {
    const lastQuarter = fiscalYear === 2026 ? 3 : 4;
    for (let quarterNumber = 1; quarterNumber <= lastQuarter; quarterNumber += 1) {
      quarters.push(fiscalQuarterConfig(fiscalYear, quarterNumber));
    }
  }
  return quarters;
}

function buildSecAnnualFinancials() {
  const companyfacts = readSecCompanyfactsJson();
  const facts = companyfacts?.facts;
  if (!facts) return [];
  return [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((fiscalYear) => {
    const revenue = secDurationFact(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], fiscalYear);
    const grossProfit = secDurationFact(facts, ["GrossProfit"], fiscalYear);
    const operatingIncome = secDurationFact(facts, ["OperatingIncomeLoss"], fiscalYear);
    const netIncome = secDurationFact(facts, ["NetIncomeLoss"], fiscalYear);
    const operatingCashFlow = secDurationFact(facts, ["NetCashProvidedByUsedInOperatingActivities"], fiscalYear);
    const capex = secDurationFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"], fiscalYear);
    const depreciation = secDurationFact(facts, ["Depreciation", "DepreciationDepletionAndAmortization"], fiscalYear);
    const stockBasedCompensation = secDurationFact(facts, ["ShareBasedCompensation"], fiscalYear);
    const dividendsPaid = secDurationFact(facts, ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"], fiscalYear);
    const buybacks = secDurationFact(facts, ["PaymentsForRepurchaseOfCommonStock"], fiscalYear);
    const dilutedEps = secDurationFact(facts, ["EarningsPerShareDiluted"], fiscalYear, "USD/shares");
    const dilutedShares = secDurationFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], fiscalYear, "shares");
    const cash = secInstantFact(facts, ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"], fiscalYear);
    const currentDebt = secInstantFact(facts, ["LongTermDebtCurrent"], fiscalYear);
    const noncurrentDebt = secInstantFact(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], fiscalYear);
    const operatingLeaseLiabilities = secInstantFact(facts, ["OperatingLeaseLiability"], fiscalYear);
    const ppeNet = secInstantFact(facts, ["PropertyPlantAndEquipmentNet"], fiscalYear);
    const filed = revenue?.filed ?? `${fiscalYear}-07-31`;
    const revenueValue = usdToMillions(revenue);
    const grossProfitValue = usdToMillions(grossProfit);
    const operatingIncomeValue = usdToMillions(operatingIncome);
    const capexValue = usdToMillions(capex);
    const ocfValue = usdToMillions(operatingCashFlow);
    return {
      id: `fy${String(fiscalYear).slice(2)}`,
      label: `FY${fiscalYear}A`,
      fiscalYear,
      periodType: "annual",
      sourceStatus: "official_actual",
      sourceId: `msft-sec-companyfacts-fy${fiscalYear}`,
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json",
      eventDate: filed,
      revenue: revenueValue,
      costOfRevenue: revenueValue != null && grossProfitValue != null ? revenueValue - grossProfitValue : null,
      grossProfit: grossProfitValue,
      grossMargin: grossProfitValue != null && revenueValue ? grossProfitValue / revenueValue : null,
      operatingIncome: operatingIncomeValue,
      operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
      netIncome: usdToMillions(netIncome),
      dilutedEps: dilutedEps?.val ?? null,
      dilutedShares: sharesToMillions(dilutedShares),
      operatingCashFlow: ocfValue,
      capex: capexValue,
      freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
      depreciationAmortizationAndOther: usdToMillions(depreciation),
      stockBasedCompensation: usdToMillions(stockBasedCompensation),
      cashAndShortTermInvestments: usdToMillions(cash),
      debt: (usdToMillions(currentDebt) ?? 0) + (usdToMillions(noncurrentDebt) ?? 0),
      operatingLeaseLiabilities: usdToMillions(operatingLeaseLiabilities),
      ppeNet: usdToMillions(ppeNet),
      dividendsPaid: usdToMillions(dividendsPaid),
      buybacks: usdToMillions(buybacks),
      notes: `SEC Companyfacts annual 10-K facts for FY${fiscalYear}; units converted to USDm.`,
    };
  }).filter((row) => row.revenue != null && row.operatingIncome != null);
}

function buildSecQuarterFinancials() {
  const companyfacts = readSecCompanyfactsJson();
  const facts = companyfacts?.facts;
  if (!facts) return [];
  const annualFinancialsByYear = new Map(buildSecAnnualFinancials().map((row) => [row.fiscalYear, row]));
  const quarters = buildFiscalQuarterConfigs();
  const quarterFact = (tags, quarter, unit = "USD") => {
    for (const tag of tags) {
      const rows = secUnit(facts, tag, unit)
        .filter((row) => row.form === "10-Q" && row.fy === quarter.fiscalYear && row.fp === quarter.quarter && row.start === quarter.start && row.end === quarter.end)
        .sort((left, right) => left.filed.localeCompare(right.filed));
      if (rows.length) return { tag, ...rows[0] };
    }
    return null;
  };
  const instantFact = (tags, quarter, unit = "USD") => {
    for (const tag of tags) {
      const rows = secUnit(facts, tag, unit)
        .filter((row) => row.form === "10-Q" && row.end === quarter.end)
        .sort((left, right) => left.filed.localeCompare(right.filed));
      if (rows.length) return { tag, ...rows[0] };
    }
    return null;
  };
  const quarterValue = (tags, quarter, unit = "USD") => quarterFact(tags, quarter, unit)?.val ?? null;
  const derivedFourthQuarterValue = (tags, quarter, annualValue, unit = "USD") => {
    if (quarter.quarter !== "Q4" || typeof annualValue !== "number") return null;
    const firstThreeQuarters = [1, 2, 3]
      .map((quarterNumber) => quarterValue(tags, fiscalQuarterConfig(quarter.fiscalYear, quarterNumber), unit))
      .filter((value) => typeof value === "number");
    if (firstThreeQuarters.length !== 3) return null;
    return annualValue - firstThreeQuarters.reduce((sum, value) => sum + value, 0);
  };
  const factOrDerived = (tags, quarter, annualValue, unit = "USD") => {
    const fact = quarterFact(tags, quarter, unit);
    if (fact) return fact;
    const value = derivedFourthQuarterValue(tags, quarter, annualValue, unit);
    return typeof value === "number"
      ? { tag: tags[0], val: value, filed: annualFinancialsByYear.get(quarter.fiscalYear)?.eventDate ?? quarter.filedFallback, derivedFromAnnual: true }
      : null;
  };
  return quarters.map((quarter) => {
    const annual = annualFinancialsByYear.get(quarter.fiscalYear);
    const isFourthQuarter = quarter.quarter === "Q4";
    const revenue = factOrDerived(["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], quarter, annual?.revenue ? annual.revenue * 1_000_000 : null);
    const grossProfit = factOrDerived(["GrossProfit"], quarter, annual?.grossProfit ? annual.grossProfit * 1_000_000 : null);
    const operatingIncome = factOrDerived(["OperatingIncomeLoss"], quarter, annual?.operatingIncome ? annual.operatingIncome * 1_000_000 : null);
    const netIncome = factOrDerived(["NetIncomeLoss"], quarter, annual?.netIncome ? annual.netIncome * 1_000_000 : null);
    const operatingCashFlow = factOrDerived(["NetCashProvidedByUsedInOperatingActivities"], quarter, annual?.operatingCashFlow ? annual.operatingCashFlow * 1_000_000 : null);
    const capex = factOrDerived(["PaymentsToAcquirePropertyPlantAndEquipment"], quarter, annual?.capex ? annual.capex * 1_000_000 : null);
    const depreciation = factOrDerived(["Depreciation", "DepreciationDepletionAndAmortization"], quarter, annual?.depreciationAmortizationAndOther ? annual.depreciationAmortizationAndOther * 1_000_000 : null);
    const stockBasedCompensation = factOrDerived(["ShareBasedCompensation"], quarter, annual?.stockBasedCompensation ? annual.stockBasedCompensation * 1_000_000 : null);
    const dividendsPaid = factOrDerived(["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"], quarter, annual?.dividendsPaid ? annual.dividendsPaid * 1_000_000 : null);
    const buybacks = factOrDerived(["PaymentsForRepurchaseOfCommonStock"], quarter, annual?.buybacks ? annual.buybacks * 1_000_000 : null);
    const dilutedEps = factOrDerived(["EarningsPerShareDiluted"], quarter, annual?.dilutedEps ?? null, "USD/shares");
    const dilutedShares = isFourthQuarter ? { val: annual?.dilutedShares ? annual.dilutedShares * 1_000_000 : null, filed: annual?.eventDate ?? quarter.filedFallback, derivedFromAnnual: true } : quarterFact(["WeightedAverageNumberOfDilutedSharesOutstanding"], quarter, "shares");
    const cash = isFourthQuarter ? { val: annual?.cashAndShortTermInvestments ? annual.cashAndShortTermInvestments * 1_000_000 : null } : instantFact(["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"], quarter);
    const currentDebt = isFourthQuarter ? null : instantFact(["LongTermDebtCurrent"], quarter);
    const noncurrentDebt = isFourthQuarter ? { val: annual?.debt ? annual.debt * 1_000_000 : null } : instantFact(["LongTermDebtNoncurrent", "LongTermDebt"], quarter);
    const operatingLeaseLiabilities = isFourthQuarter ? { val: annual?.operatingLeaseLiabilities ? annual.operatingLeaseLiabilities * 1_000_000 : null } : instantFact(["OperatingLeaseLiability"], quarter);
    const ppeNet = isFourthQuarter ? { val: annual?.ppeNet ? annual.ppeNet * 1_000_000 : null } : instantFact(["PropertyPlantAndEquipmentNet"], quarter);
    const filed = revenue?.filed ?? quarter.filedFallback;
    const revenueValue = usdToMillions(revenue);
    const grossProfitValue = usdToMillions(grossProfit);
    const operatingIncomeValue = usdToMillions(operatingIncome);
    const capexValue = usdToMillions(capex);
    const ocfValue = usdToMillions(operatingCashFlow);
    return {
      id: quarter.id,
      label: quarter.label,
      fiscalYear: quarter.fiscalYear,
      periodType: "quarter",
      sourceStatus: "official_actual",
      sourceId: `msft-sec-companyfacts-${quarter.id}`,
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json",
      eventDate: filed,
      revenue: revenueValue,
      costOfRevenue: revenueValue != null && grossProfitValue != null ? revenueValue - grossProfitValue : null,
      grossProfit: grossProfitValue,
      grossMargin: grossProfitValue != null && revenueValue ? grossProfitValue / revenueValue : null,
      operatingIncome: operatingIncomeValue,
      operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
      netIncome: usdToMillions(netIncome),
      dilutedEps: dilutedEps?.val ?? null,
      dilutedShares: sharesToMillions(dilutedShares),
      operatingCashFlow: ocfValue,
      capex: capexValue,
      freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
      depreciationAmortizationAndOther: usdToMillions(depreciation),
      stockBasedCompensation: usdToMillions(stockBasedCompensation),
      cashAndShortTermInvestments: usdToMillions(cash),
      debt: (usdToMillions(currentDebt) ?? 0) + (usdToMillions(noncurrentDebt) ?? 0),
      operatingLeaseLiabilities: usdToMillions(operatingLeaseLiabilities),
      ppeNet: usdToMillions(ppeNet),
      dividendsPaid: usdToMillions(dividendsPaid),
      buybacks: usdToMillions(buybacks),
      notes: isFourthQuarter
        ? `SEC Companyfacts filing-derived Q4 facts for ${quarter.label}; Q4 flow items are FY 10-K minus Q1-Q3 10-Q facts, units converted to USDm.`
        : `SEC Companyfacts quarterly 10-Q facts for ${quarter.label}; units converted to USDm.`,
    };
  }).filter((row) => row.revenue != null && row.operatingIncome != null);
}

async function loadMsftStaticModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/msft/data.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/msft/assumptions.ts");
    return {
      dataset: dataModule.msftDataset ?? dataModule.msftData,
      scenarioPresets: assumptionsModule.msftScenarioPresets,
      assumptionDefinitions: assumptionsModule.msftValuationAssumptionDefinitions ?? [],
    };
  } finally {
    await server.close();
  }
}

export async function buildMsftBackendSeedPayload() {
  const now = new Date().toISOString();
  const { dataset, scenarioPresets, assumptionDefinitions } = await loadMsftStaticModules();
  const secAnnualFinancials = buildSecAnnualFinancials();
  const secQuarterFinancials = buildSecQuarterFinancials();
  const reportingEventMap = new Map();
  const addEvent = (event) => {
    if (!reportingEventMap.has(event.id)) reportingEventMap.set(event.id, event);
  };

  for (const call of dataset.earningsCalls ?? []) {
    addEvent({
      id: call.id,
      ticker: TICKER,
      eventDate: call.callDate,
      fiscalPeriod: call.fiscalQuarter,
      fiscalYear: fiscalYearFromQuarter(call.fiscalQuarter),
      eventType: eventTypeFromQuarter(call.fiscalQuarter),
      label: `${call.fiscalQuarter} earnings call`,
      sourceType: sourceLayer(call.sourceStatus, "transcript_commentary"),
      sourcePath: call.transcriptSourceId,
      createdAt: now,
    });
  }
  for (const period of dataset.periods ?? []) {
    addEvent({
      id: `period-${period.id}`,
      ticker: TICKER,
      eventDate: periodEventDate(period),
      fiscalPeriod: period.label,
      fiscalYear: period.fiscalYear,
      eventType: periodEventType(period),
      label: `${period.label} financial snapshot`,
      sourceType: sourceLayer(period.sourceStatus),
      sourcePath: period.sourceId,
      createdAt: now,
    });
  }
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
  for (const period of secQuarterFinancials) {
    addEvent({
      id: `sec-${period.id}`,
      ticker: TICKER,
      eventDate: period.eventDate,
      fiscalPeriod: period.label,
      fiscalYear: period.fiscalYear,
      eventType: periodEventType(period),
      label: `${period.label} SEC quarterly snapshot`,
      sourceType: "official_actual",
      sourcePath: period.sourceId,
      createdAt: now,
    });
  }
  addEvent({
    id: `market-snapshot-${dataset.marketData.priceDate}`,
    ticker: TICKER,
    eventDate: dataset.marketData.priceDate,
    fiscalPeriod: "Market snapshot",
    fiscalYear: 2026,
    eventType: "market_snapshot",
    label: `MSFT market snapshot ${dataset.marketData.priceDate}`,
    sourceType: "market_data",
    sourcePath: dataset.marketData.sourceId,
    createdAt: now,
  });

  const reportingEvents = [...reportingEventMap.values()].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const eventByPeriodId = new Map();
  for (const event of reportingEvents) {
    if (event.id.startsWith("period-")) eventByPeriodId.set(event.id.replace("period-", ""), event);
  }
  const nearestEventForPeriod = (periodId) => eventByPeriodId.get(periodId) ?? reportingEvents.find((event) => event.eventDate === "2026-04-29") ?? reportingEvents[reportingEvents.length - 1];

  const sourceDocuments = [
    ...(dataset.sources ?? []).map((source) => ({
      id: source.id,
      ticker: TICKER,
      sourceType: sourceLayer(source.sourceStatus, "research_only"),
      sourceName: source.title,
      sourcePath: source.url?.startsWith("local://") ? source.url : null,
      sourceUrl: source.url?.startsWith("http") ? source.url : null,
      retrievedAt: source.accessedDate ?? now,
      publishedDate: source.publishedDate ?? null,
      provenance: source.notes ?? null,
      confidence: source.sourceStatus === "official_actual" ? "high" : "medium",
      checksum: null,
      metadataJson: json(source),
    })),
    ...[...secAnnualFinancials, ...secQuarterFinancials].map((period) => ({
      id: period.sourceId,
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: `${period.label} SEC Companyfacts ${period.periodType} facts`,
      sourcePath: "data/local/msft/sec/companyfacts_CIK0000789019.json",
      sourceUrl: period.sourceUrl,
      retrievedAt: now,
      publishedDate: period.eventDate,
      provenance: `SEC Companyfacts API, ${period.periodType} facts; values converted to USDm.`,
      confidence: "high",
      checksum: null,
      metadataJson: json(period),
    })),
  ];

  const financialPeriods = [
    ...[...secAnnualFinancials, ...secQuarterFinancials].map((period) => ({
      id: `msft-sec-${period.id}`,
      ticker: TICKER,
      periodId: period.id,
      fiscalYear: period.fiscalYear,
      periodType: period.periodType,
      eventId: period.periodType === "annual" ? `annual-report-fy${period.fiscalYear}` : `sec-${period.id}`,
      asOfDate: period.eventDate,
      sourceType: "official_actual",
      revenue: period.revenue,
      costOfRevenue: period.costOfRevenue,
      grossProfit: period.grossProfit,
      grossMargin: period.grossMargin,
      operatingIncome: period.operatingIncome,
      operatingMargin: period.operatingMargin,
      netIncome: period.netIncome,
      dilutedEps: period.dilutedEps,
      dilutedShares: period.dilutedShares,
      operatingCashFlow: period.operatingCashFlow,
      capex: period.capex,
      freeCashFlow: period.freeCashFlow,
      depreciationAmortization: period.depreciationAmortizationAndOther,
      stockBasedCompensation: period.stockBasedCompensation,
      cashAndShortTermInvestments: period.cashAndShortTermInvestments,
      debt: period.debt,
      operatingLeaseLiabilities: period.operatingLeaseLiabilities,
      ppeNet: period.ppeNet,
      dividendsPaid: period.dividendsPaid,
      buybacks: period.buybacks,
      currentPrice: proxyPriceForDate(period.eventDate, dataset.marketData.currentPrice),
      rawJson: json(period),
    })),
    ...(dataset.periods ?? []).map((period) => {
    const event = nearestEventForPeriod(period.id);
    return {
      id: `msft-${period.id}`,
      ticker: TICKER,
      periodId: period.id,
      fiscalYear: period.fiscalYear,
      periodType: period.periodType,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? periodEventDate(period),
      sourceType: sourceLayer(period.sourceStatus),
      revenue: period.revenue,
      costOfRevenue: period.costOfRevenue,
      grossProfit: period.grossProfit,
      grossMargin: period.grossMargin,
      operatingIncome: period.operatingIncome,
      operatingMargin: period.operatingMargin,
      netIncome: period.netIncome ?? null,
      dilutedEps: period.dilutedEps ?? null,
      dilutedShares: period.dilutedShares ?? null,
      operatingCashFlow: period.operatingCashFlow ?? null,
      capex: period.capex ?? null,
      freeCashFlow: period.freeCashFlow ?? null,
      depreciationAmortization: period.depreciationAmortizationAndOther ?? null,
      stockBasedCompensation: period.stockBasedCompensation ?? null,
      cashAndShortTermInvestments: period.cashAndShortTermInvestments ?? null,
      debt: period.debt ?? null,
      operatingLeaseLiabilities: period.operatingLeaseLiabilities ?? null,
      ppeNet: period.ppeNet ?? null,
      dividendsPaid: period.dividendsPaid ?? null,
      buybacks: period.buybacks ?? null,
      currentPrice: proxyPriceForDate(event?.eventDate ?? periodEventDate(period), dataset.marketData.currentPrice),
      rawJson: json(period),
    };
  })];

  const segmentFinancials = (dataset.segments ?? []).map((segment, index) => {
    const event = nearestEventForPeriod(segment.periodId);
    return {
      id: `msft-segment-${segment.periodId}-${index}`,
      ticker: TICKER,
      periodId: segment.periodId,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? "2026-04-29",
      segment: segment.segment,
      taxonomy: "reported_segment",
      revenue: segment.revenue,
      costOfRevenue: segment.costOfRevenue ?? null,
      operatingExpenses: segment.operatingExpenses ?? null,
      operatingIncome: segment.operatingIncome,
      operatingMargin: segment.operatingMargin ?? null,
      grossMargin: segment.grossMargin ?? null,
      growth: segment.growth ?? null,
      constantCurrencyGrowth: segment.constantCurrencyGrowth ?? null,
      sourceType: sourceLayer(segment.sourceStatus),
      notes: [...(segment.keyDrivers ?? []), segment.marginDebate].filter(Boolean).join(" | "),
      rawJson: json(segment),
    };
  });

  const cloudAiKpis = [
    ...(dataset.cloudMetrics ?? []).map((metric) => {
      const event = nearestEventForPeriod(metric.periodId);
      return {
        id: `msft-cloud-${metric.periodId}`,
        ticker: TICKER,
        periodId: metric.periodId,
        eventId: event?.id ?? null,
        asOfDate: event?.eventDate ?? "2026-04-29",
        sourceType: sourceLayer(metric.sourceStatus),
        microsoftCloudRevenue: metric.microsoftCloudRevenue,
        microsoftCloudGrowth: metric.microsoftCloudGrowth,
        microsoftCloudConstantCurrencyGrowth: metric.microsoftCloudConstantCurrencyGrowth ?? null,
        microsoftCloudGrossMargin: metric.microsoftCloudGrossMargin,
        azureGrowth: metric.azureGrowth ?? null,
        azureConstantCurrencyGrowth: metric.azureConstantCurrencyGrowth ?? null,
        azureAiContribution: null,
        m365CommercialCloudGrowth: metric.m365CommercialCloudGrowth ?? null,
        m365CommercialSeatGrowth: metric.m365CommercialSeatGrowth ?? null,
        commercialRpo: metric.commercialRpo ?? null,
        commercialBookingsGrowth: metric.commercialBookingsGrowth ?? null,
        aiArr: null,
        copilotPaidSeats: null,
        capexIntensity: null,
        reportedFcfMargin: null,
        openAiInvestmentImpact: null,
        notes: "Official Microsoft Cloud / Azure KPI row where disclosed.",
        rawJson: json(metric),
      };
    }),
    ...(dataset.earningsCalls ?? []).map((call) => ({
      id: `msft-call-kpi-${call.id}`,
      ticker: TICKER,
      periodId: call.id,
      eventId: call.id,
      asOfDate: call.callDate,
      sourceType: "transcript_commentary",
      microsoftCloudRevenue: call.microsoftCloudRevenue,
      microsoftCloudGrowth: call.microsoftCloudGrowth,
      microsoftCloudConstantCurrencyGrowth: null,
      microsoftCloudGrossMargin: call.microsoftCloudGrossMargin,
      azureGrowth: call.azureGrowth,
      azureConstantCurrencyGrowth: null,
      azureAiContribution: call.focusScores?.azureDemand ?? null,
      m365CommercialCloudGrowth: call.m365CommercialCloudGrowth,
      m365CommercialSeatGrowth: null,
      commercialRpo: call.commercialRpo,
      commercialBookingsGrowth: call.commercialBookingsGrowth ?? null,
      aiArr: call.aiRevenueRunRate ?? null,
      copilotPaidSeats: call.copilotPaidSeats ?? null,
      capexIntensity: null,
      reportedFcfMargin: null,
      openAiInvestmentImpact: null,
      notes: call.marketFocusSummary,
      rawJson: json(call),
    })),
  ];

  const marketSnapshots = reportingEvents.map((event) => {
    const currentPrice = proxyPriceForDate(event.eventDate, dataset.marketData.currentPrice);
    const shares = dataset.marketData.sharesForMarketCap;
    return {
      id: `msft-market-${event.id}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      currentPrice,
      currency: "USD",
      marketCap: currentPrice * shares,
      enterpriseValue: currentPrice * shares - 21_307,
      sharesOutstanding: shares,
      previousClose: currentPrice,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      dividendYield: 0.008,
      beta: null,
      source: event.eventDate === dataset.marketData.priceDate ? dataset.marketData.source : "research_only proxy/backcast price for backend pilot",
      fetchedAt: now,
      rawJson: json({ event, qualityTag: event.eventDate === dataset.marketData.priceDate ? "market_data" : "research_only_proxy" }),
    };
  });

  const peerSnapshots = ["GOOGL", "AMZN", "META", "ORCL"].map((peerTicker, index) => ({
    id: `msft-peer-${peerTicker}`,
    ticker: TICKER,
    asOfDate: dataset.marketData.priceDate,
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: "mega_cap_ai_platform",
    peerGroup: "AI infrastructure / enterprise software",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: [26, 42, 28, 24][index],
    forwardPe: [22, 35, 24, 20][index],
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

  const guidanceItems = (dataset.aiDisclosures ?? [])
    .filter((item) => item.sourceStatus === "management_guidance" || item.sourceStatus === "management_commentary")
    .map((item) => ({
      id: `msft-guidance-${item.id}`,
      ticker: TICKER,
      eventId: "q3-fy26",
      asOfDate: "2026-04-29",
      fiscalPeriodTarget: item.label,
      metric: item.id,
      guidanceType: item.sourceStatus === "management_guidance" ? "explicit_guide" : "candidate",
      lowValue: null,
      highValue: null,
      midpointValue: item.unit === "percent" || item.unit === "USDbn" || item.unit === "USDm" || item.unit === "seats_m" ? item.metric ?? null : null,
      unit: item.unit ?? null,
      quote: item.detail,
      speaker: "Microsoft management",
      sourcePath: item.sourceId,
      confidence: item.sourceStatus === "management_guidance" ? "high" : "medium",
      humanReviewStatus: item.sourceStatus === "management_guidance" ? "reviewed" : "needs_review",
      modelReady: item.sourceStatus === "management_guidance" ? 1 : 0,
      valuationImpactAllowed: item.sourceStatus === "management_guidance" ? 1 : 0,
      rawJson: json(item),
    }));

  const transcriptEvents = (dataset.earningsCalls ?? []).map((call) => ({
    id: `transcript-${call.id}`,
    ticker: TICKER,
    eventId: call.id,
    eventDate: call.callDate,
    fiscalPeriod: call.fiscalQuarter,
    eventType: "earnings_transcript",
    transcriptId: call.transcriptSourceId,
    hasQa: 1,
    sourcePath: call.transcriptSourceId,
    provenance: call.sourceStatus,
    confidence: call.sourceStatus === "research_only" ? "medium" : "high",
    metadataJson: json(call),
  }));

  const transcriptExtractions = (dataset.earningsCalls ?? []).flatMap((call) => [
    {
      id: `transcript-extraction-summary-${call.id}`,
      ticker: TICKER,
      transcriptId: call.transcriptSourceId,
      eventId: call.id,
      extractionType: "market_focus_summary",
      topic: "market_focus",
      segment: null,
      speaker: null,
      section: "summary",
      supportingQuoteShort: call.marketFocusSummary,
      confidence: "medium",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json(call),
    },
    ...call.analystFocus.map((theme, index) => ({
      id: `transcript-extraction-qa-${call.id}-${index}`,
      ticker: TICKER,
      transcriptId: call.transcriptSourceId,
      eventId: call.id,
      extractionType: "qa_theme",
      topic: theme,
      segment: null,
      speaker: "Analysts",
      section: "Q&A",
      supportingQuoteShort: theme,
      confidence: "medium",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ callId: call.id, theme }),
    })),
  ]);

  const modelVersions = [{
    id: MSFT_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: MSFT_BACKEND_MODEL_VERSION.version,
    name: MSFT_BACKEND_MODEL_VERSION.name,
    description: MSFT_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(MSFT_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json({ ...MSFT_BACKEND_MODEL_VERSION.assumptionSchema, assumptionDefinitions }),
    createdAt: now,
  }];

  const assumptionSets = Object.entries(scenarioPresets).map(([scenario, assumptions]) => ({
    id: `msft-${scenario.toLowerCase()}-${MSFT_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    name: `${scenario} backend pilot assumptions`,
    scenario,
    modelVersion: MSFT_BACKEND_MODEL_VERSION.version,
    asOfDate: dataset.marketData.priceDate,
    assumptionsJson: json(assumptions),
    sourceType: "forecast_assumption",
    createdAt: now,
  }));

  const validationWarnings = [{
    id: "msft-backend-proxy-market-prices",
    ticker: TICKER,
    scope: "market_snapshots",
    severity: "medium",
    title: "Historical market prices are proxy rows where local event-dated prices are unavailable",
    detail: "Seed uses explicit research_only proxy/backcast market snapshots for older events until a market data import is connected.",
    relatedTable: "market_snapshots",
    relatedRecordId: null,
    createdAt: now,
  }];

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
