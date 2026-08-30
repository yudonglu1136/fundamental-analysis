import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const REPORT_PATH = process.env.VALUATION_QA_REPORT_PATH || path.join(process.cwd(), "server/reports/valuation-qa-latest.json");

const STABLE_PROFILES = new Set([
  "ads_ai_platform",
  "mega_cap_platform",
  "medtech_platform",
  "payments_network",
  "quality_consumer",
  "information_services",
  "healthcare_distribution",
  "managed_care"
]);

const HIGH_VARIANCE_PROFILES = new Set([
  "emerging_biotech",
  "emerging_health_ai",
  "energy_technology",
  "ev_autonomy_platform",
  "hypergrowth_ai_software",
  "semiconductor_cyclical",
  "semiconductor_growth"
]);

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quarterRank(row) {
  const year = finiteNumber(row?.fiscalYear);
  const quarter = String(row?.fiscalQuarter || "").match(/Q([1-4])/i)?.[1];
  if (year == null || !quarter) return null;
  return year * 4 + Number(quarter);
}

function periodKey(row) {
  const year = finiteNumber(row?.fiscalYear);
  const quarter = String(row?.fiscalQuarter || "").match(/Q([1-4])/i)?.[1];
  if (year != null && quarter) return `${year}-Q${quarter}`;
  const label = String(row?.label || row?.periodId || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (label) return label;
  if (row?.asOfDate) return `ASOF-${row.asOfDate}`;
  return null;
}

function isQuarterlyHistory(history) {
  if (!history.length) return false;
  return history.filter((row) => quarterRank(row) != null).length >= Math.max(4, Math.floor(history.length * 0.65));
}

function daysBetween(left, right) {
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function pct(value) {
  return value == null ? null : Number((value * 100).toFixed(1));
}

function ratio(value) {
  return value == null ? null : Number(value.toFixed(3));
}

function ratioMagnitude(left, right) {
  const a = Math.abs(finiteNumber(left) || 0);
  const b = Math.abs(finiteNumber(right) || 0);
  if (!(a > 0) || !(b > 0)) return null;
  return Math.max(a, b) / Math.min(a, b);
}

function signChanged(left, right) {
  const a = finiteNumber(left);
  const b = finiteNumber(right);
  return a != null && b != null && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b);
}

function explainFairValueStep(previous, current) {
  const left = previous.dataSnapshot?.valuationSemantics?.scoreInputs || {};
  const right = current.dataSnapshot?.valuationSemantics?.scoreInputs || {};
  const reasons = [];
  const addScale = (metric, threshold) => {
    if (signChanged(left[metric], right[metric])) reasons.push(`${metric}_sign_changed`);
    if ((ratioMagnitude(left[metric], right[metric]) || 0) >= threshold) reasons.push(`${metric}_scale_changed`);
  };
  if (left.profile !== right.profile) reasons.push("valuation_profile_changed");
  if (previous.method !== current.method) reasons.push("valuation_method_changed");
  const positiveMethods = (row) => (row.methodOutputs || [])
    .filter((entry) => finiteNumber(entry?.value) > 0)
    .map((entry) => entry.key)
    .sort();
  if (JSON.stringify(positiveMethods(previous)) !== JSON.stringify(positiveMethods(current))) {
    reasons.push("positive_method_component_availability_changed");
  }
  addScale("ttmRevenue", 1.2);
  addScale("ttmNetIncome", 1.5);
  addScale("normalizedNetIncome", 1.35);
  addScale("currentEps", 1.25);
  addScale("cycleEps", 1.25);
  addScale("normalizedEps", 1.25);
  addScale("valuationFreeCashFlow", 1.35);
  addScale("equityM", 1.5);
  addScale("cashM", 1.5);
  addScale("debtM", 1.5);
  addScale("sharesM", 1.2);
  for (const metric of ["normalizedMargin", "operatingMargin", "cycleOperatingMargin", "cycleNetMargin", "cycleFcfMargin"]) {
    const a = finiteNumber(left[metric]);
    const b = finiteNumber(right[metric]);
    if (a != null && b != null && Math.abs(b - a) >= 3) reasons.push(`${metric}_shifted_3pp`);
  }
  for (const metric of ["targetPE", "targetPB", "evSalesMultiple", "targetFCFYield"]) {
    if ((ratioMagnitude(left[metric], right[metric]) || 0) >= 1.2) reasons.push(`${metric}_changed_materially`);
  }
  const leftMethods = new Map((previous.methodOutputs || [])
    .filter((entry) => entry?.key && entry?.format === "currency" && finiteNumber(entry.value) > 0)
    .map((entry) => [entry.key, finiteNumber(entry.value)]));
  const rightMethods = new Map((current.methodOutputs || [])
    .filter((entry) => entry?.key && entry?.format === "currency" && finiteNumber(entry.value) > 0)
    .map((entry) => [entry.key, finiteNumber(entry.value)]));
  for (const [key, value] of leftMethods) {
    if ((ratioMagnitude(value, rightMethods.get(key)) || 0) >= 1.2) reasons.push(`${key}_component_value_changed`);
  }
  const leftWeights = left.methodWeights || {};
  const rightWeights = right.methodWeights || {};
  for (const key of new Set([...Object.keys(leftWeights), ...Object.keys(rightWeights)])) {
    const a = finiteNumber(leftWeights[key]) || 0;
    const b = finiteNumber(rightWeights[key]) || 0;
    if (Math.abs(a - b) >= 0.05) reasons.push(`${key}_weight_changed`);
  }
  const leftGuidance = finiteNumber(previous.dataSnapshot?.guidanceCandidateCount) || 0;
  const rightGuidance = finiteNumber(current.dataSnapshot?.guidanceCandidateCount) || 0;
  if ((leftGuidance === 0) !== (rightGuidance === 0)) reasons.push("guidance_availability_changed");
  if (previous.dataSnapshot?.financialSource?.record?.dimension !== current.dataSnapshot?.financialSource?.record?.dimension) {
    reasons.push("financial_source_dimension_changed");
  }
  if (previous.dataSnapshot?.annualizedFromSinglePeriod !== current.dataSnapshot?.annualizedFromSinglePeriod) {
    reasons.push("annualization_basis_changed");
  }
  return [...new Set(reasons.length ? reasons : ["combined_subthreshold_input_changes"])].sort();
}

function groupedDuplicates(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function issue(severity, code, message, evidence = null) {
  return { severity, code, message, evidence };
}

function stepThresholds(profile) {
  if (STABLE_PROFILES.has(profile)) return { up: 0.35, down: -0.25 };
  if (HIGH_VARIANCE_PROFILES.has(profile)) return { up: 0.85, down: -0.55 };
  return { up: 0.55, down: -0.4 };
}

function transcriptQaStats(history) {
  const statusCounts = {};
  let coveragePeriods = 0;
  let qaPeriods = 0;
  let qaItems = 0;
  let bilingualQaItems = 0;
  for (const row of history) {
    const youtube = row.dataSnapshot?.youtubeEarnings || {};
    const qa = Array.isArray(youtube.qa) ? youtube.qa : [];
    const coverage = youtube.qaCoverage || null;
    if (qa.length) {
      qaPeriods += 1;
      qaItems += qa.length;
      bilingualQaItems += qa.filter((item) =>
        /[\u3400-\u9fff]/.test(String(item.questionZh || "")) &&
        /[\u3400-\u9fff]/.test(String(item.answerZh || ""))
      ).length;
    }
    if (coverage) {
      coveragePeriods += 1;
      const status = String(coverage.status || "unknown");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  }
  return {
    coveragePeriods,
    qaPeriods,
    qaItems,
    bilingualQaItems,
    untranslatedQaItems: Math.max(0, qaItems - bilingualQaItems),
    missingPeriods: Math.max(0, history.length - qaPeriods),
    statusCounts
  };
}

export function tickerQa(snapshot) {
  const valuationNotApplicable = snapshot.dataQuality?.valuationStatus === "not_applicable";
  if (valuationNotApplicable) {
    return {
      ticker: snapshot.ticker,
      name: snapshot.name,
      profile: null,
      status: "not_applicable",
      rowCount: 0,
      first: null,
      last: null,
      latestFairValue: null,
      latestPrice: finiteNumber(snapshot.latest?.latestPrice),
      latestFairToPrice: null,
      unifiedStatus: snapshot.dataQuality?.unifiedValuationAudit?.status || "not_applicable",
      consensusStatus: null,
      transcriptQa: transcriptQaStats([]),
      issueCount: 0,
      issues: [],
      watchNotes: [],
      researchStatus: "pass",
      researchIssueCount: 0,
      researchIssues: [],
      researchWatchNotes: [],
      sortRank: 0
    };
  }
  const history = [...(snapshot.history || [])]
    .filter((row) => row.asOfDate && finiteNumber(row.fairValue) != null)
    .sort((left, right) => String(left.asOfDate).localeCompare(String(right.asOfDate)));
  const latestFairValue = finiteNumber(snapshot.latest?.baseFairValue);
  const latestPrice = finiteNumber(snapshot.latest?.latestPrice);
  const latestFairToPrice = latestFairValue && latestPrice ? latestFairValue / latestPrice : null;
  const unified = snapshot.dataQuality?.unifiedValuationAudit || {};
  const modelAudit = snapshot.dataQuality?.modelInputAudit || {};
  const profile = history.at(-1)?.dataSnapshot?.valuationSemantics?.scoreInputs?.profile || null;
  const transcriptQa = transcriptQaStats(history);
  const issues = [];
  const watchNotes = [];
  const researchIssues = [];
  const researchWatchNotes = [];
  const verifiedInputs = modelAudit.status === "pass" ||
    (finiteNumber(modelAudit.financialOrGuidanceEvidenceRows) || 0) > 0 ||
    (finiteNumber(modelAudit.valuationRows) || 0) > 0;

  if (!history.length) {
    issues.push(issue("fail", "missing_history", "No usable valuation history."));
  }
  if (history.length > 0 && history.length < 8) {
    watchNotes.push(issue("watch", "short_history", "Less than eight valuation observations; coverage note, not a model-quality failure when verified financial inputs exist.", { rows: history.length }));
  }
  if (modelAudit.status === "fail") {
    issues.push(issue("fail", "model_input_audit", "Model input audit failed.", { status: modelAudit.status, warnings: modelAudit.warnings || [] }));
  } else if (modelAudit.status === "review" && !verifiedInputs) {
    issues.push(issue("review", "model_input_audit", "Model input audit lacks verified financial/guidance evidence.", { status: modelAudit.status, warnings: modelAudit.warnings || [] }));
  } else if (modelAudit.status === "review") {
    watchNotes.push(issue("watch", "model_input_audit", "Model input audit is a coverage note with verified inputs.", { status: modelAudit.status, warnings: modelAudit.warnings || [] }));
  }
  const duplicateDates = groupedDuplicates(history.map((row) => row.asOfDate));
  if (duplicateDates.length) {
    issues.push(issue("fail", "duplicate_as_of_date", "Multiple valuation rows share the same as-of date.", duplicateDates));
  }
  const quarterlyHistory = isQuarterlyHistory(history);
  const duplicatePeriods = groupedDuplicates(history.map(periodKey));
  if (duplicatePeriods.length) {
    issues.push(issue("fail", "duplicate_fiscal_period", "Multiple valuation rows share the same fiscal period.", duplicatePeriods));
  }

  const fiscalInversions = [];
  const largeSteps = [];
  const dateGaps = [];
  const shareJumps = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    const previousRank = quarterRank(previous);
    const currentRank = quarterRank(current);
    const previousCalendarTransition = previous.dataSnapshot?.financialSource?.record?.fiscalCalendarTransition === true;
    const currentCalendarTransition = current.dataSnapshot?.financialSource?.record?.fiscalCalendarTransition === true;
    if (
      previousRank != null &&
      currentRank != null &&
      currentRank <= previousRank &&
      !previousCalendarTransition &&
      !currentCalendarTransition
    ) {
      fiscalInversions.push({
        from: previous.label,
        to: current.label,
        fromDate: previous.asOfDate,
        toDate: current.asOfDate
      });
    }
    const previousFair = finiteNumber(previous.fairValue);
    const currentFair = finiteNumber(current.fairValue);
    const step = previousFair > 0 && currentFair > 0 ? currentFair / previousFair - 1 : null;
    const thresholds = stepThresholds(profile);
    if (step != null && (step > thresholds.up || step < thresholds.down || Math.abs(step) > 1.2)) {
      largeSteps.push({
        from: previous.label,
        to: current.label,
        fromDate: previous.asOfDate,
        toDate: current.asOfDate,
        stepPct: pct(step),
        previousFairValue: Number(previousFair.toFixed(2)),
        currentFairValue: Number(currentFair.toFixed(2)),
        reasons: explainFairValueStep(previous, current)
      });
    }
    const gap = daysBetween(previous.asOfDate, current.asOfDate);
    const gapThreshold = quarterlyHistory ? 190 : 410;
    if (gap != null && gap > gapThreshold) {
      dateGaps.push({
        from: previous.label,
        to: current.label,
        days: gap
      });
    }
    const previousShares = finiteNumber(previous.dataSnapshot?.valuationSemantics?.scoreInputs?.sharesM);
    const currentShares = finiteNumber(current.dataSnapshot?.valuationSemantics?.scoreInputs?.sharesM);
    if (previousShares > 0 && currentShares > 0) {
      const shareRatio = currentShares / previousShares;
      if (shareRatio > 1.5 || shareRatio < 0.67) {
        shareJumps.push({
          from: previous.label,
          to: current.label,
          ratio: ratio(shareRatio),
          policy: current.dataSnapshot?.valuationSemantics?.shareBasisPolicy ||
            previous.dataSnapshot?.valuationSemantics?.shareBasisPolicy || null
        });
      }
    }
  }
  if (fiscalInversions.length) {
    issues.push(issue("fail", "fiscal_order_inversion", "Fiscal periods are not strictly increasing.", fiscalInversions));
  }
  if (largeSteps.length) {
    watchNotes.push(issue("watch", "large_fair_value_step", "Fair-value series has large adjacent-period moves; each observation records its PIT input or method transition and remains a watch item unless structural audit fails.", largeSteps));
  }
  if (dateGaps.length) {
    watchNotes.push(issue("watch", "date_gap", "Valuation history has gaps longer than roughly two quarters.", dateGaps));
  }
  if (shareJumps.length) {
    watchNotes.push(issue(
      "watch",
      "share_count_jump",
      "PIT period-end shares changed materially. The model preserves each period's source share count and does not infer a split from the jump; review mergers, offerings, class conversions, or source lineage when the valuation also moves materially.",
      shareJumps
    ));
  }
  if (latestFairToPrice != null && (latestFairToPrice < 0.2 || latestFairToPrice > 3)) {
    watchNotes.push(issue("watch", "latest_fair_to_price_extreme", "Latest fair value / price is extreme; this is a valuation conclusion unless input audit fails.", { latestFairToPrice: ratio(latestFairToPrice) }));
  }
  const consensusCheck = unified.externalConsensusCheck || {};
  if (consensusCheck.status === "divergent") {
    watchNotes.push(issue("watch", "external_consensus_divergent", consensusCheck.message || "Fair value is materially outside external consensus guardrail.", {
      fairToConsensus: ratio(consensusCheck.fairToConsensus),
      priceToConsensus: ratio(consensusCheck.priceToConsensus)
    }));
  }
  if (consensusCheck.status === "no_external_consensus") {
    watchNotes.push(issue("watch", "no_external_consensus", consensusCheck.message || "No external consensus guardrail available."));
  }
  if (history.length && transcriptQa.coveragePeriods < history.length) {
    researchIssues.push(issue("review", "transcript_qa_coverage_missing", "Some valuation quarters do not have transcript Q&A coverage metadata.", {
      historyRows: history.length,
      coveragePeriods: transcriptQa.coveragePeriods
    }));
  }
  if (transcriptQa.untranslatedQaItems) {
    researchIssues.push(issue("review", "transcript_qa_translation_incomplete", "Stored transcript Q&A is not fully bilingual.", {
      qaItems: transcriptQa.qaItems,
      bilingualQaItems: transcriptQa.bilingualQaItems,
      untranslatedQaItems: transcriptQa.untranslatedQaItems
    }));
  }
  if (transcriptQa.statusCounts.qa_parse_miss) {
    researchWatchNotes.push(issue("watch", "transcript_qa_parse_miss", "Some transcripts contain question-like text but could not be safely paired into analyst Q&A.", {
      rows: transcriptQa.statusCounts.qa_parse_miss
    }));
  }
  if (transcriptQa.statusCounts.locked_preview) {
    researchWatchNotes.push(issue("watch", "transcript_qa_locked_preview", "Some local transcripts are locked previews without the Q&A section.", {
      rows: transcriptQa.statusCounts.locked_preview
    }));
  }

  const severityRank = { not_applicable: 0, pass: 0, review: 1, fail: 2 };
  const status = issues.some((item) => item.severity === "fail")
    ? "fail"
    : issues.some((item) => item.severity === "review")
      ? "review"
      : "pass";
  const researchStatus = researchIssues.length ? "review" : "pass";

  return {
    ticker: snapshot.ticker,
    name: snapshot.name,
    profile,
    status,
    rowCount: history.length,
    first: history[0]?.label || null,
    last: history.at(-1)?.label || null,
    latestFairValue: latestFairValue == null ? null : Number(latestFairValue.toFixed(2)),
    latestPrice: latestPrice == null ? null : Number(latestPrice.toFixed(2)),
    latestFairToPrice: ratio(latestFairToPrice),
    unifiedStatus: unified.status || null,
    consensusStatus: consensusCheck.status || null,
    transcriptQa,
    issueCount: issues.length,
    issues,
    watchNotes,
    researchStatus,
    researchIssueCount: researchIssues.length,
    researchIssues,
    researchWatchNotes,
    sortRank: severityRank[status] || 0
  };
}

export function buildValuationQaReport(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tickers = [];
    for (const row of db.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots ORDER BY ticker").iterate()) {
      tickers.push(tickerQa(parseJson(row.payload_json, { ticker: row.ticker })));
    }
    return {
      generatedAt: new Date().toISOString(),
      dbPath,
      summary: {
        tickerCount: tickers.length,
        notApplicableCount: tickers.filter((ticker) => ticker.status === "not_applicable").length,
        passCount: tickers.filter((ticker) => ticker.status === "pass").length,
        reviewCount: tickers.filter((ticker) => ticker.status === "review").length,
        failCount: tickers.filter((ticker) => ticker.status === "fail").length,
        researchPassCount: tickers.filter((ticker) => ticker.researchStatus === "pass").length,
        researchReviewCount: tickers.filter((ticker) => ticker.researchStatus === "review").length,
        transcriptQaCoveragePeriods: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.coveragePeriods, 0),
        transcriptQaPeriods: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.qaPeriods, 0),
        transcriptQaItems: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.qaItems, 0),
        bilingualTranscriptQaItems: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.bilingualQaItems, 0),
        untranslatedTranscriptQaItems: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.untranslatedQaItems, 0)
      },
      tickers: tickers.sort((left, right) => right.sortRank - left.sortRank || left.ticker.localeCompare(right.ticker))
    };
  } finally {
    db.close();
  }
}

export function writeValuationQaReport({ dbPath = DB_PATH, reportPath = REPORT_PATH } = {}) {
  const report = buildValuationQaReport(dbPath);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

function main() {
  const report = writeValuationQaReport();
  if (process.env.VALUATION_QA_VERBOSE === "1") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(JSON.stringify({ generatedAt: report.generatedAt, dbPath: report.dbPath, summary: report.summary }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
