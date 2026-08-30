const DAY_MS = 86_400_000;

export const CORPORATE_ACTION_REGISTRY = Object.freeze({
  AIG: [{
    eventDate: "2011-01-14",
    title: "AIG recapitalization and Treasury transaction",
    sourceUrl: "https://www.aig.com/content/dam/aig/america-canada/us/documents/investor-relations/aig-december-31-2015-form.pdf.coredownload.pdf"
  }],
  ALLE: [{
    eventDate: "2013-12-01",
    title: "Allegion separation from Ingersoll Rand",
    sourceUrl: "https://investor.allegion.com/ir-resources/faqs"
  }],
  KDP: [{
    eventDate: "2018-07-09",
    title: "Keurig Green Mountain and Dr Pepper Snapple merger with special dividend",
    sourceUrl: "https://investors.keurigdrpepper.com/2018-07-09-Keurig-Dr-Pepper-Announces-Successful-Completion-of-the-Merger-between-Keurig-Green-Mountain-and-Dr-Pepper-Snapple-Group"
  }],
  SWK: [{
    eventDate: "2010-03-12",
    title: "Stanley and Black & Decker merger",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/93556/000095015710000400/form8k.htm"
  }],
  WBD: [{
    eventDate: "2022-04-08",
    title: "Discovery and AT&T close WarnerMedia transaction",
    sourceUrl: "https://www.wbd.com/discovery-and-att-close-warnermedia-transaction/"
  }]
});

function finite(value) {
  if (value == null || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ratioMagnitude(left, right) {
  const a = finite(left);
  const b = finite(right);
  if (a == null || b == null || a === 0 || b === 0) return null;
  return Math.max(Math.abs(a / b), Math.abs(b / a));
}

function signChanged(left, right) {
  const a = finite(left);
  const b = finite(right);
  return a != null && b != null && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b);
}

function daysBetween(left, right) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(b - a) / DAY_MS;
}

function scoreInputs(row) {
  return row.input?.valuationSemantics?.scoreInputs ||
    row.output?.dataSnapshot?.valuationSemantics?.scoreInputs ||
    {};
}

function positiveMethodKeys(row) {
  return (row.output?.methodOutputs || [])
    .filter((entry) => finite(entry?.value) > 0)
    .map((entry) => entry.key)
    .sort();
}

function exactCorporateAction(ticker, fromDate, toDate) {
  return (CORPORATE_ACTION_REGISTRY[ticker] || []).find((event) =>
    String(event.eventDate) > String(fromDate) && String(event.eventDate) <= String(toDate)
  ) || null;
}

function sourceIntegrityFindings(row, side) {
  const findings = [];
  const score = scoreInputs(row);
  const source = row.input?.sourceRecord || {};
  const sharesM = finite(score.sharesM);
  if (!(sharesM > 0)) findings.push(`${side}_missing_positive_shares`);
  if (String(row.financial_available_at || "") > String(row.as_of_date || "")) findings.push(`${side}_future_financial`);
  if (row.guidance_max_observed_at && String(row.guidance_max_observed_at) > String(row.as_of_date || "")) {
    findings.push(`${side}_future_guidance`);
  }
  if (row.input?.valuationSemantics?.shareBasisAdjustmentFactor != null) {
    findings.push(`${side}_retrospective_share_adjustment`);
  }
  const currencyScale = finite(source.currencyScale);
  if (source.currencyScale != null && !(currencyScale > 0)) findings.push(`${side}_invalid_currency_scale`);
  if (source.sourceCurrency && source.modelCurrency && source.sourceCurrency !== source.modelCurrency) {
    const fx = source.fxConversion || {};
    if (!(finite(fx.conversionRate) > 0) || !fx.sourceRateDate || !fx.targetRateDate || !fx.sourceUrl) {
      findings.push(`${side}_incomplete_cross_currency_lineage`);
    }
  }
  const rawShares = finite(
    source.rawShareCounts?.sharesbas ??
    source.rawShareCounts?.shareswadil ??
    source.rawShareCounts?.shareswa
  );
  const appliedFactor = finite(source.appliedShareFactor);
  if (rawShares > 0 && appliedFactor > 0 && sharesM > 0) {
    const expectedSharesM = rawShares * appliedFactor / 1_000_000;
    if (Math.abs(expectedSharesM - sharesM) > 1e-6 * Math.max(1, expectedSharesM, sharesM)) {
      findings.push(`${side}_share_basis_arithmetic_mismatch`);
    }
  }
  return findings;
}

function quantitativeSignals(previous, current) {
  const left = scoreInputs(previous);
  const right = scoreInputs(current);
  const signals = [];
  const addScaleSignal = (metric, threshold) => {
    const ratio = ratioMagnitude(left[metric], right[metric]);
    if (ratio >= threshold) signals.push({ metric, type: "scale", ratio });
    else if (signChanged(left[metric], right[metric])) signals.push({ metric, type: "sign_change", ratio });
  };
  addScaleSignal("ttmRevenue", 2);
  addScaleSignal("ttmNetIncome", 3);
  addScaleSignal("ttmFreeCashFlow", 3);
  addScaleSignal("equityM", 3);
  const leftMargin = finite(left.observedOperatingMargin ?? left.operatingMargin);
  const rightMargin = finite(right.observedOperatingMargin ?? right.operatingMargin);
  if (leftMargin != null && rightMargin != null && Math.abs(rightMargin - leftMargin) >= 10) {
    signals.push({ metric: "observedOperatingMargin", type: "shift_10pp", delta: rightMargin - leftMargin });
  } else if (signChanged(leftMargin, rightMargin)) {
    signals.push({ metric: "observedOperatingMargin", type: "sign_change", delta: rightMargin - leftMargin });
  }
  return signals;
}

function modelTransitionFindings(previous, current) {
  const left = scoreInputs(previous);
  const right = scoreInputs(current);
  const findings = [];
  if (left.profile !== right.profile) findings.push("valuation_profile_changed");
  if (previous.output?.method !== current.output?.method) findings.push("valuation_method_changed");
  if (JSON.stringify(positiveMethodKeys(previous)) !== JSON.stringify(positiveMethodKeys(current))) {
    findings.push("positive_method_component_availability_changed");
  }
  if (previous.input?.sourceRecord?.dimension !== current.input?.sourceRecord?.dimension) {
    findings.push("financial_source_dimension_changed");
  }
  return findings;
}

export function classifyMaterialTransition(previous, current, { unmodeledGaps = [] } = {}) {
  const ticker = String(current.ticker || previous.ticker || "").toUpperCase();
  const previousFairValue = finite(previous.output?.fairValue);
  const currentFairValue = finite(current.output?.fairValue);
  const fairValueRatio = ratioMagnitude(previousFairValue, currentFairValue);
  const previousScore = scoreInputs(previous);
  const currentScore = scoreInputs(current);
  const shareRatio = ratioMagnitude(previousScore.sharesM, currentScore.sharesM);
  const corporateAction = exactCorporateAction(ticker, previous.as_of_date, current.as_of_date);
  const integrityFindings = [
    ...sourceIntegrityFindings(previous, "previous"),
    ...sourceIntegrityFindings(current, "current")
  ];
  if (shareRatio >= 1.5 && !corporateAction) integrityFindings.push("share_jump_without_registered_corporate_action");
  const modelFindings = modelTransitionFindings(previous, current);
  const signals = quantitativeSignals(previous, current);
  const exceptionalSignal = signals.find((signal) => signal.type === "scale" && signal.ratio >= 5);
  const interveningGaps = unmodeledGaps.filter((gap) =>
    gap.ticker === ticker &&
    String(gap.availableAt) > String(previous.as_of_date) &&
    String(gap.availableAt) <= String(current.as_of_date)
  );
  const result = {
    ticker,
    fromPeriod: previous.fiscal_period,
    toPeriod: current.fiscal_period,
    fromAsOfDate: previous.as_of_date,
    toAsOfDate: current.as_of_date,
    fromFairValue: previousFairValue,
    toFairValue: currentFairValue,
    fairValueRatio,
    reportingGapDays: daysBetween(previous.as_of_date, current.as_of_date),
    shareRatio,
    integrityFindings: [...new Set(integrityFindings)].sort(),
    modelFindings: [...new Set(modelFindings)].sort(),
    quantitativeSignals: signals,
    interveningUnmodeledPeriods: interveningGaps.map((gap) => ({
      fiscalPeriod: gap.fiscalPeriod,
      availableAt: gap.availableAt,
      reason: gap.reason
    })),
    corporateAction
  };

  if (integrityFindings.length) {
    return { ...result, classification: "unresolved", status: "blocker", rationale: "source_or_share_integrity_failure" };
  }
  if (corporateAction) {
    return { ...result, classification: "documented_corporate_action", status: "pass", rationale: corporateAction.title };
  }
  if (interveningGaps.length) {
    return {
      ...result,
      classification: "explicit_unmodeled_reporting_gap",
      status: "pass",
      rationale: "Every selected intermediate PIT period is explicitly classified as unmodelable."
    };
  }
  const hasMethodCliff = modelFindings.some((finding) =>
    ["valuation_profile_changed", "valuation_method_changed", "positive_method_component_availability_changed"].includes(finding)
  );
  if (signals.length >= 2 || (exceptionalSignal && !hasMethodCliff)) {
    return {
      ...result,
      classification: "audited_business_inflection",
      status: "pass",
      rationale: signals.length >= 2
        ? "At least two independent reported operating metrics changed materially."
        : `Exceptional ${exceptionalSignal.metric} change is supported without a model-method cliff.`
    };
  }
  return {
    ...result,
    classification: "unresolved",
    status: "blocker",
    rationale: modelFindings.length
      ? "A model or evidence-set transition is not sufficient evidence for a fourfold fair-value move."
      : "The reported operating evidence is insufficient to explain a fourfold fair-value move."
  };
}

export function inspectValuationTemporalContinuity(db, { unmodeledAudit = null } = {}) {
  const rows = db.prepare(`
    SELECT ticker, fiscal_period, as_of_date, financial_available_at,
           guidance_max_observed_at, input_json, output_json
    FROM valuation_pit_model_runs
    ORDER BY ticker, as_of_date, fiscal_period
  `).iterate();
  const changes = [];
  const unmodeledGaps = unmodeledAudit?.gaps || [];
  let previous = null;
  for (const rawRow of rows) {
    const current = {
      ...rawRow,
      ticker: String(rawRow.ticker).toUpperCase(),
      input: parseJson(rawRow.input_json, {}),
      output: parseJson(rawRow.output_json, {})
    };
    if (previous && previous.ticker === current.ticker) {
      const previousFairValue = finite(previous.output?.fairValue);
      const currentFairValue = finite(current.output?.fairValue);
      const fairValueRatio = ratioMagnitude(previousFairValue, currentFairValue);
      if (previousFairValue > 0 && currentFairValue > 0 && fairValueRatio >= 4 &&
          Math.abs(currentFairValue - previousFairValue) >= 5 && Math.max(previousFairValue, currentFairValue) >= 10) {
        changes.push(classifyMaterialTransition(previous, current, { unmodeledGaps }));
      }
    }
    previous = current;
  }
  const classifiedCounts = Object.fromEntries([...changes.reduce((counts, change) => {
    counts.set(change.classification, (counts.get(change.classification) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  return {
    materialChanges: changes.length,
    affectedTickers: new Set(changes.map((change) => change.ticker)).size,
    classifiedCounts,
    blockers: changes.filter((change) => change.status === "blocker"),
    changes
  };
}
