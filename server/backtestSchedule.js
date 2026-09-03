function executionDateOf(candidate) {
  return String(candidate?.decision?.executionDate || "");
}

function reportDateOf(candidate) {
  return String(candidate?.snapshot?.reportDate || "");
}

function selectedPriceRequirementsOf(candidate) {
  if (Array.isArray(candidate?.selectedPriceRequirements)) {
    return candidate.selectedPriceRequirements
      .map((requirement) => ({
        ticker: String(requirement?.ticker || "").trim().toUpperCase(),
        startInclusive: String(requirement?.startInclusive || ""),
        endExclusive: String(requirement?.endExclusive || "")
      }))
      .filter((requirement) => requirement.ticker);
  }
  return [...new Set(candidate?.selectedTickers || [])]
    .map((ticker) => ({
      ticker: String(ticker || "").trim().toUpperCase(),
      startInclusive: "",
      endExclusive: ""
    }))
    .filter((requirement) => requirement.ticker);
}

/**
 * If distinct 13F report periods first become tradable on the same session,
 * only the most recent report period is actionable. Older snapshots were
 * already stale before either portfolio could be executed. Duplicates within
 * the same latest report period remain in the schedule so the return engine
 * continues to fail closed on unresolved ordering ambiguity.
 */
export function collapseSupersededSameSessionSnapshots(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates) {
    const executionDate = executionDateOf(candidate);
    if (!executionDate) continue;
    const group = groups.get(executionDate) || [];
    group.push(candidate);
    groups.set(executionDate, group);
  }

  const schedule = [];
  const exclusions = [];
  for (const [executionDate, group] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const reportDates = group.map(reportDateOf).filter(Boolean);
    const latestReportDate = reportDates.sort().at(-1) || "";
    const latest = group.filter((candidate) => reportDateOf(candidate) === latestReportDate);
    if (latest.length !== 1 || group.length === 1) {
      schedule.push(...group);
      continue;
    }

    const retained = latest[0];
    schedule.push(retained);
    for (const candidate of group) {
      if (candidate === retained) continue;
      exclusions.push({
        candidate,
        code: "superseded_same_execution_session",
        executionDate,
        supersededByReportDate: latestReportDate,
        supersededByAccessionNumber:
          retained?.snapshot?.filing?.accessionNumber || null,
        reason:
          "A later 13F report period was already public before the shared execution session; the stale snapshot was not traded."
      });
    }
  }

  schedule.sort((left, right) =>
    executionDateOf(left).localeCompare(executionDateOf(right)) ||
    reportDateOf(left).localeCompare(reportDateOf(right))
  );
  return { schedule, exclusions };
}

/** Return the minimum price interval needed while each selected ticker is held. */
export function manager13fActivePriceWindows(schedule = [], endDate = "") {
  const windows = new Map();
  for (let index = 0; index < schedule.length; index += 1) {
    const candidate = schedule[index];
    const start = executionDateOf(candidate);
    const scheduledEnd = executionDateOf(schedule[index + 1]) || String(endDate || "");
    if (!start || !scheduledEnd) continue;
    for (const requirement of selectedPriceRequirementsOf(candidate)) {
      const intervalStart = requirement.startInclusive > start &&
        requirement.startInclusive < scheduledEnd
        ? requirement.startInclusive
        : start;
      const endExclusive = requirement.endExclusive > intervalStart &&
        requirement.endExclusive <= scheduledEnd
        ? requirement.endExclusive
        : "";
      const interval = {
        start: intervalStart,
        end: endExclusive || scheduledEnd,
        ...(endExclusive ? { endExclusive } : {})
      };
      const current = windows.get(requirement.ticker);
      windows.set(requirement.ticker, {
        start: current?.start && current.start < intervalStart
          ? current.start
          : intervalStart,
        end: current?.end && current.end > interval.end ? current.end : interval.end,
        intervals: [...(current?.intervals || []), interval]
      });
    }
  }
  for (const [ticker, window] of windows) {
    const merged = [];
    for (const interval of [...window.intervals].sort((left, right) =>
      left.start.localeCompare(right.start) || left.end.localeCompare(right.end)
    )) {
      const previous = merged.at(-1);
      if (previous && !previous.endExclusive && interval.start <= previous.end) {
        if (interval.end > previous.end) {
          previous.end = interval.end;
          if (interval.endExclusive) previous.endExclusive = interval.endExclusive;
          else delete previous.endExclusive;
        }
      } else {
        merged.push({ ...interval });
      }
    }
    windows.set(ticker, { ...window, intervals: merged });
  }
  return windows;
}

export function activeTradingDatesForPriceWindow(tradingDates = [], window = {}) {
  const intervals = Array.isArray(window?.intervals) && window.intervals.length
    ? window.intervals
    : window?.start && window?.end
      ? [{ start: window.start, end: window.end }]
      : [];
  return [...new Set((tradingDates || [])
    .map((point) => typeof point === "string" ? point : point?.date)
    .filter((date) => date && intervals.some((interval) =>
      date >= interval.start &&
      (interval.endExclusive ? date < interval.endExclusive : date <= interval.end)
    )))].sort();
}

/**
 * A disclosed ETF position may use the same ticker as the benchmark. Keep the
 * benchmark's full-window series authoritative instead of replacing it with
 * the position's shorter active interval.
 */
export function holdingPriceLoadUniverse(universe = [], benchmarkSymbol = "SPY") {
  const benchmark = String(benchmarkSymbol || "").trim().toUpperCase();
  return [...new Set((universe || [])
    .map((ticker) => String(ticker || "").trim().toUpperCase())
    .filter((ticker) => ticker && ticker !== benchmark))];
}
