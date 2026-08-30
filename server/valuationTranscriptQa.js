import { normalizeEarningsPeriod } from "./transcriptQaClient.js";

function text(value) {
  return String(value || "").trim();
}

function historyPeriodKey(row) {
  const fiscalYear = Number(row?.fiscalYear);
  const quarterMatch = text(row?.fiscalQuarter || row?.label || row?.periodId)
    .toUpperCase()
    .match(/Q([1-4])/);
  if (Number.isFinite(fiscalYear) && quarterMatch) {
    return `Q${quarterMatch[1]}${fiscalYear}`;
  }
  const value = text(row?.label || row?.periodId).toUpperCase();
  const quarterThenYear = value.match(/Q([1-4])\s*(?:FY)?\s*(20\d{2})/);
  if (quarterThenYear) return `Q${quarterThenYear[1]}${quarterThenYear[2]}`;
  const yearThenQuarter = value.match(/(?:FY)?\s*(20\d{2}).*Q([1-4])/);
  if (yearThenQuarter) return `Q${yearThenQuarter[2]}${yearThenQuarter[1]}`;
  return normalizeEarningsPeriod(value);
}

function storedTranscriptResearch(row) {
  const youtube = row?.dataSnapshot?.youtubeEarnings;
  if (!youtube || typeof youtube !== "object") return null;
  const qa = Array.isArray(youtube.qa) ? youtube.qa : null;
  const qaCoverage = youtube.qaCoverage && typeof youtube.qaCoverage === "object"
    ? youtube.qaCoverage
    : null;
  if (!qa && !qaCoverage) return null;
  return {
    ...(qa ? { qa } : {}),
    ...(qaCoverage ? { qaCoverage } : {})
  };
}

export function preserveTranscriptQaByFiscalPeriod(nextHistory, previousHistory) {
  const previousResearch = new Map();
  for (const row of Array.isArray(previousHistory) ? previousHistory : []) {
    const key = historyPeriodKey(row);
    const research = storedTranscriptResearch(row);
    if (key && research) previousResearch.set(key, research);
  }
  if (!previousResearch.size) return nextHistory;

  return (Array.isArray(nextHistory) ? nextHistory : []).map((row) => {
    const research = previousResearch.get(historyPeriodKey(row));
    if (!research) return row;
    return {
      ...row,
      dataSnapshot: {
        ...(row.dataSnapshot || {}),
        youtubeEarnings: {
          ...(row.dataSnapshot?.youtubeEarnings || {}),
          ...research
        }
      }
    };
  });
}

export function transcriptQaCoverageSummary(history) {
  const statusCounts = {};
  let coveragePeriods = 0;
  let qaPeriods = 0;
  let qaRows = 0;
  let bilingualQaRows = 0;
  for (const row of Array.isArray(history) ? history : []) {
    const youtube = row?.dataSnapshot?.youtubeEarnings || {};
    const coverage = youtube.qaCoverage;
    const qa = Array.isArray(youtube.qa) ? youtube.qa : [];
    if (coverage && typeof coverage === "object") {
      coveragePeriods += 1;
      const status = text(coverage.status) || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    if (qa.length) qaPeriods += 1;
    qaRows += qa.length;
    bilingualQaRows += qa.filter((item) =>
      /[\u3400-\u9fff]/.test(text(item.questionZh)) &&
      /[\u3400-\u9fff]/.test(text(item.answerZh))
    ).length;
  }
  return {
    totalPeriods: Array.isArray(history) ? history.length : 0,
    coveragePeriods,
    qaPeriods,
    qaRows,
    bilingualQaRows,
    statusCounts
  };
}
