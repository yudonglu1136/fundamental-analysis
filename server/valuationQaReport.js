import fs from "node:fs";
import path from "node:path";
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
  for (const row of history) {
    const youtube = row.dataSnapshot?.youtubeEarnings || {};
    const qa = Array.isArray(youtube.qa) ? youtube.qa : [];
    const coverage = youtube.qaCoverage || null;
    if (qa.length) {
      qaPeriods += 1;
      qaItems += qa.length;
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
    missingPeriods: Math.max(0, history.length - qaPeriods),
    statusCounts
  };
}

function tickerQa(snapshot) {
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
    if (previousRank != null && currentRank != null && currentRank <= previousRank) {
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
        currentFairValue: Number(currentFair.toFixed(2))
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
          hasSplitBasisAdjustment: Boolean(previous.dataSnapshot?.valuationSemantics?.shareBasisAdjustmentFactor || current.dataSnapshot?.valuationSemantics?.shareBasisAdjustmentFactor)
        });
      }
    }
  }
  if (fiscalInversions.length) {
    issues.push(issue("fail", "fiscal_order_inversion", "Fiscal periods are not strictly increasing.", fiscalInversions));
  }
  if (largeSteps.length) {
    watchNotes.push(issue("watch", "large_fair_value_step", "Fair-value series has large adjacent-period moves; this is reviewed as a model-watch item unless structural audit fails.", largeSteps.slice(0, 8)));
  }
  if (dateGaps.length) {
    watchNotes.push(issue("watch", "date_gap", "Valuation history has gaps longer than roughly two quarters.", dateGaps.slice(0, 8)));
  }
  if (shareJumps.some((jump) => !jump.hasSplitBasisAdjustment)) {
    issues.push(issue("review", "share_count_jump", "Share count basis changed without a visible split-basis adjustment.", shareJumps));
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
    issues.push(issue("review", "transcript_qa_coverage_missing", "Some valuation quarters do not have transcript Q&A coverage metadata.", {
      historyRows: history.length,
      coveragePeriods: transcriptQa.coveragePeriods
    }));
  }
  if (transcriptQa.statusCounts.qa_parse_miss) {
    watchNotes.push(issue("watch", "transcript_qa_parse_miss", "Some transcripts contain question-like text but could not be safely paired into analyst Q&A.", {
      rows: transcriptQa.statusCounts.qa_parse_miss
    }));
  }
  if (transcriptQa.statusCounts.locked_preview) {
    watchNotes.push(issue("watch", "transcript_qa_locked_preview", "Some local transcripts are locked previews without the Q&A section.", {
      rows: transcriptQa.statusCounts.locked_preview
    }));
  }

  const severityRank = { pass: 0, review: 1, fail: 2 };
  const status = issues.some((item) => item.severity === "fail")
    ? "fail"
    : issues.some((item) => item.severity === "review")
      ? "review"
      : "pass";

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
    sortRank: severityRank[status] || 0
  };
}

function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const rows = db.prepare("SELECT ticker, payload_json FROM valuation_ticker_snapshots ORDER BY ticker").all();
    const tickers = rows.map((row) => tickerQa(parseJson(row.payload_json, { ticker: row.ticker })));
    const report = {
      generatedAt: new Date().toISOString(),
      dbPath: DB_PATH,
      summary: {
        tickerCount: tickers.length,
        passCount: tickers.filter((ticker) => ticker.status === "pass").length,
        reviewCount: tickers.filter((ticker) => ticker.status === "review").length,
        failCount: tickers.filter((ticker) => ticker.status === "fail").length,
        transcriptQaCoveragePeriods: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.coveragePeriods, 0),
        transcriptQaPeriods: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.qaPeriods, 0),
        transcriptQaItems: tickers.reduce((sum, ticker) => sum + ticker.transcriptQa.qaItems, 0)
      },
      tickers: tickers.sort((left, right) => right.sortRank - left.sortRank || left.ticker.localeCompare(right.ticker))
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

main();
