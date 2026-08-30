const MONEY_AMOUNT_RE = /(?:\bUS\s*)?[$\u00a3\u20ac]?\s*(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|mn|m)\b/gi;
const MONEY_SHARED_SCALE_RANGE_RE = /(?:(?<leftDirection>down|negative|minus|up|positive|plus)\s+)?(?:(?<leftCurrency>US\$|[$\u00a3\u20ac])\s*)?(?<left>\d[\d,]*(?:\.\d+)?)\s*(?:to|through|[-\u2013\u2014])\s*(?:(?<rightDirection>down|negative|minus|up|positive|plus)\s+)?(?:(?<rightCurrency>US\$|[$\u00a3\u20ac])\s*)?(?<right>\d[\d,]*(?:\.\d+)?)\s*(?<scale>billion|million|thousand|bn|mm|mn|m)\b/gi;
const PARALLEL_MONETARY_METRICS = [
  ["free_cash_flow_guidance", /\b(?:free cash flow|fcf)\b/gi],
  ["operating_cash_flow_guidance", /\b(?:operating cash flow|cash from operations)\b/gi],
  ["capex_guidance", /\b(?:capital expenditures?|capital spending|capital investments?|capex)\b/gi],
  ["ebitda_guidance", /\b(?:adjusted\s+)?ebitda\b/gi],
  ["operating_income_guidance", /\b(?:operating income|income from operations|operating profit|(?:adjusted\s+)?ebit)\b/gi],
  ["net_income_guidance", /\b(?:adjusted\s+)?net income\b/gi],
  ["revenue_guidance", /\b(?:revenue|sales)\b/gi],
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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    const { left, right, leftCurrency, rightCurrency, leftDirection, rightDirection, scale: rawScale } = match.groups;
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
        text: `${leftDirection || ""} ${leftCurrency || rightCurrency || ""}${left} ${rawScale}`.trim(),
        start: match.index + leftOffset,
        end: match.index + match[0].indexOf(left, leftOffset) + left.length
      },
      {
        amountM: rightSign * Number(right.replaceAll(",", "")) * multiplier,
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
    const raw = Number(match[1].replaceAll(",", ""));
    const scale = match[2].toLowerCase();
    let amountM = ["billion", "bn"].includes(scale)
      ? raw * 1_000
      : scale === "thousand"
        ? raw / 1_000
        : raw;
    const direction = text.slice(Math.max(0, match.index - 18), match.index);
    if (/\b(?:down|negative|minus)\s*$/i.test(direction)) amountM *= -1;
    return {
      amountM,
      text: match[0].trim(),
      start: match.index,
      end: match.index + match[0].length
    };
  });
  return [...sharedValues, ...ordinaryValues].sort((left, right) => left.start - right.start);
}

function pairIsExplicitRange(text, left, right) {
  const connector = text.slice(left.end, right.start);
  const prefix = text.slice(Math.max(0, left.start - 80), left.start);
  const normalizedConnector = connector.replace(
    /(?:(?:USD|GBP|EUR|JPY|CNY|RMB|CAD|AUD|CHF)\s*|US\$|[$\u00a3\u20ac])\s*$/i,
    ""
  );
  if (/^\s*[-\u2013\u2014]\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?$/i.test(normalizedConnector)) return true;
  if (/^\s*(?:to|through)\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?$/i.test(normalizedConnector)) {
    if (!/\bfrom\s*$/i.test(prefix)) return true;
    if (/\b(?:range|guidance)\b[^.;]{0,50}\bfrom\s*$/i.test(prefix)) return true;
  }
  if (/^\s*,?\s*and\s*$/i.test(normalizedConnector)) {
    if (/(?:\bbetween|\brange(?:d)?(?:\s+of)?)\s+(?:(?:about|approximately|roughly|around|nearly)\s+)?(?:(?:USD|GBP|EUR|JPY|CNY|RMB|CAD|AUD|CHF)\s*|US\$|[$\u00a3\u20ac])?\s*$/i.test(prefix)) {
      return true;
    }
  }
  const lowEnd = /\blow end\b[^.;]{0,50}\b(?:to|at|of)\s*(?:(?:about|approximately|roughly|around|nearly)\s+)?(?:(?:USD|GBP|EUR|JPY|CNY|RMB|CAD|AUD|CHF)\s*|US\$|[$\u00a3\u20ac])?\s*$/i.test(prefix);
  const highEnd = /^\s*,?\s*(?:and\s+)?(?:(?:maintain|maintaining|keep|keeping|raise|raising|lower|lowering|leave|leaving)\s+)?(?:the\s+|our\s+)?high end\b[^.;]{0,35}\b(?:at|to|of)\s*$/i.test(normalizedConnector);
  return lowEnd && highEnd;
}

function historicalActualValue(text, value) {
  const left = text.slice(Math.max(0, value.start - 180), value.start);
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

export function independentHistoricalActualAmountMismatch({ amount, evidence }) {
  const storedAmountM = finite(amount);
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

export function independentNonGuidanceOwnerAmountMismatch({ metricName, amount, evidence }) {
  const storedAmountM = finite(amount);
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

export function independentGuidanceMidpointMismatch({ amount, evidence }) {
  const storedAmountM = finite(amount);
  const text = String(evidence || "").replaceAll("\u00c2\u00b1", " \u00b1");
  if (storedAmountM == null || !text) return null;

  const values = guidanceMonetaryAmountsM(text);
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

export function independentParallelMetricAmountMismatch({ metricName, amount, evidence }) {
  const storedAmountM = finite(amount);
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
