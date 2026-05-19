import type { DataSourceType, Scenario, SummaryMetric, ValuationResult, ValidationWarning } from "../types";
import { buildSensitivityTable } from "../../utils/chartHelpers";
import { computeExpectedShareholderCagr, computeUpsideDownside } from "../../utils/valuation";
import { defaultPltrValuationAssumptions, pltrScenarioDefinitions } from "./assumptions";
import { pltrData } from "./realData";
import { pltrSegmentGrowthHistory } from "./data/segmentGrowthHistory";
import type { PltrDashboardData, PltrDataset, PltrScenarioName, PltrSubmoduleInsight, PltrValuationAssumptions } from "./model";
import { calculateAipMonetizationEngine } from "./engines/aipMonetizationEngine";
import { calculateCustomerCohortEngine } from "./engines/customerCohortEngine";
import { calculateMarginLeverageEngine } from "./engines/marginLeverageEngine";
import { calculateOntologyMoatEngine } from "./engines/ontologyMoatEngine";
import { buildPltrQ1DeepDive } from "./engines/q1DeepDiveEngine";
import { buildPltrRiskRegister } from "./engines/riskEngine";
import { calculatePltrScenarioEngine, buildPltrScenarioAssumptions } from "./engines/scenarioEngine";
import { calculateSbcDilutionEngine } from "./engines/sbcDilutionEngine";
import { calculateTranscriptThemeEngine } from "./engines/transcriptThemeEngine";
import { calculatePltrValuationEngine } from "./engines/valuationEngine";
import { latestPeriod, metricValue, safeDivide } from "./engines/helpers";

type PltrRuntimeContext = {
  __pltrResolvedPeriod?: string;
  __pltrRequestedDataSourceType?: DataSourceType;
};

type PltrDatasetInput = PltrDataset & Partial<PltrRuntimeContext>;

function isPltrDataset(value: unknown): value is PltrDatasetInput {
  return Boolean(value && typeof value === "object" && "actuals" in value && "guidance" in value && "marketData" in value);
}

export function resolvePltrDataset(data: unknown): PltrDatasetInput {
  return isPltrDataset(data) ? data : pltrData;
}

export function attachPltrRuntimeContext(
  data: PltrDataset,
  context: { periodId?: string; dataSourceType?: DataSourceType },
): PltrDatasetInput {
  return {
    ...data,
    __pltrResolvedPeriod: context.periodId,
    __pltrRequestedDataSourceType: context.dataSourceType,
  };
}

export function getDefaultPltrPeriod(data: PltrDataset = pltrData) {
  return data.actuals[data.actuals.length - 1]?.periodId ?? "";
}

export function getPltrPeriods(data: PltrDataset = pltrData) {
  return data.actuals.map((period) => ({ value: period.periodId, label: period.label }));
}

export function resolvePltrPeriodFromData(data: unknown, fallback = getDefaultPltrPeriod()) {
  const dataset = resolvePltrDataset(data);
  const runtimePeriod = dataset.__pltrResolvedPeriod;
  if (runtimePeriod && dataset.actuals.some((period) => period.periodId === runtimePeriod)) return runtimePeriod;
  return dataset.actuals.some((period) => period.periodId === fallback) ? fallback : getDefaultPltrPeriod(dataset);
}

export function resolvePltrEffectiveDataSourceType(data: unknown): DataSourceType {
  const dataset = resolvePltrDataset(data);
  return dataset.__pltrRequestedDataSourceType === "manual" ? "manual" : "mock";
}

function metric(
  key: string,
  label: string,
  value: number,
  delta: number | undefined,
  format: SummaryMetric["format"],
  description: string,
  badge: SummaryMetric["badge"],
): SummaryMetric {
  return { key, label, value, delta, format, description, badge };
}

function activeActual(dataset: PltrDatasetInput, periodId: string) {
  return dataset.actuals.find((period) => period.periodId === periodId) ?? latestPeriod(dataset.actuals);
}

function scenarioDefinition(name: PltrScenarioName) {
  return pltrScenarioDefinitions.find((definition) => definition.name === name) ?? pltrScenarioDefinitions[1];
}

function pct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function usd(value: number | null | undefined, suffix = "M") {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 1 })}${suffix}`;
}

function multiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(1)}x`;
}

function numberLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function lastItem<T>(items: T[]) {
  return items[items.length - 1];
}

function metricSourceSummary(period: PltrDashboardData["latestActual"], keys: string[]) {
  return keys
    .map((key) => {
      const metricRecord = period.metrics[key];
      if (!metricRecord) return `${key}: missing`;
      return `${metricRecord.label}: ${metricRecord.sourceConfidence}/${metricRecord.sourceType}`;
    })
    .join("; ");
}

function evidenceStrengthForMetrics(
  period: PltrDashboardData["latestActual"],
  keys: string[],
): PltrSubmoduleInsight["evidenceStrength"] {
  const confidences = keys.map((key) => period.metrics[key]?.sourceConfidence ?? "todo");
  if (confidences.some((confidence) => confidence === "todo")) return "Source Gap";
  if (confidences.some((confidence) => confidence === "low")) return "Low";
  if (confidences.some((confidence) => confidence === "medium")) return "Medium";
  return "High";
}

function evidenceStrengthForMarket(data: PltrDatasetInput): PltrSubmoduleInsight["evidenceStrength"] {
  if (data.marketData.sourceConfidence === "high") return "High";
  if (data.marketData.sourceConfidence === "medium") return "Medium";
  if (data.marketData.sourceConfidence === "low") return "Low";
  return "Source Gap";
}

function numericRowValue(row: Record<string, number | string | null> | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function topTranscriptTopics(topicTrends: PltrDashboardData["transcript"]["topicTrends"]) {
  const totals = new Map<string, number>();
  for (const row of topicTrends) {
    totals.set(row.topic, (totals.get(row.topic) ?? 0) + row.mentions);
  }
  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([topic, mentions]) => `${topic} (${mentions})`)
    .join(", ");
}

function buildPltrSubmoduleInsights({
  dataset,
  aip,
  ontology,
  cohorts,
  ruleOf40,
  sbc,
  transcript,
  q1DeepDive,
  risks,
  valuationEngine,
  scenarioOutputs,
}: {
  dataset: PltrDatasetInput;
  aip: PltrDashboardData["aip"];
  ontology: PltrDashboardData["ontology"];
  cohorts: PltrDashboardData["cohorts"];
  ruleOf40: PltrDashboardData["ruleOf40"];
  sbc: PltrDashboardData["sbc"];
  transcript: PltrDashboardData["transcript"];
  q1DeepDive: PltrDashboardData["q1DeepDive"];
  risks: PltrDashboardData["risks"];
  valuationEngine: ReturnType<typeof calculatePltrValuationEngine>;
  scenarioOutputs: PltrDashboardData["scenarios"];
}): PltrSubmoduleInsight[] {
  const loadedLatest = latestPeriod(dataset.actuals);
  const priorYear = dataset.actuals.find(
    (period) => period.fiscalYear === loadedLatest.fiscalYear - 1 && period.fiscalQuarter === loadedLatest.fiscalQuarter,
  );
  const latestCohort = lastItem(cohorts.rows);
  const priorYearCohort = cohorts.rows.find((row) => row.period === priorYear?.label);
  const latestRule = lastItem(ruleOf40);
  const latestSbc = lastItem(sbc.rows);
  const latestSegmentGrowth = lastItem(pltrSegmentGrowthHistory);
  const baseScenario = scenarioOutputs.find((item) => item.scenario === "Base");
  const bearScenario = scenarioOutputs.find((item) => item.scenario === "Bear");
  const bullScenario = scenarioOutputs.find((item) => item.scenario === "Bull");
  const hyperBullScenario = scenarioOutputs.find((item) => item.scenario === "Hyper Bull");
  const highSeverityRisks = risks.filter((risk) => risk.severity === "High");

  const revenue = metricValue(loadedLatest, "revenue");
  const yoyRevenueGrowth = metricValue(loadedLatest, "yoyRevenueGrowth");
  const qoqRevenueGrowth = metricValue(loadedLatest, "qoqRevenueGrowth");
  const ruleOf40Value = metricValue(loadedLatest, "ruleOf40");
  const adjustedOperatingMargin = metricValue(loadedLatest, "adjustedOperatingMargin");
  const gaapOperatingMargin = metricValue(loadedLatest, "gaapOperatingMargin");
  const adjustedVsGaapMarginGap = adjustedOperatingMargin - gaapOperatingMargin;
  const fcfMargin = metricValue(loadedLatest, "fcfMargin");
  const sbcAsPctRevenue = metricValue(loadedLatest, "sbcAsPctRevenue");
  const commercialRevenue = metricValue(loadedLatest, "commercialRevenue");
  const governmentRevenue = metricValue(loadedLatest, "governmentRevenue");
  const commercialMix = safeDivide(commercialRevenue, revenue);
  const governmentMix = safeDivide(governmentRevenue, revenue);
  const usCommercialGrowth = metricValue(loadedLatest, "usCommercialGrowth");
  const usCommercialCustomers = metricValue(loadedLatest, "usCommercialCustomerCount");
  const priorUsCommercialCustomers = priorYear ? metricValue(priorYear, "usCommercialCustomerCount") : 0;
  const usCommercialCustomerGrowth = priorUsCommercialCustomers ? usCommercialCustomers / priorUsCommercialCustomers - 1 : null;
  const commercialRevenuePerCustomer = safeDivide(
    metricValue(loadedLatest, "commercialRevenue"),
    metricValue(loadedLatest, "commercialCustomerCount"),
  );
  const priorCommercialRevenuePerCustomer = numericRowValue(priorYearCohort, "commercialRevenuePerCommercialCustomer");
  const revenuePerCustomerGrowth = priorCommercialRevenuePerCustomer
    ? commercialRevenuePerCustomer / priorCommercialRevenuePerCustomer - 1
    : null;
  const customerCount = numericRowValue(latestCohort, "customerCount");
  const commercialCustomers = numericRowValue(latestCohort, "commercialCustomers");
  const netDollarRetention = metricValue(loadedLatest, "netDollarRetention");
  const largeDeals10m = metricValue(loadedLatest, "largeDeals10m");
  const shareGrowth = numericRowValue(latestSbc, "yoyShareCountGrowth");
  const perShareFcf = numericRowValue(latestSbc, "perShareFcf");
  const reverse = valuationEngine.reverseDcf;
  const latestFairValue = valuationEngine.selectedFairValue;
  const scenarioSpread =
    bearScenario?.fairValuePerShare != null && bullScenario?.fairValuePerShare != null
      ? bullScenario.fairValuePerShare - bearScenario.fairValuePerShare
      : null;
  const latestTopics = topTranscriptTopics(transcript.topicTrends);
  const transcriptCoverage =
    transcript.events.length >= 8 && transcript.events.slice(0, 8).every((event) => event.status === "parsed")
      ? "last eight events parsed"
      : "coverage gap remains";

  return [
    {
      id: "pltr-overview-insight",
      module: "Overview",
      tab: "overview",
      stance: "Mixed",
      evidenceStrength: evidenceStrengthForMetrics(loadedLatest, [
        "revenue",
        "yoyRevenueGrowth",
        "ruleOf40",
        "gaapOperatingMargin",
        "sbcAsPctRevenue",
      ]),
      keyQuestion: "Is PLTR becoming a durable AI operating layer, or is the narrative outpacing shareholder economics?",
      keyInsight: `${loadedLatest.label} combines ${pct(yoyRevenueGrowth)} revenue growth, ${pct(ruleOf40Value)} Rule of 40, and ${pct(gaapOperatingMargin)} GAAP operating margin. The evidence supports exceptional operating momentum, but it is not enough by itself to underwrite the stock.`,
      dataReadThrough: `Adjusted operating margin is ${pct(adjustedOperatingMargin)} versus GAAP operating margin of ${pct(gaapOperatingMargin)}, a ${pct(adjustedVsGaapMarginGap)} spread. SBC remains ${pct(sbcAsPctRevenue)} of revenue, so the research question is per-share compounding, not only company-level growth.`,
      modelImplication:
        "Keep the thesis separated from valuation. Momentum can justify explicit revenue, margin, or dilution assumptions only when the analyst changes them; no AIP or ontology score should flow directly into fair value.",
      falsifier:
        "Revenue growth slows before SBC/revenue and dilution improve, leaving adjusted Rule of 40 as a narrative metric rather than shareholder value creation.",
      sourceQuality: metricSourceSummary(loadedLatest, [
        "revenue",
        "yoyRevenueGrowth",
        "ruleOf40",
        "gaapOperatingMargin",
        "sbcAsPctRevenue",
      ]),
    },
    {
      id: "pltr-q1-deep-dive-insight",
      module: "Q1 2026 Deep Dive",
      tab: "q1-2026-deep-dive",
      stance: "Constructive",
      evidenceStrength: "Medium",
      keyQuestion: "Did Q1 2026 prove that AIP demand is showing up in reported financials and guidance?",
      keyInsight: `${q1DeepDive.periodLabel} is the current proof quarter: revenue was ${usd(revenue)}, YoY growth was ${pct(yoyRevenueGrowth)}, QoQ growth was ${pct(qoqRevenueGrowth)}, and net dollar retention was ${pct(netDollarRetention)}.`,
      dataReadThrough: `The deep dive separates ${q1DeepDive.officialReported.length} official metrics, ${q1DeepDive.derivedMetrics.length} derived metrics, ${q1DeepDive.whatChangedVsQ4.length} Q4 comparison items, transcript evidence, and valuation implications. FY 2026 guidance revenue midpoint is ${usd(metricValue(loadedLatest, "guidanceRevenue"))} and adjusted FCF guidance midpoint is ${usd(metricValue(loadedLatest, "guidanceFcf"))}.`,
      modelImplication:
        "Q1 can support higher commercial CAGR or FCF assumptions, but Q4 comparison fields still include chart-derived values. Treat this as strong evidence with explicit source caveats, not a free valuation upgrade.",
      falsifier:
        "The next reported quarters miss or merely match raised guidance while customer expansion and NDR weaken from the Q1 baseline.",
      sourceQuality:
        "Official Q1 business update and SEC seed metrics are high-confidence for headline items; some Q4 comparison and chart-derived values remain medium-confidence until filing extraction is refreshed.",
    },
    {
      id: "pltr-segments-insight",
      module: "Business Segments",
      tab: "business-segments",
      stance: "Constructive",
      evidenceStrength: "Medium",
      keyQuestion: "Is growth broadening across commercial and government rather than depending on one narrow AIP window?",
      keyInsight: `${loadedLatest.label} revenue mix is ${pct(commercialMix)} commercial and ${pct(governmentMix)} government. The latest segment history shows commercial YoY growth of ${pct(latestSegmentGrowth?.commercialYoyGrowth)} and government YoY growth of ${pct(latestSegmentGrowth?.governmentYoyGrowth)}.`,
      dataReadThrough: `Commercial revenue is ${usd(commercialRevenue)} and government revenue is ${usd(governmentRevenue)}. Sequentially, latest commercial growth is ${pct(latestSegmentGrowth?.commercialQoqGrowth)} while government growth is ${pct(latestSegmentGrowth?.governmentQoqGrowth)}, so the module should track both AIP-led commercial momentum and mission-market durability.`,
      modelImplication:
        "Do not model PLTR as a single revenue CAGR. Segment paths should separate commercial conversion, government procurement cadence, and international versus US mix where data is available.",
      falsifier:
        "Commercial growth stays high only because of a few large deals while government normalizes and segment revenue no longer reconciles cleanly to total revenue.",
      sourceQuality:
        "Latest actual segment metrics come from official Q1 business update seeds; Q2 2024 to Q1 2026 segment growth history is sourced from local transcript extractions and should be refreshed with filing-backed segment tables.",
    },
    {
      id: "pltr-aip-engine-insight",
      module: "AIP Engine",
      tab: "aip-engine",
      stance: "Constructive",
      evidenceStrength: evidenceStrengthForMetrics(loadedLatest, [
        "usCommercialRevenue",
        "usCommercialGrowth",
        "usCommercialCustomerCount",
        "largeDeals10m",
      ]),
      keyQuestion: "Is AIP converting from bootcamps and product excitement into measurable commercial monetization?",
      keyInsight: `AIP evidence is strongest in US commercial: latest US commercial revenue growth is ${pct(usCommercialGrowth)}, US commercial customer growth is ${pct(usCommercialCustomerGrowth)}, and there were ${numberLabel(largeDeals10m)} deals of at least $10M.`,
      dataReadThrough: `Commercial revenue per commercial customer is ${usd(commercialRevenuePerCustomer)} per quarter, with YoY growth of ${pct(revenuePerCustomerGrowth)} where comparable data exists. The AIP score is ${aip.score}/100, but it remains a research score, not a valuation input.`,
      modelImplication:
        "AIP should influence the model only through explicit commercial revenue CAGR, retention, pricing, sales efficiency, margin, or dilution assumptions.",
      falsifier:
        "AIP mentions and demo activity increase while US commercial revenue growth, large-deal count, or revenue per customer deteriorate.",
      sourceQuality: metricSourceSummary(loadedLatest, [
        "usCommercialRevenue",
        "usCommercialGrowth",
        "usCommercialCustomerCount",
        "largeDeals10m",
      ]),
    },
    {
      id: "pltr-ontology-moat-insight",
      module: "Ontology Moat",
      tab: "ontology-moat",
      stance: "Constructive",
      evidenceStrength: "Medium",
      keyQuestion: "Is the ontology a true workflow control layer or just a services-heavy integration wrapper?",
      keyInsight: `The ontology moat score is ${ontology.score}/100, with the strongest factors in mission-critical use cases, permission/governance complexity, data integration depth, and workflow embedding.`,
      dataReadThrough: `The moat case is qualitative: ${ontology.factors.map((factor) => `${factor.label} ${factor.score}/100`).join("; ")}. This is powerful thesis scaffolding, but it still needs renewal, expansion, retention, and pricing evidence to become financial proof.`,
      modelImplication:
        "Moat strength should map into lower churn, higher NDR, better pricing, or more durable terminal margins. It should not raise the terminal multiple without observable commercial proof.",
      falsifier:
        "Customers keep AIP or Foundry in narrow workflows, hyperscalers replicate governance controls, or deployments require too much services intensity to scale profitably.",
      sourceQuality:
        "Based on official Palantir platform and ontology documentation plus research interpretation. Customer-level expansion evidence is incomplete in the local dataset.",
    },
    {
      id: "pltr-customer-cohorts-insight",
      module: "Customer Cohorts",
      tab: "customer-cohorts",
      stance: "Mixed",
      evidenceStrength: evidenceStrengthForMetrics(loadedLatest, [
        "customerCount",
        "commercialCustomerCount",
        "usCommercialCustomerCount",
        "netDollarRetention",
      ]),
      keyQuestion: "Is growth broad-based land-and-expand, or concentrated in a smaller group of large accounts?",
      keyInsight: `Latest customer count is ${numberLabel(customerCount)}, commercial customers are ${numberLabel(commercialCustomers)}, and NDR is ${pct(netDollarRetention)}. This supports broadening adoption, but concentration is still not fully visible.`,
      dataReadThrough: `Revenue per total customer is ${usd(numericRowValue(latestCohort, "revenuePerCustomer"))}; commercial revenue per commercial customer is ${usd(numericRowValue(latestCohort, "commercialRevenuePerCommercialCustomer"))}. The module flags top-customer concentration and full NDR history as required diligence.`,
      modelImplication:
        "Sustained NDR and revenue per customer can support higher retention and pricing assumptions. Without concentration data, do not overfit one quarter of large-deal strength into long-term CAGR.",
      falsifier:
        "Customer count grows but revenue per customer and NDR fall, indicating smaller logos or lower expansion rather than durable enterprise-wide deployment.",
      sourceQuality: metricSourceSummary(loadedLatest, [
        "customerCount",
        "commercialCustomerCount",
        "usCommercialCustomerCount",
        "netDollarRetention",
      ]),
    },
    {
      id: "pltr-rule-of-40-insight",
      module: "Rule of 40",
      tab: "rule-of-40",
      stance: "Mixed",
      evidenceStrength: evidenceStrengthForMetrics(loadedLatest, [
        "yoyRevenueGrowth",
        "adjustedOperatingMargin",
        "gaapOperatingMargin",
        "ruleOf40",
      ]),
      keyQuestion: "Is PLTR showing real operating leverage after adjusting for the quality of margins?",
      keyInsight: `The latest Rule of 40 is ${pct(ruleOf40Value)} from ${pct(yoyRevenueGrowth)} revenue growth and ${pct(adjustedOperatingMargin)} adjusted operating margin. GAAP operating margin is ${pct(gaapOperatingMargin)}, so quality-of-margin remains a core debate.`,
      dataReadThrough: `The latest rule-of-40 row shows adjusted operating income of ${usd(numericRowValue(latestRule, "adjustedOperatingIncome"))} and GAAP operating income of ${usd(numericRowValue(latestRule, "gaapOperatingIncome"))}. FCF margin is ${pct(fcfMargin)}, which is strong but should be checked against SBC and share count.`,
      modelImplication:
        "Operating leverage should raise fair value only if it survives GAAP margin, FCF conversion, and per-share tests. Adjusted margin alone should not drive the terminal multiple.",
      falsifier:
        "Adjusted margin expands while GAAP margin, FCF margin, or per-share FCF stagnate, implying exclusions are doing too much of the work.",
      sourceQuality: metricSourceSummary(loadedLatest, [
        "yoyRevenueGrowth",
        "adjustedOperatingMargin",
        "gaapOperatingMargin",
        "ruleOf40",
      ]),
    },
    {
      id: "pltr-sbc-dilution-insight",
      module: "SBC / Dilution",
      tab: "sbc-dilution",
      stance: "Caution",
      evidenceStrength: evidenceStrengthForMetrics(loadedLatest, [
        "sbcExpense",
        "sbcAsPctRevenue",
        "dilutedShareCount",
        "adjustedFreeCashFlow",
      ]),
      keyQuestion: "Is operating progress accruing to outside shareholders after stock compensation and dilution?",
      keyInsight: `SBC expense is ${usd(metricValue(loadedLatest, "sbcExpense"))}, SBC/revenue is ${pct(sbcAsPctRevenue)}, and diluted share count growth is ${pct(shareGrowth)} where a YoY comparison exists.`,
      dataReadThrough: `Adjusted FCF is ${usd(metricValue(loadedLatest, "adjustedFreeCashFlow"))}; per-share FCF proxy is ${usd(perShareFcf, "")}. The module correctly warns that company-level FCF can overstate shareholder economics if dilution persists.`,
      modelImplication:
        "Bear/Base/Bull scenarios should vary normalized SBC and dilution assumptions, not just revenue growth or exit multiples.",
      falsifier:
        "SBC dollars rise with revenue and share count keeps climbing, meaning operating leverage accrues disproportionately to employees.",
      sourceQuality: metricSourceSummary(loadedLatest, [
        "sbcExpense",
        "sbcAsPctRevenue",
        "dilutedShareCount",
        "adjustedFreeCashFlow",
      ]),
    },
    {
      id: "pltr-valuation-insight",
      module: "Valuation",
      tab: "valuation",
      stance: "Caution",
      evidenceStrength: evidenceStrengthForMarket(dataset),
      keyQuestion: "What assumptions are already priced in, and is fair value being anchored to the current stock price?",
      keyInsight: `The equal-weight current-method fair value is ${usd(latestFairValue, "")}. Reverse DCF says the selected price requires ${pct(reverse.requiredRevenueCagr)} revenue CAGR, ${pct(reverse.requiredFcfMargin)} FCF margin, or a ${multiple(reverse.requiredTerminalMultiple)} exit multiple under selected assumptions.`,
      dataReadThrough: `Current EV/revenue is ${multiple(reverse.currentEvToRevenue)}, current EV/FCF is ${multiple(reverse.currentEvToFcf)}, and implied five-year dilution drag is ${pct(reverse.impliedDilutionDrag)}. The model classifies current implied expectations as "${reverse.marketImpliedExecutionRequirement}".`,
      modelImplication:
        "Current price is used only for reverse DCF, upside/downside, and return math. Fair value still comes from explicit revenue, margin, multiple, net cash, WACC, and dilution assumptions.",
      falsifier:
        "The stock requires speculative hyper-growth assumptions even after source refresh, while actual revenue growth, margin, and dilution trend below the implied path.",
      sourceQuality: `Market price: ${dataset.marketData.sourceConfidence}/${dataset.marketData.sourceType}; ${dataset.marketData.notes}`,
    },
    {
      id: "pltr-historical-valuation-insight",
      module: "Historical Valuation",
      tab: "valuation",
      stance: "Mixed",
      evidenceStrength: "Medium",
      keyQuestion: "Do historical valuation rows avoid future leakage and price anchoring?",
      keyInsight:
        "The historical valuation panel rebuilds reporting-event rows from event-visible actuals, trailing revenue bases, event-visible guidance where available, and selected assumptions. Backend rows currently add SQLite as-of price anchors rather than replacing the frontend valuation engine.",
      dataReadThrough: `The visible module covers the latest eight reporting events and merges backend price anchors when the API is online. Local fallback rows explicitly warn when event prices are unavailable or when annualized revenue proxies are used.`,
      modelImplication:
        "This protects the backtest from using current assumptions as historical facts, but full backend-persisted fair value runs remain a future upgrade.",
      falsifier:
        "Historical rows silently reuse latest-period guidance, current price, or current market multiples for older events without visible warnings.",
      sourceQuality:
        "Backend pilot supports PLTR reporting events and daily price anchors in SQLite; fair value calculations remain frontend-generated with visible source-treatment warnings.",
    },
    {
      id: "pltr-scenario-lab-insight",
      module: "Scenario Lab",
      tab: "scenario-lab",
      stance: "Mixed",
      evidenceStrength: "Medium",
      keyQuestion: "Do Bear/Base/Bull cases reflect different business mechanisms rather than scalar multipliers?",
      keyInsight: `Scenario spread is ${usd(scenarioSpread, "")} between Bear and Bull fair value per share. Base fair value is ${usd(baseScenario?.fairValuePerShare, "")}; Hyper Bull fair value is ${usd(hyperBullScenario?.fairValuePerShare, "")} and is explicitly marked speculative.`,
      dataReadThrough: `Base year-five revenue is ${usd(baseScenario?.revenuePath[baseScenario.revenuePath.length - 1]?.revenue)}, with FCF/share of ${usd(baseScenario?.fcfPerShare, "")}. Bear, Base, Bull, and Hyper Bull vary commercial growth, government growth, margin, SBC, dilution, and terminal multiple assumptions.`,
      modelImplication:
        "Use the scenario lab to debate mechanisms: AIP conversion, government durability, margin quality, dilution normalization, and exit multiple. Avoid using one blanket multiplier to create scenarios.",
      falsifier:
        "Scenario outputs converge because only a scalar multiple changes, or Hyper Bull becomes the default underwriting case without matching source evidence.",
      sourceQuality:
        "Scenario outputs are forecast assumptions generated from documented PLTR assumption presets. They are not consensus estimates or market-implied facts.",
    },
    {
      id: "pltr-transcript-lab-insight",
      module: "Transcript Lab",
      tab: "transcript-lab",
      stance: "Mixed",
      evidenceStrength: transcriptCoverage === "last eight events parsed" ? "Medium" : "Source Gap",
      keyQuestion: "How has the earnings-call debate evolved, and which topics are evidence rather than valuation inputs?",
      keyInsight: `Transcript lab has ${transcript.events.length} events, ${transcript.qaPairs.length} parsed Q&A pairs, and ${transcriptCoverage}. Top tracked topics are ${latestTopics || "N/A"}.`,
      dataReadThrough:
        "The transcript trend supports a shift from proof-of-AIP toward durability, government/defense timing, margin quality, SBC, and valuation discipline. All Q&A pairs remain modelReady=false and valuationImpactAllowed=false.",
      modelImplication:
        "Topic frequency and tone can guide diligence priorities, but they must be mapped into explicit numeric assumptions before affecting valuation.",
      falsifier:
        "Management commentary stays bullish while analysts repeatedly probe conversion, competition, defense timing, or margin quality and the reported KPIs stop confirming the narrative.",
      sourceQuality:
        "Eight-quarter local transcript extractions and topic tags are available; transcript evidence is research-only and should be refreshed when new calls are parsed.",
    },
    {
      id: "pltr-risk-red-team-insight",
      module: "Risk Red Team",
      tab: "risk-red-team",
      stance: "Adversarial",
      evidenceStrength: "Medium",
      keyQuestion: "What would make PLTR a narrative stock despite excellent reported results?",
      keyInsight: `The risk register contains ${risks.length} risks, including ${highSeverityRisks.length} high-severity items: ${highSeverityRisks.map((risk) => risk.title).join(", ")}.`,
      dataReadThrough:
        "The highest-quality red flags are valuation compression, AIP conversion risk, competition, and SBC/dilution because each can be monitored with KPIs already present in the module.",
      modelImplication:
        "Risk evidence should veto assumption upgrades unless the same module shows confirming data. High growth with rising dilution or unsupported terminal multiple should push scenarios toward Bear or Base.",
      falsifier:
        "Risk triggers improve for several quarters at once: commercial growth remains high, NDR holds, government growth stays durable, SBC/revenue falls, and reverse DCF moves out of speculative territory.",
      sourceQuality:
        "Risk register is research interpretation grounded in module KPIs, reverse DCF outputs, and transcript topics. It is not an external consensus risk ranking.",
    },
    {
      id: "pltr-pm-memo-insight",
      module: "PM Memo",
      tab: "pm-memo",
      stance: "Caution",
      evidenceStrength: "Medium",
      keyQuestion: "What is the decision-ready framing for a portfolio manager?",
      keyInsight:
        "The clean PM view is watchlist / valuation discipline: operating momentum is exceptional, but underwriting must decide whether the current price already discounts extreme growth, margin, and dilution improvement.",
      dataReadThrough: `The PM memo should anchor on US commercial growth of ${pct(usCommercialGrowth)}, Rule of 40 of ${pct(ruleOf40Value)}, SBC/revenue of ${pct(sbcAsPctRevenue)}, and reverse DCF required revenue CAGR of ${pct(reverse.requiredRevenueCagr)}.`,
      modelImplication:
        "Before capital commitment, refresh source data, validate price inputs, make explicit Bear/Base/Bull assumption deltas, and require monitoring triggers for NDR, large deals, GAAP margin, and dilution.",
      falsifier:
        "A PM memo becomes bullish only because the product narrative is compelling, without a margin-of-safety entry framework or disconfirming evidence plan.",
      sourceQuality:
        "Synthesis from the PLTR module. It is research assistance, not a recommendation; market data and source gaps are visible elsewhere in the dashboard.",
    },
  ];
}

function valuationAssumptionsWithLatest(
  dataset: PltrDatasetInput,
  overrides?: Partial<PltrValuationAssumptions>,
): PltrValuationAssumptions {
  const latest = latestPeriod(dataset.actuals);
  const guidanceRevenue = metricValue(latest, "guidanceRevenue") || defaultPltrValuationAssumptions.baseRevenue;
  const netCash = metricValue(latest, "netCash") || dataset.marketData.netCash || defaultPltrValuationAssumptions.netCash;
  const currentPrice = dataset.marketData.currentPrice || defaultPltrValuationAssumptions.currentPrice;
  return {
    ...defaultPltrValuationAssumptions,
    baseRevenue: guidanceRevenue,
    netCash,
    currentPrice,
    ...(overrides ?? {}),
  };
}

export function calculatePltrSummary(data: unknown): SummaryMetric[] {
  const dataset = resolvePltrDataset(data);
  const latest = latestPeriod(dataset.actuals);
  const priorYear = dataset.actuals.find(
    (period) => period.fiscalYear === latest.fiscalYear - 1 && period.fiscalQuarter === latest.fiscalQuarter,
  );
  return [
    metric(
      "revenue",
      "Revenue",
      metricValue(latest, "revenue"),
      priorYear ? metricValue(latest, "revenue") - metricValue(priorYear, "revenue") : undefined,
      "currency",
      `${latest.label} reported revenue in USD millions.`,
      latest.metrics.revenue.sourceConfidence === "high" ? "Actual" : "Needs Review",
    ),
    metric(
      "us-commercial-growth",
      "US Commercial Growth",
      metricValue(latest, "usCommercialGrowth"),
      undefined,
      "percent",
      "US commercial revenue growth is the clearest reported indicator of AIP commercial conversion.",
      "Actual",
    ),
    metric(
      "rule-of-40",
      "Rule of 40",
      metricValue(latest, "ruleOf40"),
      undefined,
      "percent",
      "Reported Rule of 40 combines YoY revenue growth and adjusted operating margin.",
      "Actual",
    ),
    metric(
      "sbc-as-revenue",
      "SBC / Revenue",
      metricValue(latest, "sbcAsPctRevenue"),
      undefined,
      "percent",
      "Stock-based compensation as a percent of revenue. This is central to the per-share debate.",
      "Derived",
    ),
  ];
}

export function buildPltrDashboardData(
  data: unknown,
  periodId = getDefaultPltrPeriod(),
  scenario: Scenario = "Base",
  overrides?: Partial<PltrValuationAssumptions>,
): PltrDashboardData {
  const dataset = resolvePltrDataset(data);
  const latestActual = activeActual(dataset, periodId);
  const baseAssumptions = valuationAssumptionsWithLatest(dataset, overrides);
  const scenarioAssumptions = buildPltrScenarioAssumptions(baseAssumptions, scenarioDefinition(scenario));
  const valuationEngine = calculatePltrValuationEngine(dataset.actuals, scenarioAssumptions);
  const scenarioOutputs = calculatePltrScenarioEngine(dataset.actuals, baseAssumptions, pltrScenarioDefinitions);
  const aip = calculateAipMonetizationEngine(dataset.actuals, dataset.researchSignals, dataset.topicTrends);
  const ontology = calculateOntologyMoatEngine();
  const cohorts = calculateCustomerCohortEngine(dataset.actuals);
  const ruleOf40 = calculateMarginLeverageEngine(dataset.actuals);
  const sbc = calculateSbcDilutionEngine(dataset.actuals);
  const transcript = calculateTranscriptThemeEngine(dataset.transcriptEvents, dataset.qaPairs, dataset.topicTrends);
  const q1DeepDive = buildPltrQ1DeepDive(dataset, valuationEngine.reverseDcf);
  const risks = buildPltrRiskRegister();

  const scenarioFairValues = scenarioOutputs
    .filter((item) => item.scenario !== "Hyper Bull")
    .map((item) => ({
      scenario: item.scenario,
      fairValue: item.fairValuePerShare,
      upsideDownside: computeUpsideDownside(item.fairValuePerShare, baseAssumptions.currentPrice),
      expectedReturn3Y: computeExpectedShareholderCagr(item.fairValuePerShare, baseAssumptions.currentPrice, 0),
      summary: item.summary,
    }));

  const warnings: ValidationWarning[] = [
    ...dataset.dataStatus.warnings,
    ...valuationEngine.warnings,
    ...aip.warnings,
    ...cohorts.warnings,
    ...transcript.warnings,
  ];
  const submoduleInsights = buildPltrSubmoduleInsights({
    dataset,
    aip,
    ontology,
    cohorts,
    ruleOf40,
    sbc,
    transcript,
    q1DeepDive,
    risks,
    valuationEngine,
    scenarioOutputs,
  });

  return {
    latestActual,
    actuals: dataset.actuals,
    guidance: dataset.guidance,
    marketData: dataset.marketData,
    sources: dataset.sources,
    valuation: {
      methods: valuationEngine.methods,
      fairValues: scenarioFairValues,
      reverseDcf: valuationEngine.reverseDcf,
      selectedFairValue: valuationEngine.selectedFairValue,
      warnings,
    },
    scenarios: scenarioOutputs,
    aip,
    ontology,
    cohorts,
    ruleOf40,
    sbc,
    transcript,
    q1DeepDive,
    risks,
    submoduleInsights,
  };
}

export function calculatePltrValuation(
  data: unknown,
  assumptions?: Partial<PltrValuationAssumptions>,
  scenario: Scenario = "Base",
): ValuationResult {
  const dataset = resolvePltrDataset(data);
  const baseAssumptions = valuationAssumptionsWithLatest(dataset, assumptions);
  const scenarioAssumptions = buildPltrScenarioAssumptions(baseAssumptions, scenarioDefinition(scenario));
  const engine = calculatePltrValuationEngine(dataset.actuals, scenarioAssumptions);
  const scenarioOutputs = calculatePltrScenarioEngine(dataset.actuals, baseAssumptions, pltrScenarioDefinitions).filter(
    (item) => item.scenario !== "Hyper Bull",
  );
  const fairValues = scenarioOutputs.map((item) => ({
    scenario: item.scenario as Scenario,
    fairValue: item.fairValuePerShare,
    upsideDownside: computeUpsideDownside(item.fairValuePerShare, baseAssumptions.currentPrice),
    expectedReturn3Y: computeExpectedShareholderCagr(item.fairValuePerShare, baseAssumptions.currentPrice, 0),
    targetPrice3Y: item.fairValuePerShare,
    summary: item.summary,
  }));

  return {
    warning: "PLTR valuation is highly sensitive to growth, margin, SBC normalization, dilution, and terminal multiple. AIP and ontology scores are research-only.",
    currentPrice: baseAssumptions.currentPrice,
    priceDate: dataset.marketData.priceDate,
    validationWarnings: [...dataset.dataStatus.warnings, ...engine.warnings],
    fairValues,
    methodCards: engine.methods.map((method) => ({
      key: method.key,
      label: method.label,
      value: method.fairValue,
      format: "currency" as const,
      description: method.description,
    })),
    expectedReturnBridge: [
      {
        key: "revenue-cagr",
        label: "Revenue CAGR",
        value: scenarioAssumptions.revenueCagrYears1To5,
        format: "percent" as const,
        description: "Explicit five-year revenue CAGR assumption.",
      },
      {
        key: "fcf-margin",
        label: "FCF Margin",
        value: scenarioAssumptions.fcfMargin,
        format: "percent" as const,
        description: "Company-level FCF margin before per-share dilution check.",
      },
      {
        key: "dilution-rate",
        label: "Dilution Rate",
        value: scenarioAssumptions.dilutionRate,
        format: "percent" as const,
        description: "Annual diluted share-count growth assumption.",
      },
      {
        key: "terminal-multiple",
        label: "Terminal Multiple",
        value: scenarioAssumptions.terminalMultiple,
        format: "multiple" as const,
        description: "Exit FCF multiple used in long-term FCF per-share scenario value.",
      },
    ],
    customSummary: `Reverse DCF requires ${(engine.reverseDcf.requiredRevenueCagr * 100).toFixed(1)}% five-year revenue CAGR, ${(engine.reverseDcf.requiredFcfMargin * 100).toFixed(1)}% FCF margin, or ${engine.reverseDcf.requiredTerminalMultiple.toFixed(1)}x terminal FCF multiple to justify the current price under the selected assumptions.`,
    sensitivityTables: [
      {
        title: "DCF value by revenue CAGR and FCF margin",
        table: buildSensitivityTable(
          "Revenue CAGR",
          "FCF margin",
          [0.18, 0.24, 0.3, 0.36, 0.42],
          [0.28, 0.36, 0.44, 0.52, 0.6],
          (growth, margin) =>
            calculatePltrValuationEngine(dataset.actuals, {
              ...scenarioAssumptions,
              revenueCagrYears1To5: growth,
              fcfMargin: margin,
            }).selectedFairValue,
        ),
      },
    ],
    dcfValue: engine.methods.find((method) => method.key === "dcf")?.fairValue,
    fcfFairValue: engine.methods.find((method) => method.key === "ev-fcf")?.fairValue,
    recommendedFairValue: engine.selectedFairValue,
    recommendedFairValueMethod: "Equal-weight PLTR valuation triangulation",
    recommendedFairValueReason:
      "PLTR is valued through revenue multiple, EV/FCF, DCF, Rule-of-40 implied multiple, and long-term FCF per-share methods because the debate is multi-variable and valuation-led.",
    valuationRangeLow: fairValues.find((item) => item.scenario === "Bear")?.fairValue,
    valuationRangeBase: fairValues.find((item) => item.scenario === "Base")?.fairValue,
    valuationRangeHigh: fairValues.find((item) => item.scenario === "Bull")?.fairValue,
    blendedFairValue: engine.selectedFairValue,
    upsideDownside: computeUpsideDownside(engine.selectedFairValue, baseAssumptions.currentPrice),
  };
}
