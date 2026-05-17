import type {
  PltrActualQuarter,
  PltrDataset,
  PltrEvidenceLayer,
  PltrMetric,
  PltrMetricUnit,
  PltrQ1DeepDiveData,
  PltrQ1DeepDiveMetric,
  PltrQ1DeepDiveTextItem,
  PltrReverseDcf,
  PltrSourceConfidence,
  PltrSourceType,
  PltrTranscriptTopic,
} from "../model";
import { metricValue, safeDivide } from "./helpers";

const Q1_2026_EARNINGS_RELEASE =
  "https://investors.palantir.com/news-details/2026/Palantir-Reports-Q1-2026-U-S--Revenue-Growth-of-104-YY-and-Revenue-Growth-of-85-YY-Raises-FY-2026-Revenue-Guidance-to-71-YY-Growth-and-U-S--Comm-Revenue-Guidance-to-120-YY-Crushing-Consensus-Expectations/";
const Q1_2026_BUSINESS_UPDATE = "https://investors.palantir.com/files/Palantir%20-%20Q1%202026%20Business%20Update.pdf";
const Q1_2026_10Q = "https://investors.palantir.com/files/2026%20Q1%20PLTR%2010-Q.pdf";

function formatMetricValue(value: number | null, unit: PltrMetricUnit) {
  if (value == null || Number.isNaN(value)) return "N/A";
  if (unit === "USDm") return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 1 })}M`;
  if (unit === "USD") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (unit === "percent") return `${(value * 100).toFixed(Math.abs(value) >= 1 ? 0 : 1)}%`;
  if (unit === "multiple") return `${value.toFixed(1)}x`;
  if (unit === "shares_m") return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}M`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function sourceLabel(sourceType: PltrSourceType) {
  if (sourceType === "official_ir") return "Palantir official earnings release";
  if (sourceType === "company_presentation") return "Palantir official Q1 2026 Business Update";
  if (sourceType === "sec_filing") return "SEC filing / companyfacts";
  if (sourceType === "transcript") return "Motley Fool transcript";
  if (sourceType === "derived") return "Derived from sourced metrics";
  if (sourceType === "yfinance") return "Yahoo Finance snapshot";
  return sourceType;
}

function footnote(sourceType: PltrSourceType, sourceUrl: string | null, notes: string) {
  return `${sourceLabel(sourceType)}${sourceUrl ? `: ${sourceUrl}` : ""}. ${notes}`;
}

function changeDisplay(current: number | null, prior: number | null, unit: PltrMetricUnit) {
  if (current == null || prior == null || Number.isNaN(current) || Number.isNaN(prior)) return undefined;
  const change = current - prior;
  if (unit === "percent") return `${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)} pts`;
  if (unit === "count") return `${change >= 0 ? "+" : ""}${change.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (unit === "USDm") {
    const relative = prior ? change / prior : null;
    return `${change >= 0 ? "+" : ""}$${change.toLocaleString("en-US", { maximumFractionDigits: 0 })}M${
      relative == null ? "" : ` / ${relative >= 0 ? "+" : ""}${(relative * 100).toFixed(1)}%`
    }`;
  }
  return `${change >= 0 ? "+" : ""}${change.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
}

function metricFromActual(
  actual: PltrActualQuarter,
  key: string,
  overrides: {
    id?: string;
    label?: string;
    layer?: PltrEvidenceLayer;
    sourceUrl?: string | null;
    sourceType?: PltrSourceType;
    sourceConfidence?: PltrSourceConfidence;
    notes?: string;
    q4Metric?: PltrMetric;
  } = {},
): PltrQ1DeepDiveMetric {
  const metric = actual.metrics[key];
  const value = metric?.value ?? null;
  const unit = metric?.unit ?? "text";
  const sourceUrl = overrides.sourceUrl ?? metric?.sourceUrl ?? null;
  const sourceType = overrides.sourceType ?? metric?.sourceType ?? "manual_todo";
  const sourceConfidence = overrides.sourceConfidence ?? metric?.sourceConfidence ?? "todo";
  const notes = overrides.notes ?? metric?.notes ?? "Metric slot is missing or not yet sourced.";
  const q4Value = overrides.q4Metric?.value;
  return {
    id: overrides.id ?? key,
    label: overrides.label ?? metric?.label ?? key,
    value,
    unit,
    displayValue: formatMetricValue(value, unit),
    layer: overrides.layer ?? (sourceType === "derived" ? "derived_metric" : "official_reported"),
    sourceUrl,
    sourceType,
    sourceConfidence,
    footnote: footnote(sourceType, sourceUrl, notes),
    notes,
    q4Value,
    q4DisplayValue: overrides.q4Metric ? formatMetricValue(q4Value ?? null, overrides.q4Metric.unit) : undefined,
    changeVsQ4: q4Value == null || value == null ? undefined : value - q4Value,
    changeVsQ4Display: overrides.q4Metric ? changeDisplay(value, q4Value ?? null, unit) : undefined,
  };
}

function manualMetric(input: {
  id: string;
  label: string;
  value: number | null;
  unit: PltrMetricUnit;
  layer: PltrEvidenceLayer;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
}): PltrQ1DeepDiveMetric {
  return {
    ...input,
    displayValue: formatMetricValue(input.value, input.unit),
    footnote: footnote(input.sourceType, input.sourceUrl, input.notes),
  };
}

function textItem(input: {
  id: string;
  title: string;
  body: string;
  layer: PltrEvidenceLayer;
  sourceUrl: string | null;
  sourceType: PltrSourceType;
  sourceConfidence: PltrSourceConfidence;
  notes: string;
  relatedQaPairId?: string;
  topicTags?: PltrTranscriptTopic[];
}): PltrQ1DeepDiveTextItem {
  return {
    ...input,
    footnote: footnote(input.sourceType, input.sourceUrl, input.notes),
  };
}

function derivedMetric(input: {
  id: string;
  label: string;
  value: number | null;
  unit: PltrMetricUnit;
  notes: string;
  sourceUrl?: string | null;
  sourceConfidence?: PltrSourceConfidence;
}): PltrQ1DeepDiveMetric {
  return manualMetric({
    ...input,
    layer: "derived_metric",
    sourceUrl: input.sourceUrl ?? Q1_2026_BUSINESS_UPDATE,
    sourceType: "derived",
    sourceConfidence: input.sourceConfidence ?? "medium",
  });
}

export function buildPltrQ1DeepDive(dataset: PltrDataset, reverseDcf: PltrReverseDcf): PltrQ1DeepDiveData {
  const q1 = dataset.actuals.find((period) => period.periodId === "q1-2026") ?? dataset.actuals[dataset.actuals.length - 1];
  const q4 = dataset.actuals.find((period) => period.periodId === "q4-2025") ?? q1;
  const q1TranscriptEvent = dataset.transcriptEvents.find((event) => event.transcriptId === "pltr-q1-2026-earnings-2026-05-04");
  const q1QaPairs = dataset.qaPairs.filter((pair) => pair.transcriptId === "pltr-q1-2026-earnings-2026-05-04");
  const danIvesPair = q1QaPairs.find((pair) => pair.analystName.includes("Daniel"));
  const bofaPair = q1QaPairs.find((pair) => pair.analystName.includes("Mariana"));

  const revenue = metricValue(q1, "revenue");
  const commercialRevenue = metricValue(q1, "commercialRevenue");
  const governmentRevenue = metricValue(q1, "governmentRevenue");
  const usCommercialRevenue = metricValue(q1, "usCommercialRevenue");
  const usGovernmentRevenue = metricValue(q1, "usGovernmentRevenue");

  const officialReported: PltrQ1DeepDiveMetric[] = [
    metricFromActual(q1, "revenue", {
      label: "Total revenue",
      q4Metric: q4.metrics.revenue,
      notes: "Q1 2026 total revenue, sourced from Palantir's official Q1 2026 Business Update.",
    }),
    manualMetric({
      id: "total-revenue-growth",
      label: "Total revenue growth",
      value: 0.85,
      unit: "percent",
      layer: "official_reported",
      sourceUrl: Q1_2026_EARNINGS_RELEASE,
      sourceType: "official_ir",
      sourceConfidence: "high",
      notes: "Headline Q1 2026 year-over-year revenue growth from Palantir's official earnings release.",
    }),
    manualMetric({
      id: "us-revenue-growth",
      label: "US revenue growth",
      value: 1.04,
      unit: "percent",
      layer: "official_reported",
      sourceUrl: Q1_2026_EARNINGS_RELEASE,
      sourceType: "official_ir",
      sourceConfidence: "high",
      notes: "Headline US revenue growth from Palantir's official Q1 2026 earnings release.",
    }),
    metricFromActual(q1, "usCommercialGrowth", {
      label: "US Commercial revenue growth",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "company_presentation",
      sourceConfidence: "high",
      notes: "US Commercial revenue growth from the Q1 2026 Business Update.",
    }),
    manualMetric({
      id: "us-government-growth",
      label: "US Government revenue growth",
      value: 0.84,
      unit: "percent",
      layer: "official_reported",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "company_presentation",
      sourceConfidence: "high",
      notes: "US Government revenue growth from the Q1 2026 Business Update comparison page.",
    }),
    metricFromActual(q1, "ruleOf40", { label: "Rule of 40", q4Metric: q4.metrics.ruleOf40 }),
    metricFromActual(q1, "adjustedOperatingMargin", {
      label: "Adjusted operating margin",
      q4Metric: q4.metrics.adjustedOperatingMargin,
    }),
    metricFromActual(q1, "fcfMargin", { label: "Adjusted FCF margin" }),
    metricFromActual(q1, "customerCount", { label: "Total customers", q4Metric: q4.metrics.customerCount }),
    manualMetric({
      id: "customer-growth",
      label: "Customer growth",
      value: 0.31,
      unit: "percent",
      layer: "official_reported",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "company_presentation",
      sourceConfidence: "high",
      notes: "Year-over-year total customer growth disclosed in the Q1 2026 Business Update.",
    }),
  ];

  const derivedMetrics: PltrQ1DeepDiveMetric[] = [
    derivedMetric({
      id: "commercial-mix",
      label: "Commercial revenue mix",
      value: safeDivide(commercialRevenue, revenue),
      unit: "percent",
      notes: "Derived as Commercial revenue divided by total revenue.",
    }),
    derivedMetric({
      id: "government-mix",
      label: "Government revenue mix",
      value: safeDivide(governmentRevenue, revenue),
      unit: "percent",
      notes: "Derived as Government revenue divided by total revenue.",
    }),
    derivedMetric({
      id: "us-commercial-revenue-mix",
      label: "US Commercial mix",
      value: safeDivide(usCommercialRevenue, revenue),
      unit: "percent",
      notes: "Derived as US Commercial revenue divided by total revenue.",
    }),
    derivedMetric({
      id: "us-government-revenue-mix",
      label: "US Government mix",
      value: safeDivide(usGovernmentRevenue, revenue),
      unit: "percent",
      notes: "Derived as US Government revenue divided by total revenue.",
    }),
    metricFromActual(q1, "gaapOperatingMargin", {
      label: "GAAP operating margin",
      layer: "derived_metric",
      sourceUrl: Q1_2026_10Q,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from Q1 2026 GAAP operating income and total revenue. GAAP operating income is seeded from the Q1 2026 10-Q / SEC companyfacts.",
    }),
    metricFromActual(q1, "sbcAsPctRevenue", {
      label: "SBC as percent of revenue",
      layer: "derived_metric",
      sourceUrl: Q1_2026_10Q,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from Q1 2026 stock-based compensation expense and total revenue.",
    }),
    derivedMetric({
      id: "adjusted-gaap-operating-margin-gap",
      label: "Adjusted minus GAAP op margin gap",
      value: metricValue(q1, "adjustedOperatingMargin") - metricValue(q1, "gaapOperatingMargin"),
      unit: "percent",
      sourceUrl: Q1_2026_10Q,
      notes: "Derived as adjusted operating margin less GAAP operating margin, using Q1 2026 Business Update and 10-Q seeded values.",
    }),
  ];

  const guidanceUpgrade: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "fy2026-revenue-guide-upgrade",
      title: "FY 2026 revenue guide raised again",
      body: "Palantir guided FY 2026 revenue to $7.650B to $7.662B, implying roughly 71% year-over-year growth and a 10% increase over its prior forecast.",
      layer: "official_reported",
      sourceUrl: Q1_2026_EARNINGS_RELEASE,
      sourceType: "official_ir",
      sourceConfidence: "high",
      notes: "Official Q1 2026 earnings release headline and guidance disclosure.",
    }),
    textItem({
      id: "fy2026-us-commercial-guide-upgrade",
      title: "US Commercial guide remains the AIP proof point",
      body: "The FY 2026 US Commercial revenue guide moved to more than $3.224B, with management indicating at least 120% growth.",
      layer: "official_reported",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "company_presentation",
      sourceConfidence: "high",
      notes: "Q1 2026 Business Update FY guidance table.",
    }),
    textItem({
      id: "fy2026-profit-guide-upgrade",
      title: "Profit and FCF guide also moved higher",
      body: "FY 2026 adjusted operating income guidance is $4.440B to $4.452B, and adjusted free cash flow guidance is $4.2B to $4.4B.",
      layer: "official_reported",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "company_presentation",
      sourceConfidence: "high",
      notes: "Q1 2026 Business Update FY guidance table.",
    }),
  ];

  const managementCommentary: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "management-demand-capacity",
      title: "Management framed demand as capacity constrained",
      body: "Management described demand as exceeding Palantir's ability to serve every opportunity, with US national security work prioritized first and commercial customers selected for high-impact deployments.",
      layer: "transcript_evidence",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Paraphrased from the Motley Fool Q1 2026 Q&A with Daniel Ives. Transcript evidence is research-only and not a valuation input.",
      relatedQaPairId: danIvesPair?.id,
      topicTags: danIvesPair?.topicTags,
    }),
    textItem({
      id: "management-ontology-load-bearing",
      title: "Ontology remained central to the enterprise AI claim",
      body: "The response linked AI value creation to load-bearing enterprise context, precision deployment, and ontology-coordinated workflows rather than generic model access.",
      layer: "transcript_evidence",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Paraphrased from the Motley Fool Q1 2026 Q&A. Transcript evidence is research-only and not a valuation input.",
      relatedQaPairId: danIvesPair?.id,
      topicTags: danIvesPair?.topicTags,
    }),
    textItem({
      id: "management-ai-lab-competition",
      title: "Management argued AIP sits at the edge of economic value",
      body: "When asked about AI labs entering enterprise software, management argued Palantir's advantage is translating models into operational value through product, FDE deployment, and customer workflow depth.",
      layer: "transcript_evidence",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Paraphrased from the Motley Fool Q1 2026 Q&A with Mariana Perez Mora. Transcript evidence is research-only.",
      relatedQaPairId: bofaPair?.id,
      topicTags: bofaPair?.topicTags,
    }),
  ];

  const analystConcerns: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "analyst-capacity-allocation",
      title: "Capacity allocation between government and commercial",
      body: "Daniel Ives asked how Palantir balances government and commercial opportunities when demand appears greater than supply.",
      layer: "transcript_evidence",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Paraphrased from the Motley Fool Q1 2026 Q&A.",
      relatedQaPairId: danIvesPair?.id,
      topicTags: danIvesPair?.topicTags,
    }),
    textItem({
      id: "analyst-ai-lab-defense-budget",
      title: "AI lab competition and defense budget timing",
      body: "Mariana Perez Mora asked whether enterprise AI labs are changing customer behavior, whether Palantir can keep scarce technical talent, and how defense growth depends on budget appropriation versus continuing resolutions.",
      layer: "transcript_evidence",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Paraphrased from the Motley Fool Q1 2026 Q&A.",
      relatedQaPairId: bofaPair?.id,
      topicTags: bofaPair?.topicTags,
    }),
  ];

  const whatChangedVsQ4: PltrQ1DeepDiveMetric[] = [
    metricFromActual(q1, "revenue", {
      label: "Revenue vs Q4 2025",
      q4Metric: q4.metrics.revenue,
      layer: "derived_metric",
      notes: "Q1 revenue compared with Q4 2025. Q4 revenue remains a derived seed from rounded Q4 chart values and needs filing refresh.",
    }),
    metricFromActual(q1, "yoyRevenueGrowth", {
      label: "YoY revenue growth vs Q4 2025",
      q4Metric: q4.metrics.yoyRevenueGrowth,
      sourceUrl: Q1_2026_EARNINGS_RELEASE,
      sourceType: "official_ir",
      sourceConfidence: "high",
      notes: "Q1 2026 headline revenue growth compared with Q4 2025 growth from the official Q4/Q1 IR event data.",
    }),
    metricFromActual(q1, "ruleOf40", {
      label: "Rule of 40 vs Q4 2025",
      q4Metric: q4.metrics.ruleOf40,
    }),
    metricFromActual(q1, "adjustedOperatingMargin", {
      label: "Adjusted op margin vs Q4 2025",
      q4Metric: q4.metrics.adjustedOperatingMargin,
    }),
    metricFromActual(q1, "customerCount", {
      label: "Customer count vs Q4 2025",
      q4Metric: q4.metrics.customerCount,
    }),
    metricFromActual(q1, "usCommercialCustomerCount", {
      label: "US Commercial customers vs Q4 2025",
      q4Metric: q4.metrics.usCommercialCustomerCount,
    }),
    metricFromActual(q1, "rpo", {
      label: "RPO vs Q4 2025",
      q4Metric: q4.metrics.rpo,
    }),
    metricFromActual(q1, "billings", {
      label: "Billings vs Q4 2025",
      q4Metric: q4.metrics.billings,
    }),
  ];

  const researchInterpretation: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "q1-bull-signal",
      title: "Q1 bull signal",
      body: "The bullish read is not one metric. It is the combination of 85% total revenue growth, 104% US revenue growth, 133% US Commercial growth, 84% US Government growth, 60% adjusted operating margin, 55% adjusted FCF margin, and a higher FY guide.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_EARNINGS_RELEASE,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Research interpretation synthesized from official Q1 2026 release and Business Update metrics.",
    }),
    textItem({
      id: "not-enough-alone",
      title: "What it still does not prove",
      body: "One quarter does not prove that AIP is a durable enterprise AI operating layer. The next tests are production conversions, broad-based customer expansion, sustained US Commercial growth, and per-share FCF after dilution.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Research interpretation from official Q1 metrics, customer metrics, and SBC/GAAP reconciliation.",
    }),
  ];

  const valuationImplication: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "valuation-reverse-dcf-check",
      title: "The quarter raises the bar, not just fair value",
      body: `Q1 makes higher near-term growth and margin assumptions easier to underwrite, but the reverse DCF still requires about ${(reverseDcf.requiredRevenueCagr * 100).toFixed(1)}% revenue CAGR, ${(reverseDcf.requiredFcfMargin * 100).toFixed(1)}% FCF margin, or a ${reverseDcf.requiredTerminalMultiple.toFixed(1)}x terminal multiple to justify the current market price under the dashboard assumptions.`,
      layer: "valuation_implication",
      sourceUrl: dataset.marketData.sourceUrl,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from the dashboard reverse DCF using the current market-data snapshot and default valuation assumptions.",
    }),
    textItem({
      id: "valuation-assumption-boundary",
      title: "Transcript evidence remains outside valuation",
      body: "Management confidence and analyst Q&A are useful for research judgment, but this tab does not let transcript tone mechanically raise revenue CAGR, margin, or terminal multiple.",
      layer: "valuation_implication",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Research-only separation rule for PLTR transcript evidence.",
    }),
  ];

  const redTeamInvalidators: PltrQ1DeepDiveTextItem[] = [
    textItem({
      id: "growth-pull-forward",
      title: "Growth pull-forward risk",
      body: "Q1 may include urgent budget pull-forward, a narrow set of large deployments, or one-time AI urgency that does not repeat in Q2 through Q4.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Red-team risk inferred from Q1 growth acceleration and sequential comparison.",
    }),
    textItem({
      id: "government-budget-risk",
      title: "Government budget risk",
      body: "Defense and US Government demand look strong, but appropriations, continuing resolutions, contract timing, and political cycles can still interrupt growth.",
      layer: "research_interpretation",
      sourceUrl: q1TranscriptEvent?.transcriptUrl ?? null,
      sourceType: "transcript",
      sourceConfidence: "medium",
      notes: "Risk raised in the Q1 2026 analyst Q&A and management response.",
    }),
    textItem({
      id: "ai-hype-vs-production",
      title: "AI hype versus production revenue",
      body: "AIP references need to keep converting into production deployments, customer expansion, and revenue per customer, not just bootcamp activity or management enthusiasm.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_BUSINESS_UPDATE,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Red-team test tied to official revenue, customer, and transcript evidence.",
    }),
    textItem({
      id: "valuation-pricing-perfection",
      title: "Valuation already pricing perfection",
      body: "If the current market price already assumes very high growth, margins, and terminal multiples, even good execution can underperform the stock.",
      layer: "valuation_implication",
      sourceUrl: dataset.marketData.sourceUrl,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from the reverse DCF and local market-data snapshot.",
    }),
    textItem({
      id: "sbc-dilution",
      title: "SBC and dilution",
      body: "Company-level FCF can look strong while per-share economics lag if SBC remains high or diluted shares keep rising.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_10Q,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from Q1 2026 SBC expense, revenue, and diluted share tracking.",
    }),
    textItem({
      id: "adjusted-gaap-gap",
      title: "Adjusted versus GAAP profitability gap",
      body: "The 60% adjusted operating margin should be read with GAAP operating margin and SBC reconciliation, not in isolation.",
      layer: "research_interpretation",
      sourceUrl: Q1_2026_10Q,
      sourceType: "derived",
      sourceConfidence: "medium",
      notes: "Derived from Q1 2026 adjusted and GAAP operating margin comparison.",
    }),
  ];

  return {
    periodId: "q1-2026",
    periodLabel: q1.label,
    benchmarkPeriodId: "q4-2025",
    benchmarkLabel: q4.label,
    sourcePriority: [
      "Palantir official Q1 2026 earnings release",
      "Palantir Q1 2026 Business Update PDF",
      "SEC filings / companyfacts",
      "Motley Fool transcript for Q&A and management commentary only",
    ],
    officialReported,
    derivedMetrics,
    guidanceUpgrade,
    managementCommentary,
    analystConcerns,
    whatChangedVsQ4,
    researchInterpretation,
    valuationImplication,
    redTeamInvalidators,
  };
}
