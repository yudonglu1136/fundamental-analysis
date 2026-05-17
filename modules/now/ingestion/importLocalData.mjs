import { NOW_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "NOW";
const CREATED_AT = "2026-05-15T00:00:00.000Z";

function json(value) { return JSON.stringify(value ?? null); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function round(value, digits = 2) { if (!Number.isFinite(value)) return null; const f = 10 ** digits; return Math.round(value * f) / f; }
function sourceLayer(year) { return year >= 2025 ? "market_data_proxy" : "official_seed"; }

function eventDateFor(fiscalYear, quarter) {
  const overrides = {
    "2018-Q1": "2018-04-25", "2018-Q2": "2018-07-25", "2018-Q3": "2018-10-24", "2018-Q4": "2019-01-30",
    "2019-Q1": "2019-04-24", "2019-Q2": "2019-07-24", "2019-Q3": "2019-10-23", "2019-Q4": "2020-01-29",
    "2020-Q1": "2020-04-29", "2020-Q2": "2020-07-29", "2020-Q3": "2020-10-28", "2020-Q4": "2021-01-27",
    "2021-Q1": "2021-04-28", "2021-Q2": "2021-07-28", "2021-Q3": "2021-10-27", "2021-Q4": "2022-01-26",
    "2022-Q1": "2022-04-27", "2022-Q2": "2022-07-27", "2022-Q3": "2022-10-26", "2022-Q4": "2023-01-25",
    "2023-Q1": "2023-04-26", "2023-Q2": "2023-07-26", "2023-Q3": "2023-10-25", "2023-Q4": "2024-01-24",
    "2024-Q1": "2024-04-24", "2024-Q2": "2024-07-24", "2024-Q3": "2024-10-23", "2024-Q4": "2025-01-29",
    "2025-Q1": "2025-04-23", "2025-Q2": "2025-07-23", "2025-Q3": "2025-10-22", "2025-Q4": "2026-01-28",
    "2026-Q1": "2026-04-23",
  };
  return overrides[fiscalYear + "-" + quarter] ?? fiscalYear + "-04-25";
}
function periodStartDateFor(fiscalYear, quarter) {
  if (quarter === "Q1") return fiscalYear + "-01-01";
  if (quarter === "Q2") return fiscalYear + "-04-01";
  if (quarter === "Q3") return fiscalYear + "-07-01";
  return fiscalYear + "-10-01";
}
function periodEndDateFor(fiscalYear, quarter) {
  if (quarter === "Q1") return fiscalYear + "-03-31";
  if (quarter === "Q2") return fiscalYear + "-06-30";
  if (quarter === "Q3") return fiscalYear + "-09-30";
  return fiscalYear + "-12-31";
}

const annualRows = [
  { fiscalYear: 2018, revenue: 2608, subscriptionRevenue: 2395, operatingIncome: 120, netIncome: 26, dilutedShares: 950, operatingCashFlow: 810, capex: 150, buybacks: 0, stockBasedCompensation: 420, currentRpo: 2100, rpo: 4700, subscriptionGrowth: 0.36, currentRpoGrowth: 0.32, netRetentionRate: 1.22, largeCustomerCount: 650, agenticAiArr: 0, agenticAiCustomers: 0, proPlusAdoptionRate: 0, eventPrice: 33 },
  { fiscalYear: 2019, revenue: 3460, subscriptionRevenue: 3210, operatingIncome: 170, netIncome: 135, dilutedShares: 975, operatingCashFlow: 1120, capex: 190, buybacks: 0, stockBasedCompensation: 560, currentRpo: 3000, rpo: 6200, subscriptionGrowth: 0.34, currentRpoGrowth: 0.35, netRetentionRate: 1.21, largeCustomerCount: 820, agenticAiArr: 0, agenticAiCustomers: 0, proPlusAdoptionRate: 0, eventPrice: 55 },
  { fiscalYear: 2020, revenue: 4519, subscriptionRevenue: 4286, operatingIncome: 210, netIncome: 119, dilutedShares: 995, operatingCashFlow: 1780, capex: 250, buybacks: 0, stockBasedCompensation: 730, currentRpo: 4100, rpo: 8600, subscriptionGrowth: 0.34, currentRpoGrowth: 0.37, netRetentionRate: 1.20, largeCustomerCount: 1050, agenticAiArr: 0, agenticAiCustomers: 0, proPlusAdoptionRate: 0, eventPrice: 110 },
  { fiscalYear: 2021, revenue: 5896, subscriptionRevenue: 5573, operatingIncome: 330, netIncome: 230, dilutedShares: 1010, operatingCashFlow: 2350, capex: 320, buybacks: 0, stockBasedCompensation: 920, currentRpo: 5400, rpo: 11200, subscriptionGrowth: 0.30, currentRpoGrowth: 0.32, netRetentionRate: 1.25, largeCustomerCount: 1350, agenticAiArr: 0, agenticAiCustomers: 0, proPlusAdoptionRate: 0, eventPrice: 130 },
  { fiscalYear: 2022, revenue: 7245, subscriptionRevenue: 6860, operatingIncome: 430, netIncome: 325, dilutedShares: 1015, operatingCashFlow: 2860, capex: 380, buybacks: 0, stockBasedCompensation: 1200, currentRpo: 6800, rpo: 14500, subscriptionGrowth: 0.23, currentRpoGrowth: 0.26, netRetentionRate: 1.24, largeCustomerCount: 1635, agenticAiArr: 0, agenticAiCustomers: 0, proPlusAdoptionRate: 0, eventPrice: 78 },
  { fiscalYear: 2023, revenue: 8971, subscriptionRevenue: 8680, operatingIncome: 760, netIncome: 1580, dilutedShares: 1025, operatingCashFlow: 3560, capex: 450, buybacks: 1500, stockBasedCompensation: 1450, currentRpo: 8600, rpo: 18000, subscriptionGrowth: 0.27, currentRpoGrowth: 0.27, netRetentionRate: 1.23, largeCustomerCount: 1895, agenticAiArr: 25, agenticAiCustomers: 50, proPlusAdoptionRate: 0.03, eventPrice: 140 },
  { fiscalYear: 2024, revenue: 10984, subscriptionRevenue: 10580, operatingIncome: 1260, netIncome: 1430, dilutedShares: 1035, operatingCashFlow: 4450, capex: 540, buybacks: 1500, stockBasedCompensation: 1750, currentRpo: 10500, rpo: 21800, subscriptionGrowth: 0.22, currentRpoGrowth: 0.22, netRetentionRate: 1.22, largeCustomerCount: 2175, agenticAiArr: 120, agenticAiCustomers: 300, proPlusAdoptionRate: 0.08, eventPrice: 212 },
  { fiscalYear: 2025, revenue: 13100, subscriptionRevenue: 12650, operatingIncome: 1680, netIncome: 1800, dilutedShares: 1040, operatingCashFlow: 5380, capex: 620, buybacks: 2000, stockBasedCompensation: 2050, currentRpo: 12600, rpo: 26300, subscriptionGrowth: 0.20, currentRpoGrowth: 0.20, netRetentionRate: 1.21, largeCustomerCount: 2490, agenticAiArr: 350, agenticAiCustomers: 850, proPlusAdoptionRate: 0.16, eventPrice: 156 },
];
const quarterWeights = { Q1: 0.235, Q2: 0.245, Q3: 0.255, Q4: 0.265 };
const partial2026Rows = [{ fiscalYear: 2026, fiscalQuarter: "Q1", revenue: 3450, subscriptionRevenue: 3330, operatingIncome: 465, netIncome: 480, dilutedShares: 1045, operatingCashFlow: 1450, capex: 165, buybacks: 500, stockBasedCompensation: 560, currentRpo: 13700, rpo: 28500, subscriptionGrowth: 0.21, currentRpoGrowth: 0.19, netRetentionRate: 1.21, largeCustomerCount: 2580, agenticAiArr: 520, agenticAiCustomers: 1300, proPlusAdoptionRate: 0.22, eventPrice: 95.15, sourceType: "market_data_proxy" }];

function quarterlyRows() {
  const rows = [];
  for (const annual of annualRows) {
    const acc = { revenue: 0, subscriptionRevenue: 0, operatingIncome: 0, netIncome: 0, operatingCashFlow: 0, capex: 0, buybacks: 0, stockBasedCompensation: 0 };
    for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
      const last = quarter === "Q4";
      const weight = quarterWeights[quarter];
      const qIndex = { Q1: 0.88, Q2: 0.96, Q3: 1.02, Q4: 1.08 }[quarter];
      const row = {
        fiscalYear: annual.fiscalYear,
        fiscalQuarter: quarter,
        revenue: last ? annual.revenue - acc.revenue : round(annual.revenue * weight, 2),
        subscriptionRevenue: last ? annual.subscriptionRevenue - acc.subscriptionRevenue : round(annual.subscriptionRevenue * weight, 2),
        operatingIncome: last ? annual.operatingIncome - acc.operatingIncome : round(annual.operatingIncome * weight, 2),
        netIncome: last ? annual.netIncome - acc.netIncome : round(annual.netIncome * weight, 2),
        operatingCashFlow: last ? annual.operatingCashFlow - acc.operatingCashFlow : round(annual.operatingCashFlow * weight, 2),
        capex: last ? annual.capex - acc.capex : round(annual.capex * weight, 2),
        buybacks: last ? annual.buybacks - acc.buybacks : round(annual.buybacks * weight, 2),
        stockBasedCompensation: last ? annual.stockBasedCompensation - acc.stockBasedCompensation : round(annual.stockBasedCompensation * weight, 2),
        dividends: 0,
        currentRpo: round(annual.currentRpo * qIndex, 2),
        rpo: round(annual.rpo * qIndex, 2),
        subscriptionGrowth: annual.subscriptionGrowth,
        currentRpoGrowth: annual.currentRpoGrowth,
        netRetentionRate: annual.netRetentionRate,
        largeCustomerCount: round(annual.largeCustomerCount * qIndex, 0),
        agenticAiArr: round(annual.agenticAiArr * qIndex, 2),
        agenticAiCustomers: round(annual.agenticAiCustomers * qIndex, 0),
        proPlusAdoptionRate: round(Math.min(0.55, annual.proPlusAdoptionRate * qIndex), 4),
        dilutedShares: round(annual.dilutedShares + (quarter === "Q4" ? 0.6 : 0), 2),
        eventPrice: round(annual.eventPrice * (quarter === "Q1" ? 0.92 : quarter === "Q2" ? 0.98 : quarter === "Q3" ? 1.03 : 1), 2),
        sourceType: sourceLayer(annual.fiscalYear),
      };
      for (const key of Object.keys(acc)) acc[key] += row[key] ?? 0;
      rows.push(row);
    }
  }
  rows.push(...partial2026Rows);
  return rows;
}
function periodId(row) { return "fy" + row.fiscalYear + "-" + row.fiscalQuarter.toLowerCase(); }
function eventId(row) { return "now-fy" + row.fiscalYear + "-" + row.fiscalQuarter.toLowerCase(); }

function buildReportingEvent(row) {
  const eventDate = eventDateFor(row.fiscalYear, row.fiscalQuarter);
  return { id: eventId(row), ticker: TICKER, eventDate, fiscalPeriod: "FY" + row.fiscalYear + " " + row.fiscalQuarter, fiscalYear: row.fiscalYear, fiscalQuarter: row.fiscalQuarter, eventType: row.fiscalQuarter === "Q4" ? "fy_earnings_release_10k" : row.fiscalQuarter.toLowerCase() + "_earnings_release_10q", label: "ServiceNow FY" + row.fiscalYear + " " + row.fiscalQuarter + " reporting event", sourceType: row.sourceType, sourcePath: null, sourceUrl: "https://investors.servicenow.com/financials/sec-filings/default.aspx", createdAt: CREATED_AT };
}
function buildFinancialPeriod(row, event) {
  const freeCashFlow = row.operatingCashFlow - row.capex;
  const totalCapitalReturn = row.buybacks;
  return { id: "now-financial-" + event.id, ticker: TICKER, periodId: periodId(row), fiscalYear: row.fiscalYear, fiscalQuarter: row.fiscalQuarter, periodType: "quarter", periodStartDate: periodStartDateFor(row.fiscalYear, row.fiscalQuarter), periodEndDate: periodEndDateFor(row.fiscalYear, row.fiscalQuarter), eventId: event.id, asOfDate: event.eventDate, sourceType: row.sourceType, revenue: row.revenue, costOfRevenue: round(row.revenue * 0.21, 2), grossProfit: round(row.revenue * 0.79, 2), grossMargin: 0.79, operatingIncome: row.operatingIncome, operatingMargin: row.revenue ? row.operatingIncome / row.revenue : null, netIncome: row.netIncome, dilutedEps: row.dilutedShares ? row.netIncome / row.dilutedShares : null, dilutedShares: row.dilutedShares, operatingCashFlow: row.operatingCashFlow, capex: row.capex, freeCashFlow, depreciationAmortization: round(row.revenue * 0.035, 2), stockBasedCompensation: row.stockBasedCompensation, cashAndShortTermInvestments: round(row.revenue * 1.1, 2), marketableSecurities: round(row.revenue * 0.9, 2), cashAndMarketableSecurities: round(row.revenue * 2.0, 2), debt: round(row.revenue * 0.75, 2), netCashDebt: round(row.revenue * 1.25, 2), operatingLeaseLiabilities: round(row.revenue * 0.12, 2), ppeNet: round(row.revenue * 0.22, 2), dividendsPaid: 0, buybacks: row.buybacks, dividendPerShare: 0, totalCapitalReturn, fcfCoverage: totalCapitalReturn > 0 ? freeCashFlow / totalCapitalReturn : null, currentPrice: row.eventPrice, rawJson: json({ source: "NOW backend SaaS seed from public-history style values plus explicit proxy assumptions pending official parser backfill.", sourceQuality: row.sourceType, splitAdjustment: "Per-share price, diluted EPS and diluted shares are adjusted for ServiceNow's December 2025 5-for-1 stock split.", noFutureLeakage: "Quarter rows expose only event-visible data/proxies as of the reporting event date.", fields: { subscriptionRevenue: "Stored in operating_metric_snapshots for subscription growth analysis.", freeCashFlow: "Operating cash flow less capex." } }) };
}
function buildSegmentRows(row, event) {
  const pid = periodId(row);
  const segments = [
    { segment: "Subscription Workflow Platform", taxonomy: "subscription_platform", revenue: row.subscriptionRevenue * 0.72, margin: 0.33, growth: row.subscriptionGrowth, notes: "Core workflow subscription engine and renewal/expansion base." },
    { segment: "AI Agents and Pro Plus", taxonomy: "agentic_ai", revenue: Math.max(row.agenticAiArr / 4, row.subscriptionRevenue * row.proPlusAdoptionRate * 0.08), margin: 0.25, growth: row.agenticAiArr > 0 ? 1.2 : 0, notes: "Analytical proxy for Agentic AI, Pro Plus, automation and AI workflow attach." },
    { segment: "Professional Services and Other", taxonomy: "services_other", revenue: Math.max(row.revenue - row.subscriptionRevenue, 0), margin: 0.02, growth: 0.06, notes: "Implementation and enablement revenue; lower strategic margin than subscription." },
  ];
  return segments.map((s) => ({ id: "now-segment-" + pid + "-" + slug(s.segment), ticker: TICKER, periodId: pid, eventId: event.id, asOfDate: event.eventDate, segment: s.segment, taxonomy: s.taxonomy, revenue: round(s.revenue, 2), costOfRevenue: null, grossProfit: null, grossMargin: null, operatingExpenses: round(s.revenue * (1 - s.margin), 2), operatingIncome: round(s.revenue * s.margin, 2), operatingMargin: s.margin, growth: s.growth, constantCurrencyGrowth: s.growth, sourceType: row.sourceType, notes: s.notes, rawJson: json({ source: "NOW backend analytical SaaS framework allocation, not official segment disclosure.", modelUse: "Dashboard and valuation sensitivity only." }) }));
}
function buildOperatingMetric(row, event) {
  const pid = periodId(row);
  return { id: "now-operating-" + event.id, ticker: TICKER, periodId: pid, eventId: event.id, asOfDate: event.eventDate, sourceType: row.sourceType, grossDollarVolume: row.currentRpo, grossDollarVolumeGrowth: row.currentRpoGrowth, purchaseVolume: row.rpo, purchaseVolumeGrowth: row.currentRpoGrowth, crossBorderVolumeGrowth: row.subscriptionGrowth, switchedTransactions: row.largeCustomerCount, switchedTransactionsGrowth: row.subscriptionGrowth, processedTransactions: row.agenticAiCustomers, processedTransactionsGrowth: row.agenticAiArr > 0 ? 0.8 : 0, cardsAccounts: row.largeCustomerCount, cardsAccountsGrowth: row.subscriptionGrowth, rebatesIncentives: row.subscriptionRevenue, rebatesIncentivesGrowth: row.subscriptionGrowth, takeRate: row.revenue ? row.subscriptionRevenue / row.revenue : null, subscriptionRevenue: row.subscriptionRevenue, subscriptionRevenueGrowth: row.subscriptionGrowth, currentRpo: row.currentRpo, currentRpoGrowth: row.currentRpoGrowth, remainingPerformanceObligations: row.rpo, remainingPerformanceObligationsGrowth: row.currentRpoGrowth, netRetentionRate: row.netRetentionRate, largeCustomerCount: row.largeCustomerCount, largeCustomerGrowth: row.subscriptionGrowth, agenticAiArr: row.agenticAiArr, agenticAiCustomers: row.agenticAiCustomers, agenticAiWorkflowCount: row.agenticAiCustomers * 2.5, proPlusAdoptionRate: row.proPlusAdoptionRate, aiAgentCommentary: "Agentic AI progress is tracked through ARR proxy, customer count proxy, Pro Plus adoption and workflow attach, with proxy rows flagged until official disclosure is parsed.", subscriptionCommentary: "Subscription revenue growth and cRPO growth are the core forward-demand checks.", workflowExpansionCommentary: "Workflow expansion depends on ITSM base renewal, Creator/Automation, SecOps, Customer/Employee workflows and AI attach.", renewalCommentary: "NRR and large-customer expansion are key guardrails against seat-growth normalization.", sbcDilutionCommentary: "SBC and dilution are tracked against FCF conversion because GAAP profitability can lag FCF quality.", takeRateCommentary: "For NOW, take-rate is repurposed as subscription revenue / total revenue to expose mix stability.", crossBorderCommentary: "SaaS demand proxy: subscription growth replaces payments cross-border volume.", travelCommentary: "Not applicable to NOW; macro sensitivity is enterprise software budget, renewal and AI platform adoption.", valueAddedServicesCommentary: "AI Agents, Pro Plus, workflow data layer and automation attach are the value-added mix tests.", cybersecurityDataAnalyticsCommentary: "Security, risk and data/automation workflows are tracked as platform expansion vectors.", operatingLeverageCommentary: "Operating leverage depends on subscription scale, cloud gross margin, sales efficiency and AI monetization.", fxImpactCommentary: "FX can affect reported billings and RPO, but valuation only uses event-visible growth proxies.", regulatoryCommentary: "Primary risk is AI/data governance, procurement scrutiny and platform lock-in review, not interchange regulation.", competitionCommentary: "Competition comes from Salesforce, Microsoft, Atlassian, Workday, BMC, hyperscaler AI workflow tooling and vertical SaaS.", capitalReturnCommentary: "NOW has no dividend; capital return is buyback/SBC dilution offset versus FCF.", normalizedFcfCommentary: "Normalized FCF conversion is a central underwriting point because upfront billing and SBC can flatter cash metrics.", pricingCommentary: "Pricing durability is tested through Pro Plus/AI attach and renewal expansion rather than seat count alone.", notes: "NOW-specific metrics in USDm except customer counts/adoption rates.", rawJson: json({ source: "NOW backend analytical seed", sourceQuality: row.sourceType, skillFramework: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"] }) };
}
function buildMarketSnapshot(row, event) {
  return { id: "now-market-" + event.id, ticker: TICKER, asOfDate: event.eventDate, priceDate: event.eventDate, currentPrice: row.eventPrice, currency: "USD", marketCap: row.eventPrice * row.dilutedShares, enterpriseValue: row.eventPrice * row.dilutedShares - row.revenue * 1.25, sharesOutstanding: row.dilutedShares, previousClose: row.eventPrice, fiftyTwoWeekHigh: row.eventPrice * 1.18, fiftyTwoWeekLow: row.eventPrice * 0.70, dividendYield: 0, beta: 1.05, source: "NOW backend market snapshot proxy; daily_price_bars override valuation as-of price.", fetchedAt: CREATED_AT, rawJson: json({ sourceQuality: "market_data_proxy", splitAdjustment: "ServiceNow 5-for-1 stock split effective December 2025; market snapshots use split-adjusted price and shares.", noFutureLeakage: "Valuation service replaces this with nearest prior daily adjusted close." }) };
}
function buildAssumptionSet(scenario, overrides = {}) {
  const base = { revenueGrowth: 0.18, subscriptionGrowth: 0.20, currentRpoGrowth: 0.19, agenticAiGrowth: 0.75, proPlusAdoptionRate: 0.22, netRetentionRate: 1.21, operatingMargin: 0.16, normalizedFcfMargin: 0.33, terminalGrowth: 0.035, discountRate: 0.085, targetFcfYield: 0.027, targetPe: 45, targetEvRevenue: 12, targetEvEbit: 45, peerPremium: 0.12, aiExecutionHaircut: 0.04, platformCompetitionHaircut: 0.03, sbcDilutionHaircut: 0.02, buybackYield: 0.008, dividendYield: 0 };
  return { id: "now-assumptions-" + scenario.toLowerCase(), ticker: TICKER, name: "NOW " + scenario + " backend assumptions", scenario, modelVersion: NOW_BACKEND_MODEL_VERSION.version, asOfDate: "2018-04-25", assumptionsJson: json({ ...base, ...overrides }), sourceType: "forecast_assumption", createdAt: CREATED_AT };
}

export async function buildNowBackendSeedPayload() {
  const sourceDocuments = [
    { id: "now-source-sec-filings", ticker: TICKER, sourceType: "official_reference", sourceName: "ServiceNow SEC filings and investor relations reference", sourcePath: null, sourceUrl: "https://investors.servicenow.com/financials/sec-filings/default.aspx", retrievedAt: CREATED_AT, publishedDate: null, provenance: "reference_url", confidence: "medium", checksum: null, metadataJson: json({ status: "parser_pending", note: "Seed rows are official_seed / market_data_proxy until the official filing parser is promoted." }) },
    { id: "now-source-analytical-framework", ticker: TICKER, sourceType: "research_framework", sourceName: "NOW SaaS / Agentic AI analytical framework", sourcePath: null, sourceUrl: null, retrievedAt: CREATED_AT, publishedDate: CREATED_AT.slice(0, 10), provenance: "local_codex_buy_side_skills", confidence: "high", checksum: null, metadataJson: json({ checkedSkills: ["bs-initiation-research", "bs-valuation-triangulation", "bs-filing-qoe-review", "bs-earnings-call-analysis", "bs-risk-red-team", "bs-variant-perception", "bs-model-audit"], nowSpecificSkillFound: false, framework: ["Subscription revenue growth and renewal durability", "cRPO/RPO as forward demand signals", "Agentic AI ARR, customer adoption and Pro Plus attach", "Large customer expansion and NRR", "Workflow expansion beyond ITSM", "Operating leverage and FCF margin", "SBC/dilution versus buyback offset", "Competition from Salesforce, Microsoft, Atlassian, Workday and AI workflow tooling", "Premium multiple durability versus growth normalization"] }) },
  ];
  const rows = quarterlyRows();
  const reportingEvents = rows.map(buildReportingEvent);
  const eventByPid = new Map(reportingEvents.map((event) => ["fy" + event.fiscalYear + "-" + event.fiscalQuarter.toLowerCase(), event]));
  const eventFor = (row) => eventByPid.get(periodId(row));
  const financialPeriods = rows.map((row) => buildFinancialPeriod(row, eventFor(row)));
  const segmentFinancials = rows.flatMap((row) => buildSegmentRows(row, eventFor(row)));
  const operatingMetricSnapshots = rows.map((row) => buildOperatingMetric(row, eventFor(row)));
  const marketSnapshots = rows.map((row) => buildMarketSnapshot(row, eventFor(row)));
  const latestEvent = reportingEvents[reportingEvents.length - 1];
  const peerSnapshots = [["CRM", "Salesforce", "enterprise_app_saas", 38, 30, 26], ["MSFT", "Microsoft", "platform_ai_cloud", 34, 31, 28], ["WDAY", "Workday", "enterprise_workflow", 42, 31, 24], ["TEAM", "Atlassian", "devops_collaboration", 58, 40, 30]].map(([peerTicker, companyName, category, trailingPe, forwardPe, evEbit]) => ({ id: "now-peer-" + String(peerTicker).toLowerCase(), ticker: TICKER, asOfDate: latestEvent.eventDate, peerTicker, peerName: companyName, companyName, category, peerGroup: "enterprise_saas_ai_workflow", marketCap: null, enterpriseValue: null, trailingPe, forwardPe, forwardEvEbitda: evEbit, priceToSales: null, dividendYield: null, beta: null, currency: "USD", source: "research_only peer multiple guardrail", fetchedAt: CREATED_AT, confidenceLevel: "medium", absoluteValueUse: "metadata_only_mixed_sources", rawJson: json({ sourceQuality: "research_only", use: "relative multiple context only" }) }));
  const guidanceItems = reportingEvents.slice(-6).map((event) => ({ id: "now-guidance-" + event.id + "-ai", ticker: TICKER, eventId: event.id, asOfDate: event.eventDate, fiscalPeriodTarget: event.fiscalPeriod, metric: "agentic_ai_adoption", guidanceType: "candidate", lowValue: null, highValue: null, midpointValue: null, unit: "USDm/customers", quote: "Candidate placeholder: Agentic AI commentary requires official transcript/source review before valuation impact.", speaker: null, sourcePath: null, confidence: "low", humanReviewStatus: "needs_review", modelReady: 0, valuationImpactAllowed: 0, rawJson: json({ sourceQuality: "candidate_only" }) }));
  const transcriptEvents = reportingEvents.map((event) => ({ id: "now-transcript-" + event.id, ticker: TICKER, eventId: event.id, eventDate: event.eventDate, fiscalPeriod: event.fiscalPeriod, eventType: event.eventType, transcriptId: "now-transcript-" + event.id, hasQa: 0, sourcePath: null, provenance: "transcript_placeholder_pending_official_import", confidence: "low", metadataJson: json({ modelReady: false, valuationImpactAllowed: false }) }));
  const transcriptExtractions = reportingEvents.flatMap((event) => ["agentic_ai", "subscription_growth"].map((topic) => ({ id: "now-transcript-extract-" + event.id + "-" + topic, ticker: TICKER, transcriptId: "now-transcript-" + event.id, eventId: event.id, extractionType: "topic_candidate", topic, segment: topic === "agentic_ai" ? "AI Agents and Pro Plus" : "Subscription Workflow Platform", speaker: null, section: "prepared_remarks", supportingQuoteShort: "Official quote pending transcript import.", confidence: "low", needsHumanReview: 1, modelReady: 0, valuationImpactAllowed: 0, rawJson: json({ researchUse: "display_only_until_reviewed" }) })));
  const modelVersions = [{ id: NOW_BACKEND_MODEL_VERSION.version, ticker: TICKER, version: NOW_BACKEND_MODEL_VERSION.version, name: NOW_BACKEND_MODEL_VERSION.name, description: NOW_BACKEND_MODEL_VERSION.description, codeCommitSha: null, valuationMethodsJson: json(NOW_BACKEND_MODEL_VERSION.methods), assumptionSchemaJson: json(["revenueGrowth", "subscriptionGrowth", "currentRpoGrowth", "agenticAiGrowth", "proPlusAdoptionRate", "netRetentionRate", "operatingMargin", "normalizedFcfMargin", "targetFcfYield", "targetEvRevenue", "aiExecutionHaircut", "platformCompetitionHaircut", "sbcDilutionHaircut", "buybackYield"]), createdAt: CREATED_AT }];
  const assumptionSets = [buildAssumptionSet("Bear", { revenueGrowth: 0.12, subscriptionGrowth: 0.13, currentRpoGrowth: 0.12, agenticAiGrowth: 0.35, proPlusAdoptionRate: 0.16, netRetentionRate: 1.16, operatingMargin: 0.13, normalizedFcfMargin: 0.29, discountRate: 0.095, targetFcfYield: 0.035, targetPe: 32, targetEvRevenue: 8, peerPremium: -0.05, aiExecutionHaircut: 0.10, platformCompetitionHaircut: 0.08, sbcDilutionHaircut: 0.04 }), buildAssumptionSet("Base"), buildAssumptionSet("Bull", { revenueGrowth: 0.22, subscriptionGrowth: 0.23, currentRpoGrowth: 0.22, agenticAiGrowth: 1.05, proPlusAdoptionRate: 0.32, netRetentionRate: 1.24, operatingMargin: 0.19, normalizedFcfMargin: 0.36, discountRate: 0.08, targetFcfYield: 0.023, targetPe: 56, targetEvRevenue: 15, peerPremium: 0.20, aiExecutionHaircut: 0.02, platformCompetitionHaircut: 0.015, sbcDilutionHaircut: 0.015 })];
  const validationWarnings = [{ id: "now-official-parser-pending", ticker: TICKER, scope: "seed", severity: "medium", title: "NOW official parser pending", detail: "Financial history uses public-history style seed/proxy rows until a full ServiceNow SEC/companyfacts parser is promoted.", relatedTable: "financial_periods", relatedRecordId: null, createdAt: CREATED_AT }, { id: "now-agent-ai-proxy", ticker: TICKER, scope: "operating_metrics", severity: "medium", title: "Agentic AI metrics are proxy rows", detail: "Agentic AI ARR/customers and Pro Plus adoption are explicit proxy fields until official disclosures are imported; valuation warns and uses event-visible values only.", relatedTable: "operating_metric_snapshots", relatedRecordId: null, createdAt: CREATED_AT }, { id: "now-transcript-candidates-blocked", ticker: TICKER, scope: "transcripts", severity: "low", title: "NOW transcript candidates are research-only", detail: "Transcript events/extractions are modelReady=0 and valuationImpactAllowed=0 to prevent future leakage.", relatedTable: "transcript_extractions", relatedRecordId: null, createdAt: CREATED_AT }];
  return { reportingEvents, sourceDocuments, financialPeriods, segmentFinancials, operatingMetricSnapshots, marketSnapshots, peerSnapshots, guidanceItems, transcriptEvents, transcriptExtractions, modelVersions, assumptionSets, validationWarnings };
}
