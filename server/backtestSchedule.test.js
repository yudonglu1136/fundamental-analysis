import assert from "node:assert/strict";
import test from "node:test";

import {
  activeTradingDatesForPriceWindow,
  collapseSupersededSameSessionSnapshots,
  holdingPriceLoadUniverse,
  manager13fActivePriceWindows
} from "./backtestSchedule.js";

function candidate(reportDate, executionDate, tickers, accessionNumber = reportDate) {
  return {
    snapshot: { reportDate, filing: { accessionNumber } },
    decision: { executionDate },
    selectedTickers: tickers
  };
}

test("a later report period supersedes a stale snapshot on the same execution session", () => {
  const stale = candidate("2016-12-31", "2017-06-15", ["BIDU", "SINA"], "q4");
  const current = candidate("2017-03-31", "2017-06-15", ["BIDU", "SINA"], "q1");
  const next = candidate("2017-06-30", "2017-08-15", ["BIDU", "SINA", "WB"], "q2");
  const result = collapseSupersededSameSessionSnapshots([stale, next, current]);

  assert.deepEqual(result.schedule, [current, next]);
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].candidate, stale);
  assert.equal(result.exclusions[0].code, "superseded_same_execution_session");
  assert.equal(result.exclusions[0].supersededByReportDate, "2017-03-31");
});

test("unresolved duplicates in the latest report period remain fail-closed", () => {
  const left = candidate("2026-06-30", "2026-08-17", ["A"], "left");
  const right = candidate("2026-06-30", "2026-08-17", ["B"], "right");
  const result = collapseSupersededSameSessionSnapshots([left, right]);

  assert.deepEqual(result.schedule, [left, right]);
  assert.deepEqual(result.exclusions, []);
});

test("ticker price windows end at the next executable portfolio snapshot", () => {
  const schedule = [
    candidate("2017-03-31", "2017-06-15", ["BIDU", "SINA"]),
    candidate("2017-06-30", "2017-08-15", ["BIDU", "SINA", "WB"]),
    candidate("2018-06-30", "2018-08-15", ["BIDU", "BABA"])
  ];
  const windows = manager13fActivePriceWindows(schedule, "2026-09-02");

  assert.deepEqual(windows.get("SINA"), {
    start: "2017-06-15",
    end: "2018-08-15",
    intervals: [{ start: "2017-06-15", end: "2018-08-15" }]
  });
  assert.deepEqual(windows.get("BIDU"), {
    start: "2017-06-15",
    end: "2026-09-02",
    intervals: [{ start: "2017-06-15", end: "2026-09-02" }]
  });
  assert.deepEqual(windows.get("BABA"), {
    start: "2018-08-15",
    end: "2026-09-02",
    intervals: [{ start: "2018-08-15", end: "2026-09-02" }]
  });
});

test("disjoint holdings require prices only during their active intervals", () => {
  const schedule = [
    candidate("2022-03-31", "2022-05-16", ["AAA"]),
    candidate("2022-06-30", "2022-08-15", ["BBB"]),
    candidate("2022-09-30", "2022-11-15", ["AAA"])
  ];
  const window = manager13fActivePriceWindows(schedule, "2023-02-15").get("AAA");
  assert.deepEqual(window, {
    start: "2022-05-16",
    end: "2023-02-15",
    intervals: [
      { start: "2022-05-16", end: "2022-08-15" },
      { start: "2022-11-15", end: "2023-02-15" }
    ]
  });
  assert.deepEqual(
    activeTradingDatesForPriceWindow([
      "2022-05-16",
      "2022-08-15",
      "2022-09-15",
      "2022-11-15",
      "2023-02-15"
    ], window),
    ["2022-05-16", "2022-08-15", "2022-11-15", "2023-02-15"]
  );
});

test("cash acquisition bounds required prices before the effective date", () => {
  const q2 = candidate("2022-06-30", "2022-08-15", ["CHNG"]);
  q2.selectedPriceRequirements = [{
    ticker: "CHNG",
    endExclusive: "2022-10-03"
  }];
  const q3 = candidate("2022-09-30", "2022-11-15", ["AAPL"]);
  const window = manager13fActivePriceWindows([q2, q3], "2023-02-15").get("CHNG");

  assert.deepEqual(window, {
    start: "2022-08-15",
    end: "2022-10-03",
    intervals: [{
      start: "2022-08-15",
      end: "2022-10-03",
      endExclusive: "2022-10-03"
    }]
  });
  assert.deepEqual(activeTradingDatesForPriceWindow([
    "2022-08-15",
    "2022-09-30",
    "2022-10-03",
    "2022-10-04"
  ], window), ["2022-08-15", "2022-09-30"]);
});

test("stock conversion splits source and successor price requirements", () => {
  const q3 = candidate("2024-09-30", "2024-11-15", ["ARCH", "CNR"]);
  q3.selectedPriceRequirements = [
    { ticker: "ARCH", endExclusive: "2025-01-14" },
    { ticker: "CNR", startInclusive: "2025-01-15" }
  ];
  const q4 = candidate("2024-12-31", "2025-02-14", ["CNR"]);
  const windows = manager13fActivePriceWindows([q3, q4], "2025-05-15");

  assert.deepEqual(windows.get("ARCH"), {
    start: "2024-11-15",
    end: "2025-01-14",
    intervals: [{
      start: "2024-11-15",
      end: "2025-01-14",
      endExclusive: "2025-01-14"
    }]
  });
  assert.deepEqual(windows.get("CNR"), {
    start: "2025-01-15",
    end: "2025-05-15",
    intervals: [{ start: "2025-01-15", end: "2025-05-15" }]
  });
});

test("a benchmark held by the manager cannot replace its full-window price series", () => {
  assert.deepEqual(
    holdingPriceLoadUniverse(["AAPL", "SPY", "spy", "AAPL", "MSFT"], "SPY"),
    ["AAPL", "MSFT"]
  );
});
