import crypto from "node:crypto";
import { independentPerShareEvidence, resolveIndependentPerShareOwner } from "./guidancePerShareEvidenceAudit.js";
import { auditEventGuidanceCurrencyEvidence } from "./eventGuidanceCurrencyEvidenceAudit.js";
import {
  independentGuidanceCurrencyMismatch,
  independentGuidanceGrowthRangeMismatch,
  independentGuidanceMidpointMismatch,
  independentHistoricalActualAmountMismatch,
  independentNonGuidanceOwnerAmountMismatch,
  independentParallelMetricAmountMismatch,
  independentFullDollarTargetMismatch,
  independentMalformedMonetarySource,
  independentOwnedMonetaryRangeTarget,
  independentExplicitGrowthBasisMismatch
} from "./guidanceEvidenceAudit.js";

// This deliberately does not import the extraction/model selection code. A
// coverage status, parser quality label, or selected_values array is not proof
// that an original quotation is usable company-level forward guidance.
const COMPANY_SUBJECTS = new Set(["company_total", "company_total_or_unspecified"]);
const PERIODIC_SCOPES = new Set(["full_year", "annual", "fiscal_year", "quarter"]);
const OFFICIAL_SOURCES = new Set(["official_issuer_results_release", "official_issuer_sec_filing"]);
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
const FORWARD = /\b(?:guidance|outlook|maintain(?:s|ed|ing)?|reaffirm(?:s|ed|ing)?|rais(?:e|es|ed|ing)|lower(?:s|ed|ing)?|revis(?:e|es|ed|ing)|expect(?:s|ed|ations?)?|forecast(?:s)?|project(?:s)?(?!\s+(?:execution|cost|construction|completion|timeline))|anticipat(?:e|es)|target(?:s|ing)?|will|plan(?:s)?)\b/i;
const PAST_GUIDANCE = /\b(?:previous(?:ly)?|prior|former|original)\b[^.;]{0,45}\b(?:guidance|outlook|forecast|expectation)\b|\b(?:previously|had)\s+(?:expected|forecast|guided)\b|\b(?:we|management|the company)\s+(?:originally\s+)?(?:expected|projected|anticipated)\b/i;
const HISTORICAL = /\b(?:was|were|reported|recorded|achieved|generated|delivered|grew|increased|decreased|ended|amounted|totaled|totalled)\b/i;
const ANNUAL = /\b(?:20\d{2}\s+(?:total |net |adjusted )?(?:revenue|sales)\s+expected|full[- ]year|fiscal year|fiscal\s+(?:20)?\d{2}|annual|this year|for the year|fy\s*(?:20)?\d{2}e?|(?:for\s+)?20\d{2}\s+(?:(?:adjusted|net|total|revenue|sales|operating|income|ebitda)\s+){0,5}(?:guidance|outlook)|(?:guidance|outlook|for)\s+(?:fiscal\s+)?20\d{2})\b/i;
const QUARTER = /\b(?:q[1-4]|(?:first|second|third|fourth|next|current|this|January|February|March|April|May|June|July|August|September|October|November|December)\s+quarter|for the quarter)\b/i;
const MULTI_YEAR_TARGET = /\bcompounded annual growth\b[^.;]{0,140}\bfrom 20\d{2} to 20\d{2}\b|\b(?:long[- ]term|medium[- ]term|multi[- ]year)\b[^.;]{0,55}\b(?:targets?|goals?|objectives?|ambitions?)\b|\b(?:targets?|goals?|objectives?|ambitions?)\b[^.;]{0,55}\b(?:long[- ]term|medium[- ]term|multi[- ]year)\b/i;
const RESULTS_VS_OUTLOOK = /\b(?:financial\s+)?(?:results?|actuals?|performance)\s+(?:vs\.?|versus|compared (?:with|to))\s+(?:prior |previous )?(?:outlook|guidance)\b/gi;
const SUBSET_PREFIX = /\b(?:same[- ]store|comparable(?:[- ]store)?|segment|division|business unit|unit|corporate|commercial|government|international|subscription|product|services?|software|data[ -]center|cloud|advertising|digital|regional|domestic|consumer|enterprise|china|acquisition|acquired|brand)\s*$/i;
const NON_PERIODIC = /\b(?:cumulative|synerg(?:y|ies)|run[- ]rate|addressable market|market opportunity|financial capacity|incremental contribution|cost savings?)\b/i;
const METRIC_PATTERNS = {
  revenue_guidance: /\b(?:revenues?|sales|total income)\b/gi,
  revenue_growth: /\b(?:revenues?|sales|total income)\b/gi,
  operating_income_guidance: /\b(?:operating (?:income|profit)|income from operations|ebit)\b/gi,
  operating_cash_flow_guidance: /\b(?:operating cash flow|cash from operations)\b/gi,
  net_income_guidance: /\b(?:adjusted\s+)?net income\b/gi,
  free_cash_flow_guidance: /\b(?:free cash flow|fcf)\b/gi,
  capex_guidance: /\b(?:capex|capital expenditures?|capital spending|capital investments?)\b/gi,
  ebitda_guidance: /\b(?:adjusted\s+)?ebitda\b/gi,
  eps_guidance: /\b(?:eps|(?:earnings|net income) per (?:diluted )?share|net income(?=\s+(?:(?:per|for)\s+(?:diluted\s+)?share\b|[^;$\n.]{0,95}\$\d+(?:\.\d+)?(?:\s*(?:to|[-–—])\s*\$?\d+(?:\.\d+)?)?\s+per\s+(?:diluted\s+)?share\b)))\b/gi,
  gross_margin: /\bgross (?:margin|profit)\b/gi,
  operating_margin: /\boperating margin\b/gi,
  margin: /\bmargin\b/gi,
  backlog_guidance: /\b(?:backlog|bookings|billings|remaining performance obligations?|rpo|arr)\b/gi
};

function finite(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function object(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try { return object(JSON.parse(value)); } catch { return {}; }
}

function normalizedPeriod(value) {
  const period = String(value || "").toUpperCase().replace(/[\s-]/g, "");
  const match = period.match(/^(20\d{2})Q([1-4])$/);
  return match ? `Q${match[2]}${match[1]}` : period;
}

function validDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function close(left, right) {
  return left == null || right == null ? left === right : Math.abs(left - right) <= Math.max(1e-7, Math.abs(right) * 1e-7);
}

function median(values) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}

function eventFields(row) {
  const payload = object(row.payload_json);
  const nested = object(payload.payload_json);
  return { ...nested, ...payload, ...row };
}

export function guidanceReleaseEventKey(row) {
  return JSON.stringify([String(row.source_database || row.source_type || ""), String(row.source_id ?? row.id ?? "")]);
}

// Bind the economic owner before checking percentage ranges. In particular,
// the TBBB paragraph places SSS 13–16% before total revenue 29–32%.
function metricOwnerEvidence(metricName, evidence, percentage = null, exactMetricIndex = null) {
  const pattern = METRIC_PATTERNS[metricName];
  if (!pattern) return { text: evidence, supported: false, subset: false };
  const matches = [...evidence.matchAll(new RegExp(pattern.source, pattern.flags))];
  if (!matches.length) return { text: evidence, supported: false, subset: false };
  const owners = matches.map((match, index) => {
    const before = evidence.slice(Math.max(0, match.index - 90), match.index);
    const subset = SUBSET_PREFIX.test(before) || /\b(?:revenue|sales)\s+from\s+(?:the |our )?(?:segment|acquisition|cloud|services?|unused\b[^.;]{0,35}\bcommitments)\b/i.test(evidence.slice(match.index, match.index + 100));
    const total = /\b(?:total(?: company)?|consolidated|group|company(?:'s)?)\s*$/i.test(before);
    let start = Math.max(0, match.index - 100);
    const prefix = evidence.slice(start, match.index);
    const boundaries = [...prefix.matchAll(/[.;](?=\s+[A-Z]|$)|[;\n]/g)];
    if (boundaries.length) start += boundaries.at(-1).index + 1;
    // Do not include the preceding different economic owner in this span.
    if (index > 0) start = Math.max(start, matches[index - 1].index + matches[index - 1][0].length);
    let end = matches[index + 1]?.index ?? evidence.length;
    // Repeating the SAME metric as a unit qualifier does not start a new
    // forecast: "free cash flow ... $1.4-$1.5 billion of free cash flow in
    // fiscal 2027" has one amount and one period. Do not extend across another
    // target, sentence, or economic metric.
    const nextOwner = matches[index + 1];
    if (nextOwner && /(?:\$|USD|GBP|EUR)\s*[\d.]+[^;\n]{0,65}\b(?:billion|million|bn|m)\s+of\s*$/i.test(evidence.slice(match.index, nextOwner.index)) &&
        match[0].toLowerCase() === nextOwner[0].toLowerCase()) {
      end = matches[index + 2]?.index ?? evidence.length;
    }
    const suffix = evidence.slice(match.index, end);
    const stop = suffix.search(/[.;](?=\s+[A-Z]|$)|[;\n]/);
    if (stop >= 0) end = match.index + stop;
    return { text: evidence.slice(start, end).trim(), startIndex: start, endIndex: end, metricIndex: match.index, subset, total, supported: true };
  });
  if (exactMetricIndex != null) return owners.find((owner) => owner.metricIndex === exactMetricIndex)
    || { text: evidence, supported: false, subset: false };
  // A paragraph may repeat revenue for company, unit and corporate demand.
  // A uniquely matching original percentage identifies the source occurrence;
  // never let a later forward company clause re-label an earlier subset actual.
  if (percentage != null) {
    const matching = owners.filter((owner) => {
      const span = evidence.slice(owner.metricIndex, owner.endIndex);
      const values = [...span.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)];
      if (values.some((match) => close(Number(match[1]), percentage))) return true;
      return [...span.matchAll(/(-?\d+(?:\.\d+)?)\s*%?\s*(?:to|[-–—])\s*(-?\d+(?:\.\d+)?)\s*%/g)].some((match) => close((Number(match[1]) + Number(match[2])) / 2, percentage));
    });
    if (matching.length === 1) return matching[0];
  }
  return owners.find((owner) => owner.total && !owner.subset) || owners.find((owner) => !owner.subset) || owners[0];
}

function independentPeriodEvidence(owner, evidence) {
  const metricIndex = owner.metricIndex ?? 0;
  const selectedAnnualGuidanceHeader = evidence.match(/^Year ended 31 December 20\d{2}\s*\|\s*(?:Updated\s+)?guidance\s*\./i);
  // A dated, selected current guidance column is annual. A historical Results
  // column or an unprojected current/previous/results table does not qualify.
  if (selectedAnnualGuidanceHeader && metricIndex >= selectedAnnualGuidanceHeader[0].length && metricIndex < 200) {
    return { annual: true, quarter: false, nearest: { scope: "full_year", index: 0, text: selectedAnnualGuidanceHeader[0] } };
  }
  // FY in "Q4 FY2022" or "third quarter of fiscal year 2026" qualifies
  // that quarter; it is not a separate full-year target. Presentation footers
  // and historical performance context likewise do not scope the target.
  const qualifiedQuarters = [...evidence.matchAll(/\b(?:q[1-4]|(?:first|second|third|fourth)\s+quarter)\s+(?:of\s+)?(?:fiscal(?: year)?\s+|fy\s*)?(?:20)?\d{2}(?:\s+outlook)?\b/gi)];
  const markers = [["full_year", ANNUAL], ["quarter", QUARTER]].flatMap(([scope, pattern]) =>
    [...evidence.matchAll(new RegExp(pattern.source, "gi"))].map((match) => ({ scope, index: match.index, text: match[0] }))
  ).filter((marker) => {
    if (marker.scope === "full_year" && qualifiedQuarters.some((quarter) => marker.index >= quarter.index && marker.index < quarter.index + quarter[0].length)) return false;
    if (marker.scope === "quarter") {
      const before = evidence.slice(Math.max(0, marker.index - 50), marker.index);
      const after = evidence.slice(marker.index + marker.text.length, marker.index + marker.text.length + 65);
      if (/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+quarter$/i.test(marker.text) &&
        /\b(?:compared (?:with|to)|versus|prior|previous|last)\b[^.;]{0,55}$/i.test(before)) return false;
      if (/\b(?:performance in|record)\s*$/i.test(before) || /^\s+performance\b/i.test(after)) return false;
      if (/\bas of\s*$/i.test(before) || /^\s+(?:20\d{2}\s+)?earnings\s+(?:presentation|on)\b/i.test(after)) return false;
    }
    return true;
  }).sort((a, b) => a.index - b.index);
  const nearest = markers.filter((marker) => marker.index <= metricIndex && metricIndex - marker.index <= 500).at(-1);
  const afterOwner = markers.filter((marker) => marker.index > metricIndex && marker.index < (owner.endIndex ?? evidence.length));
  // A verified EPS range followed immediately by "for the fourth quarter"
  // owns that period, even if a preceding DIFFERENT EPS range was annual.
  // This uses independently recovered value offsets, not parser positions.
  const directlyQualified = owner.valueEndIndex == null ? null : afterOwner.find((marker) =>
    marker.index >= owner.valueEndIndex &&
    /^\s*(?:for\s+)(?:the\s+)?$/i.test(evidence.slice(owner.valueEndIndex, marker.index)));
  if (directlyQualified) return {
    annual: directlyQualified.scope === "full_year", quarter: directlyQualified.scope === "quarter",
    nearest: directlyQualified
  };
  return {
    annual: nearest?.scope === "full_year" || afterOwner.some((marker) => marker.scope === "full_year"),
    quarter: nearest?.scope === "quarter" || afterOwner.some((marker) => marker.scope === "quarter"),
    nearest
  };
}

function historicalGuidanceComparison(owner, evidence) {
  const text = owner.text;
  const currentTarget = /\b(?:expect(?:s)?|forecast(?:s)?|anticipat(?:e|es)|will|plan(?:s)?)\b/i.test(text);
  if (currentTarget) return false;
  return /\b(?:in line with|within|exceed(?:ed|ing))\b[^.;]{0,70}\b(?:guidance|target)\b/i.test(text) ||
    /\breaffirms\s+20\d{2}\s+guidance\s+(?:first|second|third|fourth)\s+quarter\s+revenue\s+of\b/i.test(text) ||
    /\brevenue growth of\s+[\d.]+%\s+in\s+q[1-4]\s+fy\s*\d{2,4}\s*;\s*driven by\b/i.test(evidence.slice(owner.metricIndex, (owner.endIndex ?? evidence.length) + 30));
}

function perShareRangeWidthEvidence(owner, evidence) {
  // A change in a range's WIDTH is not the absolute EPS/FFO level. Bind this
  // narrow original wording to its own EPS occurrence, never a later target.
  const pattern = /\b(?:narrowed|narrowing)\s+the range for EPS and FFO per share\s+from a range of\s+\$\d+(?:\.\d+)?\s+to a range of\s+\$\d+(?:\.\d+)?\s+per share\b/gi;
  return [...evidence.matchAll(pattern)].some((match) =>
    match.index + match[0].search(/\bEPS\b/i) === owner.metricIndex);
}

function independentEpsComponentEvidence(owner, evidence) {
  const position = owner.metricIndex ?? 0;
  const metric = evidence.slice(position).match(/^(?:eps|(?:earnings|net income) per (?:diluted )?share)\b/i);
  if (!metric) return null;
  const after = evidence.slice(position + metric[0].length).match(/^\s+(?:(?:currency|fx|recycling|tariff)\s+)?(?:headwinds?|tailwinds?|benefits?|impacts?|contributions?|drags?|pickups?|dilution|accretion)\b/i);
  if (after) return { basis: "original_eps_driver_directly_after_metric", quote: metric[0] + after[0] };
  const before = evidence.slice(Math.max(0, position - 220), position);
  const driver = before.match(/\b(?:headwinds?|tailwinds?|impacts?|benefits?|contributions?|dilution|dilutive)\b(?:\s+(?:of|on|to|in|our|the|about|approximately|roughly|favorable|unfavorable|negative|positive|or|million|billion|full[- ]year|first|second|third|fourth|quarter|q[1-4]|fiscal|20\d{2}|adjusted|non[- ]gaap|diluted|consolidated)|\s*\$-?\d+(?:\.\d+)?(?:\s*[-–—]\s*\$?\d+(?:\.\d+)?)?)*\s*$/i);
  return driver ? { basis: "original_driver_quantity_directly_targets_eps", quote: driver[0] + metric[0] } : null;
}

function quotedMonetaryMetricTarget(metricName, evidence) {
  const pattern = METRIC_PATTERNS[metricName];
  if (!pattern || /margin/.test(metricName)) return false;
  const anyMetric = new RegExp(Object.values(METRIC_PATTERNS).map((item) => `(?:${item.source})`).join("|"), "i");
  return [...evidence.matchAll(new RegExp(pattern.source, pattern.flags))].some((match) => {
    const before = evidence.slice(Math.max(0, match.index - 100), match.index);
    const suffix = evidence.slice(match.index + match[0].length, match.index + match[0].length + 150);
    const money = suffix.match(/(?:\$|\b(?:USD|MXN|EUR|GBP|Ps)\s*)\s*\(?[\d,]+(?:\.\d+)?/i);
    if (!money) return false;
    const connector = suffix.slice(0, money.index);
    const afterMoney = suffix.slice(money.index + money[0].length);
    // Explicit units decide the economic quantity. A reserve-development
    // amount in millions is not an EPS target; a per-share/per-kilogram price
    // is not missing group revenue, even in a forward-looking paragraph.
    if (metricName === "eps_guidance" && /^\s*(?:billion|million|thousand|bn|mm|mn|[mb])\b/i.test(afterMoney)) return false;
    if (metricName !== "eps_guidance" && /^\s*(?:per\s+(?:(?:diluted|common)\s+){0,2}(?:share|kilogram|kg|tonne|ton|unit|barrel)|\/\s*(?:share|kg|ton))\b/i.test(afterMoney)) return false;
    // Do not borrow the next metric, tax/expense assumption, historical base,
    // EPS denominator, or revision delta merely because it is nearby.
    if (anyMetric.test(connector) || /[;\n]|\.(?=\s+[A-Z])/.test(connector)) return false;
    if (metricName === "eps_guidance" && /\b(?:affo|ffo|funds from operations)\b/i.test(connector)) return false;
    if (/\b(?:expenses?|costs?|tax(?:es)?|arbitration award|impact|headwind|credit facility|cash usage|share count|shares outstanding|assum(?:e|es|ed|ing)|compared|versus)\b/i.test(connector)) return false;
    // Capital spending can be background for a capital-return decision. The
    // repurchase verb owns its amount even when "shares" follows the amount;
    // it is not evidence of an unextracted capex target (BLK Q1 2024).
    if (/\b(?:repurchas(?:e|es|ed|ing)|buybacks?|buy(?:ing)?\s+back)\b/i.test(connector)) return false;
    if (/\b(?:includes?|excluding)\b/i.test(connector) && /\b(?:impact|headwind|expense|arbitration award)\b/i.test(suffix.slice(money.index + money[0].length, money.index + money[0].length + 70))) return false;
    if (/\b(?:cash taxes|non-operating expense)\b[^.;]{0,95}\([^)]*$/i.test(before)) return false;
    if (metricName === "net_income_guidance" && /^\s+per\s+(?:diluted\s+)?share\b/i.test(suffix)) return false;
    if (/^\s+margin\b/i.test(suffix)) return false;
    if (/\b(?:reported|recorded|generated)\s+(?:adjusted\s+)?$/i.test(before) || /^\s+(?:was|were|increased|decreased)\b/i.test(connector)) return false;
    if (/\b(?:increased|raised|reduced)\b[^.;]{0,50}\bby\s*$/i.test(connector) || /\bguidance\b[^.;]{0,100}\bby\s*$/i.test(before + connector)) return false;
    return true;
  });
}

function quotedGrowthMetricTarget(metricName, owner) {
  if (!["revenue_guidance", "revenue_growth"].includes(metricName)) return false;
  // An independently located revenue occurrence owns only its local growth
  // clause. Qualitative revenue growth cannot borrow a later EPS, margin or
  // FCF percentage and be relabelled as an unextracted quantified target.
  const pattern = METRIC_PATTERNS[metricName];
  const localMetric = [...owner.text.matchAll(new RegExp(pattern.source, pattern.flags))][0];
  if (!localMetric) return false;
  let clause = owner.text.slice(localMetric.index + localMetric[0].length);
  const nextOwner = new RegExp(Object.entries(METRIC_PATTERNS)
    .filter(([name]) => !["revenue_guidance", "revenue_growth"].includes(name))
    .map(([, regex]) => `(?:${regex.source})`).concat("\\bmargins?\\b").join("|"), "i");
  const next = clause.search(nextOwner);
  if (next >= 0) clause = clause.slice(0, next);
  return /\bgrowth\b[^.;]{0,75}\d+(?:\.\d+)?\s*%/i.test(clause);
}

function historicalResultsComparison(owner, evidence) {
  const prefix = evidence.slice(0, owner.metricIndex ?? 0);
  const heading = [...prefix.matchAll(RESULTS_VS_OUTLOOK)].at(-1);
  if (!heading || prefix.length - heading.index > 300) return false;
  const afterHeading = evidence.slice(heading.index + heading[0].length);
  const beforeOwner = prefix.slice(heading.index + heading[0].length);
  // A subsequent explicitly scoped/current forward section starts a new
  // disclosure. "Outlook" in the old-comparison table's header does not.
  const reset = ANNUAL.test(beforeOwner) || /\b(?:new|updated|current|revised)\s+(?:outlook|guidance)\b/i.test(beforeOwner) ||
    /\b(?:expect(?:s)?|forecast(?:s)?|will|anticipat(?:e|es)|project(?:s)?)\b/i.test(owner.text) && (ANNUAL.test(owner.text) || QUARTER.test(owner.text));
  return !reset && /\b(?:revenue|sales|income|ebitda|eps|margin|cash flow)\b/i.test(afterHeading);
}

export function createGuidanceReportingCurrencyResolver(financialRows = []) {
  const byTicker = new Map();
  for (const row of financialRows) {
    const payload = object(row.payload_json);
    const ticker = String(row.ticker || "").toUpperCase();
    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    const evidence = [
      ["reportingCurrency", payload.reportingCurrency],
      ["sourceFinancialStatementCurrency", payload.sourceFinancialStatementCurrency],
      ["sourceRecord.reportingCurrency", payload.sourceRecord?.reportingCurrency],
      ["sourceRecord.sourceCurrency", payload.sourceRecord?.sourceCurrency]
    ].filter(([, value]) => CURRENCIES.has(String(value || "").toUpperCase())).map(([field, value]) => ({
      currency: String(value).toUpperCase(), field, availableAt: String(row.available_at || ""),
      source: payload.sourceRecord?.sourceUrl || payload.sourceRecord?.dataset || null
    }));
    byTicker.get(ticker).push({ availableAt: String(row.available_at || ""), modelCurrency: String(row.currency || "").toUpperCase(), evidence });
  }
  for (const rows of byTicker.values()) rows.sort((a, b) => b.availableAt.localeCompare(a.availableAt));
  const resolver = (ticker, observedAt) => {
    if (!validDate(observedAt)) return null;
    const rows = (byTicker.get(String(ticker).toUpperCase()) || []).filter((row) => validDate(row.availableAt) && row.availableAt <= observedAt);
    if (!rows.length) return null;
    const evidence = rows.filter((row) => row.availableAt === rows[0].availableAt).flatMap((row) => row.evidence);
    const currencies = new Set(evidence.map((item) => item.currency));
    return currencies.size === 1 ? { currency: evidence[0].currency, evidence } : null;
  };
  resolver.modelCurrencyAtOrBefore = (ticker, asOf) => {
    const rows = (byTicker.get(String(ticker).toUpperCase()) || []).filter((row) => validDate(row.availableAt) && row.availableAt <= asOf);
    if (!rows.length) return null;
    const currencies = new Set(rows.filter((row) => row.availableAt === rows[0].availableAt).map((row) => row.modelCurrency).filter((currency) => CURRENCIES.has(currency)));
    return currencies.size === 1 ? [...currencies][0] : null;
  };
  return resolver;
}

export function assessGuidanceReleaseEvent(row, { reportingCurrencyAtOrBefore = () => null } = {}) {
  const fields = eventFields(row);
  const evidence = String(row.evidence_excerpt || fields.evidence_excerpt || row.value_text || fields.value_text || "").trim();
  const metricName = String(fields.metric_name || "").toLowerCase();
  const subject = String(fields.guidance_subject || "").toLowerCase();
  const scope = String(fields.guidance_scope || "").toLowerCase();
  const quality = String(fields.quality_status || "").toLowerCase();
  const actualOrGuidance = String(fields.actual_or_guidance || "").toLowerCase();
  const amount = finite(fields.amount);
  const perShareValue = finite(fields.per_share_value);
  const reportedSourceCurrency = String(fields.currency || "").toUpperCase();
  const issuerCurrencyEvidence = !reportedSourceCurrency && (amount != null || perShareValue != null)
    ? reportingCurrencyAtOrBefore(row.ticker || fields.ticker, fields.observed_at) : null;
  const sourceCurrency = reportedSourceCurrency || issuerCurrencyEvidence?.currency || "";
  const perShareOwner = metricName === "eps_guidance" && perShareValue != null
    ? resolveIndependentPerShareOwner({ evidence, value: perShareValue, unit: fields.unit,
      basis: fields.per_share_basis || "unspecified", currency: sourceCurrency }) : null;
  // A paragraph can mention an unquantified metric heading, then an actual,
  // then its current target. Independently locate the unique directly owned
  // monetary RANGE in the original before classifying scope/tense. A stored
  // value is a reconciliation check, never authority to choose among owners.
  const monetaryRangeOwner = amount != null && METRIC_PATTERNS[metricName] &&
    [...evidence.matchAll(METRIC_PATTERNS[metricName])].length > 1
    ? independentOwnedMonetaryRangeTarget({ metricName, evidence }) : null;
  const exactOwnerIndex = perShareOwner?.status === "ready" ? perShareOwner.owner.metricIndex
    : monetaryRangeOwner && close(monetaryRangeOwner.amountM, amount) ? monetaryRangeOwner.metricIndex : null;
  const owner = perShareOwner?.reason === "guidance_per_share_owner_ambiguous"
    ? { text: evidence, supported: false, subset: false }
    : metricOwnerEvidence(metricName, evidence, finite(fields.growth_yoy ?? fields.margin_pct),
      exactOwnerIndex);
  if (perShareOwner?.status === "ready") owner.valueEndIndex = perShareOwner.owner.valueEndIndex;
  const periodEvidence = independentPeriodEvidence(owner, evidence);
  const multiYearTarget = MULTI_YEAR_TARGET.test(owner.text);
  const historicalComparison = historicalResultsComparison(owner, evidence);
  const historicalGuidance = historicalGuidanceComparison(owner, evidence);
  const historicalTable = /^Income Statement\s*-\s*20\d{2}[^.]{0,100}\bQTD\b/i.test(evidence) ||
    /historical adjusted EPS growth achieved[^.]{0,240}historical adjusted EPS guidance/i.test(evidence) &&
    /\bActual Adjusted EPS\b.*\bBase EPS for 5-year/i.test(evidence);
  const questionOnly = /\?\s*$/.test(evidence) && /\b(?:should we|can you|could you|would you|do you|are you)\b/i.test(evidence);
  const perShareRangeWidth = metricName === "eps_guidance" && perShareRangeWidthEvidence(owner, evidence);
  // A research-only width occurrence cannot excuse a DIFFERENT EPS target
  // whose value is missing or failed independent owner resolution. Audit each
  // original occurrence, not producer offsets or the first fallback owner.
  const unreviewedAdditionalPerShareTarget = perShareRangeWidth &&
    [...evidence.matchAll(METRIC_PATTERNS.eps_guidance)].some((match) => {
      const other = metricOwnerEvidence(metricName, evidence, null, match.index);
      return other.metricIndex !== owner.metricIndex && !perShareRangeWidthEvidence(other, evidence) &&
        FORWARD.test(other.text) && !PAST_GUIDANCE.test(other.text) &&
        !historicalGuidanceComparison(other, evidence) && !historicalResultsComparison(other, evidence) &&
        !NON_PERIODIC.test(other.text) && !MULTI_YEAR_TARGET.test(other.text) &&
        quotedMonetaryMetricTarget(metricName, other.text);
    });
  const beforeMetric = evidence.slice(Math.max(0, (owner.metricIndex ?? 0) - 100), owner.metricIndex ?? 0);
  const metricPattern = METRIC_PATTERNS[metricName];
  const directlyHistoricalMetric = metricPattern && new RegExp(`^(?:${metricPattern.source})\\s+(?:(?:in|during|for)\\s+the\\s+(?:first|second|third|fourth|last|prior)\\s+(?:quarter|year)\\s+)?(?:(?:has|have|had)\\s+)?(?:grew|rose|was|were|increased|decreased|declined|reached)\\b`, "i")
    .test(evidence.slice(owner.metricIndex ?? 0));
  const metricOwnedHistorical = /\b(?:delivered|recorded|achieved|generated)\s+(?:an?\s+)?(?:(?:record|adjusted|strong|net|total)\s+)?$/i.test(beforeMetric) ||
    /\b(?:we|they|it|the company|the group|has|have|had)\s+reported\s+(?:(?:adjusted|net|total)\s+)?$/i.test(beforeMetric) ||
    /\b(?:achieved|delivered)\s+(?:another\s+|a\s+)?(?:quarter|year)\s+of\s+(?:record\s+)?$/i.test(beforeMetric) ||
    /\bdelivering\s+(?:an?\s+)?$/i.test(beforeMetric) && !/\b(?:expect(?:s)?|will|anticipate(?:s)?|forecast(?:s)?|reaffirming|maintaining)\b/i.test(beforeMetric) ||
    directlyHistoricalMetric || metricName === "eps_guidance" &&
    /^(?:eps|(?:earnings|net income) per (?:diluted )?share)\s+of\s+\$[\d.]+\s*,?\s*(?:grew|represents?|representing)\b/i.test(evidence.slice(owner.metricIndex ?? 0)) &&
    !/\b(?:expect|anticipate|forecast|will)\b/i.test(beforeMetric);
  const cashNoncashBudget = metricName === "capex_guidance" && /\bbudget(?:ed)?\b/i.test(evidence) &&
    /\b(?:capital expenditures?|capex)\b[^.]{0,320}\b(?:including\s+(?:as\s+)?right[- ]of[- ]use assets|including\s+non[- ]cash)\b/i.test(evidence);
  const productSales = ["revenue_guidance", "revenue_growth"].includes(metricName) && !owner.total &&
    /\b[A-Z][A-Z0-9]+[®™]\s+(?:Performance|Quarterly|net sales)\b/.test(evidence);
  const preliminaryActual = /\bpreliminar(?:y|ily)\b[^.;]{0,100}\b(?:unaudited|estimates?|results?|revenue)\b|\bunaudited\b[^.;]{0,100}\bpreliminar(?:y|ily)\b/i.test(owner.text);
  const industrialSubset = ["revenue_guidance", "revenue_growth"].includes(metricName) && /\bIndustrial Activities\s+20\d{2}A\s+20\d{2}E\s+Net Sales\b/i.test(evidence);
  const incomePerShare = ["net_income_guidance", "operating_income_guidance"].includes(metricName) &&
    /^(?:net\s+)?(?:operating\s+)?income(?:\s+from continuing operations)?\s+(?:(?:per|for)\s+(?:(?:diluted|common)\s+){0,2}share\b|[^;$\n.]{0,95}\$\d+(?:\.\d+)?(?:\s*(?:to|[-–—])\s*\$?\d+(?:\.\d+)?)?\s+per\s+(?:(?:diluted|common)\s+){0,2}share\b)/i.test(evidence.slice(owner.metricIndex, owner.endIndex));
  const incomeComponent = metricName === "net_income_guidance" && /\bother\s*$/i.test(beforeMetric);
  const originalEpsComponent = metricName === "eps_guidance" ? independentEpsComponentEvidence(owner, evidence) : null;
  const epsDriver = originalEpsComponent || metricName === "eps_guidance" && /^\s*(?:(?:headwinds?|benefits?|impacts?|contributions?|drags?)\b|(?:will\s+be\s+)?(?:negatively|positively)\s+impacted\s+by\b)/i.test(
    evidence.slice((owner.metricIndex ?? 0) + (evidence.slice(owner.metricIndex ?? 0).match(METRIC_PATTERNS.eps_guidance)?.[0]?.length ?? 0)));
  const fplSubsidiaryCapex = String(row.ticker || fields.ticker).toUpperCase() === "NEE" && metricName === "capex_guidance" && /\bFPL['’]s\b/i.test(evidence);
  const parallelFinancialTable = ["revenue_guidance", "ebitda_guidance"].includes(metricName) &&
    /\bRevenue\s*\(\$m\)\s+Adj\.\s*EBITDA\s*\(\$m\)/i.test(evidence) && /\bFY\s*\d{2}\s*E\b/i.test(evidence);
  const scalarValues = Object.fromEntries(["amount", "per_share_value", "growth_yoy", "growth_qoq", "margin_pct"].map((field) => [field, finite(fields[field])]));
  const conversionPercent = evidence.match(/\b(\d+(?:\.\d+)?)\s*%\s+conversion\s+of\s+(?:adjusted\s+)?ebitda\s+to\s+(?:adjusted\s+)?free cash flow\b/i);
  const wrongGrowthOwner = ["revenue_guidance", "revenue_growth"].includes(metricName) && conversionPercent && Number(conversionPercent[1]) === scalarValues.growth_yoy;
  const qualitativeRange = ["revenue_guidance", "revenue_growth"].includes(metricName) && /\b(?:up|down)\s+(?:approximately\s+)?\d+(?:\.\d+)?%\s+to\s+(?:up|down)\s+(?:slightly|modestly)\b/i.test(owner.text.split(/\b(?:compared (?:with|to)|previous guidance)\b/i)[0]);
  const liquidityRatio = ["revenue_guidance", "revenue_growth"].includes(metricName) && /\bliquidity\b[^.]{0,150}\b(?:trailing[- ]12[- ]month|ttm)\s+revenue\b/i.test(owner.text);
  const reasons = [];
  const details = {};
  const add = (reason, detail) => { reasons.push(reason); if (detail) details[reason] = detail; };
  // An extractor may preserve an ambiguous original as research with a null
  // scalar. That must not turn an explicitly pending source review into a
  // successful extraction. This is a blocking declaration, never approval of
  // either candidate number or a substitute for the independent quote checks.
  const pendingExtractionReview = fields.extraction_review_required;
  const hasPendingExtractionReview = pendingExtractionReview != null &&
    pendingExtractionReview !== false && pendingExtractionReview !== "";
  if (hasPendingExtractionReview) add("guidance_original_source_review_pending", {
    declaredRequirement: pendingExtractionReview,
    basis: "unresolved_original_source_must_remain_blocking_even_when_scalar_is_null"
  });
  // A populated currency is not proof: every declared event-level resolution
  // must still bind to the original quote, issuer/date and independent primary
  // document. SQL fields take precedence over payload/contract assertions.
  const officialCurrencyContract = fields.official_guidance_currency_evidence;
  const officialCurrencyMismatch = fields.currency_resolution?.status === "independently_reviewed_official_event_currency" && officialCurrencyContract == null
    ? { reason: "guidance_official_event_currency_missing_contract", details: { basis: "declared_reviewed_currency_requires_retained_original_proof" } }
    : auditEventGuidanceCurrencyEvidence({
    ticker: String(row.ticker || fields.ticker || "").toUpperCase(),
    sourceId: String(row.source_id ?? row.id ?? fields.id ?? ""),
    observedAt: String(fields.observed_at || ""), evidence,
    currency: reportedSourceCurrency, contract: officialCurrencyContract,
    amount, perShareValue, unit: fields.unit, metricName, fiscalPeriod: fields.fiscal_period
  });
  if (officialCurrencyMismatch) add(officialCurrencyMismatch.reason, officialCurrencyMismatch.details);
  const originalSourceCorruption = independentMalformedMonetarySource({ metricName,
    evidence: owner.supported ? evidence.slice(owner.metricIndex, owner.endIndex) : evidence });
  if (originalSourceCorruption) add("guidance_corrupt_original_source", originalSourceCorruption);
  if (!evidence) add("guidance_evidence_missing");
  if (!owner.supported) add("guidance_metric_owner_unresolved");
  if (perShareOwner?.reason === "guidance_per_share_owner_ambiguous") add(perShareOwner.reason, perShareOwner);
  if (perShareRangeWidth) add("guidance_per_share_range_width_not_level", { basis: "original_metric_owned_change_in_range_width_not_earnings_level" });
  if (unreviewedAdditionalPerShareTarget) add("guidance_other_per_share_target_requires_review", {
    basis: "separate_original_forward_eps_target_cannot_inherit_range_width_exemption"
  });
  if (!Object.values(scalarValues).some((value) => value != null)) add("guidance_not_quantified");
  const currentRevenueTarget = /\b(?:revenues?|sales)\s+to be\s+(?:up|down|approximately|flat)\b/i.test(owner.text.split(/\bcompared (?:with|to)\b/i)[0]);
  // Preserve the actual immediately preceding target heading across the
  // paragraph boundary. A generic document title cannot bless later actuals.
  const originalHeadingForward = /^For\s+(?:(?:the\s+)?(?:first|second|third|fourth) quarter of\s+)?20\d{2},\s+we expect:\.?\s+/i.test(evidence) &&
    /\b(?:revenues?|sales|margin|eps|earnings per share)\b[^.;]{0,65}\bto be\b/i.test(owner.text.split(/\b(?:compared (?:with|to)|previous guidance)\b/i)[0]) ||
    /^(?:(?:Outlook|Guidance) for (?:Fiscal Year )?20\d{2}|(?:Q[1-4]|First Quarter|Second Quarter|Third Quarter|Fourth Quarter|Full Year(?: Fiscal)?) 20\d{2} Financial (?:Outlook|Guidance))\.\s+/i.test(evidence) && (owner.metricIndex ?? 0) < 150 ||
    /^[^.]{0,125}\bfinancial outlook\b[^.]{0,100}\.\s+(?:Q[1-4]\s+20\d{2}|Fiscal Year 20\d{2})\.\s+(?:Net )?Revenue\b/i.test(evidence) && (owner.metricIndex ?? 0) < 220;
  const sameClauseBefore = evidence.slice(0, owner.metricIndex ?? 0).split(/[.;](?=\s+[A-Z]|$)/).at(-1).slice(-350);
  const parallelForward = /\b(?:expects?|anticipates?|forecasts?)\b/i.test(sameClauseBefore) && /\band\s+(?:(?:our|adjusted|diluted|net|total)\s+)*$/i.test(sameClauseBefore) && !PAST_GUIDANCE.test(sameClauseBefore);
  // An explicit current target followed by its old comparator is not the old
  // forecast itself. Prove the temporal order in the original owned sentence.
  const ownedPrefix = evidence.slice(owner.startIndex ?? 0, owner.metricIndex ?? 0);
  const ownedSuffix = evidence.slice(owner.metricIndex ?? 0, owner.endIndex ?? evidence.length);
  // A current main-clause forecast can explain an old expectation AFTER its
  // target. Past-tense commentary is not allowed to reclassify that target;
  // conversely a historical owner can never borrow a later forward verb.
  const mainClauseForward = /\b(?:we|the company|the group)\s+(?:(?:now|currently|still|again|continue to)\s+)?(?:expect|expects|forecast|forecasts|anticipate|anticipates)\b/i.test(sameClauseBefore) &&
    !PAST_GUIDANCE.test(sameClauseBefore) &&
    !/\b(?:but|however|whereas)\b/i.test(sameClauseBefore.split(/\b(?:expects?|forecasts?|anticipates?)\b/i).at(-1));
  const ownedCurrentForward = /\b(?:we\s+)?(?:expect|forecast|anticipate)(?:s)?\b|\b(?:raising|raised|reaffirming|maintaining)\b|\bupdated\s+guidance\b/i.test(ownedPrefix) && !PAST_GUIDANCE.test(ownedPrefix);
  const historicalAfterCurrentTarget = (ownedCurrentForward || mainClauseForward) &&
    /\b(?:as\s+(?:we\s+)?(?:had )?expected|(?:compared (?:with|to)|versus|from|than)\s+(?:(?:our|the)\s+)?(?:prior|previous|original)\s+(?:guidance|outlook|expectation))\b/i.test(ownedSuffix);
  // A parenthetical "as we expected" describes the trajectory, while an
  // explicit later reaffirmation still states the current same-metric range.
  const reaffirmedAfterAside = /\bas we (?:had )?expected\b/i.test(owner.text) &&
    /\bwe (?:are )?(?:again )?reaffirming\b[^.;]{0,55}\bguidance\s+range\s+of\s+\$/i.test(owner.text) &&
    !PAST_GUIDANCE.test(owner.text.replace(/\bas we (?:had )?expected\b/ig, ""));
  const currentRevisionForward = /\b(?:we\s+)?now\s+(?:expect|forecast|anticipate)\b|\b(?:raising|raised|reaffirming|maintaining)\b/i.test(ownedPrefix) &&
    !PAST_GUIDANCE.test(ownedPrefix) && /\b(?:up|down|higher|lower)\s+from\s+(?:(?:our|the)\s+)?(?:prior|previous)\s+guidance\b/i.test(ownedSuffix);
  const expresslyRetainedTarget = /\b(?:maintaining|reaffirming|reiterating)\s+(?:(?:our|the)\s+)?(?:previous|prior|original)\s+(?:guidance|outlook)\b/i.test(owner.text) ||
    /\b(?:now\s+expect|raising|raised|reaffirming|maintaining)\b/i.test(ownedPrefix) &&
    /\b(?:higher|lower|up|down)\s+(?:than|from)\s+(?:(?:our|the)\s+)?(?:prior|previous)\s+guidance\b/i.test(ownedSuffix);
  const longGuidanceHeading = /\b(?:our|the company(?:'s)?)\s+(?:guidance|outlook)\b/i.test(sameClauseBefore) &&
    /\bis as follows\s*:\s*$/i.test(sameClauseBefore) && !PAST_GUIDANCE.test(sameClauseBefore);
  const derivedSameMetricGrowth = ["revenue_guidance", "revenue_growth"].includes(metricName) &&
    /\bwhich\s+translates\s+into\s*$/i.test(sameClauseBefore) &&
    /\b(?:expect|forecast|anticipate)\b[^;]{0,180}\b(?:revenue|sales)\s+(?:of|to be|between)\b/i.test(sameClauseBefore) &&
    !PAST_GUIDANCE.test(sameClauseBefore) && !SUBSET_PREFIX.test(beforeMetric) &&
    /^\s*(?:revenues?|sales)\s+growth\b/i.test(ownedSuffix);
  const localForward = (FORWARD.test(owner.text) && !PAST_GUIDANCE.test(owner.text) || currentRevenueTarget || originalHeadingForward || parallelForward || currentRevisionForward || expresslyRetainedTarget || longGuidanceHeading || derivedSameMetricGrowth || mainClauseForward || historicalAfterCurrentTarget || reaffirmedAfterAside) && !historicalComparison && !historicalGuidance && !metricOwnedHistorical && !historicalTable && !questionOnly;
  const annualHeading = /\b20\d{2}\s+(?:guidance|outlook)\b/i.test(evidence);
  if ((!localForward && !(annualHeading && !HISTORICAL.test(owner.text))) || (PAST_GUIDANCE.test(owner.text) && !currentRevenueTarget && !originalHeadingForward && !parallelForward && !currentRevisionForward && !expresslyRetainedTarget && !historicalAfterCurrentTarget && !reaffirmedAfterAside && !/\b(?:now|updated|raised|revised|current)\b/i.test(owner.text))) add("guidance_not_forward");
  if (HISTORICAL.test(owner.text) && !localForward) add("guidance_historical_actual");
  if (metricOwnedHistorical) add("guidance_historical_actual", { basis: "original_past_tense_verb_directly_owns_metric" });
  if (historicalComparison) add("guidance_historical_results_vs_outlook", { basis: "original_results_vs_outlook_comparison_heading" });
  if (historicalTable) add("guidance_historical_actual", { basis: "original_historical_income_statement_or_actual_vs_base_eps_table" });
  if (questionOnly) add("guidance_question_not_management_statement", { basis: "original_question_not_an_issuer_forecast_answer" });
  if (historicalGuidance) add("guidance_historical_guidance_comparison", { basis: "original_metric_owned_actual_vs_target_language" });
  if (preliminaryActual) add("guidance_preliminary_historical_results", { basis: "original_preliminary_unaudited_results_language" });
  if (productSales) add("guidance_product_sales_not_company_total", { basis: "original_registered_product_performance_heading" });
  if (industrialSubset) add("guidance_non_company_or_non_periodic", { basis: "original_industrial_activities_segment_table" });
  if (incomePerShare) add("guidance_per_share_not_total_income", { basis: "original_net_income_per_share_wording" });
  if (incomeComponent) add("guidance_non_company_or_non_periodic", { basis: "original_other_net_income_component_not_total_net_income" });
  if (epsDriver) add("guidance_non_company_or_non_periodic", originalEpsComponent || { basis: "original_eps_driver_not_absolute_earnings_level" });
  if (fplSubsidiaryCapex) add("guidance_non_company_or_non_periodic", { basis: "nee_named_fpl_subsidiary_capital_plan_not_consolidated_capex" });
  if (wrongGrowthOwner) add("guidance_percentage_other_economic_owner", { basis: "original_ebitda_to_fcf_conversion_ratio", percentage: Number(conversionPercent[1]) });
  if (qualitativeRange) add("guidance_qualitative_range_endpoint_unquantified", { basis: "one_range_endpoint_is_qualitative_not_a_numeric_midpoint" });
  if (liquidityRatio) add("guidance_percentage_other_economic_owner", { basis: "original_liquidity_to_ttm_revenue_ratio_not_a_revenue_target" });
  if (cashNoncashBudget) add("guidance_cash_noncash_mapping_required", { basis: "capital_budget_definition_explicitly_includes_rou_or_noncash_assets" });
  if (owner.subset || ["segment_or_subset", "non_company_or_non_periodic"].includes(subject) || NON_PERIODIC.test(owner.text) || multiYearTarget) add("guidance_non_company_or_non_periodic", multiYearTarget ? { basis: "metric_owned_multi_year_target" } : undefined);
  else if (!COMPANY_SUBJECTS.has(subject)) add("guidance_subject_unresolved");
  if (!PERIODIC_SCOPES.has(scope)) add("guidance_scope_unresolved");
  else if (!(scope === "quarter" ? periodEvidence.quarter : periodEvidence.annual)) add("guidance_scope_not_supported_by_evidence");
  if (actualOrGuidance !== "guidance") add("guidance_not_designated_forward");
  if (amount != null) {
    if (!CURRENCIES.has(sourceCurrency)) add("guidance_source_currency_unresolved");
    const args = { amount, evidence, currency: sourceCurrency, sourceCurrency };
    for (const [reason, audit] of [
      ["guidance_historical_actual_amount", independentHistoricalActualAmountMismatch],
      ["guidance_non_guidance_amount_owner", independentNonGuidanceOwnerAmountMismatch],
      ["guidance_parallel_metric_amount_mismatch", independentParallelMetricAmountMismatch],
      ["guidance_full_dollar_amount_mismatch", independentFullDollarTargetMismatch],
      ["guidance_independent_amount_mismatch", independentGuidanceMidpointMismatch],
      ["guidance_source_currency_mismatch", independentGuidanceCurrencyMismatch]
    ]) {
      const mismatch = audit({ ...args, metricName });
      if (mismatch) add(reason, mismatch);
    }
  }
  if (perShareValue != null) {
    if (metricName !== "eps_guidance" || amount != null) add("guidance_per_share_metric_or_total_amount_conflict");
    if (!CURRENCIES.has(sourceCurrency)) add("guidance_source_currency_unresolved");
    const mismatch = independentPerShareEvidence({ evidence, value: perShareValue, unit: fields.unit, basis: fields.per_share_basis || "unspecified", currency: sourceCurrency });
    if (mismatch) add(mismatch.reason, mismatch);
  }
  if (["revenue_growth", "revenue_guidance"].includes(metricName) && scalarValues.growth_yoy != null) {
    const mismatch = independentGuidanceGrowthRangeMismatch({ growthYoy: scalarValues.growth_yoy, evidence: owner.text, targetYear: fields.guidance_target_year ?? fields.guidance_year });
    if (mismatch) add(mismatch.reason, mismatch);
    const yearMismatch = independentGuidanceGrowthRangeMismatch({ growthYoy: scalarValues.growth_yoy, evidence: `${evidence.match(/\b20\d{2}\s+(?:guidance|outlook)\b/i)?.[0] || ""}. ${owner.text}`, targetYear: fields.guidance_target_year ?? fields.guidance_year });
    if (yearMismatch?.reason === "guidance_target_year_mismatch") add(yearMismatch.reason, yearMismatch);
  }
  if (["revenue_growth", "revenue_guidance"].includes(metricName) && localForward) {
    let basisEvidence = evidence.slice(owner.metricIndex, owner.endIndex);
    const metricEnd = basisEvidence.match(METRIC_PATTERNS[metricName])?.[0]?.length ?? 0;
    const otherMetric = new RegExp(Object.entries(METRIC_PATTERNS).filter(([name]) => !["revenue_guidance", "revenue_growth"].includes(name)).map(([, pattern]) => `(?:${pattern.source})`).join("|"), "i");
    const nextOwner = basisEvidence.slice(metricEnd).search(otherMetric);
    if (nextOwner >= 0) basisEvidence = basisEvidence.slice(0, metricEnd + nextOwner);
    const mismatch = independentExplicitGrowthBasisMismatch({ evidence: basisEvidence,
      growthYoy: scalarValues.growth_yoy, growthQoq: scalarValues.growth_qoq });
    if (mismatch) add(mismatch.reason, mismatch);
  }
  // A missing extracted scalar is not proof of no quantified guidance when
  // the original metric-owned quotation itself contains a target. Keep such
  // extraction failures blocked instead of relabelling them research-only.
  const sourceQuantifiedButUnparsed = reasons.includes("guidance_not_quantified") && localForward && owner.supported && !owner.subset &&
    !NON_PERIODIC.test(owner.text) && !multiYearTarget && !qualitativeRange && !cashNoncashBudget && !productSales && !preliminaryActual && !industrialSubset && !incomePerShare && !incomeComponent && !epsDriver && !fplSubsidiaryCapex && !perShareRangeWidth &&
    (quotedMonetaryMetricTarget(metricName, evidence) || parallelFinancialTable || quotedGrowthMetricTarget(metricName, owner));
  if (sourceQuantifiedButUnparsed) add("guidance_quantified_source_not_extracted");
  else if (reasons.includes("guidance_not_quantified") && /\$\s*\(?[\d,]/.test(evidence)) add("guidance_no_owned_quantified_target", { basis: "nearby_currency_value_not_a_forward_target_of_this_metric" });
  const independentlyEligible = reasons.length === 0;
  const bookkeepingReasons = new Set(["guidance_subject_unresolved", "guidance_scope_unresolved", "guidance_not_designated_forward"]);
  const metadataConflict = reasons.length > 0 && reasons.every((reason) => bookkeepingReasons.has(reason)) &&
    owner.supported && !owner.subset && localForward && (periodEvidence.annual || periodEvidence.quarter) && !multiYearTarget;
  const quantifiedTarget = Object.values(scalarValues).some((value) => value != null) || quotedMonetaryMetricTarget(metricName, evidence);
  const scopeConflict = PERIODIC_SCOPES.has(scope) && localForward && !multiYearTarget && !owner.subset && !wrongGrowthOwner && !NON_PERIODIC.test(owner.text) && quantifiedTarget &&
    (scope === "quarter" ? periodEvidence.annual && !periodEvidence.quarter : periodEvidence.quarter && !periodEvidence.annual);
  const subjectConflict = quantifiedTarget && owner.total && !owner.subset && localForward &&
    ["segment_or_subset", "non_company_or_non_periodic"].includes(subject) && !NON_PERIODIC.test(owner.text) && !multiYearTarget;
  const currencyReviewIncomplete = officialCurrencyMismatch != null || reasons.length > 0 &&
    reasons.every((reason) => ["guidance_source_currency_unresolved", "guidance_source_currency_mismatch"].includes(reason));
  const quantifiedReviewIncomplete = reasons.length > 0 && reasons.every((reason) => [
    "guidance_source_currency_unresolved", "guidance_source_currency_mismatch", "guidance_parallel_metric_amount_mismatch",
    "guidance_independent_amount_mismatch", "guidance_full_dollar_amount_mismatch", "guidance_growth_range_mismatch", "guidance_growth_period_basis_mismatch", "guidance_growth_period_basis_ambiguous", "guidance_target_year_mismatch", "guidance_per_share_value_mismatch", "guidance_per_share_basis_invalid", "guidance_per_share_unit_invalid", "guidance_per_share_metric_or_total_amount_conflict"
  ].includes(reason)) || sourceQuantifiedButUnparsed && reasons.every((reason) => ["guidance_not_quantified", "guidance_quantified_source_not_extracted"].includes(reason))
    || reasons.includes("guidance_per_share_owner_ambiguous") && !historicalTable || unreviewedAdditionalPerShareTarget || originalSourceCorruption != null || hasPendingExtractionReview;
  if (quality !== "clear") add("guidance_quality_not_clear", { quality: quality || null });
  return {
    key: guidanceReleaseEventKey(row), sourceDatabase: String(row.source_database || row.source_type || fields.source_type || ""),
    sourceId: String(row.source_id ?? row.id ?? fields.id ?? ""), ticker: String(row.ticker || fields.ticker || "").toUpperCase(),
    period: normalizedPeriod(fields.fiscal_period), observedAt: String(fields.observed_at || "").slice(0, 10),
    metricName, scope, subject, quality, scalarValues, sourceCurrency, reportedSourceCurrency, issuerCurrencyEvidence,
    officialCurrencyEvidence: officialCurrencyContract && !officialCurrencyMismatch ? {
      currency: sourceCurrency, evidenceType: officialCurrencyContract.evidenceType,
      documentSha256: officialCurrencyContract.proof.documentSha256,
      sourceUrl: officialCurrencyContract.proof.sourceUrl,
      availableAt: officialCurrencyContract.proof.availableAt,
      inference: officialCurrencyContract.proof.inference === true
    } : null,
    targetYear: finite(fields.guidance_target_year ?? fields.guidance_year),
    usable: reasons.length === 0, independentlyEligible, metadataConflict: metadataConflict || subjectConflict || scopeConflict, currencyReviewIncomplete, quantifiedReviewIncomplete, rejectionReasons: [...new Set(reasons)].sort(), details,
    evidenceSha256: crypto.createHash("sha256").update(evidence).digest("hex"), evidence,
    declaredExclusionReason: fields.model_exclusion_reason || fields.currency_resolution?.rejectionReason || null,
    declaredSourceReview: fields.source_review || null, sourceUrl: fields.source_url || null
  };
}

function uniqueEffectiveEvents(events) {
  const officials = new Set(events.filter((event) => event.usable && OFFICIAL_SOURCES.has(event.sourceDatabase)).map((event) => event.metricName));
  const seen = new Set();
  return events.filter((event) => event.usable && (!officials.has(event.metricName) || OFFICIAL_SOURCES.has(event.sourceDatabase))).filter((event) => {
    const key = JSON.stringify([event.metricName, event.scalarValues, event.sourceCurrency, event.scope, event.subject, event.evidence]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SCALAR_INPUTS = [
  ["revenueGuidanceGrowth", ["revenue_growth", "revenue_guidance"], "growth_yoy"]
];
// These digest aggregates are displayed as research, not read by the valuation
// routes. The routes use PIT financial margins and revenueGuidanceGrowth.
// Keeping an actual/research value here is not itself model consumption.
const RESEARCH_DISPLAY_SCALARS = ["revenueGrowth", "operatingMargin", "grossMargin"];
const MONEY_SELECTIONS = [
  ["revenue", "revenue_guidance", "revenueGuidanceM"],
  ["operatingIncome", "operating_income_guidance", "operatingIncomeGuidanceM"],
  ["freeCashFlow", "free_cash_flow_guidance", "fcfGuidanceM"]
];

/** Independently reconcile raw retention, coverage, and model consumption.
 * rows/modelRuns may be SQLite iterate() generators; no IO is performed here.
 */
export function auditGuidanceCoverageRelease({ rows, financialRows = [], modelRuns = [], requiredTickers, noQuantifiedTickers, coverageRows = null, declaredCoverage = null, declaredStats = null }) {
  const required = new Set([...requiredTickers].map((ticker) => String(ticker).toUpperCase()));
  const failures = [];
  const assessed = [];
  const byPeriod = new Map();
  const byIdentity = new Map();
  const usableTickers = new Set();
  const rawTickers = new Set();
  const rawPeriods = new Set();
  const rejectedEventKeys = new Set();
  const reasonCounts = {};
  const researchEvidence = [];
  const resolvedCurrencyEvidence = [];
  const supersededCorruptSources = [];
  const reportingCurrencyAtOrBefore = createGuidanceReportingCurrencyResolver(financialRows);
  let usableEvents = 0;
  for (const row of rows) {
    const event = assessGuidanceReleaseEvent(row, { reportingCurrencyAtOrBefore });
    if (event.issuerCurrencyEvidence) resolvedCurrencyEvidence.push({ ticker: event.ticker, sourceId: event.sourceId, sourceDatabase: event.sourceDatabase, observedAt: event.observedAt, ...event.issuerCurrencyEvidence });
    if (event.officialCurrencyEvidence) resolvedCurrencyEvidence.push({ ticker: event.ticker, sourceId: event.sourceId, sourceDatabase: event.sourceDatabase, observedAt: event.observedAt, ...event.officialCurrencyEvidence });
    assessed.push(event);
    rawTickers.add(event.ticker);
    if (event.period) rawPeriods.add(`${event.ticker}::${event.period}`);
    if (byIdentity.has(event.key)) failures.push({ code: "duplicate_guidance_raw_identity", sourceId: event.sourceId, sourceDatabase: event.sourceDatabase });
    byIdentity.set(event.key, event);
    const periodKey = `${event.ticker}::${event.period}`;
    if (!byPeriod.has(periodKey)) byPeriod.set(periodKey, []);
    byPeriod.get(periodKey).push(event);
    if (!required.has(event.ticker)) failures.push({ code: "unexpected_raw_guidance_ticker", ticker: event.ticker, sourceId: event.sourceId });
    if (!event.sourceId || !event.sourceDatabase) failures.push({ code: "guidance_raw_identity_missing", ticker: event.ticker, sourceId: event.sourceId });
    if (!validDate(event.observedAt) || !/^Q[1-4]20\d{2}$/.test(event.period)) failures.push({ code: "guidance_raw_temporal_identity_unresolved", ticker: event.ticker, sourceId: event.sourceId, observedAt: event.observedAt, fiscalPeriod: event.period });
    if (event.usable) { usableEvents += 1; usableTickers.add(event.ticker); }
    else {
      rejectedEventKeys.add(event.key);
      for (const reason of event.rejectionReasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      researchEvidence.push({ ticker: event.ticker, fiscalPeriod: event.period, sourceDatabase: event.sourceDatabase, sourceId: event.sourceId, observedAt: event.observedAt, reasons: event.rejectionReasons, details: event.details, evidenceSha256: event.evidenceSha256 });
      if (event.independentlyEligible) failures.push({ code: "usable_guidance_rejected_only_by_quality", ticker: event.ticker, sourceId: event.sourceId, quality: event.quality });
      if (event.metadataConflict) failures.push({ code: "guidance_semantic_classification_conflict", ticker: event.ticker, sourceId: event.sourceId, reasons: event.rejectionReasons });
      if (event.currencyReviewIncomplete) failures.push({ code: "guidance_currency_review_incomplete", ticker: event.ticker, sourceId: event.sourceId, reasons: event.rejectionReasons });
      else if (event.quantifiedReviewIncomplete) failures.push({ code: "guidance_quantified_evidence_review_incomplete", ticker: event.ticker, sourceId: event.sourceId, reasons: event.rejectionReasons });
    }
  }
  // A proven corrupt transcript remains rejected and fully retained. Only an
  // explicit, hash-bound, SAME-DATE official replacement closes its unresolved
  // review. Reconstruct its range independently; never trust the review label,
  // stored amount, producer selected_values, or a later official announcement.
  for (const event of assessed.filter(item => item.declaredSourceReview)) {
    const review = event.declaredSourceReview;
    const target = review.replacement || {};
    const replacement = byIdentity.get(JSON.stringify([target.sourceDatabase, target.sourceId]));
    const range = replacement && independentOwnedMonetaryRangeTarget({ metricName: replacement.metricName, evidence: replacement.evidence });
    const valid = review.type === "corrupt_numeric_source_superseded" &&
      event.sourceDatabase === "downloaded_online_earnings_transcript" &&
      event.quality === "research_only_corrupt_source" && !event.usable &&
      Object.values(event.scalarValues).every(value => value == null) &&
      review.originalEvidenceSha256 === event.evidenceSha256 &&
      event.rejectionReasons.includes("guidance_corrupt_original_source") &&
      replacement?.usable && OFFICIAL_SOURCES.has(replacement.sourceDatabase) &&
      replacement.ticker === event.ticker && replacement.metricName === event.metricName &&
      replacement.period === event.period && replacement.observedAt === event.observedAt &&
      replacement.scope === event.scope && replacement.evidenceSha256 === target.evidenceSha256 &&
      (replacement.targetYear ?? Number(replacement.period.slice(2))) === (event.targetYear ?? Number(event.period.slice(2))) &&
      validDate(replacement.observedAt) && target.observedAt === replacement.observedAt &&
      target.ticker === replacement.ticker && normalizedPeriod(target.fiscalPeriod) === replacement.period &&
      target.metricName === replacement.metricName && target.sourceUrl === replacement.sourceUrl &&
      /^https:\/\//.test(replacement.sourceUrl || "") && range &&
      close(range.amountM, replacement.scalarValues.amount) &&
      (!event.details.guidance_corrupt_original_source.explicitCurrency ||
        event.details.guidance_corrupt_original_source.explicitCurrency === replacement.sourceCurrency) &&
      !independentGuidanceCurrencyMismatch({ amount: range.amountM, evidence: event.evidence,
        currency: replacement.sourceCurrency, sourceCurrency: replacement.sourceCurrency });
    if (!valid) {
      failures.push({ code: "guidance_corrupt_source_replacement_invalid", ticker: event.ticker,
        sourceId: event.sourceId, claimedReplacement: target });
      continue;
    }
    // Remove only this handled source's extraction-review blocker. All other
    // identity, temporal, currency, semantic and model-consumption gates stay.
    for (let index = failures.length - 1; index >= 0; index -= 1) {
      if (failures[index].code === "guidance_quantified_evidence_review_incomplete" &&
          failures[index].ticker === event.ticker && failures[index].sourceId === event.sourceId) failures.splice(index, 1);
    }
    supersededCorruptSources.push({ ticker: event.ticker, sourceId: event.sourceId,
      sourceDatabase: event.sourceDatabase, originalEvidenceSha256: event.evidenceSha256,
      observedAt: event.observedAt, status: "independently_verified_official_replacement_original_remains_rejected",
      replacement: target, independentlyReconstructedRange: range });
  }
  // A failed/incomplete filing review is neither covered nor evidence of no
  // guidance. Reconcile its exact issuer population separately, while keeping
  // every incomplete issuer a release blocker. Legacy closed-release callers
  // without a ledger retain their original all-required binary guard.
  const incompleteTickers = new Set();
  const coverageByTicker = new Map();
  const coverageHistogram = {};
  if (coverageRows != null) {
    for (const row of coverageRows) {
      const ticker = String(row.ticker || "").toUpperCase();
      const status = String(row.status || "");
      if (coverageByTicker.has(ticker)) failures.push({ code: "guidance_coverage_duplicate_issuer", ticker });
      if (!required.has(ticker)) failures.push({ code: "guidance_coverage_unexpected_issuer", ticker });
      coverageByTicker.set(ticker, status);
      coverageHistogram[status] = (coverageHistogram[status] || 0) + 1;
      if (!["covered", "covered_official_filing", "no_quantified_official_guidance"].includes(status)) {
        incompleteTickers.add(ticker);
        failures.push({ code: "guidance_coverage_review_incomplete", ticker, status });
      }
    }
    for (const ticker of required) if (!coverageByTicker.has(ticker)) {
      incompleteTickers.add(ticker);
      failures.push({ code: "guidance_coverage_missing_issuer", ticker });
    }
    if (declaredCoverage) for (const status of new Set([...Object.keys(coverageHistogram), ...Object.keys(declaredCoverage)])) {
      if (Number(declaredCoverage[status] || 0) !== Number(coverageHistogram[status] || 0)) failures.push({ code: "guidance_coverage_status_count_mismatch", status, declared: Number(declaredCoverage[status] || 0), independentlyCounted: Number(coverageHistogram[status] || 0) });
    }
    const ledgerNoQuantified = [...coverageByTicker].filter(([, status]) => status === "no_quantified_official_guidance").map(([ticker]) => ticker).sort();
    if (JSON.stringify(ledgerNoQuantified) !== JSON.stringify([...noQuantifiedTickers].map((ticker) => String(ticker).toUpperCase()).sort())) failures.push({ code: "guidance_coverage_no_quantified_ledger_mismatch", ledger: ledgerNoQuantified });
  }
  const completeRequired = [...required].filter((ticker) => !incompleteTickers.has(ticker));
  const expectedNoQuantifiedTickers = completeRequired.filter((ticker) => !usableTickers.has(ticker)).sort();
  const expectedCovered = completeRequired.filter((ticker) => usableTickers.has(ticker)).length;
  const actualNoQuantified = [...noQuantifiedTickers].map((ticker) => String(ticker).toUpperCase());
  if (JSON.stringify(actualNoQuantified) !== JSON.stringify(expectedNoQuantifiedTickers)) failures.push({ code: "no_quantified_guidance_evidence_mismatch", actual: actualNoQuantified, expected: expectedNoQuantifiedTickers });
  if (declaredCoverage) {
    const noQuantified = Number(declaredCoverage.no_quantified_official_guidance || 0);
    const covered = Number(declaredCoverage.covered || 0) + Number(declaredCoverage.covered_official_filing || 0);
    if (noQuantified !== expectedNoQuantifiedTickers.length || covered !== expectedCovered) failures.push({ code: "guidance_coverage_usable_count_mismatch", noQuantified, covered, expectedNoQuantified: expectedNoQuantifiedTickers.length, expectedCovered });
  }
  const rawStats = { events: assessed.length, tickers: rawTickers.size, periods: rawPeriods.size };
  if (declaredStats) for (const field of Object.keys(rawStats)) if (Number(declaredStats[field]) !== rawStats[field]) failures.push({ code: "guidance_raw_count_mismatch", field, stored: Number(declaredStats[field]), independentlyCounted: rawStats[field] });

  let modelRunsAudited = 0;
  let selectedEvidenceChecks = 0;
  let scalarInputChecks = 0;
  for (const run of modelRuns) {
    modelRunsAudited += 1;
    const ticker = String(run.ticker || "").toUpperCase();
    const period = normalizedPeriod(run.fiscal_period || run.fiscalPeriod);
    const input = run.input || object(run.input_json);
    const guidance = input.guidance || {};
    const asOf = String(run.as_of_date || run.asOfDate || "").slice(0, 10);
    const periodEvents = byPeriod.get(`${ticker}::${period}`) || [];
    const visible = periodEvents.filter((event) => event.observedAt && event.observedAt <= asOf);
    const effective = uniqueEffectiveEvents(visible);
    const selection = guidance.guidanceSelection || {};
    for (const [metric, metricName, annualAmountField] of MONEY_SELECTIONS) {
      const metricSelection = selection[metric] || {};
      for (const field of ["acceptedEvidenceIds", "unscopedEvidenceIds", "quarterEvidenceIds"]) {
        for (const id of metricSelection[field] || []) {
          selectedEvidenceChecks += 1;
          // Existing model lineage stores IDs without source namespace. Demand
          // an unambiguous same-issuer/period/metric binding, never a global ID.
          const matches = periodEvents.filter((event) => event.sourceId === String(id) && event.metricName === metricName);
          if (matches.length !== 1) failures.push({ code: "selected_guidance_identity_unresolved", ticker, period, metric, evidenceId: String(id), matches: matches.length });
          else if (!matches[0].usable) failures.push({ code: "research_only_guidance_selected", ticker, period, metric, evidenceId: String(id), reasons: matches[0].rejectionReasons });
          else if (!matches[0].observedAt || matches[0].observedAt > asOf) failures.push({ code: "selected_guidance_not_event_visible", ticker, period, evidenceId: String(id), observedAt: matches[0].observedAt, asOf });
        }
      }
      for (const event of effective.filter((candidate) => candidate.metricName === metricName && candidate.scalarValues.amount > 0)) {
        const field = event.scope === "quarter" ? "quarterEvidenceIds" : "acceptedEvidenceIds";
        if (!(metricSelection[field] || []).map(String).includes(event.sourceId)) failures.push({ code: "usable_quantified_guidance_silently_ignored", ticker, period, metric, evidenceId: event.sourceId, expectedSelection: field });
      }
      for (const [amountField, idField] of [
        [annualAmountField, "acceptedEvidenceIds"],
        ...(metric === "revenue" ? [["revenueUnscopedGuidanceM", "unscopedEvidenceIds"], ["revenueQuarterGuidanceM", "quarterEvidenceIds"]] : [])
      ]) {
        const storedAmount = finite(guidance[amountField]);
        const ids = metricSelection[idField] || [];
        if (storedAmount != null && !ids.length) failures.push({ code: "monetary_guidance_missing_contributor_ids", ticker, period, field: amountField, stored: storedAmount });
        if (!ids.length) continue;
        const targetCurrency = reportingCurrencyAtOrBefore.modelCurrencyAtOrBefore(ticker, asOf);
        const amounts = [];
        for (const id of ids) {
          const candidates = visible.filter((event) => event.sourceId === String(id) && event.metricName === metricName && event.usable);
          if (candidates.length !== 1) continue; // Specific lineage failure is emitted above.
          const event = candidates[0];
          const sourceAmount = event.scalarValues.amount;
          const conversions = (guidance.fxConversions || []).filter((fx) =>
            fx.sourceCurrency === event.sourceCurrency && (!targetCurrency || fx.targetCurrency === targetCurrency) && close(finite(fx.sourceAmountM), sourceAmount)
          );
          if (targetCurrency && targetCurrency !== event.sourceCurrency && !conversions.length) {
            failures.push({ code: "monetary_guidance_missing_event_visible_fx", ticker, period, field: amountField, evidenceId: event.sourceId, sourceCurrency: event.sourceCurrency, targetCurrency });
            continue;
          }
          if (!conversions.length) { amounts.push(sourceAmount); continue; }
          const valid = conversions.filter((fx) => finite(fx.conversionRate) > 0 &&
            validDate(fx.sourceRateDate) && fx.sourceRateDate <= event.observedAt &&
            validDate(fx.targetRateDate) && fx.targetRateDate <= event.observedAt &&
            close(finite(fx.modelAmountM), sourceAmount * finite(fx.conversionRate)) && /\becb\.europa\.eu\b/i.test(String(fx.source || "")));
          const convertedAmounts = [...new Set(valid.map((fx) => finite(fx.modelAmountM)))];
          if (convertedAmounts.length !== 1) failures.push({ code: "monetary_guidance_fx_evidence_invalid", ticker, period, field: amountField, evidenceId: event.sourceId });
          else amounts.push(convertedAmounts[0]);
        }
        if (!close(storedAmount, median(amounts))) failures.push({ code: "monetary_guidance_contributor_value_mismatch", ticker, period, field: amountField, stored: storedAmount, expected: median(amounts) });
      }
    }
    for (const [field, names, scalar] of SCALAR_INPUTS) {
      const candidates = effective.filter((event) => names.includes(event.metricName) && event.scalarValues[scalar] != null);
      const expected = median(candidates.map((event) => event.scalarValues[scalar]));
      const stored = finite(guidance[field]);
      scalarInputChecks += 1;
      if (!close(stored, expected)) failures.push({ code: stored == null && expected != null ? "usable_quantified_guidance_silently_ignored" : "guidance_scalar_research_exclusion_mismatch", ticker, period, field, stored, expected, expectedEvidenceIds: candidates.map((event) => event.sourceId) });
      const researchCandidates = visible.filter((event) => !event.usable && names.includes(event.metricName) && event.scalarValues[scalar] != null);
      const evidenceIds = guidance.scalarEvidenceIds?.[field];
      // A matching median alone cannot prove exclusion when rejected and valid
      // quotes happen to contain the same number. Require contributor lineage.
      if (stored != null && researchCandidates.length && !Array.isArray(evidenceIds)) failures.push({ code: "missing_scalar_guidance_exclusion_lineage", ticker, period, field, researchEvidenceIds: researchCandidates.map((event) => event.sourceId) });
      if (Array.isArray(evidenceIds)) {
        const selected = [];
        for (const id of evidenceIds) {
          selectedEvidenceChecks += 1;
          const matches = periodEvents.filter((event) => event.sourceId === String(id) && names.includes(event.metricName));
          if (matches.length !== 1) failures.push({ code: "selected_guidance_identity_unresolved", ticker, period, field, evidenceId: String(id), matches: matches.length });
          else if (!matches[0].usable) failures.push({ code: "research_only_guidance_selected", ticker, period, field, evidenceId: String(id), reasons: matches[0].rejectionReasons });
          else if (!matches[0].observedAt || matches[0].observedAt > asOf) failures.push({ code: "selected_guidance_not_event_visible", ticker, period, field, evidenceId: String(id), observedAt: matches[0].observedAt, asOf });
          else selected.push(matches[0].scalarValues[scalar]);
        }
        if (!close(stored, median(selected))) failures.push({ code: "guidance_scalar_contributor_value_mismatch", ticker, period, field, stored, contributors: median(selected) });
      }
    }
  }
  return {
    rawStats, usableEvents, usableTickers: usableTickers.size, researchEvents: researchEvidence.length,
    researchOnlyTickers: [...rawTickers].filter((ticker) => !usableTickers.has(ticker)).sort(),
    noEvidenceTickers: [...required].filter((ticker) => !rawTickers.has(ticker)).sort(),
    expectedNoQuantifiedTickers, reasonCounts, researchEvidence, resolvedCurrencyEvidence, supersededCorruptSources,
    coverageReconciliation: { basis: coverageRows == null ? "legacy_complete_required_set" : "exact_issuer_three_state_ledger", completeIssuers: completeRequired.length, incompleteTickers: [...incompleteTickers].sort(), expectedCovered, statusCounts: coverageHistogram },
    researchOnlyDisplayFields: RESEARCH_DISPLAY_SCALARS,
    modelRunsAudited, selectedEvidenceChecks, scalarInputChecks, failures,
    // Used only to coordinate the separate original-quote arithmetic audits.
    // Every exemption is still listed above and checked for non-consumption.
    rejectedEventKeys
  };
}
