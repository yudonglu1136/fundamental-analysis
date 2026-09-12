// Independent EPS reconstruction. Currency-per-share amounts never use the
// million-currency revenue/cash-flow parser or trust parser selected_values.
// Independent original grammar for net income/earnings whose per-share unit
// appears after the level. Operating-income/share is intentionally excluded.
const EPS = /\b(?:eps|(?:earnings|net income) per (?:diluted )?share|net income(?=\s+(?:(?:per|for)\s+(?:diluted\s+)?share\b|[^;$\n.]{0,95}\$\d+(?:\.\d+)?(?:\s*(?:to|[-–—])\s*\$?\d+(?:\.\d+)?)?\s+per\s+(?:diluted\s+)?share\b)))\b/gi;
const TOKEN = /(?:(?<currency>US\$|USD|MXN|GBP|EUR|Ps\.|[$£€])\s*)?(?<open>\()?\s*(?<value>\d+(?:\.\d+)?)\s*(?<close>\))?/gi;
const iso = (token) => ({ "US$": "USD", USD: "USD", MXN: "MXN", GBP: "GBP", EUR: "EUR", "PS.": "MXN", "£": "GBP", "€": "EUR" })[String(token || "").toUpperCase()] || null;
const close = (left, right) => Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-8);

// A raise amount is not the new earnings level. This grammar binds the next
// amount only when the original words explicitly carry this EPS revision to
// its new target; it never searches across a tax, revenue or FFO owner.
function revisedEpsTargetConnector(text) {
  const toTarget = String.raw`to\s+(?:approximately\s+|about\s+)?(?:(?:now\s+)?be\s+)?(?:(?:between|(?:in\s+)?(?:the\s+|a\s+)?(?:new\s+)?range(?:\s+of)?|a midpoint of)\s+)?`;
  return new RegExp(String.raw`^\s*(?:(?:a share|per share|on the (?:bottom|low|high|top) end|at (?:the )?midpoint)\s+)?${toTarget}$`, "i").test(text)
    || new RegExp(String.raw`^\s*,\s*bringing\s+(?:(?:our|the)\s+)?(?:full[- ]year\s+)?guidance\s+${toTarget}$`, "i").test(text);
}

function perShareCandidates(evidence) {
  evidence = String(evidence || "");
  const owners = [...String(evidence || "").matchAll(EPS)];
  const candidates = [];
  for (let index = 0; index < owners.length; index += 1) {
    const owner = owners[index];
    const start = owner.index + owner[0].length;
    let suffix = evidence.slice(start, owners[index + 1]?.index ?? evidence.length);
    suffix = suffix.split(/;|\.(?=\s+[A-Z]|$)/)[0];
    // FFO/AFFO remain different economics even when their per-share unit is
    // printed after the range rather than beside the metric label.
    const nextFfoOwner = suffix.search(/\b(?:affo|ffo|funds from operations)\b/i);
    if (nextFfoOwner >= 0) suffix = suffix.slice(0, nextFfoOwner);
    const values = [...suffix.matchAll(TOKEN)].filter((match) => {
      const cents = /^\s*cents?\s+per\s+share\b/i.test(suffix.slice(match.index + match[0].length));
      if (!match.groups.currency && !match.groups.value.includes(".") && !cents) return false;
      if (Boolean(match.groups.open) !== Boolean(match.groups.close)) return false;
      return !/^\s*(?:%|billion|million|thousand|bn\b|mm\b|mn\b|[mb]\b|shares?\b)/i.test(suffix.slice(match.index + match[0].length));
    });
    const before = evidence.slice(Math.max(0, owner.index - 70), owner.index);
    // A legal range immediately BEFORE its owner also belongs to EPS, e.g.
    // "between $5.90 and $6.04 of earnings per share". Reconstruct from the
    // original text, not extractor selected_values or the stored numeric value.
    const prefixStart = owners[index - 1] ? owners[index - 1].index + owners[index - 1][0].length : 0;
    const prefix = evidence.slice(prefixStart, owner.index);
    const preceding = [...prefix.matchAll(TOKEN)].filter((match) =>
      (match.groups.currency || match.groups.value.includes(".")) &&
      Boolean(match.groups.open) === Boolean(match.groups.close));
    let context = suffix;
    let selected = [];
    const midpointReference = evidence.startsWith("The difference between ") && owners.length === 1
      ? [...suffix.matchAll(/\band\s+(?:the\s+)?(?:midpoint of the\s+[^.;]{0,65}guidance range|[^.;]{0,65}guidance midpoint)\s+of\s+(\$\d+(?:\.\d+)?)/gi)][0] : null;
    if (midpointReference) {
      const targetStart = midpointReference.index + midpointReference[0].lastIndexOf(midpointReference[1]);
      selected = values.filter(value => value.index >= targetStart - 1 && value.index < targetStart + midpointReference[1].length);
    }
    if (!selected.length && preceding.length >= 2) {
      const [left, right] = preceding.slice(-2);
      const connector = prefix.slice(left.index + left[0].length, right.index);
      const afterRange = prefix.slice(right.index + right[0].length);
      const beforeRange = prefix.slice(0, left.index);
      if (/^\s*(?:(?:of|in|for)\s+)?(?:(?:full[- ]year|fiscal\s+20\d{2})\s+)?(?:adjusted\s+|diluted\s+|non[- ]gaap\s+)*$/i.test(afterRange) &&
          (/^\s*(?:to|through|[-–—])\s*$/i.test(connector) ||
           /^\s*and\s*$/i.test(connector) && /\b(?:between|range(?: of)?)\s*$/i.test(beforeRange))) {
        selected = [left, right];
        context = prefix;
      }
    }
    if (!selected.length) {
      if (!values.length) continue;
      let firstIndex = 0;
      let connector = suffix.slice(0, values[0].index);
      const betweenValues = (left, right) => suffix.slice(values[left].index + values[left][0].length, values[right].index);
      const plainRange = (left, right) => /^\s*(?:to|[-–—])\s*$/i.test(betweenValues(left, right));
      const newRange = (left, right) => /^\s*,?\s*to\s+(?:(?:a|an|the)\s+)?(?:new|updated)\s+range\s+of\s*$/i.test(betweenValues(left, right));
      // An explicit old-range -> new-range revision does not average the two
      // regimes. Require two original ranges and an unambiguous connector.
      if (values.length >= 4 && /\bfrom\s+(?:(?:our|the)\s+)?(?:prior|previous)\s+(?:range\s+of\s*)?$/i.test(connector) &&
          plainRange(0, 1) && newRange(1, 2) && plainRange(2, 3)) {
        firstIndex = 2;
        connector = suffix.slice(0, values[2].index);
      }
      // "raising ... from X to Y" is a revised point estimate, not an X–Y
      // range. Without a revision verb this branch does not reinterpret ranges.
      if (firstIndex === 0 && values.length >= 2 && /\bfrom\s*$/i.test(connector) &&
          /\b(?:raising|lowering|increasing|reducing|revising)\b/i.test(evidence.slice(Math.max(0, owner.index - 100), start)) &&
          /^\s*to\s*$/i.test(betweenValues(0, 1))) {
        firstIndex = 1;
        connector = suffix.slice(0, values[1].index);
      }
      // A new low endpoint is followed by the complete resulting EPS range.
      if (firstIndex === 0 && values.length >= 3 &&
          /^\s*,\s*resulting in a range of\s*$/i.test(betweenValues(0, 1)) && plainRange(1, 2) &&
          /\blow end\b/i.test(evidence.slice(Math.max(0, owner.index - 100), start))) {
        firstIndex = 1;
        connector = suffix.slice(0, values[1].index);
      }
      // "raise EPS by X to Y-Z": X is a revision, and Y-Z is the new range.
      if (firstIndex === 0) {
        const firstIsDelta = /\b(?:by|(?:increased|raised|reduced|lowered)(?:\s+by)?)\s*$/i.test(connector);
        const nextConnector = values[1] ? suffix.slice(values[0].index + values[0][0].length, values[1].index) : "";
        const explicitPriorGuideDelta = /^\s*(?:higher|lower) than (?:what )?we guided in (?:January|February|March|April|May|June|July|August|September|October|November|December)\s+to a new range of\s*$/i.test(nextConnector);
        if (values[1] && (firstIsDelta && revisedEpsTargetConnector(nextConnector) || explicitPriorGuideDelta)) {
          firstIndex = 1;
          connector = suffix.slice(0, values[1].index);
        } else if (firstIsDelta && values.length >= 4 && plainRange(0, 1) &&
            /^\s*,?\s*to\s*$/i.test(betweenValues(1, 2)) && plainRange(2, 3)) {
          // The revision itself can be a range: "by X–Y, to A–B".
          firstIndex = 2;
          connector = suffix.slice(0, values[2].index);
        } else if (firstIsDelta && values.length >= 5 &&
            /^\s*from a range of\s*$/i.test(nextConnector) && plainRange(1, 2) &&
            newRange(2, 3) && plainRange(3, 4)) {
          // "by X from A–B to a new range C–D": skip both the delta and
          // old range; a following per-share adjustment is not an endpoint.
          firstIndex = 3;
          connector = suffix.slice(0, values[3].index);
        } else if (firstIsDelta && values.length >= 3 && /^\s*from\s*$/i.test(nextConnector) &&
            /^\s*to\s*$/i.test(betweenValues(1, 2))) {
          firstIndex = 2;
          connector = suffix.slice(0, values[2].index);
        } else if (firstIsDelta) {
          // A standalone increase or one followed by another economic owner
          // cannot be certified as the absolute EPS level.
          continue;
        }
      }
      if (/\b(?:costs?|expenses?|tax(?:es)?|award|headwind|assum(?:es|ing)|shares)\b/i.test(connector)) continue;
      const first = values[firstIndex], second = values[firstIndex + 1];
      selected = [first];
      if (second) {
        const between = suffix.slice(first.index + first[0].length, second.index);
        if (/^\s*(?:to|through|[-–—])\s*$/i.test(between) || /^\s*and\s*$/i.test(between) && /\b(?:between|range(?:\s+of)?)\s*$/i.test(connector)) selected.push(second);
      }
    }
    const selectedEnd = selected.at(-1).index + selected.at(-1)[0].length;
    const after = context === prefix ? suffix.slice(0, 55) : suffix.slice(selectedEnd, selectedEnd + 55);
    const label = /\b(?:(?<!split-)(?<!split )adjusted|non[- ]gaap)\b[^.;]{0,55}$/i.test(before) || /^\s+on a non[- ]gaap basis\b/i.test(after) ? "adjusted"
      : /\bgaap\b[^.;]{0,55}$/i.test(before) || /^\s+on a gaap basis\b/i.test(after) ? "gaap" : "unspecified";
    const explicitCurrencies = [...new Set(selected.map((match) => iso(match.groups.currency)).filter(Boolean))];
    candidates.push({ value: selected.reduce((sum, match) => sum + Number(match.groups.value) * (match.groups.open ? -1 : 1) *
      (/^\s*cents?\s+per\s+share\b/i.test(context.slice(match.index + match[0].length)) ? 0.01 : 1), 0) / selected.length,
      basis: label, currencies: explicitCurrencies,
      metricIndex: owner.index, metricEndIndex: start,
      valueStartIndex: (context === prefix ? prefixStart : start) + selected[0].index,
      valueEndIndex: (context === prefix ? prefixStart : start) + selectedEnd
    });
  }
  return candidates;
}

function perShareMismatch({ value, unit, basis, currency }, candidates) {
  if (unit !== "currency_per_share") return { reason: "guidance_per_share_unit_invalid", unit };
  if (!["gaap", "adjusted", "unspecified"].includes(basis)) return { reason: "guidance_per_share_basis_invalid", basis };
  const matching = candidates.filter((candidate) => close(Number(value), candidate.value) && (basis === "unspecified" || candidate.basis === basis));
  if (!matching.length) return { reason: "guidance_per_share_value_mismatch", value, basis, candidates };
  if (matching.every((candidate) => candidate.currencies.length > 1 || candidate.currencies.length === 1 && candidate.currencies[0] !== currency)) return { reason: "guidance_source_currency_mismatch", value, currency, candidates: matching };
  return null;
}

export function independentPerShareEvidence({ evidence, value, unit, basis = "unspecified", currency }) {
  return perShareMismatch({ value, unit, basis, currency }, perShareCandidates(evidence));
}

/**
 * Identify the original metric occurrence BEFORE a caller audits its period.
 * Numeric value, basis and any explicit currency are reconstructed from the
 * original quotation. Producer metric_position/selected_values/stored scope
 * are deliberately not inputs. Equal values at multiple occurrences remain
 * ambiguous, even when the caller's stored scope would select one of them.
 * This is owner resolution, not approval of currency, scope or forward status.
 */
export function resolveIndependentPerShareOwner({ evidence, value, unit, basis = "unspecified", currency } = {}) {
  const candidates = perShareCandidates(evidence);
  const mismatch = perShareMismatch({ value, unit, basis, currency }, candidates);
  if (mismatch) return { status: "blocked", ...mismatch };
  const matching = candidates.filter((candidate) => close(Number(value), candidate.value)
    && (basis === "unspecified" || candidate.basis === basis)
    && (candidate.currencies.length === 0 || candidate.currencies.length === 1 && candidate.currencies[0] === currency));
  if (matching.length !== 1) return {
    status: "blocked", reason: "guidance_per_share_owner_ambiguous", candidates: matching
  };
  return { status: "ready", owner: { ...matching[0] }, evidenceBasis: "independently_reconstructed_original_per_share_range" };
}
