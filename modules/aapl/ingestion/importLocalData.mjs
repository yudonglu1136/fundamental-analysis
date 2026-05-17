import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { AAPL_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "AAPL";
const SEC_DIR = path.resolve("data/local/aapl/sec");
const MARKET_DIR = path.resolve("data/local/aapl/market");
const COMPANYFACTS_PATH = path.join(SEC_DIR, "companyfacts_CIK0000320193.json");
const SUBMISSIONS_PATH = path.join(SEC_DIR, "submissions_CIK0000320193.json");

const PRODUCT_MEMBERS = [
  ["iPhone", "aapl:IPhoneMember"],
  ["Mac", "aapl:MacMember"],
  ["iPad", "aapl:IPadMember"],
  ["Wearables, Home and Accessories", "aapl:WearablesHomeandAccessoriesMember"],
  ["Products", "us-gaap:ProductMember"],
  ["Services", "us-gaap:ServiceMember"],
];

const GEOGRAPHY_MEMBERS = [
  ["Americas", "aapl:AmericasSegmentMember"],
  ["Europe", "aapl:EuropeSegmentMember"],
  ["Greater China", "aapl:GreaterChinaSegmentMember"],
  ["Japan", "aapl:JapanSegmentMember"],
  ["Rest of Asia Pacific", "aapl:RestOfAsiaPacificSegmentMember"],
];

function json(value) {
  return JSON.stringify(value ?? null);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function attrs(text = "") {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

function scaleIxValue(rawText, factAttrs) {
  const cleaned = cleanText(rawText).replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const negative = /^\(.+\)$/.test(cleaned);
  const parsed = Number(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  const value = negative ? -parsed : parsed;
  const unit = factAttrs.unitRef;
  const scale = Number(factAttrs.scale ?? 0);
  if (unit === "usd") return (value * 10 ** scale) / 1_000_000;
  if (unit === "shares") return (value * 10 ** scale) / 1_000_000;
  return value * 10 ** scale;
}

function parseIxbrlFiling(filePath) {
  if (!fs.existsSync(filePath)) return { contexts: new Map(), facts: [] };
  const html = fs.readFileSync(filePath, "utf8");
  const contexts = new Map();
  for (const match of html.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
    const body = match[2];
    const members = [...body.matchAll(/<xbrldi:explicitMember[^>]*>([^<]+)<\/xbrldi:explicitMember>/g)].map((member) => member[1]);
    const start = body.match(/<xbrli:startDate>([^<]+)<\/xbrli:startDate>/)?.[1] ?? null;
    const end = body.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/)?.[1] ?? null;
    const instant = body.match(/<xbrli:instant>([^<]+)<\/xbrli:instant>/)?.[1] ?? null;
    contexts.set(match[1], {
      id: match[1],
      start,
      end,
      instant,
      durationDays: start && end ? daysBetween(start, end) : null,
      members,
    });
  }
  const facts = [];
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g)) {
    const factAttrs = attrs(match[1]);
    const context = contexts.get(factAttrs.contextRef);
    facts.push({
      name: factAttrs.name,
      contextRef: factAttrs.contextRef,
      unitRef: factAttrs.unitRef,
      scale: factAttrs.scale,
      value: scaleIxValue(match[2], factAttrs),
      text: cleanText(match[2]),
      context,
    });
  }
  return { contexts, facts };
}

function sourceLayer(value, fallback = "research_only") {
  if (value === "official_actual") return "official_actual";
  if (value === "management_guidance") return "management_guidance";
  if (value === "forecast_assumption") return "forecast_assumption";
  if (value === "transcript_commentary") return "transcript_commentary";
  if (value === "market_data") return "market_data";
  return fallback;
}

function listSecFilings() {
  const submissions = readJsonIfExists(SUBMISSIONS_PATH);
  const recent = submissions?.filings?.recent;
  if (!recent) return [];
  const fiscalQuarterFromReportDate = (reportDate) => {
    const month = String(reportDate ?? "").slice(5, 7);
    if (["12", "01"].includes(month)) return "Q1";
    if (["03", "04"].includes(month)) return "Q2";
    if (["06", "07"].includes(month)) return "Q3";
    return null;
  };
  return recent.accessionNumber
    .map((accession, index) => ({
      accession,
      compactAccession: accession.replace(/-/g, ""),
      form: recent.form[index],
      filingDate: recent.filingDate[index],
      reportDate: recent.reportDate[index],
      primaryDocument: recent.primaryDocument[index],
      fiscalYear: Number(recent.reportDate[index]?.slice(0, 4)) + (recent.reportDate[index]?.slice(5, 7) === "12" ? 1 : 0),
      sourceUrl: `https://www.sec.gov/Archives/edgar/data/320193/${accession.replace(/-/g, "")}/${recent.primaryDocument[index]}`,
    }))
    .filter((row) => ["10-Q", "10-K"].includes(row.form))
    .filter((row) => row.filingDate >= "2018-01-01")
    .map((row) => {
      const companyfacts = readJsonIfExists(COMPANYFACTS_PATH);
      const focus = companyfacts?.facts?.dei?.DocumentFiscalPeriodFocus?.units?.["pure"]?.find((fact) => fact.accn === row.accession);
      return {
        ...row,
        fiscalYear: focus?.fy ?? row.fiscalYear,
        fiscalQuarter: row.form === "10-K" ? "Q4" : focus?.fp ?? fiscalQuarterFromReportDate(row.reportDate),
        localPath: path.join(SEC_DIR, "filings", row.compactAccession, row.primaryDocument),
      };
    })
    .filter((row) => row.fiscalYear >= 2018)
    .sort((left, right) => left.filingDate.localeCompare(right.filingDate));
}

function secUnit(companyfacts, tag, unit = "USD") {
  return companyfacts?.facts?.["us-gaap"]?.[tag]?.units?.[unit] ?? [];
}

function durationFact(companyfacts, tags, filing, unit = "USD", mode = "quarter") {
  for (const tag of tags) {
    const rows = secUnit(companyfacts, tag, unit)
      .filter((row) => row.accn === filing.accession)
      .filter((row) => row.end === filing.reportDate)
      .filter((row) => {
        const duration = daysBetween(row.start, row.end);
        if (mode === "annual") return duration != null && duration > 300;
        return duration != null && duration >= 60 && duration <= 110;
      })
      .sort((left, right) => (daysBetween(left.start, left.end) ?? 999) - (daysBetween(right.start, right.end) ?? 999));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function instantFact(companyfacts, tags, filing, unit = "USD") {
  for (const tag of tags) {
    const rows = secUnit(companyfacts, tag, unit)
      .filter((row) => row.accn === filing.accession)
      .filter((row) => row.end === filing.reportDate)
      .sort((left, right) => left.filed.localeCompare(right.filed));
    if (rows.length) return { tag, ...rows[0] };
  }
  return null;
}

function factValue(fact, unit = "USD") {
  if (typeof fact?.val !== "number") return null;
  if (unit === "USD") return fact.val / 1_000_000;
  if (unit === "shares") return fact.val / 1_000_000;
  return fact.val;
}

function selectIxCoreFact(parsed, tags, filing, mode) {
  for (const tag of tags) {
    const candidates = parsed.facts
      .filter((fact) => fact.name === tag)
      .filter((fact) => fact.context?.end === filing.reportDate)
      .filter((fact) => (fact.context?.members ?? []).length === 0)
      .filter((fact) => {
        const duration = fact.context?.durationDays;
        if (mode === "annual") return duration != null && duration > 300;
        return duration != null && duration >= 60 && duration <= 110;
      })
      .filter((fact) => Number.isFinite(fact.value))
      .sort((left, right) => (left.context?.durationDays ?? 999) - (right.context?.durationDays ?? 999));
    if (candidates.length) return candidates[0];
  }
  return null;
}

function selectIxCoreInstantFact(parsed, tags, filing) {
  for (const tag of tags) {
    const candidates = parsed.facts
      .filter((fact) => fact.name === tag)
      .filter((fact) => fact.context?.instant === filing.reportDate)
      .filter((fact) => (fact.context?.members ?? []).length === 0)
      .filter((fact) => Number.isFinite(fact.value));
    if (candidates.length) return candidates[0];
  }
  return null;
}

function buildCoreFinancialForFiling(companyfacts, filing) {
  const mode = filing.form === "10-K" ? "annual" : "quarter";
  const parsed = parseIxbrlFiling(filing.localPath);
  const revenue = durationFact(companyfacts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "Revenues"], filing, "USD", mode);
  const costOfRevenue = durationFact(companyfacts, ["CostOfGoodsAndServicesSold", "CostOfRevenue"], filing, "USD", mode);
  const grossProfit = durationFact(companyfacts, ["GrossProfit"], filing, "USD", mode);
  const operatingIncome = durationFact(companyfacts, ["OperatingIncomeLoss"], filing, "USD", mode);
  const netIncome = durationFact(companyfacts, ["NetIncomeLoss"], filing, "USD", mode);
  const operatingCashFlow = durationFact(companyfacts, ["NetCashProvidedByUsedInOperatingActivities"], filing, "USD", mode);
  const capex = durationFact(companyfacts, ["PaymentsToAcquirePropertyPlantAndEquipment"], filing, "USD", mode);
  const depreciation = durationFact(companyfacts, ["DepreciationDepletionAndAmortization", "Depreciation"], filing, "USD", mode);
  const stockBasedCompensation = durationFact(companyfacts, ["ShareBasedCompensation"], filing, "USD", mode);
  const dividendsPaid = durationFact(companyfacts, ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock", "Dividends"], filing, "USD", mode);
  const buybacks = durationFact(companyfacts, ["PaymentsForRepurchaseOfCommonStock", "StockRepurchasedAndRetiredDuringPeriodValue"], filing, "USD", mode);
  const dilutedEps = durationFact(companyfacts, ["EarningsPerShareDiluted"], filing, "USD/shares", mode);
  const dilutedShares = durationFact(companyfacts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], filing, "shares", mode);
  const cash = instantFact(companyfacts, ["CashAndCashEquivalentsAtCarryingValue", "Cash"], filing);
  const currentMarketable = instantFact(companyfacts, ["MarketableSecuritiesCurrent", "ShortTermInvestments"], filing);
  const noncurrentMarketable = instantFact(companyfacts, ["MarketableSecuritiesNoncurrent"], filing);
  const currentDebt = instantFact(companyfacts, ["LongTermDebtCurrent"], filing);
  const noncurrentDebt = instantFact(companyfacts, ["LongTermDebtNoncurrent", "LongTermDebt"], filing);
  const ppeNet = instantFact(companyfacts, ["PropertyPlantAndEquipmentNet"], filing);

  const ixDuration = (tags) => selectIxCoreFact(parsed, tags, filing, mode);
  const ixInstant = (tags) => selectIxCoreInstantFact(parsed, tags, filing);
  const revenueIx = ixDuration(["us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:SalesRevenueNet", "us-gaap:Revenues"]);
  const costIx = ixDuration(["us-gaap:CostOfGoodsAndServicesSold", "us-gaap:CostOfRevenue"]);
  const grossProfitIx = ixDuration(["us-gaap:GrossProfit"]);
  const operatingIncomeIx = ixDuration(["us-gaap:OperatingIncomeLoss"]);
  const netIncomeIx = ixDuration(["us-gaap:NetIncomeLoss"]);
  const operatingCashFlowIx = ixDuration(["us-gaap:NetCashProvidedByUsedInOperatingActivities"]);
  const capexIx = ixDuration(["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment"]);
  const depreciationIx = ixDuration(["us-gaap:DepreciationDepletionAndAmortization", "us-gaap:Depreciation"]);
  const stockBasedCompensationIx = ixDuration(["us-gaap:ShareBasedCompensation"]);
  const dividendsPaidIx = ixDuration(["us-gaap:PaymentsOfDividends", "us-gaap:PaymentsOfDividendsCommonStock", "us-gaap:Dividends"]);
  const buybacksIx = ixDuration(["us-gaap:PaymentsForRepurchaseOfCommonStock", "us-gaap:StockRepurchasedAndRetiredDuringPeriodValue"]);
  const dilutedEpsIx = ixDuration(["us-gaap:EarningsPerShareDiluted"]);
  const dilutedSharesIx = ixDuration(["us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding"]);
  const cashIx = ixInstant(["us-gaap:CashAndCashEquivalentsAtCarryingValue", "us-gaap:Cash"]);
  const cashAndMarketableIx = ixInstant(["aapl:CashCashEquivalentsAndMarketableSecurities"]);
  const currentMarketableIx = ixInstant(["us-gaap:MarketableSecuritiesCurrent", "us-gaap:ShortTermInvestments"]);
  const noncurrentMarketableIx = ixInstant(["us-gaap:MarketableSecuritiesNoncurrent"]);
  const currentDebtIx = ixInstant(["us-gaap:LongTermDebtCurrent"]);
  const noncurrentDebtIx = ixInstant(["us-gaap:LongTermDebtNoncurrent", "us-gaap:LongTermDebt"]);
  const ppeNetIx = ixInstant(["us-gaap:PropertyPlantAndEquipmentNet"]);

  const revenueValue = factValue(revenue) ?? revenueIx?.value ?? null;
  const costValue = factValue(costOfRevenue) ?? costIx?.value ?? null;
  const grossProfitValue = factValue(grossProfit) ?? grossProfitIx?.value ?? (revenueValue != null && costValue != null ? revenueValue - costValue : null);
  const operatingIncomeValue = factValue(operatingIncome) ?? operatingIncomeIx?.value ?? null;
  const ocfValue = factValue(operatingCashFlow) ?? operatingCashFlowIx?.value ?? null;
  const capexValue = factValue(capex) ?? capexIx?.value ?? null;
  const cashValue = factValue(cash) ?? cashIx?.value ?? null;
  const marketableValue =
    cashAndMarketableIx?.value != null && cashValue != null
      ? Math.max(cashAndMarketableIx.value - cashValue, 0)
      : (factValue(currentMarketable) ?? currentMarketableIx?.value ?? 0) + (factValue(noncurrentMarketable) ?? noncurrentMarketableIx?.value ?? 0);
  const debtValue = (factValue(currentDebt) ?? currentDebtIx?.value ?? 0) + (factValue(noncurrentDebt) ?? noncurrentDebtIx?.value ?? 0);
  const periodId = filing.form === "10-K"
    ? `fy${String(filing.fiscalYear).slice(2)}`
    : `q${String(filing.fiscalQuarter).replace("Q", "").toLowerCase()}-fy${String(filing.fiscalYear).slice(2)}`;

  return {
    id: periodId,
    fiscalYear: filing.fiscalYear,
    fiscalQuarter: filing.form === "10-K" ? "FY" : filing.fiscalQuarter,
    periodType: filing.form === "10-K" ? "annual" : "quarter",
    periodStartDate: revenue?.start ?? revenueIx?.context?.start ?? null,
    periodEndDate: filing.reportDate,
    eventDate: filing.filingDate,
    sourcePath: filing.localPath,
    sourceUrl: filing.sourceUrl,
    accession: filing.accession,
    sourceStatus: "official_actual",
    revenue: revenueValue,
    costOfRevenue: costValue ?? (revenueValue != null && grossProfitValue != null ? revenueValue - grossProfitValue : null),
    grossProfit: grossProfitValue,
    grossMargin: grossProfitValue != null && revenueValue ? grossProfitValue / revenueValue : null,
    operatingIncome: operatingIncomeValue,
    operatingMargin: operatingIncomeValue != null && revenueValue ? operatingIncomeValue / revenueValue : null,
    netIncome: factValue(netIncome) ?? netIncomeIx?.value ?? null,
    dilutedEps: factValue(dilutedEps, "USD/shares") ?? dilutedEpsIx?.value ?? null,
    dilutedShares: factValue(dilutedShares, "shares") ?? dilutedSharesIx?.value ?? null,
    operatingCashFlow: ocfValue,
    capex: capexValue,
    freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
    depreciationAmortization: factValue(depreciation) ?? depreciationIx?.value ?? null,
    stockBasedCompensation: factValue(stockBasedCompensation) ?? stockBasedCompensationIx?.value ?? null,
    cashAndShortTermInvestments: cashValue,
    marketableSecurities: marketableValue || null,
    cashAndMarketableSecurities: cashValue != null ? cashValue + marketableValue : null,
    debt: debtValue || null,
    netCashDebt: cashValue != null ? cashValue + marketableValue - debtValue : null,
    ppeNet: factValue(ppeNet) ?? ppeNetIx?.value ?? null,
    dividendsPaid: factValue(dividendsPaid) ?? dividendsPaidIx?.value ?? null,
    buybacks: factValue(buybacks) ?? buybacksIx?.value ?? null,
    notes: `SEC ${filing.form} XBRL/companyfacts ${mode} facts; USD values converted to USDm.`,
  };
}

function subtractRows(annual, quarters, fiscalQuarter = "Q4") {
  const sum = (key) => quarters.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
  const flowKeys = [
    "revenue",
    "costOfRevenue",
    "grossProfit",
    "operatingIncome",
    "netIncome",
    "operatingCashFlow",
    "capex",
    "freeCashFlow",
    "depreciationAmortization",
    "stockBasedCompensation",
    "dividendsPaid",
    "buybacks",
  ];
  const derived = {
    ...annual,
    id: `q4-fy${String(annual.fiscalYear).slice(2)}`,
    fiscalQuarter,
    periodType: "quarter",
    periodStartDate: null,
    sourceStatus: "official_actual",
    notes: `Official-derived ${fiscalQuarter} row: FY ${annual.fiscalYear} 10-K minus Q1-Q3 10-Q facts. No forward data used.`,
  };
  for (const key of flowKeys) {
    derived[key] = annual[key] != null ? annual[key] - sum(key) : null;
  }
  derived.grossMargin = derived.grossProfit != null && derived.revenue ? derived.grossProfit / derived.revenue : null;
  derived.operatingMargin = derived.operatingIncome != null && derived.revenue ? derived.operatingIncome / derived.revenue : null;
  derived.dilutedEps = derived.netIncome != null && annual.dilutedShares ? derived.netIncome / annual.dilutedShares : null;
  return derived;
}

function selectIxFact(parsed, tag, member, filing, mode) {
  const candidates = parsed.facts
    .filter((fact) => fact.name === tag)
    .filter((fact) => fact.context?.end === filing.reportDate)
    .filter((fact) => fact.context?.members?.includes(member))
    .filter((fact) => {
      const duration = fact.context?.durationDays;
      if (mode === "annual") return duration != null && duration > 300;
      return duration != null && duration >= 60 && duration <= 110;
    })
    .filter((fact) => Number.isFinite(fact.value))
    .sort((left, right) => (left.context?.durationDays ?? 999) - (right.context?.durationDays ?? 999));
  return candidates[0]?.value ?? null;
}

function grossProfitFromFields(revenue, costOfRevenue, grossProfit) {
  if (grossProfit != null) return grossProfit;
  if (revenue != null && costOfRevenue != null) return revenue - costOfRevenue;
  return null;
}

function grossMarginFromFields(revenue, costOfRevenue, grossProfit) {
  const resolvedGrossProfit = grossProfitFromFields(revenue, costOfRevenue, grossProfit);
  return resolvedGrossProfit != null && revenue ? resolvedGrossProfit / revenue : null;
}

function buildMixRowsFromFiling(filing) {
  if (!fs.existsSync(filing.localPath)) return { productRows: [], geographicRows: [], segmentRows: [] };
  const parsed = parseIxbrlFiling(filing.localPath);
  const mode = filing.form === "10-K" ? "annual" : "quarter";
  const periodId = filing.form === "10-K"
    ? `fy${String(filing.fiscalYear).slice(2)}`
    : `q${String(filing.fiscalQuarter).replace("Q", "").toLowerCase()}-fy${String(filing.fiscalYear).slice(2)}`;
  const productRows = PRODUCT_MEMBERS.map(([productCategory, member]) => {
    const revenue = selectIxFact(parsed, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", member, filing, mode);
    const costOfRevenue = selectIxFact(parsed, "us-gaap:CostOfGoodsAndServicesSold", member, filing, mode);
    const grossProfit = selectIxFact(parsed, "us-gaap:GrossProfit", member, filing, mode);
    const resolvedGrossProfit = grossProfitFromFields(revenue, costOfRevenue, grossProfit);
    return {
      periodId,
      fiscalYear: filing.fiscalYear,
      fiscalQuarter: filing.form === "10-K" ? "FY" : filing.fiscalQuarter,
      periodType: mode,
      eventDate: filing.filingDate,
      productCategory,
      revenue,
      costOfRevenue,
      grossProfit: resolvedGrossProfit,
      grossMargin: grossMarginFromFields(revenue, costOfRevenue, grossProfit),
      sourcePath: filing.localPath,
      sourceUrl: filing.sourceUrl,
      sourceStatus: "official_actual",
      notes: `SEC inline XBRL context member ${member}.`,
    };
  }).filter((row) => row.revenue != null || row.grossProfit != null);

  const geographicRows = GEOGRAPHY_MEMBERS.map(([geography, member]) => {
    const revenue = selectIxFact(parsed, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", member, filing, mode);
    return {
      periodId,
      fiscalYear: filing.fiscalYear,
      fiscalQuarter: filing.form === "10-K" ? "FY" : filing.fiscalQuarter,
      periodType: mode,
      eventDate: filing.filingDate,
      geography,
      revenue,
      sourcePath: filing.localPath,
      sourceUrl: filing.sourceUrl,
      sourceStatus: "official_actual",
      notes: `SEC inline XBRL operating segment member ${member}.`,
    };
  }).filter((row) => row.revenue != null);

  const segmentRows = productRows
    .filter((row) => ["Products", "Services"].includes(row.productCategory))
    .map((row) => ({
      periodId,
      fiscalYear: filing.fiscalYear,
      fiscalQuarter: filing.form === "10-K" ? "FY" : filing.fiscalQuarter,
      eventDate: filing.filingDate,
      segment: row.productCategory,
      taxonomy: "product_or_service",
      revenue: row.revenue,
      costOfRevenue: row.costOfRevenue,
      grossProfit: row.grossProfit,
      grossMargin: row.grossMargin,
      operatingIncome: null,
      operatingMargin: null,
      sourceStatus: "official_actual",
      notes: row.notes,
      raw: row,
    }));

  return { productRows, geographicRows, segmentRows };
}

function deriveQ4MixRows(annualRows, quarterRows, key, fiscalYear, eventDate, sourcePath, sourceUrl) {
  const categories = [...new Set(annualRows.map((row) => row[key]))];
  return categories.map((category) => {
    const annual = annualRows.find((row) => row[key] === category);
    const quarters = quarterRows.filter((row) => row[key] === category);
    const derived = { ...annual };
    derived.periodId = `q4-fy${String(fiscalYear).slice(2)}`;
    derived.fiscalQuarter = "Q4";
    derived.periodType = "quarter";
    derived.eventDate = eventDate;
    derived.sourcePath = sourcePath;
    derived.sourceUrl = sourceUrl;
    derived.notes = `Official-derived Q4 row: FY ${fiscalYear} 10-K minus Q1-Q3 10-Q ${key} facts.`;
    for (const field of ["revenue", "costOfRevenue", "grossProfit", "operatingIncome"]) {
      if (annual?.[field] != null) {
        derived[field] = annual[field] - quarters.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
      }
    }
    if ("grossMargin" in derived) derived.grossMargin = derived.grossProfit != null && derived.revenue ? derived.grossProfit / derived.revenue : null;
    return derived;
  }).filter((row) => row.revenue != null || row.grossProfit != null);
}

function addGrowth(rows, key) {
  const byKey = new Map();
  for (const row of rows) {
    const groupKey = `${row[key]}:${row.fiscalQuarter}`;
    if (!byKey.has(groupKey)) byKey.set(groupKey, []);
    byKey.get(groupKey).push(row);
  }
  for (const group of byKey.values()) {
    group.sort((left, right) => left.fiscalYear - right.fiscalYear);
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      current.growth = previous.revenue && current.revenue != null ? current.revenue / previous.revenue - 1 : null;
    }
  }
  return rows;
}

function parseYahooChartRows(ticker) {
  const filePath = path.join(MARKET_DIR, `yahoo_${ticker.toLowerCase()}_chart.json`);
  const payload = readJsonIfExists(filePath);
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjclose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  return timestamps.map((timestamp, index) => ({
    ticker,
    priceDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
    adjustedClose: adjclose[index] ?? quote.close?.[index] ?? null,
    close: quote.close?.[index] ?? null,
    source: "Yahoo Finance chart API",
  })).filter((row) => row.adjustedClose != null);
}

function nearestPriceForDate(rows, date) {
  return [...rows].filter((row) => row.priceDate <= date).sort((left, right) => right.priceDate.localeCompare(left.priceDate))[0] ?? null;
}

async function loadAaplStaticModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/aapl/assumptions.ts");
    return {
      scenarioPresets: assumptionsModule.aaplScenarioPresets,
      assumptionDefinitions: assumptionsModule.aaplValuationAssumptionDefinitions ?? [],
    };
  } finally {
    await server.close();
  }
}

export async function buildAaplBackendSeedPayload() {
  const now = new Date().toISOString();
  const companyfacts = readJsonIfExists(COMPANYFACTS_PATH);
  const filings = listSecFilings();
  const { scenarioPresets, assumptionDefinitions } = await loadAaplStaticModules();
  const directFinancials = filings
    .map((filing) => buildCoreFinancialForFiling(companyfacts, filing))
    .filter((row) => row.revenue != null && row.operatingIncome != null);
  const annuals = directFinancials.filter((row) => row.periodType === "annual");
  const directQuarters = directFinancials.filter((row) => row.periodType === "quarter");
  const derivedQ4Financials = annuals.flatMap((annual) => {
    const q1ToQ3 = directQuarters.filter((row) => row.fiscalYear === annual.fiscalYear && ["Q1", "Q2", "Q3"].includes(row.fiscalQuarter));
    return q1ToQ3.length === 3 ? [subtractRows(annual, q1ToQ3)] : [];
  });
  const quarterFinancials = [...directQuarters, ...derivedQ4Financials]
    .filter((row) => row.fiscalYear >= 2018)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate));

  const mixByFiling = filings.map((filing) => ({ filing, ...buildMixRowsFromFiling(filing) }));
  const directProductRows = mixByFiling.flatMap((entry) => entry.productRows).filter((row) => row.periodType === "quarter");
  const directGeographicRows = mixByFiling.flatMap((entry) => entry.geographicRows).filter((row) => row.periodType === "quarter");
  const directSegmentRows = mixByFiling.flatMap((entry) => entry.segmentRows).filter((row) => row.fiscalQuarter !== "FY");
  const annualProductRows = mixByFiling.flatMap((entry) => entry.productRows).filter((row) => row.periodType === "annual");
  const annualGeographicRows = mixByFiling.flatMap((entry) => entry.geographicRows).filter((row) => row.periodType === "annual");
  const annualSegmentRows = mixByFiling.flatMap((entry) => entry.segmentRows).filter((row) => row.fiscalQuarter === "FY");
  const derivedQ4ProductRows = annuals.flatMap((annual) => {
    const annualRows = annualProductRows.filter((row) => row.fiscalYear === annual.fiscalYear);
    const quarterRows = directProductRows.filter((row) => row.fiscalYear === annual.fiscalYear && ["Q1", "Q2", "Q3"].includes(row.fiscalQuarter));
    return quarterRows.length >= 15 ? deriveQ4MixRows(annualRows, quarterRows, "productCategory", annual.fiscalYear, annual.eventDate, annual.sourcePath, annual.sourceUrl) : [];
  });
  const derivedQ4GeographicRows = annuals.flatMap((annual) => {
    const annualRows = annualGeographicRows.filter((row) => row.fiscalYear === annual.fiscalYear);
    const quarterRows = directGeographicRows.filter((row) => row.fiscalYear === annual.fiscalYear && ["Q1", "Q2", "Q3"].includes(row.fiscalQuarter));
    return quarterRows.length >= 15 ? deriveQ4MixRows(annualRows, quarterRows, "geography", annual.fiscalYear, annual.eventDate, annual.sourcePath, annual.sourceUrl) : [];
  });
  const derivedQ4SegmentRows = annuals.flatMap((annual) => {
    const annualRows = annualSegmentRows.filter((row) => row.fiscalYear === annual.fiscalYear);
    const quarterRows = directSegmentRows.filter((row) => row.fiscalYear === annual.fiscalYear && ["Q1", "Q2", "Q3"].includes(row.fiscalQuarter));
    return quarterRows.length >= 6 ? deriveQ4MixRows(annualRows, quarterRows, "segment", annual.fiscalYear, annual.eventDate, annual.sourcePath, annual.sourceUrl) : [];
  });
  const productRowsWithGrowth = addGrowth([...directProductRows, ...derivedQ4ProductRows], "productCategory");
  const geographicRowsWithGrowth = addGrowth([...directGeographicRows, ...derivedQ4GeographicRows], "geography");
  const segmentRowsWithGrowth = addGrowth([...directSegmentRows, ...derivedQ4SegmentRows], "segment");

  const reportingEvents = quarterFinancials.map((period) => ({
    id: `sec-${period.id}`,
    ticker: TICKER,
    eventDate: period.eventDate,
    fiscalPeriod: `FY${period.fiscalYear} ${period.fiscalQuarter}`,
    fiscalYear: period.fiscalYear,
    fiscalQuarter: period.fiscalQuarter,
    eventType: `q${String(period.fiscalQuarter).replace("Q", "").toLowerCase()}_results`,
    label: `FY${period.fiscalYear} ${period.fiscalQuarter} SEC reporting event`,
    sourceType: "official_actual",
    sourcePath: period.sourcePath,
    sourceUrl: period.sourceUrl,
    createdAt: now,
  }));
  const eventByPeriodId = new Map(quarterFinancials.map((period) => [period.id, reportingEvents.find((event) => event.id === `sec-${period.id}`)]));
  const priceRows = parseYahooChartRows("AAPL");
  const latestPrice = priceRows[priceRows.length - 1];

  const sourceDocuments = [
    {
      id: "aapl-sec-companyfacts",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Apple SEC Companyfacts",
      sourcePath: COMPANYFACTS_PATH,
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
      retrievedAt: now,
      publishedDate: null,
      provenance: "SEC Companyfacts API; core GAAP facts used for quarterly financial periods.",
      confidence: companyfacts ? "high" : "missing",
      checksum: null,
      metadataJson: json({ cik: 320193, entityName: companyfacts?.entityName ?? "Apple Inc." }),
    },
    {
      id: "aapl-sec-submissions",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "Apple SEC submissions feed",
      sourcePath: SUBMISSIONS_PATH,
      sourceUrl: "https://data.sec.gov/submissions/CIK0000320193.json",
      retrievedAt: now,
      publishedDate: null,
      provenance: "SEC submissions API; used to identify 10-Q and 10-K primary documents.",
      confidence: filings.length ? "high" : "missing",
      checksum: null,
      metadataJson: json({ filingCount: filings.length }),
    },
    ...filings.map((filing) => ({
      id: `aapl-filing-${filing.accession}`,
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: `Apple ${filing.form} ${filing.reportDate}`,
      sourcePath: filing.localPath,
      sourceUrl: filing.sourceUrl,
      retrievedAt: now,
      publishedDate: filing.filingDate,
      provenance: "SEC primary inline XBRL filing; product and geography revenue parsed from context dimensions.",
      confidence: fs.existsSync(filing.localPath) ? "high" : "missing",
      checksum: null,
      metadataJson: json(filing),
    })),
  ];

  const financialPeriods = quarterFinancials.map((period) => {
    const event = eventByPeriodId.get(period.id);
    const nearest = nearestPriceForDate(priceRows, period.eventDate);
    return {
      id: `aapl-${period.id}`,
      ticker: TICKER,
      periodId: period.id,
      fiscalYear: period.fiscalYear,
      fiscalQuarter: period.fiscalQuarter,
      periodType: period.periodType,
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
      eventId: event?.id ?? null,
      asOfDate: period.eventDate,
      sourceType: sourceLayer(period.sourceStatus),
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
      depreciationAmortization: period.depreciationAmortization,
      stockBasedCompensation: period.stockBasedCompensation,
      cashAndShortTermInvestments: period.cashAndShortTermInvestments,
      marketableSecurities: period.marketableSecurities,
      cashAndMarketableSecurities: period.cashAndMarketableSecurities,
      debt: period.debt,
      netCashDebt: period.netCashDebt,
      operatingLeaseLiabilities: null,
      ppeNet: period.ppeNet,
      dividendsPaid: period.dividendsPaid,
      buybacks: period.buybacks,
      currentPrice: nearest?.adjustedClose ?? null,
      rawJson: json(period),
    };
  });

  const productFinancials = productRowsWithGrowth.map((row, index) => {
    const event = eventByPeriodId.get(row.periodId);
    const grossProfit = grossProfitFromFields(row.revenue, row.costOfRevenue, row.grossProfit);
    return {
      id: `aapl-product-${row.periodId}-${index}`,
      ticker: TICKER,
      periodId: row.periodId,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? row.eventDate,
      productCategory: row.productCategory,
      revenue: row.revenue,
      costOfRevenue: row.costOfRevenue ?? null,
      grossProfit,
      grossMargin: row.grossMargin ?? grossMarginFromFields(row.revenue, row.costOfRevenue, row.grossProfit),
      growth: row.growth ?? null,
      sourceType: sourceLayer(row.sourceStatus),
      sourcePath: row.sourcePath,
      notes: row.notes,
      rawJson: json(row),
    };
  });

  const geographicFinancials = geographicRowsWithGrowth.map((row, index) => {
    const event = eventByPeriodId.get(row.periodId);
    return {
      id: `aapl-geo-${row.periodId}-${index}`,
      ticker: TICKER,
      periodId: row.periodId,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? row.eventDate,
      geography: row.geography,
      revenue: row.revenue,
      operatingIncome: null,
      growth: row.growth ?? null,
      sourceType: sourceLayer(row.sourceStatus),
      sourcePath: row.sourcePath,
      notes: row.notes,
      rawJson: json(row),
    };
  });

  const segmentFinancials = segmentRowsWithGrowth.map((row, index) => {
    const event = eventByPeriodId.get(row.periodId);
    return {
      id: `aapl-segment-${row.periodId}-${index}`,
      ticker: TICKER,
      periodId: row.periodId,
      eventId: event?.id ?? null,
      asOfDate: event?.eventDate ?? row.eventDate,
      segment: row.segment,
      taxonomy: row.taxonomy,
      revenue: row.revenue,
      costOfRevenue: row.costOfRevenue,
      grossProfit: row.grossProfit,
      grossMargin: row.grossMargin,
      operatingExpenses: null,
      operatingIncome: row.operatingIncome,
      operatingMargin: row.operatingMargin,
      growth: row.growth ?? null,
      constantCurrencyGrowth: null,
      sourceType: sourceLayer(row.sourceStatus),
      notes: row.notes,
      rawJson: json(row.raw ?? row),
    };
  });

  const operatingMetricSnapshots = reportingEvents.map((event) => ({
    id: `aapl-operating-metrics-${event.id}`,
    ticker: TICKER,
    periodId: event.id.replace("sec-", ""),
    eventId: event.id,
    asOfDate: event.eventDate,
    sourceType: "research_only",
    installedBaseCommentary: "Installed base commentary is represented as a research framework field; official quantitative installed-base figures are not imported unless disclosed in source documents.",
    activeDevicesCommentary: "Active-device detail is not fabricated; future source ingestion can promote reviewed official disclosures.",
    paidSubscriptionsCommentary: "Paid subscription commentary is separated from valuation-impacting assumptions until reviewed.",
    appStoreRegulationCommentary: event.eventDate >= "2020-01-01" ? "Services regulation is known as a live diligence item as of this event date." : "Pre-2020 valuation runs carry lower App Store regulatory haircut assumptions.",
    chinaCommentary: "Greater China is modeled from imported geographic revenue where available; valuation haircuts are event-dated by the adapter.",
    fxImpactCommentary: "FX impact is captured only when disclosed; no FX values are fabricated.",
    iphoneCycleCommentary: "iPhone replacement-cycle debate is modeled through event-dated iPhone revenue growth and scenario assumptions.",
    aiAppleIntelligenceCommentary: event.eventDate >= "2024-06-10" ? "Apple Intelligence optionality can be considered after WWDC 2024; older historical runs force AI optionality to zero." : "Apple Intelligence was not knowable as a named catalyst at this event date.",
    visionProCommentary: event.eventDate >= "2024-02-02" ? "Vision Pro/new-category optionality is monitored but not given standalone valuation impact in v1." : null,
    supplyChainCommentary: "Supply-chain and component-cost commentary remains a research-only qualitative field.",
    capitalReturnCommentary: "Buybacks and diluted share count are imported as official financial facts and valuation drivers.",
    normalizedFcfCommentary: "Normalized FCF uses event-dated operating cash flow, capex, and revenue facts.",
    notes: "Research-only operating metric snapshot; not valuation-impacting unless the adapter maps official rows or reviewed assumptions.",
    rawJson: json(event),
  }));

  const marketSnapshots = reportingEvents.map((event) => {
    const nearest = nearestPriceForDate(priceRows, event.eventDate);
    const shares = financialPeriods.find((row) => row.eventId === event.id)?.dilutedShares ?? 15_000;
    return {
      id: `aapl-market-${event.id}`,
      ticker: TICKER,
      asOfDate: event.eventDate,
      priceDate: nearest?.priceDate ?? null,
      currentPrice: nearest?.adjustedClose ?? latestPrice?.adjustedClose ?? null,
      currency: "USD",
      marketCap: nearest?.adjustedClose ? nearest.adjustedClose * shares : null,
      enterpriseValue: nearest?.adjustedClose ? nearest.adjustedClose * shares - (financialPeriods.find((row) => row.eventId === event.id)?.netCashDebt ?? 0) : null,
      sharesOutstanding: shares,
      previousClose: nearest?.close ?? null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      dividendYield: null,
      beta: null,
      source: nearest ? "Yahoo Finance chart API local file" : "research_only no local price at seed time",
      fetchedAt: now,
      rawJson: json({ event, nearestPrice: nearest }),
    };
  });

  const peerSnapshots = ["MSFT", "GOOGL", "META", "AMZN"].map((peerTicker) => ({
    id: `aapl-peer-${peerTicker}`,
    ticker: TICKER,
    asOfDate: latestPrice?.priceDate ?? reportingEvents[reportingEvents.length - 1]?.eventDate ?? now.slice(0, 10),
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: "mega_cap_platform",
    peerGroup: "Mega-cap ecosystem / platform peers",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: null,
    forwardPe: null,
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: "research_only peer placeholder",
    fetchedAt: now,
    confidenceLevel: "low",
    absoluteValueUse: "metadata_only_not_aggregated",
    rawJson: json({ note: "Peer absolute market cap / EV intentionally omitted to avoid mixed-source aggregation." }),
  }));

  const modelVersions = [{
    id: AAPL_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: AAPL_BACKEND_MODEL_VERSION.version,
    name: AAPL_BACKEND_MODEL_VERSION.name,
    description: AAPL_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(AAPL_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json({ ...AAPL_BACKEND_MODEL_VERSION.assumptionSchema, assumptionDefinitions }),
    createdAt: now,
  }];

  const assumptionSets = Object.entries(scenarioPresets).map(([scenario, assumptions]) => ({
    id: `aapl-${scenario.toLowerCase()}-${AAPL_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    name: `${scenario} Apple backend assumptions`,
    scenario,
    modelVersion: AAPL_BACKEND_MODEL_VERSION.version,
    asOfDate: "2018-01-01",
    assumptionsJson: json(assumptions),
    sourceType: "forecast_assumption",
    createdAt: now,
  }));

  const validationWarnings = [{
    id: "aapl-operating-commentary-research-only",
    ticker: TICKER,
    scope: "operating_metric_snapshots",
    severity: "low",
    title: "Qualitative operating metric commentary is research-only",
    detail: "Installed base, paid subscriptions, App Store regulation, China, AI, Vision Pro, and supply-chain commentary fields are present but not promoted into valuation unless explicitly mapped by event-dated adapter logic.",
    relatedTable: "operating_metric_snapshots",
    relatedRecordId: null,
    createdAt: now,
  }];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    productFinancials,
    geographicFinancials,
    operatingMetricSnapshots,
    marketSnapshots,
    peerSnapshots,
    guidanceItems: [],
    transcriptEvents: [],
    transcriptExtractions: [],
    modelVersions,
    assumptionSets,
    validationWarnings,
  };
}
