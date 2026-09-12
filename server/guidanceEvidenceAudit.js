// Independent reconstruction of the original evidence; do not consume the
// Python extractor's selected values or inferred ISO code as audit evidence.
const AUDIT_CURRENCY_TOKEN = String.raw`(?:\bUS\$|\bU\.?S\.?\s+dollars?\b|\b(?:USD|MXN|GBP|EUR)(?![A-Za-z_])|\bMEX\$|\bMX\$|\bPs\.|\bMexican\s+pesos?\b|[$£€])`;
const AUDIT_CURRENCY_SUFFIX = String.raw`(?:USD|MXN|GBP|EUR|Mexican\s+pesos?|U\.?S\.?\s+dollars?)\b`;
const MONEY_AMOUNT_RE = new RegExp(String.raw`(?<currency>${AUDIT_CURRENCY_TOKEN})?\s*(?<value>\d[\d,]*(?:\.\d+)?)\s*(?<scale>billion|million|thousand|bn|mm|mn|m)\b(?:\s*(?<currencySuffix>${AUDIT_CURRENCY_SUFFIX}))?`, "gi");
const MONEY_SHARED_SCALE_RANGE_RE = new RegExp(String.raw`(?:(?<leftDirection>down|negative|minus|up|positive|plus)\s+)?(?:(?<leftCurrency>${AUDIT_CURRENCY_TOKEN})\s*)?(?<left>\d[\d,]*(?:\.\d+)?)\s*(?:to|through|[-–—])\s*(?:(?<rightDirection>down|negative|minus|up|positive|plus)\s+)?(?:(?<rightCurrency>${AUDIT_CURRENCY_TOKEN})\s*)?(?<right>\d[\d,]*(?:\.\d+)?)\s*(?<scale>billion|million|thousand|bn|mm|mn|m)\b(?:\s*(?<currencySuffix>${AUDIT_CURRENCY_SUFFIX}))?`, "gi");
const PARALLEL_MONETARY_METRICS = [
  ["free_cash_flow_guidance", /\b(?:free cash flow|fcf)\b/gi],
  ["operating_cash_flow_guidance", /\b(?:operating cash flow|cash from operations)\b/gi],
  ["capex_guidance", /\b(?:capital expenditures?|capital spending|capital investments?|capex)\b/gi],
  ["ebitda_guidance", /\b(?:adjusted\s+)?ebitda\b/gi],
  ["operating_income_guidance", /\b(?:operating income|income from operations|operating profit|(?:adjusted\s+)?ebit)\b/gi],
  ["net_income_guidance", /\b(?:adjusted\s+)?net income\b/gi],
  ["revenue_guidance", /\b(?:revenues?|sales)\b/gi],
  ["backlog_guidance", /\b(?:remaining performance obligation|rpo|backlog|bookings|billings|arr)\b/gi]
];
const NON_GUIDANCE_AMOUNT_OWNER_RE = /\b(?:costs?|expenses?|savings?|charges?|synergies?|tax expense|depreciation and amortization|depreciation|amortization|d\s*&\s*a|general and administrative|g\s*&\s*a|freight|foreign exchange|fx|currency headwind|debt|dividends?|shareholder returns?|returns? to shareholders?|operating cash flow|cash from operations|diluted share count|share count|shares|share repurchases?|cash balance|cash on hand|available borrowings|liquidity)\b/gi;
const ANY_MONETARY_METRIC_RE = /\b(?:free cash flow|fcf|operating cash flow|cash from operations|capital expenditures?|capital spending|capital investments?|capex|ebitda|operating income|income from operations|operating profits?|(?:adjusted\s+)?ebit|net income|revenue|revenues|sales|backlog|bookings|billings|arr|rpo)\b/gi;
const HISTORICAL_AMOUNT_LEAD_RE = /\b(?:came in(?: at)?|grew to|increased to|decreased to|declined to|rose to|fell to|reached)\b[^,.;]{0,100}?(?:approximately|about|roughly|around|nearly|over|more than|less than|at least|of|at|to)?\s*$|\b(?:we|they|it|the company|the business|the segment)\s+(?:delivered|reported|recorded|generated|achieved)\b[^,.;]{0,100}(?:approximately|about|roughly|around|nearly|over|more than|less than|at least|of|at|to)?\s*$|\b(?:we|the company|the business)\s+closed\b[^,.;]{0,100}\b(?:with|at|of)\s*$|\brecord\s+(?:revenue|revenues|sales|earnings|income|cash flow)\s+of\s*$|\b(?:net loss|net income|revenue|revenues|sales|operating income|operating profit|free cash flow)\b[^,.;]{0,100}\b(?:was|were)\s*$/i;
const HISTORICAL_ACRONYM_AMOUNT_LEAD_RE = /\b[A-Z][A-Z0-9&.-]{1,9}\s+(?:delivered|reported|recorded|generated|achieved)\b[^,.;]{0,100}(?:approximately|about|roughly|around|nearly|over|more than|less than|at least|of|at|to)?\s*$/;
const HISTORICAL_AMOUNT_TRAIL_RE = /^[^.;]{0,120}\b(?:we|the company|the business)?\s*(?:delivered|reported|recorded|generated|achieved)\b/i;
const HISTORICAL_COMPARISON_LEAD_RE = /\b(?:versus|compared (?:with|to)|relative to|from|what)\b[^.;]{0,120}$/i;
const STRICT_FORWARD_VALUE_RE = /\bwe\b[^.;]{0,80}\b(?:expect|anticipate|forecast|project|target|intend|plan)\b|\b(?:is|are) expected to\b|\b(?:raise|raised|raising|lower|lowered|lowering|reaffirm|reaffirmed|reaffirming|update|updated|updating|maintain|maintained|maintaining)\b[^.;]{0,80}\bguidance\b|\b(?:target|goal|plan) of\b/i;

function finite(value) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function auditIsoCurrency(token) {
  const value = String(token || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (/^(?:MXN|MEX\$|MX\$|PS\.|MEXICAN PESOS?)$/.test(value)) return "MXN";
  if (/^(?:USD|US\$|U\.?S\.? DOLLARS?)$/.test(value)) return "USD";
  if (["£", "GBP"].includes(value)) return "GBP";
  if (["€", "EUR"].includes(value)) return "EUR";
  return null;
}

function auditAmountCurrency(text, ...tokens) {
  const explicit = [...new Set(tokens.map(auditIsoCurrency).filter(Boolean))];
  if (explicit.length) return { currency: explicit.length === 1 ? explicit[0] : null, currencyConflict: explicit.length > 1 };
  const context = [...new Set([...text.matchAll(new RegExp(AUDIT_CURRENCY_TOKEN, "gi"))].map((match) => auditIsoCurrency(match[0])).filter(Boolean))];
  return { currency: context.length === 1 ? context[0] : null, currencyConflict: false };
}

function auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion }) {
  // A converted model amount is not the scalar stated by management.
  return finite(sourceAmountM ?? fxConversion?.sourceAmountM ?? fx_conversion?.sourceAmountM ?? amount);
}

function closeEnough(actual, expected, tolerance = 1e-7) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected));
}

export function guidanceMonetaryAmountsM(value) {
  const text = String(value || "").replaceAll("\u00c2\u00b1", " \u00b1");
  const ranges = [...text.matchAll(MONEY_SHARED_SCALE_RANGE_RE)].filter((match) => {
    const leftNumber = Number(match.groups.left.replaceAll(",", ""));
    return match.groups.leftCurrency || !Number.isInteger(leftNumber) || leftNumber < 1900 || leftNumber > 2100;
  });
  const coveredSpans = ranges.map((match) => [match.index, match.index + match[0].length]);
  const sharedValues = ranges.flatMap((match) => {
    const { left, right, leftCurrency, rightCurrency, leftDirection, rightDirection, scale: rawScale, currencySuffix } = match.groups;
    const scale = rawScale.toLowerCase();
    const multiplier = ["billion", "bn"].includes(scale) ? 1_000 : scale === "thousand" ? 0.001 : 1;
    const leftToken = leftDirection || leftCurrency || left;
    const rightToken = rightDirection || rightCurrency || right;
    const leftOffset = match[0].indexOf(leftToken);
    const rightOffset = match[0].lastIndexOf(rightToken);
    const leftSign = /^(?:down|negative|minus)$/i.test(leftDirection || "") ? -1 : 1;
    const rightSign = /^(?:down|negative|minus)$/i.test(rightDirection || "") ? -1 : 1;
    return [
      {
        amountM: leftSign * Number(left.replaceAll(",", "")) * multiplier,
        ...auditAmountCurrency(text, leftCurrency, currencySuffix),
        text: `${leftDirection || ""} ${leftCurrency || rightCurrency || ""}${left} ${rawScale}`.trim(),
        start: match.index + leftOffset,
        end: match.index + match[0].indexOf(left, leftOffset) + left.length
      },
      {
        amountM: rightSign * Number(right.replaceAll(",", "")) * multiplier,
        ...auditAmountCurrency(text, rightCurrency, currencySuffix),
        text: `${rightDirection || ""} ${rightCurrency || leftCurrency || ""}${right} ${rawScale}`.trim(),
        start: match.index + rightOffset,
        end: match.index + match[0].length
      }
    ];
  });
  const ordinaryValues = [...text.matchAll(MONEY_AMOUNT_RE)]
    .filter((match) => !coveredSpans.some(([start, end]) =>
      start <= match.index && match.index + match[0].length <= end
    ))
    .map((match) => {
    const raw = Number(match.groups.value.replaceAll(",", ""));
    const scale = match.groups.scale.toLowerCase();
    let amountM = ["billion", "bn"].includes(scale)
      ? raw * 1_000
      : scale === "thousand"
        ? raw / 1_000
        : raw;
    const direction = text.slice(Math.max(0, match.index - 18), match.index);
    if (/\b(?:down|negative|minus)\s*$/i.test(direction)) amountM *= -1;
    return {
      amountM,
      ...auditAmountCurrency(text, match.groups.currency, match.groups.currencySuffix),
      text: match[0].trim(),
      start: match.index,
      end: match.index + match[0].length
    };
  });
  // Independently recover comma-formatted original-currency units. Explicit
  // currency and two comma groups avoid confusing years, EPS and share counts
  // with millions. Do not rely on the extractor's selected_values or amount.
  const rawDollarPattern = new RegExp(String.raw`(?<currency>${AUDIT_CURRENCY_TOKEN})\s*(?<open>\()?\s*(?<value>\d{1,3}(?:\s*,\s*\d{3}){2,}(?:\.\d+)?)(?<close>\))?(?!\d|,\s*\d)`, "gi");
  const fullDollarValues = [...text.matchAll(rawDollarPattern)]
    .filter((match) => ![...sharedValues, ...ordinaryValues].some(value => value.start <= match.index && match.index < value.end))
    .filter((match) => Boolean(match.groups.open) === Boolean(match.groups.close))
    .filter((match) => !/^\s*(?:billion|million|thousand|bn|mm|mn|m|b)\b/i.test(text.slice(match.index + match[0].length)))
    .map((match) => ({
      amountM: Number(match.groups.value.replace(/[,\s]/g, "")) / 1_000_000 *
        (match.groups.open || /\b(?:down|negative|minus)\s*$/i.test(text.slice(Math.max(0, match.index - 18), match.index)) ? -1 : 1),
      ...auditAmountCurrency(text, match.groups.currency),
      text: match[0], start: match.index, end: match.index + match[0].length
    }));
  const quotedValues = [...sharedValues, ...ordinaryValues, ...fullDollarValues];
  const zeroEndpoints = quotedValues.flatMap(value => {
    const suffix = text.slice(value.end);
    const zero = /^\s+(?:to|through)\s+(break[- ]?even|zero)\b/i.exec(suffix);
    if (!zero) return [];
    const offset = zero[0].lastIndexOf(zero[1]);
    return [{ ...value, amountM: 0, text: zero[1], start: value.end + offset,
      end: value.end + offset + zero[1].length, literalZeroEndpoint: true }];
  });
  return [...quotedValues, ...zeroEndpoints].sort((left, right) => left.start - right.start);
}

function pairIsExplicitRange(text, left, right) {
  const connector = text.slice(left.end, right.start);
  const prefix = text.slice(Math.max(0, left.start - 80), left.start);
  const normalizedConnector = connector.replace(
    new RegExp(String.raw`(?:${AUDIT_CURRENCY_TOKEN}|JPY|CNY|RMB|CAD|AUD|CHF)\s*$`, "i"),
    ""
  );
  if (/^\s*[-\u2013\u2014]\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?$/i.test(normalizedConnector)) return true;
  if (/^\s*(?:to|through)\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?$/i.test(normalizedConnector)) {
    if (!/\bfrom\s*$/i.test(prefix)) return true;
    if (/\b(?:range|guidance)\b[^.;]{0,50}\bfrom\s*$/i.test(prefix)) return true;
  }
  if (/^\s*,?\s*and\s*$/i.test(normalizedConnector)) {
    if (new RegExp(String.raw`(?:\bbetween|\brange(?:d)?(?:\s+of)?)\s+(?:(?:about|approximately|roughly|around|nearly)\s+)?(?:${AUDIT_CURRENCY_TOKEN}|JPY|CNY|RMB|CAD|AUD|CHF)?\s*$`, "i").test(prefix)) {
      return true;
    }
  }
  const lowEnd = /\blow end\b[^.;]{0,50}\b(?:to|at|of)\s*(?:(?:about|approximately|roughly|around|nearly)\s+)?(?:(?:USD|GBP|EUR|JPY|CNY|RMB|CAD|AUD|CHF)\s*|US\$|[$\u00a3\u20ac])?\s*$/i.test(prefix);
  const highEnd = /^\s*,?\s*(?:and\s+)?(?:(?:maintain|maintaining|keep|keeping|raise|raising|lower|lowering|leave|leaving)\s+)?(?:the\s+|our\s+)?high end\b[^.;]{0,35}\b(?:at|to|of)\s*$/i.test(normalizedConnector);
  return lowEnd && highEnd;
}

export function independentMalformedMonetarySource({ metricName, evidence }) {
  const text = String(evidence || "");
  const metric = PARALLEL_MONETARY_METRICS.find(([name]) => name === metricName)?.[1];
  if (!metric) return null;
  for (const owner of text.matchAll(metric)) {
    const suffix = text.slice(owner.index + owner[0].length);
    const next = suffix.search(new RegExp(`${ANY_MONETARY_METRIC_RE.source}|\\b(?:EPS|earnings per share|costs?|expenses?|shares?)\\b`, "i"));
    const clause = next < 0 ? suffix : suffix.slice(0, next);
    const malformed = clause.match(/([$£€])\s*\d+\.\s*,\s*\d{3}/);
    if (malformed) return {
      reason: "guidance_original_currency_number_format_requires_review",
      explicitCurrency: auditIsoCurrency(malformed[1]),
      basis: "malformed_decimal_comma_separator_in_original_metric_owned_range"
    };
  }
  return null;
}

// Narrow independent oracle for a reviewed replacement: a SINGLE directly
// owned explicit monetary range in the original official quote. An arbitrary
// scalar, guessed digit repair, or producer-selected endpoints cannot qualify.
export function independentOwnedMonetaryRangeTarget({ metricName, evidence }) {
  const text = String(evidence || "");
  const metric = PARALLEL_MONETARY_METRICS.find(([name]) => name === metricName)?.[1];
  if (!metric || independentMalformedMonetarySource({ metricName, evidence })) return null;
  const values = guidanceMonetaryAmountsM(text);
  const targets = [];
  for (const owner of text.matchAll(metric)) {
    const start = owner.index + owner[0].length;
    const suffix = text.slice(start);
    const next = suffix.search(new RegExp(`${ANY_MONETARY_METRIC_RE.source}|\\b(?:EPS|earnings per share|costs?|expenses?|shares?)\\b`, "i"));
    const end = next < 0 ? text.length : start + next;
    const owned = values.filter(value => value.start >= start && value.end <= end);
    if (owned.length !== 2 || owned[0].amountM > owned[1].amountM || !pairIsExplicitRange(text, ...owned)) continue;
    const lead = text.slice(start, owned[0].start);
    if (lead.length > 160 || /\b(?:compared|versus|previous|prior|reported|was|were|by)\b|[;\n]/i.test(lead)) continue;
    targets.push({ amountM: (owned[0].amountM + owned[1].amountM) / 2,
      lowM: owned[0].amountM, highM: owned[1].amountM,
      metricIndex: owner.index, originalRange: text.slice(owned[0].start, owned[1].end) });
  }
  return targets.length === 1 ? targets[0] : null;
}

export function independentFullDollarTargetMismatch({ metricName, amount, evidence, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  const text = String(evidence || "");
  const metric = PARALLEL_MONETARY_METRICS.find(([name]) => name === metricName)?.[1];
  if (storedAmountM == null || !metric) return null;
  const money = guidanceMonetaryAmountsM(text);
  const expected = [];
  for (const owner of text.matchAll(metric)) {
    const suffix = text.slice(owner.index + owner[0].length);
    const nextOwner = suffix.search(new RegExp(`${ANY_MONETARY_METRIC_RE.source}|\\b(?:EPS|earnings per share|gross margins?|operating margins?|costs?|expenses?|shares?)\\b`, "i"));
    const end = nextOwner < 0 ? text.length : owner.index + owner[0].length + nextOwner;
    const originalClause = text.slice(owner.index + owner[0].length, end);
    if (independentMalformedMonetarySource({ metricName, evidence: owner[0] + originalClause })) {
      // HON's retained transcript has '$38.,100,000,000-$38,900,000,000'.
      // A readable right endpoint cannot silently stand in for a corrupted
      // range. Do not repair the source digit sequence or guess the midpoint.
      return { reason: "guidance_original_currency_number_format_requires_review", storedAmountM,
        basis: "malformed_decimal_comma_separator_in_original_metric_owned_range" };
    }
    const values = money.filter(value => value.start >= owner.index + owner[0].length && value.end <= end);
    if (!values.length || !values.some(value => /\d{1,3}(?:\s*,\s*\d{3}){2,}/.test(value.text))) continue;
    const connector = text.slice(owner.index + owner[0].length, values[0].start);
    if (connector.length > 160 || /\b(?:compared|versus|previous|prior|reported|was|were|by)\b|[;\n]/i.test(connector)) continue;
    expected.push(values.length > 1 && pairIsExplicitRange(text, values[0], values[1])
      ? (values[0].amountM + values[1].amountM) / 2 : values[0].amountM);
  }
  if (!expected.length || expected.some(value => closeEnough(value, storedAmountM))) return null;
  return { reason: "guidance_full_dollar_amount_mismatch", storedAmountM, expectedAmountsM: expected,
    basis: "independently_owned_original_full_currency_units_divided_by_one_million" };
}

function historicalActualValue(text, value) {
  const left = text.slice(Math.max(0, value.start - 180), value.start);
  if (/\b(?:provided|contributed|generated)\s+(?:an?\s+)?incremental\s*$/i.test(left)) return true;
  const right = text.slice(value.end, Math.min(text.length, value.end + 140));
  if (HISTORICAL_AMOUNT_LEAD_RE.test(left) || HISTORICAL_ACRONYM_AMOUNT_LEAD_RE.test(left)) return true;
  if (HISTORICAL_COMPARISON_LEAD_RE.test(left) && HISTORICAL_AMOUNT_TRAIL_RE.test(right)) return true;
  if (HISTORICAL_COMPARISON_LEAD_RE.test(left) && /\b(?:last|prior|previous)\s+(?:year|quarter|period)\b/i.test(right)) return true;
  if (/\bachieving\b[^.;]{0,100}$/i.test(left)) {
    const local = text.slice(Math.max(0, value.start - 220), Math.min(text.length, value.end + 120));
    if (!STRICT_FORWARD_VALUE_RE.test(local)) return true;
  }
  return false;
}

function nonGuidanceOwnedGroups(text, values) {
  const groups = [];
  const metricPositions = [...text.matchAll(ANY_MONETARY_METRIC_RE)].map((match) => match.index);
  for (const owner of text.matchAll(NON_GUIDANCE_AMOUNT_OWNER_RE)) {
    const before = values.filter((value) => value.end <= owner.index);
    const after = values.filter((value) => value.start >= owner.index + owner[0].length);

    if (before.length) {
      const right = before.at(-1);
      const connector = text.slice(right.end, owner.index);
      if (/^\s*(?:(?:of|in|for|from|to)\s+(?:[A-Za-z-]+\s+){0,6}|between(?:\s+(?:our|the))?|related to|associated with)?\s*$/i.test(connector)) {
        const group = [right];
        if (before.length > 1) {
          const left = before.at(-2);
          if (owner.index - left.end <= 140 && pairIsExplicitRange(text, left, right)) group.unshift(left);
        }
        groups.push({ owner: owner[0], values: group });
      }
    }

    if (after.length) {
      const left = after[0];
      const connector = text.slice(owner.index + owner[0].length, left.start);
      const interveningMetric = metricPositions.some((position) =>
        position > owner.index + owner[0].length && position < left.start
      );
      const directQuantitySyntax = (
        connector.length <= 100 &&
        !/[,.;]/.test(connector) &&
        /^\s*(?:(?:of|at|to|between|in(?: a)? range(?: of)?|was|were|is|are|will be|to be|expected to be|projected to be|forecast to be)\s+)?(?:(?:approximately|about|roughly|around|north of|over|under)\s+)?$/i.test(connector)
      );
      const datedRepurchaseTotal = /share repurchases?/i.test(owner[0]) && /\bto\s*$/i.test(connector);
      const datedCashBalance = /cash balance|cash on hand/i.test(owner[0]) && /\bat\b[^,.;]{0,60}\b(?:was|were)\s*$/i.test(connector);
      if (!interveningMetric && (directQuantitySyntax || datedRepurchaseTotal || datedCashBalance)) {
        const group = [left];
        if (after.length > 1 && pairIsExplicitRange(text, left, after[1])) group.push(after[1]);
        groups.push({ owner: owner[0], values: group });
      }
    }
  }
  return groups;
}

export function independentHistoricalActualAmountMismatch({ amount, evidence, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  const text = String(evidence || "").replaceAll("\u00c2\u00b1", " \u00b1");
  if (storedAmountM == null || !text) return null;
  const values = guidanceMonetaryAmountsM(text);
  const exact = values.filter((value) => closeEnough(value.amountM, storedAmountM));
  if (exact.length && exact.every((value) => historicalActualValue(text, value))) {
    return {
      storedAmountM,
      quotedValues: exact.map((value) => value.text),
      reason: "historical_actual_or_comparison_base"
    };
  }
  for (let index = 0; index < values.length - 1; index += 1) {
    const left = values[index];
    const right = values[index + 1];
    if (!pairIsExplicitRange(text, left, right)) continue;
    if (!closeEnough((left.amountM + right.amountM) / 2, storedAmountM)) continue;
    if (!historicalActualValue(text, left) && !historicalActualValue(text, right)) continue;
    return {
      storedAmountM,
      quotedValues: [left.text, right.text],
      reason: "historical_actual_range_midpoint"
    };
  }
  return null;
}

export function independentNonGuidanceOwnerAmountMismatch({ metricName, amount, evidence, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  const text = String(evidence || "").replaceAll("\u00c2\u00b1", " \u00b1");
  if (storedAmountM == null || !text) return null;
  const values = guidanceMonetaryAmountsM(text);
  const groups = nonGuidanceOwnedGroups(text, values);
  if (metricName === "operating_cash_flow_guidance") {
    const ownCashFlow = groups.some((group) => {
      if (!/^(?:operating cash flow|cash from operations)$/i.test(group.owner)) return false;
      const candidates = group.values.map((value) => value.amountM);
      if (group.values.length === 2 && pairIsExplicitRange(text, group.values[0], group.values[1])) {
        candidates.push((group.values[0].amountM + group.values[1].amountM) / 2);
      }
      return candidates.some((candidate) => closeEnough(candidate, storedAmountM));
    });
    if (ownCashFlow) return null;
  }
  const ownedPositions = new Set(groups.flatMap((group) => group.values.map((value) => value.start)));
  const legitimateExact = values.some((value) =>
    !ownedPositions.has(value.start) && closeEnough(value.amountM, storedAmountM)
  );
  if (legitimateExact) return null;

  const legitimateRangeMidpoint = values.some((left, leftIndex) =>
    values.slice(leftIndex + 1).some((right) =>
      !ownedPositions.has(left.start) &&
      !ownedPositions.has(right.start) &&
      pairIsExplicitRange(text, left, right) &&
      closeEnough((left.amountM + right.amountM) / 2, storedAmountM)
    )
  );
  if (legitimateRangeMidpoint) return null;

  for (let leftIndex = 0; leftIndex < values.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      if (pairIsExplicitRange(text, left, right)) continue;
      if (!ownedPositions.has(left.start) && !ownedPositions.has(right.start)) continue;
      const midpointM = (left.amountM + right.amountM) / 2;
      if (!closeEnough(midpointM, storedAmountM)) continue;
      return {
        storedAmountM,
        midpointM,
        owner: groups.find((group) =>
          group.values.some((value) => value.start === left.start || value.start === right.start)
        )?.owner || null,
        quotedValues: [left.text, right.text],
        reason: "non_guidance_cross_owner_midpoint"
      };
    }
  }

  for (const group of groups) {
    const candidates = group.values.map((value) => value.amountM);
    if (group.values.length === 2 && pairIsExplicitRange(text, group.values[0], group.values[1])) {
      candidates.push((group.values[0].amountM + group.values[1].amountM) / 2);
    }
    if (!candidates.some((candidate) => closeEnough(candidate, storedAmountM))) continue;
    return {
      storedAmountM,
      owner: group.owner,
      quotedValues: group.values.map((value) => value.text),
      reason: "non_guidance_amount_owner"
    };
  }
  return null;
}

export function independentGuidanceMidpointMismatch({ amount, evidence, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  const text = String(evidence || "").replaceAll("\u00c2\u00b1", " \u00b1");
  if (storedAmountM == null || !text) return null;

  const values = guidanceMonetaryAmountsM(text);
  for (let index = 1; index < values.length; index++) {
    const left = values[index - 1], right = values[index];
    if (!right.literalZeroEndpoint || !pairIsExplicitRange(text, left, right)) continue;
    const midpointM = (left.amountM + right.amountM) / 2;
    if (closeEnough(storedAmountM, left.amountM) && !closeEnough(storedAmountM, midpointM)) {
      return { reason: "guidance_breakeven_range_endpoint_used_as_midpoint", storedAmountM, midpointM,
        quotedAmountsM: [left.amountM, right.amountM], quotedValues: [left.text, right.text] };
    }
  }
  if (values.length < 2 || values.some((value) => closeEnough(value.amountM, storedAmountM))) {
    return null;
  }

  // A sentence can compare a new explicit range with a prior range.  When the
  // stored value reconciles to any explicitly stated range, it is defensible
  // even if another cross-range pair happens to have the same midpoint.
  for (let leftIndex = 0; leftIndex < values.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      if (!pairIsExplicitRange(text, left, right)) continue;
      if (closeEnough((left.amountM + right.amountM) / 2, storedAmountM)) return null;
    }
  }

  for (let leftIndex = 0; leftIndex < values.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      const midpointM = (left.amountM + right.amountM) / 2;
      if (!closeEnough(midpointM, storedAmountM) || pairIsExplicitRange(text, left, right)) continue;
      return {
        storedAmountM,
        midpointM,
        quotedAmountsM: [left.amountM, right.amountM],
        quotedValues: [left.text, right.text],
        connector: text.slice(left.end, right.start).trim()
      };
    }
  }
  return null;
}

export function independentParallelMetricAmountMismatch({ metricName, amount, evidence, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  const text = String(evidence || "").replaceAll("\u00c2\u00b1", " \u00b1");
  if (storedAmountM == null || !text) return null;

  const values = guidanceMonetaryAmountsM(text);
  if (values.length < 2) return null;
  if (values.some((value, index) =>
    index > 0 && pairIsExplicitRange(text, values[index - 1], value)
  )) return null;
  const firstValueStart = values[0].start;
  const leadingMetrics = PARALLEL_MONETARY_METRICS.flatMap(([name, pattern]) =>
    [...text.matchAll(pattern)]
      .filter((match) => match.index < firstValueStart)
      .map((match) => ({ name, start: match.index, text: match[0] }))
  ).sort((left, right) => left.start - right.start);

  const simpleParallelValues = values.length >= 2 && values.slice(1).every((value, index) => {
    const left = values[index];
    return /^\s*,?\s*(?:and\s+)?$/i.test(text.slice(left.end, value.start));
  });
  if (!simpleParallelValues && !/\brespectively\b/i.test(text)) return null;

  if (
    leadingMetrics.length !== values.length ||
    new Set(leadingMetrics.map((metric) => metric.name)).size !== leadingMetrics.length
  ) {
    return null;
  }
  const metricIndex = leadingMetrics.findIndex((metric) => metric.name === metricName);
  if (metricIndex < 0) return null;
  const expectedAmountM = values[metricIndex].amountM;
  if (closeEnough(storedAmountM, expectedAmountM)) return null;
  return {
    storedAmountM,
    expectedAmountM,
    metricOrder: leadingMetrics.map((metric) => metric.name),
    quotedAmountsM: values.map((value) => value.amountM),
    quotedValues: values.map((value) => value.text)
  };
}

export function independentGuidanceCurrencyMismatch({ amount, evidence, currency, sourceCurrency, sourceAmountM, fxConversion, fx_conversion }) {
  const storedAmountM = auditSourceAmount({ amount, sourceAmountM, fxConversion, fx_conversion });
  if (storedAmountM == null) return null; // Percentage-only guidance has no FX.
  const text = String(evidence || "");
  const values = guidanceMonetaryAmountsM(text);
  const matches = values.filter((value) => closeEnough(value.amountM, storedAmountM));
  for (let index = 0; index < values.length - 1; index += 1) {
    const left = values[index];
    const right = values[index + 1];
    if (pairIsExplicitRange(text, left, right) && closeEnough((left.amountM + right.amountM) / 2, storedAmountM)) matches.push(left, right);
  }
  const explicitCurrencies = [...new Set(matches.map((value) => value.currency).filter(Boolean))];
  const reportedCurrency = String(sourceCurrency || currency || fxConversion?.sourceCurrency || fx_conversion?.sourceCurrency || "").toUpperCase() || null;
  if (matches.some((value) => value.currencyConflict) || explicitCurrencies.length > 1) return { reason: "conflicting_evidence_currencies", storedAmountM, reportedCurrency, evidenceCurrencies: explicitCurrencies };
  if (explicitCurrencies.length === 1 && explicitCurrencies[0] !== reportedCurrency) return { reason: "source_currency_mismatch", storedAmountM, reportedCurrency, evidenceCurrencies: explicitCurrencies };
  return null;
}

export function independentGuidanceGrowthRangeMismatch({ growthYoy, evidence, targetYear }) {
  const growth = finite(growthYoy);
  if (growth == null) return null;
  const text = String(evidence || "");
  const owners = [...text.matchAll(/\b(?:revenues?|sales)\b/gi)].map((match) => ({
    start: match.index, end: match.index + match[0].length,
    companyTotal: /\b(?:total(?: company)?|consolidated|group|company(?:'s)?)\s*$/i.test(text.slice(Math.max(0, match.index - 40), match.index))
  }));
  const otherEconomicOwner = /\b(?:eps|earnings per (?:diluted )?share|net income|ebitda|operating (?:income|profit|margin)|gross margin|margins?|dividends?|capex|capital expenditures?|bookings)\b/i;
  // Look ahead rather than consuming a rejected match: in "FY 2025 to
  // 6.5%-7.5%", rejecting the year must not swallow the real 6.5%-7.5% range.
  // "and" is a range only when an explicit between/range introducer owns it.
  const rangePattern = /(?=(?<quoted>(?<![\w.])(?:(?<leftDirection>down|up|negative|positive|minus|plus)\s+(?:(?:approximately|about|roughly|around)\s+)?)?(?<left>-?\d+(?:\.\d+)?)\s*(?<leftPct>%)?\s*(?<separator>to|and|[-–—])\s*(?:(?<rightDirection>down|up|negative|positive|minus|plus)\s+(?:(?:approximately|about|roughly|around)\s+)?)?(?<right>-?\d+(?:\.\d+)?)\s*%))/gi;
  const candidates = [...text.matchAll(rangePattern)].flatMap((range) => {
    const { quoted, leftDirection, left: leftToken, leftPct, separator, rightDirection, right: rightToken } = range.groups;
    const end = range.index + quoted.length;
    const beforeRange = text.slice(Math.max(0, range.index - 100), range.index);
    if (!leftPct && /^(?:19|20)\d{2}$/.test(leftToken)
      && /\b(?:fy\s*|(?:fiscal(?: year)?|year|for)\s+)['’]?\s*$/i.test(beforeRange)) return [];
    if (/^and$/i.test(separator)
      && !/\b(?:between|range(?:\s+of)?)\s+(?:(?:approximately|about|roughly|around)\s+)?$/i.test(beforeRange)) return [];
    const prefixClause = text.slice(Math.max(0, range.index - 160), range.index).split(/[,;]|\.(?=\s+[A-Za-z]|$)/).at(-1);
    const suffixClause = text.slice(end).split(/[,;]|\.(?=\s+[A-Za-z]|$)/)[0];
    // ELF puts the current 22–23% before "net sales" and the superseded
    // 18–20% after it. Adjacency alone must not bind that old range.
    if (/\b(?:compared (?:with|to)|versus)\b(?!\s+(?:the\s+)?prior year\b)|\b(?:previous(?:ly)?|prior|originally)\b/i.test(prefixClause) || /\b(?:previously|originally|prior\s+(?:guidance|outlook|range))\b/i.test(suffixClause)) return [];
    const bindings = owners.filter((owner) => {
      if (owner.end <= range.index) return range.index - owner.end <= 120 &&
        !otherEconomicOwner.test(text.slice(owner.end, range.index));
      if (owner.start < end || owner.start - end > 100) return false;
      return /^\s*(?:(?:year[- ]over[- ]year|yoy|annual)\s+)?(?:(?:increase|growth|decrease|decline)\s+)?(?:(?:in|for|of)\s+)?(?:(?:constant currency|underlying|organic|net|total|consolidated|recurring|life|enterprise)\s+)*$/i.test(text.slice(end, owner.start));
    });
    if (!bindings.length) return [];
    const owner = bindings.sort((a, b) => Number(b.companyTotal) - Number(a.companyTotal) || Math.abs(a.start - range.index) - Math.abs(b.start - range.index))[0];
    const negative = (direction) => /^(?:down|negative|minus)$/i.test(direction || "");
    const commonDecline = /\b(?:decline|decrease)\s+(?:in\s+)?(?:(?:the|a)\s+)?(?:range\s+(?:of\s+)?)?$/i.test(beforeRange);
    const left = negative(leftDirection) || commonDecline ? -Math.abs(Number(leftToken)) : Number(leftToken);
    // A signed left endpoint is not a shared direction: between -0.5% and
    // +1% crosses zero. A stated "decline/down" can govern both endpoints.
    const right = negative(rightDirection) || !rightDirection && (negative(leftDirection) || commonDecline)
      ? -Math.abs(Number(rightToken)) : Number(rightToken);
    const revisedPoint = /^to$/i.test(separator) && /\bfrom\s*$/i.test(beforeRange) &&
      /\b(?:increased?|raising|raised|revised|lowered|decreased)\b[^.;]{0,140}\bfrom\s*$/i.test(text.slice(Math.max(0, range.index - 200), range.index)) &&
      !/\brange\s+from\s*$/i.test(beforeRange);
    return [{ midpoint: revisedPoint ? right : (left + right) / 2, companyTotal: owner.companyTotal, index: range.index }];
  }).sort((a, b) => Number(b.companyTotal) - Number(a.companyTotal) || a.index - b.index);
  if (!candidates.length) return null;
  const midpoint = candidates[0].midpoint;
  if (!closeEnough(growth, midpoint)) return { reason: "guidance_growth_range_mismatch", storedGrowth: growth, expectedGrowth: midpoint };
  const year = [...text.matchAll(/\b(20\d{2})\s+(?:guidance|outlook)\b|\b(?:full[- ]year|fiscal year|outlook for fiscal|guidance for fiscal|for)\s*(20\d{2})\b|\bFY\s*((?:20)?\d{2})(?:e)?\b/gi)].find((match) => !/\b(?:compared (?:with|to)|versus)\s*$/i.test(text.slice(Math.max(0, match.index - 35), match.index)));
  let evidenceYear = year ? Number(year[1] || year[2] || year[3]) : null;
  if (evidenceYear != null && evidenceYear < 100) evidenceYear += 2000;
  if (targetYear != null && evidenceYear != null && Number(targetYear) !== evidenceYear) return { reason: "guidance_target_year_mismatch", targetYear, evidenceYear };
  return null;
}

export function independentExplicitGrowthBasisMismatch({ evidence, growthYoy, growthQoq }) {
  const text = String(evidence || "");
  const quoted = [...text.matchAll(/(?:(?<directionPrefix>down|negative|minus|up|positive|plus)\s+)?(?<left>-?\d+(?:\.\d+)?)\s*%?(?:\s*(?<separator>to|and|[-–—])\s*(?:(?<rightDirection>down|negative|minus|up|positive|plus)\s+)?(?<right>-?\d+(?:\.\d+)?)\s*)?%\s*(?:(?<directionBefore>increase|decrease|decline|growth|reduction)\s+)?(?<basis>sequential(?:ly)?|year[- ]over[- ]year|quarter[- ]over[- ]quarter|yoy|qoq)(?:\s+(?<directionAfter>increase|decrease|decline|growth|reduction))?\b/gi)];
  if (!quoted.length) return null;
  const byBasis = { yoy: [], qoq: [] };
  for (const match of quoted) {
    const basis = /^(?:sequential|quarter|qoq)/i.test(match.groups.basis) ? "qoq" : "yoy";
    const before = text.slice(Math.max(0, match.index - 100), match.index);
    if (/^and$/i.test(match.groups.separator || "") && !/\b(?:between|range(?:\s+of)?)\s*$/i.test(before)) return {
      reason: "guidance_growth_period_basis_ambiguous", basis: "unintroduced_and_is_not_a_percentage_range"
    };
    const negative = /^(?:decrease|decline|reduction)$/i.test(match.groups.directionBefore || match.groups.directionAfter || "");
    const commonNegative = negative || /^(?:down|negative|minus)$/i.test(match.groups.directionPrefix || "") || /\b(?:decline|decrease|reduce)\s+(?:in\s+)?(?:(?:the|a)\s+)?range\s+(?:of\s+)?$/i.test(before);
    const values = [match.groups.left, match.groups.right].filter(value => value != null).map(Number)
      .map((value, index) => commonNegative || index === 1 && /^(?:down|negative|minus)$/i.test(match.groups.rightDirection || "") ? -Math.abs(value) : value);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 85);
    const constantCurrency = /^\s*(?:on\s+(?:a\s+)?|in\s+)?constant[- ]currency\b/i.test(after) ||
      /\bconstant[- ]currency\s+(?:growth\s+of\s+)?$/i.test(before);
    byBasis[basis].push({ value: values.reduce((sum, value) => sum + value, 0) / values.length, constantCurrency });
  }
  // Reported and constant-currency growth use the SAME time comparator but
  // different FX bases. An explicitly qualified FX alternative does not make
  // the preceding primary rate ambiguous. Without the original qualifier,
  // multiple rates still require review; never average them or pick a number
  // merely because it matches the stored scalar.
  for (const basis of ["yoy", "qoq"]) {
    const primary = byBasis[basis].filter(rate => !rate.constantCurrency);
    if (primary.length === 1 && byBasis[basis].some(rate => rate.constantCurrency)) byBasis[basis] = primary;
    byBasis[basis] = byBasis[basis].map(rate => rate.value);
  }
  // More than one separately stated same-basis observation needs independent
  // temporal owner resolution; never average unrelated quarters here.
  if (Object.values(byBasis).some(values => values.length > 1)) return {
    reason: "guidance_growth_period_basis_ambiguous", quotedRates: byBasis
  };
  const expected = { yoy: byBasis.yoy[0] ?? null, qoq: byBasis.qoq[0] ?? null };
  const stored = { yoy: finite(growthYoy), qoq: finite(growthQoq) };
  if (["yoy", "qoq"].every(basis => expected[basis] == null ? stored[basis] == null : closeEnough(stored[basis], expected[basis]))) return null;
  return { reason: "guidance_growth_period_basis_mismatch", expected, stored,
    basis: "original_explicit_sequential_vs_year_over_year_label_and_direction" };
}
