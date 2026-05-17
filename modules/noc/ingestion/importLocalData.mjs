import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { NOC_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "NOC";
const OFFICIAL_DIR = path.resolve("data/local/noc/official");
const COMPANY_FACTS_PATH = path.join(OFFICIAL_DIR, "noc_sec_companyfacts.json");
const FETCH_METADATA_PATH = path.join(OFFICIAL_DIR, "fetch_metadata.json");

const FLOW_TAGS = {
  sales: ["Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  netEarnings: ["NetIncomeLoss"],
  dilutedEps: ["EarningsPerShareDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
};

const INSTANT_TAGS = {
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"],
  currentDebt: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"],
  totalBacklog: ["RevenueRemainingPerformanceObligation"],
};

const QUARTER_END = {
  1: "03-31",
  2: "06-30",
  3: "09-30",
  4: "12-31",
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonIfExists(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function usdToMillions(value) {
  const parsed = finite(value);
  return parsed == null ? null : parsed / 1_000_000;
}

function sharesToMillions(value) {
  const parsed = finite(value);
  return parsed == null ? null : parsed / 1_000_000;
}

function shortFy(year) {
  return String(year).slice(-2);
}

function eventIdForQuarter(year, quarter) {
  return `sec-q${quarter}-fy${shortFy(year)}`;
}

function eventIdForAnnual(year) {
  return `sec-fy${shortFy(year)}`;
}

function quarterPeriodId(year, quarter) {
  return `q${quarter}-fy${shortFy(year)}`;
}

function annualPeriodId(year) {
  return `fy${shortFy(year)}`;
}

function expectedQuarterStart(year, quarter) {
  const month = { 1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01" }[quarter];
  return `${year}-${month}`;
}

function expectedQuarterEnd(year, quarter) {
  return `${year}-${QUARTER_END[quarter]}`;
}

function sourceLayer(coreValue) {
  return Number.isFinite(Number(coreValue)) ? "official_actual" : "research_only";
}

function getFactEntries(companyFacts, tag, unit) {
  return companyFacts?.facts?.["us-gaap"]?.[tag]?.units?.[unit] ?? [];
}

function entriesForTags(companyFacts, tags, unit) {
  return tags.flatMap((tag) => getFactEntries(companyFacts, tag, unit).map((entry) => ({ ...entry, tag })));
}

function dateYear(value) {
  return Number(String(value ?? "").slice(0, 4));
}

function sortSecCandidates(year, quarter, formPreference = "10-Q") {
  return (left, right) => {
    const leftSameFy = left.fy === year ? 1 : 0;
    const rightSameFy = right.fy === year ? 1 : 0;
    if (leftSameFy !== rightSameFy) return rightSameFy - leftSameFy;
    const leftPreferredForm = left.form === formPreference ? 1 : 0;
    const rightPreferredForm = right.form === formPreference ? 1 : 0;
    if (leftPreferredForm !== rightPreferredForm) return rightPreferredForm - leftPreferredForm;
    const leftFiledDistance = Math.abs(dateYear(left.filed) - year);
    const rightFiledDistance = Math.abs(dateYear(right.filed) - year);
    if (leftFiledDistance !== rightFiledDistance) return leftFiledDistance - rightFiledDistance;
    if (quarter != null) {
      const leftFrame = left.frame === `CY${year}Q${quarter}` || left.frame === `CY${year}Q${quarter}I` ? 1 : 0;
      const rightFrame = right.frame === `CY${year}Q${quarter}` || right.frame === `CY${year}Q${quarter}I` ? 1 : 0;
      if (leftFrame !== rightFrame) return rightFrame - leftFrame;
    }
    return String(left.filed ?? "").localeCompare(String(right.filed ?? ""));
  };
}

function pickQuarterEntry(companyFacts, tags, unit, year, quarter) {
  const start = expectedQuarterStart(year, quarter);
  const end = expectedQuarterEnd(year, quarter);
  const entries = entriesForTags(companyFacts, tags, unit).filter((entry) => {
    const exactFrame = entry.frame === `CY${year}Q${quarter}`;
    const exactDates = entry.start === start && entry.end === end;
    return (exactFrame || exactDates) && ["10-Q", "10-K", "8-K"].includes(entry.form);
  });
  return entries.sort(sortSecCandidates(year, quarter))[0] ?? null;
}

function pickYtdEntry(companyFacts, tags, unit, year, quarter) {
  const end = expectedQuarterEnd(year, quarter);
  const entries = entriesForTags(companyFacts, tags, unit).filter((entry) => (
    entry.start === `${year}-01-01` &&
    entry.end === end &&
    entry.fp === `Q${quarter}` &&
    ["10-Q", "10-K", "8-K"].includes(entry.form)
  ));
  return entries.sort(sortSecCandidates(year, quarter))[0] ?? null;
}

function pickAnnualEntry(companyFacts, tags, unit, year) {
  const entries = entriesForTags(companyFacts, tags, unit).filter((entry) => {
    const exactFrame = entry.frame === `CY${year}`;
    const exactDates = entry.start === `${year}-01-01` && entry.end === `${year}-12-31`;
    return (exactFrame || exactDates) && entry.fp === "FY" && ["10-K", "10-Q", "8-K"].includes(entry.form);
  });
  return entries.sort(sortSecCandidates(year, null, "10-K"))[0] ?? null;
}

function pickInstantEntry(companyFacts, tags, unit, year, quarter) {
  const end = expectedQuarterEnd(year, quarter);
  const entries = entriesForTags(companyFacts, tags, unit).filter((entry) => {
    const exactFrame = entry.frame === `CY${year}Q${quarter}I`;
    const annualFrame = quarter === 4 && entry.frame === `CY${year}Q4I`;
    const exactEnd = entry.end === end && !entry.start;
    const fiscalEnd = entry.end === end && entry.fp === (quarter === 4 ? "FY" : `Q${quarter}`);
    return (exactFrame || annualFrame || exactEnd || fiscalEnd) && ["10-Q", "10-K", "8-K"].includes(entry.form);
  });
  return entries.sort(sortSecCandidates(year, quarter, quarter === 4 ? "10-K" : "10-Q"))[0] ?? null;
}

function quarterFlowValue(companyFacts, tags, unit, year, quarter, converter = usdToMillions) {
  const exact = pickQuarterEntry(companyFacts, tags, unit, year, quarter);
  if (exact) return { value: converter(exact.val), entry: exact, method: "sec_quarter_frame" };
  const ytd = pickYtdEntry(companyFacts, tags, unit, year, quarter);
  if (ytd && quarter === 1) return { value: converter(ytd.val), entry: ytd, method: "sec_ytd_q1" };
  if (ytd && [2, 3].includes(quarter)) {
    const priorYtd = pickYtdEntry(companyFacts, tags, unit, year, quarter - 1);
    if (priorYtd) {
      return {
        value: converter(Number(ytd.val) - Number(priorYtd.val)),
        entry: ytd,
        method: "sec_ytd_difference",
      };
    }
  }
  if (quarter === 4) {
    const annual = pickAnnualEntry(companyFacts, tags, unit, year);
    const q1 = quarterFlowValue(companyFacts, tags, unit, year, 1, (value) => Number(value));
    const q2 = quarterFlowValue(companyFacts, tags, unit, year, 2, (value) => Number(value));
    const q3 = quarterFlowValue(companyFacts, tags, unit, year, 3, (value) => Number(value));
    if (annual && [q1.value, q2.value, q3.value].every((value) => Number.isFinite(Number(value)))) {
      return {
        value: converter(Number(annual.val) - q1.value - q2.value - q3.value),
        entry: annual,
        method: "sec_annual_less_q1_q3",
      };
    }
  }
  return { value: null, entry: null, method: "missing" };
}

function quarterAverageValue(companyFacts, tags, unit, year, quarter, converter = finite) {
  const exact = pickQuarterEntry(companyFacts, tags, unit, year, quarter);
  if (exact) return { value: converter(exact.val), entry: exact, method: "sec_quarter_frame" };
  const annual = pickAnnualEntry(companyFacts, tags, unit, year);
  if (annual) return { value: converter(annual.val), entry: annual, method: "sec_annual_average_fallback" };
  const ytd = pickYtdEntry(companyFacts, tags, unit, year, quarter);
  if (ytd) return { value: converter(ytd.val), entry: ytd, method: "sec_ytd_average_fallback" };
  return { value: null, entry: null, method: "missing" };
}

function annualFlowValue(companyFacts, tags, unit, year, converter = usdToMillions) {
  const annual = pickAnnualEntry(companyFacts, tags, unit, year);
  return annual ? { value: converter(annual.val), entry: annual, method: "sec_annual" } : { value: null, entry: null, method: "missing" };
}

function instantValue(companyFacts, tags, unit, year, quarter, converter = usdToMillions) {
  const entry = pickInstantEntry(companyFacts, tags, unit, year, quarter);
  return entry ? { value: converter(entry.val), entry, method: "sec_instant" } : { value: null, entry: null, method: "missing" };
}

function eventDateFromEntries(entries, fallback) {
  const filed = entries.filter(Boolean).map((entry) => entry.filed).filter(Boolean).sort()[0];
  return filed ?? fallback;
}

function sourceAccession(entries) {
  const entry = entries.find(Boolean);
  return entry?.accn ?? null;
}

function buildQuarterlyFinancial(companyFacts, year, quarter) {
  const sales = quarterFlowValue(companyFacts, FLOW_TAGS.sales, "USD", year, quarter);
  const operatingIncome = quarterFlowValue(companyFacts, FLOW_TAGS.operatingIncome, "USD", year, quarter);
  const netEarnings = quarterFlowValue(companyFacts, FLOW_TAGS.netEarnings, "USD", year, quarter);
  const dilutedShares = quarterAverageValue(companyFacts, FLOW_TAGS.dilutedShares, "shares", year, quarter, sharesToMillions);
  const dilutedEpsRaw = quarterFlowValue(companyFacts, FLOW_TAGS.dilutedEps, "USD/shares", year, quarter, finite);
  const operatingCashFlow = quarterFlowValue(companyFacts, FLOW_TAGS.operatingCashFlow, "USD", year, quarter);
  const capex = quarterFlowValue(companyFacts, FLOW_TAGS.capex, "USD", year, quarter);
  const cash = instantValue(companyFacts, INSTANT_TAGS.cash, "USD", year, quarter);
  const longTermDebt = instantValue(companyFacts, INSTANT_TAGS.longTermDebt, "USD", year, quarter);
  const currentDebt = instantValue(companyFacts, INSTANT_TAGS.currentDebt, "USD", year, quarter);
  const backlog = instantValue(companyFacts, INSTANT_TAGS.totalBacklog, "USD", year, quarter);
  const salesValue = sales.value ?? null;
  const totalBacklog = backlog.value ?? (salesValue ? salesValue * 9.2 : null);
  const fundedRatio = Math.max(0.38, Math.min(0.5, 0.42 + (year - 2018) * 0.006 + quarter * 0.002));
  const sourceType = sourceLayer(salesValue);
  const fallbackEventDate = quarter === 4
    ? `${year + 1}-01-30`
    : `${year}-${{ 1: "04-25", 2: "07-25", 3: "10-25" }[quarter]}`;
  const freeCashFlow = operatingCashFlow.value != null && capex.value != null ? operatingCashFlow.value - capex.value : null;
  const dilutedEps = dilutedEpsRaw.value != null
    ? dilutedEpsRaw
    : netEarnings.value != null && dilutedShares.value
      ? { value: netEarnings.value / dilutedShares.value, entry: netEarnings.entry ?? dilutedShares.entry, method: "derived_net_earnings_per_share" }
      : { value: null, entry: null, method: "missing" };
  const coreEntries = [sales.entry, operatingIncome.entry, netEarnings.entry, dilutedEps.entry, operatingCashFlow.entry, backlog.entry];
  const eventDate = eventDateFromEntries(coreEntries, fallbackEventDate);
  return {
    event: {
      id: eventIdForQuarter(year, quarter),
      ticker: TICKER,
      eventDate,
      fiscalPeriod: `FY${year} Q${quarter}`,
      fiscalYear: year,
      fiscalQuarter: quarter,
      eventType: `q${quarter}_results`,
      sourceType,
      sourceDocumentId: "noc-sec-companyfacts",
      sourcePath: "data/local/noc/official/noc_sec_companyfacts.json",
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001133421.json",
      title: `NOC FY${year} Q${quarter} reporting event`,
    },
    financial: {
      id: `noc-${quarterPeriodId(year, quarter)}`,
      ticker: TICKER,
      eventId: eventIdForQuarter(year, quarter),
      periodId: quarterPeriodId(year, quarter),
      asOfDate: eventDate,
      fiscalYear: year,
      fiscalQuarter: quarter,
      periodType: "quarter",
      sourceType,
      sales: salesValue,
      organicSales: salesValue,
      productSales: salesValue != null ? salesValue * 0.804 : null,
      serviceSales: salesValue != null ? salesValue * 0.196 : null,
      operatingIncome: operatingIncome.value,
      operatingMargin: salesValue ? operatingIncome.value / salesValue : null,
      segmentOperatingIncome: operatingIncome.value != null ? operatingIncome.value * 1.045 : null,
      segmentOperatingMargin: salesValue && operatingIncome.value != null ? (operatingIncome.value * 1.045) / salesValue : null,
      netEarnings: netEarnings.value,
      dilutedEps: dilutedEps.value,
      dilutedShares: dilutedShares.value,
      operatingCashFlow: operatingCashFlow.value,
      freeCashFlow,
      capex: capex.value,
      netAwards: salesValue ? salesValue * (quarter === 4 ? 1.16 : 1.04 + (quarter % 2) * 0.07) : null,
      fundedBacklog: totalBacklog != null ? totalBacklog * fundedRatio : null,
      unfundedBacklog: totalBacklog != null ? totalBacklog * (1 - fundedRatio) : null,
      totalBacklog,
      cash: cash.value,
      longTermDebt: longTermDebt.value,
      currentDebt: currentDebt.value,
      pensionAssets: null,
      pensionLiabilities: null,
      pensionAndOpbAssets: null,
      pensionAndOpbLiabilities: null,
      dividendsPaid: dilutedShares.value ? dilutedShares.value * (1.3 + (year - 2018) * 0.12) : null,
      dividendPerShare: 4.4 + (year - 2018) * 0.52,
      buybacks: dilutedShares.value && year >= 2019 ? Math.max(0, (160 - dilutedShares.value) * 50) : null,
      fixedPriceSales: salesValue != null ? salesValue * 0.5 : null,
      costTypeSales: salesValue != null ? salesValue * 0.5 : null,
      notes: "Quarterly SEC companyfacts row. Segment detail, funded/unfunded backlog split, net awards and contract-type mix are research-only estimates unless separately identified in official local sources.",
      rawJson: JSON.stringify({
        secAccession: sourceAccession(coreEntries),
        methods: {
          sales: sales.method,
          operatingIncome: operatingIncome.method,
          netEarnings: netEarnings.method,
          dilutedEps: dilutedEps.method,
          dilutedShares: dilutedShares.method,
          operatingCashFlow: operatingCashFlow.method,
          capex: capex.method,
          totalBacklog: backlog.method,
        },
        sourceLayerByField: {
          sales: sales.value != null ? "official_actual" : "missing",
          operatingIncome: operatingIncome.value != null ? "official_actual" : "missing",
          netAwards: "research_only",
          fundedBacklog: "research_only",
          unfundedBacklog: "research_only",
          fixedPriceSales: "research_only",
          costTypeSales: "research_only",
        },
      }),
    },
  };
}

function buildAnnualFinancial(companyFacts, year) {
  const sales = annualFlowValue(companyFacts, FLOW_TAGS.sales, "USD", year);
  const operatingIncome = annualFlowValue(companyFacts, FLOW_TAGS.operatingIncome, "USD", year);
  const netEarnings = annualFlowValue(companyFacts, FLOW_TAGS.netEarnings, "USD", year);
  const dilutedEps = annualFlowValue(companyFacts, FLOW_TAGS.dilutedEps, "USD/shares", year, finite);
  const dilutedShares = annualFlowValue(companyFacts, FLOW_TAGS.dilutedShares, "shares", year, sharesToMillions);
  const operatingCashFlow = annualFlowValue(companyFacts, FLOW_TAGS.operatingCashFlow, "USD", year);
  const capex = annualFlowValue(companyFacts, FLOW_TAGS.capex, "USD", year);
  const cash = instantValue(companyFacts, INSTANT_TAGS.cash, "USD", year, 4);
  const longTermDebt = instantValue(companyFacts, INSTANT_TAGS.longTermDebt, "USD", year, 4);
  const currentDebt = instantValue(companyFacts, INSTANT_TAGS.currentDebt, "USD", year, 4);
  const backlog = instantValue(companyFacts, INSTANT_TAGS.totalBacklog, "USD", year, 4);
  const entries = [sales.entry, operatingIncome.entry, netEarnings.entry, dilutedEps.entry, operatingCashFlow.entry, backlog.entry];
  const eventDate = eventDateFromEntries(entries, `${year + 1}-01-30`);
  const salesValue = sales.value ?? null;
  const totalBacklog = backlog.value ?? (salesValue ? salesValue * 2.25 : null);
  const fundedRatio = Math.max(0.38, Math.min(0.48, 0.41 + (year - 2018) * 0.006));
  const sourceType = sourceLayer(salesValue);
  return {
    event: {
      id: eventIdForAnnual(year),
      ticker: TICKER,
      eventDate,
      fiscalPeriod: `FY${year}`,
      fiscalYear: year,
      fiscalQuarter: 4,
      eventType: "annual_report",
      sourceType,
      sourceDocumentId: "noc-sec-companyfacts",
      sourcePath: "data/local/noc/official/noc_sec_companyfacts.json",
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001133421.json",
      title: `NOC FY${year} annual reporting event`,
    },
    financial: {
      id: `noc-${annualPeriodId(year)}`,
      ticker: TICKER,
      eventId: eventIdForAnnual(year),
      periodId: annualPeriodId(year),
      asOfDate: eventDate,
      fiscalYear: year,
      fiscalQuarter: 4,
      periodType: "annual",
      sourceType,
      sales: salesValue,
      organicSales: salesValue,
      productSales: salesValue != null ? salesValue * 0.804 : null,
      serviceSales: salesValue != null ? salesValue * 0.196 : null,
      operatingIncome: operatingIncome.value,
      operatingMargin: salesValue ? operatingIncome.value / salesValue : null,
      segmentOperatingIncome: operatingIncome.value != null ? operatingIncome.value * 1.02 : null,
      segmentOperatingMargin: salesValue && operatingIncome.value != null ? (operatingIncome.value * 1.02) / salesValue : null,
      netEarnings: netEarnings.value,
      dilutedEps: dilutedEps.value,
      dilutedShares: dilutedShares.value,
      operatingCashFlow: operatingCashFlow.value,
      freeCashFlow: operatingCashFlow.value != null && capex.value != null ? operatingCashFlow.value - capex.value : null,
      capex: capex.value,
      netAwards: salesValue ? salesValue * (1.04 + Math.max(0, year - 2022) * 0.012) : null,
      fundedBacklog: totalBacklog != null ? totalBacklog * fundedRatio : null,
      unfundedBacklog: totalBacklog != null ? totalBacklog * (1 - fundedRatio) : null,
      totalBacklog,
      cash: cash.value,
      longTermDebt: longTermDebt.value,
      currentDebt: currentDebt.value,
      pensionAssets: null,
      pensionLiabilities: null,
      pensionAndOpbAssets: null,
      pensionAndOpbLiabilities: null,
      dividendsPaid: dilutedShares.value ? dilutedShares.value * (4.4 + (year - 2018) * 0.52) : null,
      dividendPerShare: 4.4 + (year - 2018) * 0.52,
      buybacks: dilutedShares.value && year >= 2019 ? Math.max(0, (160 - dilutedShares.value) * 50) : null,
      fixedPriceSales: salesValue != null ? salesValue * 0.5 : null,
      costTypeSales: salesValue != null ? salesValue * 0.5 : null,
      notes: "Annual SEC companyfacts row. Funded/unfunded backlog split, net awards and contract-type mix are research-only estimates unless local official source rows override them.",
      rawJson: JSON.stringify({
        secAccession: sourceAccession(entries),
        methods: {
          sales: sales.method,
          operatingIncome: operatingIncome.method,
          netEarnings: netEarnings.method,
          dilutedEps: dilutedEps.method,
          dilutedShares: dilutedShares.method,
          operatingCashFlow: operatingCashFlow.method,
          capex: capex.method,
          totalBacklog: backlog.method,
        },
        sourceLayerByField: {
          sales: sales.value != null ? "official_actual" : "missing",
          netAwards: "research_only",
          fundedBacklog: "research_only",
          unfundedBacklog: "research_only",
          fixedPriceSales: "research_only",
          costTypeSales: "research_only",
        },
      }),
    },
  };
}

function overlayStaticFinancial(financialRows, staticPeriods) {
  const byPeriodId = new Map(financialRows.map((row) => [row.periodId, row]));
  const staticByTarget = new Map([
    ["fy24", { eventId: eventIdForAnnual(2024), asOfDate: "2025-01-30" }],
    ["fy25", { eventId: eventIdForAnnual(2025), asOfDate: "2026-01-27" }],
    ["q1-26", { eventId: eventIdForQuarter(2026, 1), asOfDate: "2026-04-21" }],
  ]);
  for (const period of staticPeriods) {
    const target = staticByTarget.get(period.id);
    if (!target || !byPeriodId.has(period.id)) continue;
    const row = byPeriodId.get(period.id);
    Object.assign(row, {
      sales: period.sales,
      organicSales: period.organicSales ?? period.sales,
      productSales: period.productSales ?? null,
      serviceSales: period.serviceSales ?? null,
      operatingIncome: period.operatingIncome,
      operatingMargin: period.operatingMargin,
      segmentOperatingIncome: period.segmentOperatingIncome,
      segmentOperatingMargin: period.segmentOperatingMargin,
      netEarnings: period.netEarnings,
      dilutedEps: period.dilutedEps,
      dilutedShares: period.dilutedShares,
      operatingCashFlow: period.operatingCashFlow,
      freeCashFlow: period.freeCashFlow,
      capex: period.capex,
      netAwards: period.netAwards,
      fundedBacklog: period.fundedBacklog,
      unfundedBacklog: period.unfundedBacklog,
      totalBacklog: period.totalBacklog,
      cash: period.cash ?? row.cash,
      longTermDebt: period.longTermDebt ?? row.longTermDebt,
      currentDebt: period.currentDebt ?? row.currentDebt,
      pensionAssets: period.pensionAssets ?? null,
      pensionLiabilities: period.pensionLiabilities ?? null,
      pensionAndOpbAssets: period.pensionAndOpbAssets ?? null,
      pensionAndOpbLiabilities: period.pensionAndOpbLiabilities ?? null,
      dividendsPaid: period.dividendsPaid ?? row.dividendsPaid,
      dividendPerShare: period.dividendPerShare ?? row.dividendPerShare,
      buybacks: period.buybacks ?? row.buybacks,
      fixedPriceSales: period.fixedPriceSales ?? row.fixedPriceSales,
      costTypeSales: period.costTypeSales ?? row.costTypeSales,
      sourceType: "official_actual",
      notes: period.notes,
      rawJson: JSON.stringify({ sourceLayerByField: { allStaticFields: "official_actual" }, staticSourceId: period.sourceId }),
    });
  }
  return financialRows;
}

function buildSourceDocuments(fetchMetadata) {
  const records = Array.isArray(fetchMetadata?.records) ? fetchMetadata.records : [];
  const docs = records.map((record) => ({
    id: record.id,
    ticker: TICKER,
    title: record.title ?? record.id,
    documentType: record.documentType ?? "source_document",
    sourceType: record.documentType?.includes("sec") ? "official_actual" : "research_only",
    reportingPeriod: record.reportingPeriod ?? null,
    publishedDate: record.downloadDate?.slice(0, 10) ?? null,
    sourceUrl: record.sourceUrl ?? null,
    sourcePath: record.localPath ?? null,
    localPath: record.localPath ?? null,
    extractionStatus: record.extractionStatus ?? null,
    blocked: record.blocked ? 1 : 0,
    metadataJson: JSON.stringify(record),
  }));
  const required = [
    {
      id: "noc-sec-companyfacts",
      ticker: TICKER,
      title: "SEC companyfacts for Northrop Grumman",
      documentType: "sec_companyfacts_json",
      sourceType: "official_actual",
      reportingPeriod: "multi-period",
      publishedDate: null,
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001133421.json",
      sourcePath: "data/local/noc/official/noc_sec_companyfacts.json",
      localPath: "data/local/noc/official/noc_sec_companyfacts.json",
      extractionStatus: existsSync(COMPANY_FACTS_PATH) ? "cached_json_loaded" : "missing",
      blocked: 0,
      metadataJson: JSON.stringify({ cik: "0001133421" }),
    },
    {
      id: "noc-static-module",
      ticker: TICKER,
      title: "NOC curated frontend research module",
      documentType: "curated_module",
      sourceType: "research_only",
      reportingPeriod: "module baseline",
      publishedDate: null,
      sourceUrl: null,
      sourcePath: "src/stocks/noc",
      localPath: "src/stocks/noc",
      extractionStatus: "loaded_by_vite_ssr",
      blocked: 0,
      metadataJson: JSON.stringify({ usage: "static official rows, program taxonomy, transcript trend synthesis" }),
    },
  ];
  const byId = new Map([...docs, ...required].map((doc) => [doc.id, doc]));
  return [...byId.values()];
}

function buildMarketSnapshots(events, financialRows, staticMarket) {
  const financialByEvent = new Map(financialRows.map((row) => [row.eventId, row]));
  return events.map((event) => {
    const financial = financialByEvent.get(event.id);
    const salesRunRate = financial?.periodType === "quarter" ? (financial.sales ?? 0) * 4 : financial?.sales ?? 0;
    const scale = salesRunRate ? Math.max(0.55, Math.min(1.1, (salesRunRate / 41_954) ** 0.65)) : 0.85;
    const timeTilt = 1 + (Number(event.fiscalYear) - 2025) * 0.012;
    const currentPrice = event.id === eventIdForQuarter(2026, 1)
      ? staticMarket.currentPrice
      : Number((staticMarket.currentPrice * scale * timeTilt).toFixed(2));
    const shares = financial?.dilutedShares ?? staticMarket.sharesForMarketCap;
    const marketCap = currentPrice * shares;
    const debt = (financial?.longTermDebt ?? 0) + (financial?.currentDebt ?? 0);
    const cash = financial?.cash ?? 0;
    return {
      id: `noc-market-${event.id}`,
      ticker: TICKER,
      eventId: event.id,
      asOfDate: event.eventDate,
      priceDate: event.eventDate,
      sourceType: event.id === eventIdForQuarter(2026, 1) ? "market_data" : "research_only",
      source: event.id === eventIdForQuarter(2026, 1) ? staticMarket.source : "Backend seed proxy pending daily-price import",
      currentPrice,
      sharesOutstandingM: shares,
      marketCapUsdM: marketCap,
      enterpriseValueUsdM: marketCap + debt - cash,
      dividendYield: financial?.dividendPerShare ? financial.dividendPerShare / currentPrice : null,
      fcfYield: financial?.freeCashFlow && marketCap ? financial.freeCashFlow / marketCap : null,
      rawJson: JSON.stringify({
        sourceLayer: event.id === eventIdForQuarter(2026, 1) ? "market_data" : "research_only",
        note: "Valuation service overrides this row with daily_price_bars adjusted close when available.",
      }),
    };
  });
}

function buildEstimatedSegments(events, financialRows, staticSegments) {
  const byEvent = new Map(financialRows.map((row) => [row.eventId, row]));
  const baseSegments = staticSegments.filter((segment) => segment.periodId === "fy25");
  const staticRows = [];
  const staticByPeriod = new Map();
  for (const row of staticSegments) {
    const periodMap = staticByPeriod.get(row.periodId) ?? [];
    periodMap.push(row);
    staticByPeriod.set(row.periodId, periodMap);
  }

  for (const event of events) {
    const financial = byEvent.get(event.id);
    if (!financial) continue;
    const staticPeriodRows = staticByPeriod.get(financial.periodId);
    if (staticPeriodRows?.length) {
      for (const segment of staticPeriodRows) {
        staticRows.push({
          id: `noc-segment-${event.id}-${segment.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          ticker: TICKER,
          eventId: event.id,
          periodId: financial.periodId,
          asOfDate: event.eventDate,
          fiscalYear: event.fiscalYear,
          fiscalQuarter: event.fiscalQuarter,
          segment: segment.segment,
          sourceType: "official_actual",
          sales: segment.sales,
          salesPriorYear: segment.salesPriorYear ?? null,
          operatingIncome: segment.operatingIncome ?? null,
          operatingIncomePriorYear: segment.operatingIncomePriorYear ?? null,
          operatingMargin: segment.operatingMargin ?? null,
          fundedBacklog: segment.fundedBacklog ?? null,
          unfundedBacklog: segment.unfundedBacklog ?? null,
          totalBacklog: segment.totalBacklog ?? null,
          totalBacklogPriorYear: segment.totalBacklogPriorYear ?? null,
          costTypeSales: segment.costTypeSales ?? null,
          fixedPriceSales: segment.fixedPriceSales ?? null,
          capex: segment.capex ?? null,
          depreciationAmortization: segment.depreciationAmortization ?? null,
          strategicImportance: segment.strategicImportance,
          keyProgramsJson: JSON.stringify(segment.keyPrograms ?? []),
          risksJson: JSON.stringify(segment.risks ?? []),
          notes: segment.notes ?? null,
          rawJson: JSON.stringify({ staticSourceId: segment.sourceId }),
        });
      }
      continue;
    }

    const baseTotalSales = baseSegments.reduce((sum, segment) => sum + (segment.sales ?? 0), 0) || 1;
    const backlogTotal = financial.totalBacklog ?? (financial.sales ?? 0) * 2.2;
    for (const segment of baseSegments) {
      const mix = (segment.sales ?? 0) / baseTotalSales;
      const sales = (financial.sales ?? 0) * mix;
      const margin = Math.max(0.025, (segment.operatingMargin ?? 0.1) + (event.fiscalYear - 2025) * 0.001);
      const segmentBacklog = backlogTotal * Math.max(0, (segment.totalBacklog ?? 0) / 95_681);
      staticRows.push({
        id: `noc-segment-${event.id}-${segment.segment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        ticker: TICKER,
        eventId: event.id,
        periodId: financial.periodId,
        asOfDate: event.eventDate,
        fiscalYear: event.fiscalYear,
        fiscalQuarter: event.fiscalQuarter,
        segment: segment.segment,
        sourceType: "research_only",
        sales,
        salesPriorYear: null,
        operatingIncome: sales * margin,
        operatingIncomePriorYear: null,
        operatingMargin: margin,
        fundedBacklog: financial.fundedBacklog != null ? segmentBacklog * (financial.fundedBacklog / Math.max(financial.totalBacklog ?? 1, 1)) : null,
        unfundedBacklog: financial.unfundedBacklog != null ? segmentBacklog * (financial.unfundedBacklog / Math.max(financial.totalBacklog ?? 1, 1)) : null,
        totalBacklog: segmentBacklog,
        totalBacklogPriorYear: null,
        costTypeSales: sales * 0.5,
        fixedPriceSales: sales * 0.5,
        capex: sales * 0.035,
        depreciationAmortization: sales * 0.032,
        strategicImportance: segment.strategicImportance,
        keyProgramsJson: JSON.stringify(segment.keyPrograms ?? []),
        risksJson: JSON.stringify(segment.risks ?? []),
        notes: "Research-only historical segment estimate scaled from FY2025 NOC segment mix. Do not treat as official segment actuals.",
        rawJson: JSON.stringify({ sourceLayer: "research_only", basis: "FY2025 static segment mix scaled to event sales/backlog" }),
      });
    }
  }
  return staticRows;
}

function buildPeerSnapshots(events) {
  const latestEvent = [...events].sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0];
  if (!latestEvent) return [];
  const peers = [
    { peerTicker: "LMT", peerName: "Lockheed Martin", currency: "USD", pe: 18.5, evEbit: 16.5, fcfYield: 0.052 },
    { peerTicker: "RTX", peerName: "RTX", currency: "USD", pe: 19.0, evEbit: 17.0, fcfYield: 0.043 },
    { peerTicker: "GD", peerName: "General Dynamics", currency: "USD", pe: 18.0, evEbit: 15.5, fcfYield: 0.047 },
    { peerTicker: "HII", peerName: "Huntington Ingalls", currency: "USD", pe: 14.5, evEbit: 12.5, fcfYield: 0.06 },
    { peerTicker: "BA.L", peerName: "BAE Systems", currency: "GBP", pe: 20.0, evEbit: 17.5, fcfYield: 0.045 },
  ];
  return peers.map((peer) => ({
    id: `noc-peer-${peer.peerTicker.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ticker: TICKER,
    eventId: latestEvent.id,
    asOfDate: latestEvent.eventDate,
    peerTicker: peer.peerTicker,
    peerName: peer.peerName,
    currency: peer.currency,
    marketCap: null,
    enterpriseValue: null,
    pe: peer.pe,
    evEbit: peer.evEbit,
    evEbitda: null,
    fcfYield: peer.fcfYield,
    absoluteValueUse: peer.currency === "USD" ? "same_currency_metadata_only" : "metadata_only_do_not_aggregate_mixed_currency",
    sourceType: "research_only",
    rawJson: JSON.stringify({ sourceLayer: "research_only", note: "Peer multiples are research-only placeholders for backend pilot validation." }),
  }));
}

function buildGuidanceItems(events, guidanceRows) {
  const latestEventByDate = [...events].sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0];
  if (!latestEventByDate || !Array.isArray(guidanceRows)) return [];
  const rows = [];
  for (const guidance of guidanceRows) {
    const base = {
      ticker: TICKER,
      eventId: latestEventByDate.id,
      asOfDate: guidance.asOfDate,
      fiscalYear: guidance.year,
      guidanceType: "explicit_management_guidance",
      sourceType: "management_guidance",
      guidanceSourceId: guidance.sourceId,
      humanReviewStatus: "reviewed",
      modelReady: 1,
      valuationImpactAllowed: 1,
    };
    rows.push(
      {
        id: `noc-guidance-${guidance.year}-sales`,
        ...base,
        metric: "sales",
        value: null,
        low: guidance.salesLow,
        high: guidance.salesHigh,
        units: "USD millions",
        notes: guidance.notes,
        rawJson: JSON.stringify(guidance),
      },
      {
        id: `noc-guidance-${guidance.year}-segment-operating-income`,
        ...base,
        metric: "segmentOperatingIncome",
        value: null,
        low: guidance.segmentOperatingIncomeLow,
        high: guidance.segmentOperatingIncomeHigh,
        units: "USD millions",
        notes: guidance.notes,
        rawJson: JSON.stringify(guidance),
      },
      {
        id: `noc-guidance-${guidance.year}-free-cash-flow`,
        ...base,
        metric: "freeCashFlow",
        value: null,
        low: guidance.freeCashFlowLow,
        high: guidance.freeCashFlowHigh,
        units: "USD millions",
        notes: guidance.notes,
        rawJson: JSON.stringify(guidance),
      },
    );
  }
  return rows;
}

function eventIdForCall(record) {
  const match = String(record.fiscalQuarter ?? "").match(/Q([1-4])\s+(\d{4})/i);
  return match ? eventIdForQuarter(Number(match[2]), Number(match[1])) : null;
}

function buildTranscriptRows(earningsCalls) {
  const records = earningsCalls?.records ?? [];
  const transcriptEvents = [];
  const transcriptExtractions = [];
  for (const record of records) {
    const eventId = eventIdForCall(record);
    transcriptEvents.push({
      id: `noc-call-${record.id}`,
      ticker: TICKER,
      eventId,
      callDate: record.callDate,
      fiscalPeriod: record.fiscalQuarter,
      sourceType: "transcript_commentary",
      sourceUrl: record.sourceUrl,
      transcriptAvailability: record.transcriptAvailability,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: JSON.stringify(record),
    });
    transcriptExtractions.push({
      id: `noc-call-${record.id}-summary`,
      ticker: TICKER,
      transcriptEventId: `noc-call-${record.id}`,
      extractionType: "ai_summary",
      topic: "market_focus_trend",
      value: record.aiSummary,
      score: null,
      sourceType: "transcript_commentary",
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: JSON.stringify({ marketFocus: record.marketFocus, investorDebate: record.investorDebate }),
    });
    for (const [topic, score] of Object.entries(record.topicScores ?? {})) {
      transcriptExtractions.push({
        id: `noc-call-${record.id}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        ticker: TICKER,
        transcriptEventId: `noc-call-${record.id}`,
        extractionType: "topic_score",
        topic,
        value: String(score),
        score,
        sourceType: "transcript_commentary",
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: JSON.stringify({ sourceLayer: "research_only", methodology: earningsCalls.methodology }),
      });
    }
  }
  return { transcriptEvents, transcriptExtractions };
}

function buildAssumptionSets(scenarioPresets) {
  return ["Bear", "Base", "Bull"].map((scenario) => ({
    id: `noc-assumptions-${scenario.toLowerCase()}-${NOC_BACKEND_MODEL_VERSION.version}`,
    ticker: TICKER,
    scenario,
    modelVersion: NOC_BACKEND_MODEL_VERSION.version,
    asOfDate: "2018-01-01",
    sourceType: "forecast_assumption",
    assumptionsJson: JSON.stringify(scenarioPresets[scenario] ?? scenarioPresets.Base),
    notes: `Default ${scenario} NOC backend pilot assumptions. Event-specific price, shares, net debt, margin, backlog and cash-conversion overrides are applied by the valuation adapter.`,
  }));
}

function buildModelVersions() {
  return [{
    id: NOC_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: NOC_BACKEND_MODEL_VERSION.version,
    name: NOC_BACKEND_MODEL_VERSION.name,
    description: NOC_BACKEND_MODEL_VERSION.description,
    valuationMethodsJson: JSON.stringify(NOC_BACKEND_MODEL_VERSION.valuationMethods),
    sourceIsolationPolicyJson: JSON.stringify(NOC_BACKEND_MODEL_VERSION.sourceIsolationPolicy),
    active: 1,
  }];
}

function buildValidationWarnings(events) {
  const latestEvent = [...events].sort((left, right) => right.eventDate.localeCompare(left.eventDate))[0];
  return [
    {
      id: "noc-segment-history-research-only",
      ticker: TICKER,
      eventId: latestEvent?.id ?? null,
      severity: "medium",
      category: "source_isolation",
      title: "Historical segment detail is estimated outside latest official rows",
      detail: "SEC companyfacts provides consolidated quarterly metrics. Historical segment rows before FY2025 / Q1 2026 are scaled research-only estimates and are not treated as official actuals.",
      sourceType: "research_only",
    },
    {
      id: "noc-market-snapshot-proxy-before-price-import",
      ticker: TICKER,
      eventId: latestEvent?.id ?? null,
      severity: "low",
      category: "market_data",
      title: "Seeded market snapshots are placeholders until daily prices are imported",
      detail: "The valuation service overrides seeded market snapshots with daily_price_bars adjusted close when price bars are available on or before the event date.",
      sourceType: "research_only",
    },
  ];
}

export async function buildNocBackendSeedPayload() {
  const companyFacts = readJsonIfExists(COMPANY_FACTS_PATH, {});
  const fetchMetadata = readJsonIfExists(FETCH_METADATA_PATH, {});
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const dataModule = await server.ssrLoadModule("/src/stocks/noc/data/index.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/noc/assumptions.ts");
    const staticDataset = dataModule.nocDataset;
    const quarterly = [];
    for (let year = 2018; year <= 2026; year += 1) {
      const maxQuarter = year === 2026 ? 1 : 4;
      for (let quarter = 1; quarter <= maxQuarter; quarter += 1) {
        quarterly.push(buildQuarterlyFinancial(companyFacts, year, quarter));
      }
    }
    const annual = [];
    for (let year = 2018; year <= 2025; year += 1) {
      annual.push(buildAnnualFinancial(companyFacts, year));
    }
    const reportingEvents = [...quarterly, ...annual]
      .map((item) => item.event)
      .sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.id.localeCompare(right.id));
    const financialPeriods = overlayStaticFinancial(
      [...quarterly, ...annual].map((item) => item.financial),
      staticDataset.periods ?? [],
    );
    const segmentFinancials = buildEstimatedSegments(reportingEvents, financialPeriods, staticDataset.segments ?? []);
    const marketSnapshots = buildMarketSnapshots(reportingEvents, financialPeriods, staticDataset.marketData);
    const { transcriptEvents, transcriptExtractions } = buildTranscriptRows(staticDataset.earningsCalls);
    return {
      reportingEvents,
      sourceDocuments: buildSourceDocuments(fetchMetadata),
      financialPeriods,
      segmentFinancials,
      marketSnapshots,
      peerSnapshots: buildPeerSnapshots(reportingEvents),
      guidanceItems: buildGuidanceItems(reportingEvents, staticDataset.guidance),
      transcriptEvents,
      transcriptExtractions,
      assumptionSets: buildAssumptionSets(assumptionsModule.nocScenarioPresets),
      modelVersions: buildModelVersions(),
      validationWarnings: buildValidationWarnings(reportingEvents),
      backtestRuns: [],
    };
  } finally {
    await server.close();
  }
}
