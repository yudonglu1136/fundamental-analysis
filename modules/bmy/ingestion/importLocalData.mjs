import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { BMY_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "BMY";
const CIK = "0000014272";
const SEC_DIR = path.resolve("data/local/bmy/sec");
const SUBMISSIONS_PATH = path.join(SEC_DIR, "submissions_CIK0000014272.json");
const COMPANYFACTS_PATH = path.join(SEC_DIR, "companyfacts_CIK0000014272.json");
const RETRIEVAL_DATE = "2026-05-13";

const PRODUCT_NAMES = [
  "Eliquis",
  "Opdivo",
  "Revlimid",
  "Pomalyst",
  "Orencia",
  "Yervoy",
  "Breyanzi",
  "Camzyos",
  "Reblozyl",
  "Sotyktu",
  "Abecma",
  "Zeposia",
  "Growth Portfolio",
  "Other growth portfolio products",
];

function json(value) {
  return JSON.stringify(value ?? null);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fiscalQuarterFromReportDate(reportDate) {
  const month = Number(String(reportDate).slice(5, 7));
  if (month === 3) return "Q1";
  if (month === 6) return "Q2";
  if (month === 9) return "Q3";
  return "Q4";
}

function quarterEndDate(year, quarter) {
  if (quarter === "Q1") return `${year}-03-31`;
  if (quarter === "Q2") return `${year}-06-30`;
  if (quarter === "Q3") return `${year}-09-30`;
  return `${year}-12-31`;
}

function quarterStartDate(year, quarter) {
  if (quarter === "Q1") return `${year}-01-01`;
  if (quarter === "Q2") return `${year}-04-01`;
  if (quarter === "Q3") return `${year}-07-01`;
  return `${year}-10-01`;
}

function eventTypeForQuarter(quarter) {
  return `${String(quarter).toLowerCase()}_results`;
}

function secDocUrl(accessionNumber, primaryDocument) {
  const accession = String(accessionNumber ?? "").replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/14272/${accession}/${primaryDocument}`;
}

function buildReportingEvents(submissionsInput) {
  const submissionsList = Array.isArray(submissionsInput) ? submissionsInput : [submissionsInput];
  const rows = [];
  for (const submissions of submissionsList) {
    const recent = submissions?.filings?.recent ?? submissions ?? {};
    for (let index = 0; index < (recent.form?.length ?? 0); index += 1) {
      const form = recent.form[index];
      if (form !== "10-K" && form !== "10-Q") continue;
      const reportDate = recent.reportDate[index];
      const filingDate = recent.filingDate[index];
      if (!reportDate || !filingDate) continue;
      const fiscalYear = Number(String(reportDate).slice(0, 4));
      const fiscalQuarter = fiscalQuarterFromReportDate(reportDate);
      if (fiscalYear < 2018 || fiscalYear > 2026) continue;
      if (fiscalYear === 2026 && fiscalQuarter !== "Q1") continue;
      const id = `fy${fiscalYear}-${String(fiscalQuarter).toLowerCase()}`;
      rows.push({
        id,
        ticker: TICKER,
        eventDate: filingDate,
        reportDate,
        fiscalPeriod: `FY${fiscalYear} ${fiscalQuarter}`,
        fiscalYear,
        fiscalQuarter,
        eventType: eventTypeForQuarter(fiscalQuarter),
        label: `FY${fiscalYear} ${fiscalQuarter} reporting event`,
        sourceType: "official_actual",
        sourcePath: "data/local/bmy/sec/submissions_CIK0000014272.json",
        sourceUrl: secDocUrl(recent.accessionNumber[index], recent.primaryDocument[index]),
        accessionNumber: recent.accessionNumber[index],
        createdAt: new Date().toISOString(),
      });
    }
  }
  return rows
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate))
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate));
}

function conceptUnits(facts, concept, unit = "USD") {
  const units = facts?.["us-gaap"]?.[concept]?.units ?? {};
  if (units[unit]) return units[unit];
  const first = Object.keys(units)[0];
  return first ? units[first] : [];
}

function durationDays(row) {
  if (!row?.start || !row?.end) return 0;
  return (new Date(row.end).getTime() - new Date(row.start).getTime()) / 86_400_000;
}

function selectFact(facts, concepts, { fiscalYear, fiscalQuarter, annual = false, instant = false, unit = "USD" }) {
  const targetEnd = annual ? `${fiscalYear}-12-31` : quarterEndDate(fiscalYear, fiscalQuarter);
  const frame = annual
    ? (instant ? `CY${fiscalYear}Q4I` : `CY${fiscalYear}`)
    : (instant ? `CY${fiscalYear}${fiscalQuarter}I` : `CY${fiscalYear}${fiscalQuarter}`);
  for (const concept of concepts) {
    const rows = conceptUnits(facts, concept, unit).filter((row) => row.end === targetEnd && ["10-K", "10-Q"].includes(row.form));
    const exactFrame = rows
      .filter((row) => row.frame === frame)
      .sort((left, right) => String(left.filed).localeCompare(String(right.filed)))[0];
    if (exactFrame) return { value: exactFrame.val, concept, row: exactFrame };
    const periodRows = rows
      .filter((row) => annual ? row.fp === "FY" : row.fp === fiscalQuarter)
      .filter((row) => instant || annual || durationDays(row) <= 120)
      .sort((left, right) => durationDays(left) - durationDays(right) || String(left.filed).localeCompare(String(right.filed)));
    if (periodRows[0]) return { value: periodRows[0].val, concept, row: periodRows[0] };
  }
  return { value: null, concept: null, row: null };
}

function factValue(fact) {
  return fact?.value == null ? null : Number(fact.value);
}

function usdMillions(fact) {
  return factValue(fact) == null ? null : factValue(fact) / 1_000_000;
}

function sharesMillions(fact) {
  return factValue(fact) == null ? null : factValue(fact) / 1_000_000;
}

function annualFact(facts, concepts, fiscalYear, unit = "USD") {
  return selectFact(facts, concepts, { fiscalYear, fiscalQuarter: "Q4", annual: true, unit });
}

function quarterFact(facts, concepts, event, unit = "USD") {
  return selectFact(facts, concepts, {
    fiscalYear: event.fiscalYear,
    fiscalQuarter: event.fiscalQuarter,
    annual: false,
    unit,
  });
}

function instantFact(facts, concepts, event, unit = "USD") {
  return selectFact(facts, concepts, {
    fiscalYear: event.fiscalYear,
    fiscalQuarter: event.fiscalQuarter,
    annual: event.fiscalQuarter === "Q4",
    instant: true,
    unit,
  });
}

function q4DerivedFact(facts, concepts, event, annualValue, unit = "USD") {
  if (event.fiscalQuarter !== "Q4" || typeof annualValue !== "number") return null;
  const firstThree = ["Q1", "Q2", "Q3"]
    .map((quarter) => factValue(selectFact(facts, concepts, {
      fiscalYear: event.fiscalYear,
      fiscalQuarter: quarter,
      annual: false,
      unit,
    })))
    .filter((value) => typeof value === "number");
  if (firstThree.length !== 3) return null;
  return {
    value: annualValue - firstThree.reduce((sum, value) => sum + value, 0),
    concept: concepts[0],
    row: { filed: event.eventDate, derivedFromAnnual: true },
  };
}

function flowFact(facts, concepts, event, unit = "USD") {
  if (event.fiscalQuarter !== "Q4") return quarterFact(facts, concepts, event, unit);
  const annual = annualFact(facts, concepts, event.fiscalYear, unit);
  return q4DerivedFact(facts, concepts, event, factValue(annual), unit) ?? annual;
}

function completeReportingEventsFromCompanyfacts(events, facts) {
  const byPeriod = new Map(events.map((event) => [event.fiscalPeriod, event]));
  const rows = [...events];
  for (let fiscalYear = 2018; fiscalYear <= 2026; fiscalYear += 1) {
    for (const fiscalQuarter of ["Q1", "Q2", "Q3", "Q4"]) {
      if (fiscalYear === 2026 && fiscalQuarter !== "Q1") continue;
      const fiscalPeriod = `FY${fiscalYear} ${fiscalQuarter}`;
      if (byPeriod.has(fiscalPeriod)) continue;
      const draft = {
        id: `fy${fiscalYear}-${fiscalQuarter.toLowerCase()}`,
        fiscalYear,
        fiscalQuarter,
        reportDate: quarterEndDate(fiscalYear, fiscalQuarter),
      };
      const revenue = flowFact(facts, ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"], draft);
      if (revenue.value == null) continue;
      const eventDate = revenue.row?.filed ?? (fiscalQuarter === "Q4" ? `${fiscalYear + 1}-02-15` : `${fiscalYear}-${fiscalQuarter === "Q1" ? "05" : fiscalQuarter === "Q2" ? "08" : "11"}-05`);
      rows.push({
        id: draft.id,
        ticker: TICKER,
        eventDate,
        reportDate: draft.reportDate,
        fiscalPeriod,
        fiscalYear,
        fiscalQuarter,
        eventType: eventTypeForQuarter(fiscalQuarter),
        label: `${fiscalPeriod} SEC Companyfacts reporting event`,
        sourceType: "official_actual",
        sourcePath: "data/local/bmy/sec/companyfacts_CIK0000014272.json",
        sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000014272.json",
        accessionNumber: null,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return rows
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
    .sort((left, right) => left.eventDate.localeCompare(right.eventDate));
}

function buildFinancialRows(events, facts) {
  return events.map((event) => {
    const revenue = flowFact(facts, ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"], event);
    const grossProfit = flowFact(facts, ["GrossProfit"], event);
    const costOfGoods = flowFact(facts, ["CostOfGoodsSold", "CostOfGoodsAndServicesSold"], event);
    const rnd = flowFact(facts, ["ResearchAndDevelopmentExpense"], event);
    const sga = flowFact(facts, ["SellingGeneralAndAdministrativeExpense"], event);
    const netIncome = flowFact(facts, ["NetIncomeLoss", "IncomeLossFromContinuingOperations"], event);
    const gaapEps = flowFact(facts, ["EarningsPerShareDiluted", "IncomeLossFromContinuingOperationsPerDilutedShare"], event, "USD/shares");
    const shares = flowFact(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], event, "shares");
    const ocf = flowFact(facts, ["NetCashProvidedByUsedInOperatingActivities"], event);
    const capex = flowFact(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"], event);
    const dividends = flowFact(facts, ["PaymentsOfDividends", "DividendsCommonStockCash"], event);
    const buybacks = flowFact(facts, ["PaymentsForRepurchaseOfCommonStock", "StockRepurchasedDuringPeriodValue"], event);
    const acquisitions = flowFact(facts, ["PaymentsToAcquireBusinessesNetOfCashAcquired", "BusinessCombinationAcquisitionRelatedCosts"], event);
    const cash = instantFact(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], event);
    const currentDebt = instantFact(facts, ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"], event);
    const noncurrentDebt = instantFact(facts, ["LongTermDebtNoncurrent", "LongTermDebt"], event);
    const revenueValue = usdMillions(revenue);
    const grossProfitValue = usdMillions(grossProfit) ?? (revenueValue != null && usdMillions(costOfGoods) != null ? revenueValue - usdMillions(costOfGoods) : null);
    const rndValue = usdMillions(rnd);
    const sgaValue = usdMillions(sga);
    const operatingIncome = grossProfitValue != null && rndValue != null && sgaValue != null
      ? grossProfitValue - rndValue - sgaValue
      : null;
    const ocfValue = usdMillions(ocf);
    const capexValue = usdMillions(capex);
    const cashValue = usdMillions(cash);
    const debtValue = (usdMillions(currentDebt) ?? 0) + (usdMillions(noncurrentDebt) ?? 0);
    return {
      id: `bmy-${event.id}`,
      ticker: TICKER,
      periodId: event.id,
      fiscalYear: event.fiscalYear,
      fiscalQuarter: event.fiscalQuarter,
      periodType: "quarter",
      eventId: event.id,
      asOfDate: event.eventDate,
      reportDate: event.reportDate,
      sourceType: "official_actual",
      revenue: revenueValue,
      usRevenue: null,
      internationalRevenue: null,
      grossProfit: grossProfitValue,
      grossMargin: grossProfitValue != null && revenueValue ? grossProfitValue / revenueValue : null,
      researchAndDevelopmentExpense: rndValue,
      sellingGeneralAdministrativeExpense: sgaValue,
      operatingIncome,
      operatingMargin: operatingIncome != null && revenueValue ? operatingIncome / revenueValue : null,
      netIncome: usdMillions(netIncome),
      adjustedDilutedEps: null,
      gaapDilutedEps: gaapEps?.value ?? null,
      dilutedShares: sharesMillions(shares),
      operatingCashFlow: ocfValue,
      capex: capexValue,
      freeCashFlow: ocfValue != null && capexValue != null ? ocfValue - capexValue : null,
      dividendsPaid: usdMillions(dividends),
      buybacks: usdMillions(buybacks),
      cashAndInvestments: cashValue,
      debt: debtValue || null,
      netDebt: debtValue && cashValue != null ? debtValue - cashValue : null,
      acquisitionLicensingPayments: usdMillions(acquisitions),
      currentPrice: null,
      rawJson: json({
        source: "SEC Companyfacts",
        sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000014272.json",
        concepts: {
          revenue: revenue.concept,
          grossProfit: grossProfit.concept ?? costOfGoods.concept,
          rnd: rnd.concept,
          sga: sga.concept,
          netIncome: netIncome.concept,
          gaapEps: gaapEps.concept,
          shares: shares.concept,
          ocf: ocf.concept,
          capex: capex.concept,
          dividends: dividends.concept,
          buybacks: buybacks.concept,
          acquisitions: acquisitions.concept,
          cash: cash.concept,
          debt: [currentDebt.concept, noncurrentDebt.concept].filter(Boolean),
        },
        q4Derived: event.fiscalQuarter === "Q4",
        noFutureData: true,
      }),
    };
  }).filter((row) => row.revenue != null);
}

async function loadBmyStaticModules() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const researchModule = await server.ssrLoadModule("/src/stocks/bmy/researchData.ts");
    return { dataset: researchModule.bmyResearchData };
  } finally {
    await server.close();
  }
}

function evidenceMap(dataset) {
  return new Map((dataset.evidence ?? []).map((item) => [item.id, item]));
}

function sourceLayer(sourceType, fallback = "research_only") {
  if (sourceType === "SEC_10K" || sourceType === "SEC_10Q" || sourceType === "official_press_release" || sourceType === "FDA_label") return "official_actual";
  if (sourceType === "market_data") return "market_data";
  if (sourceType === "transcript") return "transcript_commentary";
  if (sourceType === "research_assumption" || sourceType === "analyst_consensus") return "research_only";
  return fallback;
}

function nearestEventOnOrAfter(events, date) {
  return events.find((event) => event.eventDate >= date) ?? events[events.length - 1] ?? null;
}

function buildSegmentRows(financialRows) {
  return financialRows.map((financial) => ({
    id: `${financial.eventId}-segment-total-company`,
    ticker: TICKER,
    periodId: financial.periodId,
    eventId: financial.eventId,
    asOfDate: financial.asOfDate,
    segment: "Total company",
    taxonomy: "reported_company_total",
    revenue: financial.revenue,
    operatingIncome: financial.operatingIncome,
    operatingMargin: financial.operatingMargin,
    sourceType: "official_actual",
    notes: "BMY Companyfacts does not expose event-level US/international segment revenue in a normalized tag set; total company is the official parsed row.",
    rawJson: json({ noFutureData: true, source: "SEC Companyfacts" }),
  }));
}

function buildProductRows({ events, dataset, financialRows }) {
  const products = [];
  const eventById = new Map(events.map((event) => [event.id, event]));
  const eventByLabel = new Map(events.map((event) => [`${event.fiscalYear}-${event.fiscalQuarter}`, event]));
  const financialByEvent = new Map(financialRows.map((row) => [row.eventId, row]));

  for (const quarter of dataset.earnings?.quarters ?? []) {
    const year = Number(quarter.label.match(/20\d{2}/)?.[0]);
    const quarterName = quarter.label.match(/Q[1-4]/)?.[0];
    const event = eventByLabel.get(`${year}-${quarterName}`) ?? nearestEventOnOrAfter(events, quarter.callDate);
    if (!event) continue;
    products.push({
      id: `${event.id}-product-growth-portfolio`,
      ticker: TICKER,
      periodId: event.id,
      eventId: event.id,
      asOfDate: event.eventDate,
      productName: "Growth Portfolio",
      franchise: "Growth Portfolio",
      revenue: quarter.primaryMetric ?? null,
      revenueGrowth: null,
      geography: null,
      sourceType: quarter.sourceEvidenceIds?.some((id) => (dataset.evidence ?? []).find((item) => item.id === id)?.confidence === "high") ? "official_actual" : "research_only",
      sourceDocumentId: quarter.sourceEvidenceIds?.[0] ?? null,
      modelReady: 1,
      valuationImpactAllowed: 0,
      notes: "Growth Portfolio amount from the static BMY evidence map; used for display and historical context, not direct valuation impact.",
      rawJson: json({ quarter, noFutureData: true }),
    });
  }

  for (const product of dataset.products ?? []) {
    const asOfEvidence = (product.sourceEvidenceIds ?? [])
      .map((id) => (dataset.evidence ?? []).find((item) => item.id === id))
      .filter(Boolean)
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))[0];
    const event = nearestEventOnOrAfter(events, asOfEvidence?.date ?? dataset.priceDate);
    if (!event) continue;
    const value = product.latestQuarterRevenue ?? (product.revenue2025 != null ? product.revenue2025 / 4 : null);
    products.push({
      id: `${event.id}-product-${slugify(product.name)}`,
      ticker: TICKER,
      periodId: event.id,
      eventId: event.id,
      asOfDate: event.eventDate,
      productName: product.name,
      franchise: product.category,
      revenue: value,
      revenueGrowth: null,
      geography: null,
      sourceType: asOfEvidence ? sourceLayer(asOfEvidence.sourceType) : "research_only",
      sourceDocumentId: asOfEvidence?.id ?? null,
      modelReady: value != null ? 1 : 0,
      valuationImpactAllowed: 0,
      notes: "Curated from BMY static research evidence; direct product rows are not valuation-impacting unless promoted in a future reviewed assumption set.",
      rawJson: json({ product, evidence: asOfEvidence, noFutureData: true }),
    });
  }

  for (const event of events) {
    const present = new Set(products.filter((row) => row.eventId === event.id).map((row) => row.productName));
    const financial = financialByEvent.get(event.id);
    if (financial?.revenue != null && !present.has("Total revenue")) {
      products.push({
        id: `${event.id}-product-total-revenue`,
        ticker: TICKER,
        periodId: event.id,
        eventId: event.id,
        asOfDate: event.eventDate,
        productName: "Total revenue",
        franchise: "Company total",
        revenue: financial.revenue,
        revenueGrowth: null,
        geography: null,
        sourceType: "official_actual",
        sourceDocumentId: `bmy-sec-${event.id}`,
        modelReady: 1,
        valuationImpactAllowed: 0,
        notes: "Official total company revenue. Detailed brand revenue was not parsed from SEC Companyfacts for this event.",
        rawJson: json({ noFutureData: true, productLevelGap: true }),
      });
    }
    for (const productName of PRODUCT_NAMES) {
      if (present.has(productName)) continue;
      products.push({
        id: `${event.id}-product-gap-${slugify(productName)}`,
        ticker: TICKER,
        periodId: event.id,
        eventId: event.id,
        asOfDate: event.eventDate,
        productName,
        franchise: productName === "Growth Portfolio" ? "Growth Portfolio" : "Brand",
        revenue: null,
        revenueGrowth: null,
        geography: null,
        sourceType: "research_only",
        sourceDocumentId: null,
        modelReady: 0,
        valuationImpactAllowed: 0,
        notes: "No official event-level product revenue row was imported for this brand and quarter.",
        rawJson: json({ noFutureData: true, gapMarker: true }),
      });
    }
  }

  return products.filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
}

function sourceDateForEvidence(dataset, ids, fallback) {
  const byId = evidenceMap(dataset);
  const dates = ids.map((id) => byId.get(id)?.date).filter(Boolean).sort();
  return dates[0] ?? fallback;
}

function buildPipelineRows(dataset) {
  return (dataset.pipeline ?? []).map((asset) => {
    const asOfDate = sourceDateForEvidence(dataset, asset.sourceEvidenceIds ?? [], dataset.priceDate);
    const promoted = asset.assetName === "Cobenfy lifecycle" && asOfDate <= "2026-04-30";
    return {
      id: `bmy-pipeline-${slugify(asset.assetName)}`,
      ticker: TICKER,
      assetName: asset.assetName,
      eventDate: asOfDate,
      asOfDate,
      eventType: asset.stage === "approved" ? "approval_or_lifecycle" : "pipeline_assumption",
      phase: asset.stage,
      indication: asset.indication,
      targetOrMechanism: asset.targetOrMechanism,
      expectedCatalyst: asset.expectedCatalyst,
      estimatedLaunchYear: asset.estimatedLaunchYear,
      estimatedPeakSales: asset.estimatedPeakSales,
      probabilityOfSuccess: asset.probabilityOfSuccess,
      discountRate: asset.discountRate,
      developmentCostRemaining: asset.developmentCostRemaining,
      economicsShare: asset.economicsShare,
      sourceType: asset.assumptionType === "research_only" ? "research_only" : "official_actual",
      sourceDocumentId: asset.sourceEvidenceIds?.[0] ?? null,
      modelReady: promoted ? 1 : 0,
      valuationImpactAllowed: promoted ? 1 : 0,
      notes: promoted
        ? "Cobenfy approval/lifecycle row is explicitly promoted as event-visible pipeline optionality after FDA approval evidence."
        : "Pipeline candidate remains research-only and non-valuation-impacting until explicitly promoted.",
      rawJson: json({ asset, noFutureData: true }),
    };
  });
}

function buildClinicalReadouts(dataset) {
  return (dataset.pipeline ?? []).map((asset) => {
    const asOfDate = sourceDateForEvidence(dataset, asset.sourceEvidenceIds ?? [], dataset.priceDate);
    return {
      id: `bmy-clinical-${slugify(asset.assetName)}`,
      ticker: TICKER,
      assetName: asset.assetName,
      readoutDate: null,
      asOfDate,
      phase: asset.stage,
      indication: asset.indication,
      outcome: "Candidate catalyst tracked; no event-specific clinical readout imported in the backend seed.",
      sourceType: "research_only",
      sourceDocumentId: asset.sourceEvidenceIds?.[0] ?? null,
      modelReady: 0,
      valuationImpactAllowed: 0,
      notes: "Clinical/pipeline candidates are not valuation-impacting unless reviewed and promoted.",
      rawJson: json({ asset, noFutureData: true }),
    };
  });
}

function buildPatentRows(dataset) {
  return [
    {
      id: "bmy-patent-revlimid-erosion",
      productName: "Revlimid",
      eventDate: "2022-01-01",
      asOfDate: "2022-01-01",
      geography: "US",
      eventType: "generic_erosion",
      exposedRevenue: null,
      notes: "Revlimid generic erosion row is date-gated to the post-entry period and is not applied to earlier historical quarters.",
    },
    {
      id: "bmy-patent-eliquis-loe-ira",
      productName: "Eliquis",
      eventDate: "2026-02-13",
      asOfDate: "2026-02-13",
      geography: "US",
      eventType: "loe_and_ira_pricing_exposure",
      exposedRevenue: 13_300,
      notes: "Eliquis LOE/IRA exposure is sourced from the current 10-K/static evidence map and only visible after the 2025 10-K event date.",
    },
    {
      id: "bmy-patent-opdivo-lifecycle",
      productName: "Opdivo",
      eventDate: "2026-02-13",
      asOfDate: "2026-02-13",
      geography: "US",
      eventType: "lifecycle_management",
      exposedRevenue: null,
      notes: "Opdivo lifecycle risk is tracked as a current risk row, not applied to older historical quarters.",
    },
  ].map((row) => ({
    ticker: TICKER,
    erosionCurveJson: json({ source: "research_only", noFutureData: true }),
    sourceType: "research_only",
    sourceDocumentId: row.productName === "Revlimid" ? "bmy-10k-2025" : "bmy-10k-2025",
    modelReady: row.productName === "Revlimid" || row.productName === "Eliquis" ? 1 : 0,
    valuationImpactAllowed: 0,
    rawJson: json({ noFutureData: true }),
    ...row,
  }));
}

function buildMarketSnapshots(events, dataset) {
  const latestEvent = events[events.length - 1];
  const currentPrice = dataset.currentPrice;
  const shares = dataset.sharesOutstanding;
  return [{
    id: `bmy-market-${dataset.priceDate}`,
    ticker: TICKER,
    asOfDate: latestEvent?.eventDate ?? dataset.priceDate,
    priceDate: dataset.priceDate,
    currentPrice,
    currency: "USD",
    marketCap: currentPrice * shares,
    enterpriseValue: dataset.enterpriseValue ?? currentPrice * shares,
    sharesOutstanding: shares,
    previousClose: currentPrice,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: null,
    beta: null,
    source: "Static BMY market-data snapshot; valuation service prefers daily_price_bars after import.",
    fetchedAt: new Date().toISOString(),
    rawJson: json({ source: dataset.evidence?.find((item) => item.id === "bmy-market"), noFutureData: true }),
  }];
}

function buildPeerSnapshots(now) {
  return ["PFE", "MRK", "GILD", "AMGN"].map((peerTicker, index) => ({
    id: `bmy-peer-${peerTicker}`,
    ticker: TICKER,
    asOfDate: RETRIEVAL_DATE,
    peerTicker,
    peerName: peerTicker,
    companyName: peerTicker,
    category: "large_cap_biopharma",
    peerGroup: "Mature large-cap biopharma",
    marketCap: null,
    enterpriseValue: null,
    trailingPe: [11, 13, 12, 14][index],
    forwardPe: [10, 12, 11, 13][index],
    forwardEvEbitda: null,
    priceToSales: null,
    dividendYield: null,
    beta: null,
    currency: "USD",
    source: "research_only peer multiple placeholder",
    fetchedAt: now,
    confidenceLevel: "low",
    absoluteValueUse: "metadata_only_not_aggregated",
    rawJson: json({ note: "Absolute market cap / EV intentionally not seeded to avoid mixed-source aggregation." }),
  }));
}

function latestFinancialForEvent(financialRows, event) {
  return [...financialRows]
    .filter((row) => row.asOfDate <= event.eventDate && row.revenue != null)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate)).at(-1) ?? null;
}

function normalizedEps(financial) {
  if (!financial) return 6.0;
  const multiplier = financial.periodType === "quarter" ? 4 : 1;
  if (financial.adjustedDilutedEps != null && financial.adjustedDilutedEps > 0) return financial.adjustedDilutedEps * multiplier;
  if (financial.gaapDilutedEps != null && financial.gaapDilutedEps > 0) return financial.gaapDilutedEps * multiplier;
  if (financial.operatingIncome != null && financial.dilutedShares) {
    return Math.max(0.5, (financial.operatingIncome * multiplier * 0.82) / financial.dilutedShares);
  }
  if (financial.freeCashFlow != null && financial.dilutedShares) return Math.max(0.5, (financial.freeCashFlow * multiplier) / financial.dilutedShares);
  return 6.0;
}

function dividendBridge(financial) {
  if (!financial?.dividendsPaid || !financial.dilutedShares) return 7.2;
  const annualDividend = Math.abs(financial.dividendsPaid) / financial.dilutedShares * (financial.periodType === "quarter" ? 4 : 1);
  return Math.max(0, annualDividend * 3);
}

function yearMultipleDrift(event) {
  const progress = Math.max(0, Math.min(1, (event.fiscalYear - 2018) / 8));
  return 12.0 - progress * 2.5;
}

function scenarioAssumptionsForEvent(financialRows, event, scenario) {
  const financial = latestFinancialForEvent(financialRows, event);
  const eps = normalizedEps(financial);
  const baseMultiple = yearMultipleDrift(event);
  const scenarioConfig = {
    Bear: { multiple: Math.max(6.5, baseMultiple - 2.0), pipelineHaircut: 0.15, optionValue: 0, summary: "LOE pressure dominates and pipeline credit is minimal." },
    Base: { multiple: baseMultiple, pipelineHaircut: 0.35, optionValue: event.fiscalYear >= 2025 ? 500 : 0, summary: "Growth Portfolio and partial pipeline credit offset some legacy erosion." },
    Bull: { multiple: baseMultiple + 2.0, pipelineHaircut: 0.60, optionValue: event.fiscalYear >= 2025 ? 1_500 : 300, summary: "Pipeline and Growth Portfolio execution improve the market multiple." },
  }[scenario];
  return {
    coreMetricLabel: "Normalized EPS",
    coreMetricValue: eps,
    coreMultiple: scenarioConfig.multiple,
    pipelineHaircut: scenarioConfig.pipelineHaircut,
    platformOptionValue: scenarioConfig.optionValue,
    cashOrDebtAdjustment: 0,
    expectedDividends: dividendBridge(financial),
    summary: scenarioConfig.summary,
    dataPolicy: "Event-specific assumptions generated from SEC financial rows visible on or before the reporting event date.",
    financialRowId: financial?.id ?? null,
  };
}

function buildAssumptionSets(events, financialRows, now) {
  return events.flatMap((event) =>
    ["Bear", "Base", "Bull"].map((scenario) => ({
      id: `bmy-${event.id}-${scenario.toLowerCase()}-${BMY_BACKEND_MODEL_VERSION.version}`,
      ticker: TICKER,
      name: `${event.fiscalPeriod} ${scenario} backend assumptions`,
      scenario,
      modelVersion: BMY_BACKEND_MODEL_VERSION.version,
      reportingEventId: event.id,
      asOfDate: event.eventDate,
      assumptionsJson: json(scenarioAssumptionsForEvent(financialRows, event, scenario)),
      sourceType: "forecast_assumption",
      createdAt: now,
    })),
  );
}

function buildGuidanceItems(events, dataset) {
  const latestEvent = events.find((event) => event.eventDate >= "2026-04-30") ?? events[events.length - 1];
  return (dataset.guidance ?? []).map((item) => ({
    id: `bmy-guidance-${slugify(item.metric)}`,
    ticker: TICKER,
    eventId: latestEvent?.id ?? null,
    asOfDate: latestEvent?.eventDate ?? "2026-04-30",
    fiscalPeriodTarget: item.period,
    metric: item.metric,
    guidanceType: item.status === "reaffirmed" || item.status === "issued" || item.status === "raised" ? "explicit_guide" : "candidate",
    lowValue: item.low ?? null,
    highValue: item.high ?? null,
    midpointValue: item.midpoint ?? (item.low != null && item.high != null ? (item.low + item.high) / 2 : null),
    unit: item.unit,
    quote: item.commentary,
    speaker: "BMY management",
    sourcePath: item.sourceEvidenceIds?.[0] ?? null,
    confidence: "medium",
    humanReviewStatus: "reviewed",
    modelReady: 1,
    valuationImpactAllowed: item.metric.includes("EPS") ? 1 : 0,
    rawJson: json({ item, noFutureData: true }),
  }));
}

function buildTranscriptRows(events, dataset) {
  const eventByLabel = new Map(events.map((event) => [`${event.fiscalYear}-${event.fiscalQuarter}`, event]));
  const transcriptEvents = [];
  const transcriptExtractions = [];
  for (const quarter of dataset.earnings?.quarters ?? []) {
    const year = Number(quarter.label.match(/20\d{2}/)?.[0]);
    const quarterName = quarter.label.match(/Q[1-4]/)?.[0];
    const event = eventByLabel.get(`${year}-${quarterName}`) ?? nearestEventOnOrAfter(events, quarter.callDate);
    if (!event) continue;
    const transcriptId = `bmy-transcript-${quarter.id}`;
    transcriptEvents.push({
      id: transcriptId,
      ticker: TICKER,
      eventId: event.id,
      eventDate: quarter.callDate,
      fiscalPeriod: quarter.label,
      eventType: "earnings_transcript",
      transcriptId,
      hasQa: 1,
      sourcePath: quarter.sourceEvidenceIds?.[0] ?? null,
      provenance: "static earnings-call intelligence dataset",
      confidence: "medium",
      metadataJson: json(quarter),
    });
    transcriptExtractions.push({
      id: `${transcriptId}-summary`,
      ticker: TICKER,
      transcriptId,
      eventId: event.id,
      extractionType: "ai_summary",
      topic: "call_summary",
      segment: null,
      speaker: null,
      section: "summary",
      supportingQuoteShort: quarter.aiSummary,
      confidence: "medium",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json(quarter),
    });
    for (const [index, question] of (quarter.analystQuestions ?? []).entries()) {
      transcriptExtractions.push({
        id: `${transcriptId}-question-${index}`,
        ticker: TICKER,
        transcriptId,
        eventId: event.id,
        extractionType: "analyst_question",
        topic: "analyst_focus",
        segment: null,
        speaker: "Analysts",
        section: "Q&A",
        supportingQuoteShort: question,
        confidence: "medium",
        needsHumanReview: 1,
        modelReady: 0,
        valuationImpactAllowed: 0,
        rawJson: json({ question, noFutureData: true }),
      });
    }
  }
  return { transcriptEvents, transcriptExtractions };
}

function buildSourceDocuments({ events, dataset, now }) {
  return [
    ...events.map((event) => ({
      id: `bmy-sec-${event.id}`,
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: `${event.fiscalPeriod} SEC filing`,
      sourcePath: "data/local/bmy/sec/submissions_CIK0000014272.json",
      sourceUrl: event.sourceUrl,
      retrievedAt: now,
      publishedDate: event.eventDate,
      provenance: `SEC submissions and Companyfacts for CIK ${CIK}; values converted to USDm.`,
      confidence: "high",
      checksum: null,
      metadataJson: json(event),
    })),
    ...(dataset.evidence ?? []).map((source) => ({
      id: source.id,
      ticker: TICKER,
      sourceType: sourceLayer(source.sourceType),
      sourceName: source.sourceTitle,
      sourcePath: source.url?.startsWith("local://") ? source.url : null,
      sourceUrl: source.url?.startsWith("http") ? source.url : null,
      retrievedAt: now,
      publishedDate: source.date,
      provenance: source.notes,
      confidence: source.confidence,
      checksum: null,
      metadataJson: json(source),
    })),
    {
      id: "bmy-sec-companyfacts",
      ticker: TICKER,
      sourceType: "official_actual",
      sourceName: "BMY SEC Companyfacts",
      sourcePath: "data/local/bmy/sec/companyfacts_CIK0000014272.json",
      sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000014272.json",
      retrievedAt: now,
      publishedDate: RETRIEVAL_DATE,
      provenance: "Official SEC XBRL Companyfacts API.",
      confidence: "high",
      checksum: null,
      metadataJson: json({ cik: CIK }),
    },
  ];
}

export async function buildBmyBackendSeedPayload() {
  const now = new Date().toISOString();
  const submissions = readJsonFile(SUBMISSIONS_PATH);
  const archivedSubmissions = readJsonFile(path.join(SEC_DIR, "CIK0000014272-submissions-001.json"));
  const companyfacts = readJsonFile(COMPANYFACTS_PATH);
  if (!submissions || !companyfacts) {
    throw new Error("BMY SEC submissions/companyfacts files are missing. Expected data/local/bmy/sec/*.json.");
  }
  const { dataset } = await loadBmyStaticModules();
  const reportingEvents = completeReportingEventsFromCompanyfacts(buildReportingEvents([submissions, archivedSubmissions].filter(Boolean)), companyfacts.facts ?? {});
  const financialPeriods = buildFinancialRows(reportingEvents, companyfacts.facts ?? {});
  const segmentFinancials = buildSegmentRows(financialPeriods);
  const productFinancials = buildProductRows({ events: reportingEvents, dataset, financialRows: financialPeriods });
  const pipelineEvents = buildPipelineRows(dataset);
  const clinicalReadouts = buildClinicalReadouts(dataset);
  const patentExclusivityEvents = buildPatentRows(dataset);
  const marketSnapshots = buildMarketSnapshots(reportingEvents, dataset);
  const peerSnapshots = buildPeerSnapshots(now);
  const guidanceItems = buildGuidanceItems(reportingEvents, dataset);
  const { transcriptEvents, transcriptExtractions } = buildTranscriptRows(reportingEvents, dataset);
  const sourceDocuments = buildSourceDocuments({ events: reportingEvents, dataset, now });
  const assumptionSets = buildAssumptionSets(reportingEvents, financialPeriods, now);
  const modelVersions = [{
    id: BMY_BACKEND_MODEL_VERSION.version,
    ticker: TICKER,
    version: BMY_BACKEND_MODEL_VERSION.version,
    name: BMY_BACKEND_MODEL_VERSION.name,
    description: BMY_BACKEND_MODEL_VERSION.description,
    codeCommitSha: null,
    valuationMethodsJson: json(BMY_BACKEND_MODEL_VERSION.valuationMethods),
    assumptionSchemaJson: json(BMY_BACKEND_MODEL_VERSION.assumptionSchema),
    createdAt: now,
  }];
  const validationWarnings = [
    {
      id: "bmy-product-brand-gaps",
      ticker: TICKER,
      scope: "product_financials",
      severity: "medium",
      title: "Brand-level product revenue gaps are explicit",
      detail: "SEC Companyfacts provides official company-level financials, but not normalized quarterly brand revenue rows. Missing brand rows are marked research_only/modelReady=false.",
      relatedTable: "product_financials",
      relatedRecordId: null,
      createdAt: now,
    },
    {
      id: "bmy-current-pipeline-date-gating",
      ticker: TICKER,
      scope: "pipeline_events",
      severity: "medium",
      title: "Current pipeline assumptions are date-gated",
      detail: "Pipeline rows from the 2026-05-12 source are not available to Q1 2026 historical valuations dated 2026-04-30.",
      relatedTable: "pipeline_events",
      relatedRecordId: null,
      createdAt: now,
    },
  ];

  return {
    reportingEvents,
    sourceDocuments,
    financialPeriods,
    segmentFinancials,
    productFinancials,
    pipelineEvents,
    clinicalReadouts,
    patentExclusivityEvents,
    marketSnapshots,
    peerSnapshots,
    guidanceItems,
    transcriptEvents,
    transcriptExtractions,
    assumptionSets,
    modelVersions,
    validationWarnings,
  };
}
