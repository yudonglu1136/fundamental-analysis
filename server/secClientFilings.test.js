import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-sec-filings-test-"));
const databasePath = path.join(tempDir, "sec.sqlite");
fs.closeSync(fs.openSync(databasePath, "w"));
process.env.SQLITE_DB_PATH = databasePath;
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
process.env.PRICE_CACHE_DIR = path.join(tempDir, "prices");

const { filingsFromRecentShape } = await import("./secClient.js");
const {
  filterLedgerAuditedPriceRepairPoints,
  readPriceSeriesFromDb,
  readPriceRepairAudit,
  writeAuditedPriceRepair,
  writePriceSeriesToDb
} = await import("./localDatabase.js");
const {
  enforceAdjustedPriceRequirement,
  loadPriceSeries,
  normalizeYahooChartPoints
} = await import("./marketData.js");

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("SEC recent filing normalization retains acceptanceDateTime and amendment state", () => {
  const rows = filingsFromRecentShape({
    form: ["13F-HR", "13F-HR/A"],
    accessionNumber: ["0001", "0002"],
    filingDate: ["2024-05-15", "2024-06-01"],
    acceptanceDateTime: ["2024-05-15T17:31:12.000Z", "2024-06-01T11:00:00.000Z"],
    reportDate: ["2024-03-31", "2024-03-31"],
    primaryDocument: ["original.xml", "amendment.xml"]
  });

  assert.equal(rows[0].acceptanceDateTime, "2024-05-15T17:31:12.000Z");
  assert.equal(rows[0].isAmendment, false);
  assert.equal(rows[1].acceptanceDateTime, "2024-06-01T11:00:00.000Z");
  assert.equal(rows[1].isAmendment, true);
});

test("adjusted close survives the SQLite price cache round trip", () => {
  writePriceSeriesToDb("TEST", [{
    date: "2024-01-02",
    open: 99,
    high: 101,
    low: 98,
    close: 100,
    adjustedClose: 95,
    volume: 1000
  }], "fixture");

  const points = readPriceSeriesFromDb("TEST", "2024-01-01", "2024-01-03");
  assert.equal(points.length, 1);
  assert.equal(points[0].close, 100);
  assert.equal(points[0].adjustedClose, 95);
});

test("a generic cache write cannot inherit adjusted close from an older source", () => {
  writePriceSeriesToDb("NOADJINHERIT", [{
    date: "2024-01-02",
    close: 100,
    adjustedClose: 95
  }], "older-source");
  writePriceSeriesToDb("NOADJINHERIT", [{
    date: "2024-01-02",
    close: 101,
    adjustedClose: null
  }], "newer-source-without-adjustment");

  const points = readPriceSeriesFromDb("NOADJINHERIT", "2024-01-02", "2024-01-02");
  assert.equal(points.length, 1);
  assert.equal(points[0].close, 101);
  assert.equal(points[0].adjustedClose, null);
  assert.equal(points[0].source, "newer-source-without-adjustment");
});

test("audited price repair validates and atomically records exact adjusted rows", () => {
  writePriceSeriesToDb("SPY", [{
    date: "2026-08-28",
    open: 650,
    high: 655,
    low: 645,
    close: 652,
    adjustedClose: 652,
    volume: 50_000_000
  }], "fixture");
  for (const symbol of ["REPAIRA", "REPAIRB", "REPAIRC", "NO-PARTIAL-A", "NO-PARTIAL-B"]) {
    writePriceSeriesToDb(symbol, [{
      date: "2026-08-27",
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      adjustedClose: 10,
      volume: 1000
    }], "fixture");
  }
  writePriceSeriesToDb("REPAIRC", [{
    date: "2026-08-28",
    open: 40,
    high: 42,
    low: 39,
    close: 41,
    volume: 3000
  }], "incomplete-fixture");
  const audit = writeAuditedPriceRepair([
    {
      symbol: "repairb",
      date: "2026-08-28",
      open: 20,
      high: 22,
      low: 19,
      close: 21,
      adjustedClose: 20.5,
      volume: 2000
    },
    {
      symbol: "REPAIRA",
      date: "2026-08-28",
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      adjustedClose: 10.25,
      volume: 1000
    },
    {
      symbol: "REPAIRC",
      date: "2026-08-28",
      open: 40.00002,
      high: 42.00002,
      low: 39.00002,
      close: 41.00002,
      adjustedClose: 40.75,
      volume: 3001
    }
  ], {
    provider: "fixture-provider",
    reason: "Restore an independently verified missing trading session.",
    snapshotId: "snap-00000000000000000",
    sourceReference: "Fixture provider request dated 2026-08-28.",
    operator: "node-test",
    affectedGuruIds: ["bill-ackman"]
  });

  assert.equal(audit.rowCount, 3);
  assert.equal(audit.insertedRows, 2);
  assert.equal(audit.completedRows, 1);
  assert.deepEqual(audit.symbols, ["REPAIRA", "REPAIRB", "REPAIRC"]);
  assert.deepEqual(audit.dates, ["2026-08-28"]);
  assert.match(audit.auditId, /^price-repair-/);
  assert.match(audit.payloadSha256, /^[a-f0-9]{64}$/);
  const repaired = readPriceSeriesFromDb("REPAIRA", "2026-08-28", "2026-08-28");
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].adjustedClose, 10.25);
  assert.equal(repaired[0].source, "audited:fixture-provider");
  const storedAudit = readPriceRepairAudit(audit.auditId);
  assert.equal(storedAudit.snapshotId, "snap-00000000000000000");
  assert.equal(
    storedAudit.policy,
    "insert_missing_or_complete_null_fields_verified_spy_session"
  );
  assert.deepEqual(storedAudit.affectedGuruIds, ["bill-ackman"]);
  assert.deepEqual(
    storedAudit.rows.map((row) => row.symbol),
    ["REPAIRA", "REPAIRB", "REPAIRC"]
  );
  assert.deepEqual(
    storedAudit.beforeRows.map((row) => [row.symbol, row.action]),
    [
      ["REPAIRA", "insert"],
      ["REPAIRB", "insert"],
      ["REPAIRC", "complete-null-fields"]
    ]
  );
  const completed = readPriceSeriesFromDb("REPAIRC", "2026-08-28", "2026-08-28");
  assert.equal(completed[0].close, 41);
  assert.equal(completed[0].adjustedClose, 40.75);
  assert.equal(completed[0].volume, 3000);
  assert.equal(completed[0].source, "audited:fixture-provider");
  assert.equal(filterLedgerAuditedPriceRepairPoints(completed).length, 1);
  assert.equal(filterLedgerAuditedPriceRepairPoints([{
    ...completed[0],
    volume: 3001
  }]).length, 0);

  const failureDb = new DatabaseSync(databasePath);
  failureDb.exec(`
    CREATE TRIGGER abort_test_price_repair
    BEFORE INSERT ON price_points
    WHEN NEW.symbol = 'NO-PARTIAL-B'
    BEGIN
      SELECT RAISE(ABORT, 'forced transaction failure');
    END;
  `);
  failureDb.close();

  assert.throws(() => writeAuditedPriceRepair([
    {
      symbol: "NO-PARTIAL-A",
      date: "2026-08-28",
      open: 30,
      high: 31,
      low: 29,
      close: 30,
      adjustedClose: 30,
      volume: 1000
    },
    {
      symbol: "NO-PARTIAL-B",
      date: "2026-08-28",
      open: 31,
      high: 32,
      low: 30,
      close: 31,
      adjustedClose: 31,
      volume: 2000
    }
  ], {
    provider: "fixture-provider",
    reason: "This database failure must roll back every inserted row.",
    snapshotId: "snap-00000000000000000",
    sourceReference: "Fixture provider request dated 2026-08-28.",
    operator: "node-test",
    affectedGuruIds: ["bill-ackman"]
  }), /forced transaction failure/);
  assert.deepEqual(
    readPriceSeriesFromDb("NO-PARTIAL-A", "2026-08-28", "2026-08-28"),
    []
  );
  assert.deepEqual(
    readPriceSeriesFromDb("NO-PARTIAL-B", "2026-08-28", "2026-08-28"),
    []
  );
});

test("Yahoo chart normalization retains adjusted close for total-return backtests", () => {
  const points = normalizeYahooChartPoints({
    timestamp: [1704153600],
    indicators: {
      quote: [{
        open: [100], high: [102], low: [99], close: [101], volume: [1234]
      }],
      adjclose: [{ adjclose: [97.5] }]
    }
  }, "TEST");

  assert.equal(points.length, 1);
  assert.equal(points[0].close, 101);
  assert.equal(points[0].adjustedClose, 97.5);
});

test("adjusted-close requirement fails closed when Yahoo omits one or every adjusted row", () => {
  const partialPoints = normalizeYahooChartPoints({
    timestamp: [1704153600, 1704240000],
    indicators: {
      quote: [{ close: [101, 102] }],
      adjclose: [{ adjclose: [97.5, null] }]
    }
  }, "TEST");
  const partial = enforceAdjustedPriceRequirement({
    symbol: "TEST",
    source: "yahoo",
    returnBasis: "unadjusted_close",
    points: partialPoints
  }, {
    start: "2024-01-02",
    end: "2024-01-03",
    requireAdjusted: true
  });
  assert.equal(partial.source, "unavailable");
  assert.equal(partial.returnBasis, "unavailable");
  assert.deepEqual(partial.points, []);
  assert.equal(partial.failure.code, "adjusted_close_unavailable");
  assert.equal(partial.failure.adjustedPointCount, 1);
  assert.equal(partial.observedAdjustedPoints, undefined);

  const intervalAwarePartial = enforceAdjustedPriceRequirement({
    symbol: "TEST",
    source: "yahoo",
    returnBasis: "unadjusted_close",
    points: partialPoints
  }, {
    start: "2024-01-02",
    end: "2024-01-03",
    requireAdjusted: true,
    expectedTradingDates: ["2024-01-02", "2024-01-03"]
  });
  assert.deepEqual(intervalAwarePartial.points, []);
  assert.deepEqual(
    intervalAwarePartial.observedAdjustedPoints.map((point) => point.date),
    ["2024-01-02"]
  );
  assert.equal(intervalAwarePartial.failure.code, "expected_internal_session_gap");
  assert.deepEqual(intervalAwarePartial.failure.missingDates, ["2024-01-03"]);

  const missingPoints = normalizeYahooChartPoints({
    timestamp: [1704153600, 1704240000],
    indicators: { quote: [{ close: [101, 102] }] }
  }, "TEST");
  const missing = enforceAdjustedPriceRequirement({
    symbol: "TEST",
    source: "yahoo",
    returnBasis: "unadjusted_close",
    points: missingPoints
  }, {
    start: "2024-01-02",
    end: "2024-01-03",
    requireAdjusted: true
  });
  assert.equal(missing.source, "unavailable");
  assert.deepEqual(missing.points, []);
  assert.equal(missing.failure.adjustedPointCount, 0);
  assert.match(missing.failure.policy, /fail_closed/);
});

test("loadPriceSeries cannot publish partially adjusted Yahoo history", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          timestamp: [1704153600, 1704240000],
          indicators: {
            quote: [{ close: [101, 102] }],
            adjclose: [{ adjclose: [97.5, null] }]
          }
        }]
      }
    })
  });

  try {
    const series = await loadPriceSeries("ADJMISSFIXTURE", {
      start: "2024-01-02",
      end: "2024-01-03",
      requireAdjusted: true
    });
    assert.equal(series.source, "unavailable");
    assert.equal(series.returnBasis, "unavailable");
    assert.deepEqual(series.points, []);
    assert.equal(series.failure.code, "adjusted_close_unavailable");
    assert.equal(series.failure.observedPointCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a truncated adjusted SQLite series is refreshed for the requested range", async () => {
  writePriceSeriesToDb("TRUNCATEDFIXTURE", [
    {
      date: "2024-01-02",
      close: 101,
      adjustedClose: 101
    },
    {
      date: "2024-01-03",
      close: 102,
      adjustedClose: 102
    }
  ], "truncated-fixture");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1672704000, 1704153600, 1704240000],
            indicators: {
              quote: [{ close: [80, 101, 102] }],
              adjclose: [{ adjclose: [79, 101, 102] }]
            }
          }]
        }
      })
    };
  };

  try {
    const series = await loadPriceSeries("TRUNCATEDFIXTURE", {
      start: "2023-01-01",
      end: "2024-01-03",
      requireAdjusted: true
    });
    assert.equal(fetchCalls, 1);
    assert.equal(series.source, "yahoo+sqlite-merged");
    assert.equal(series.returnBasis, "total_return_adjusted_close");
    assert.equal(series.points[0]?.date, "2023-01-03");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an adjusted SQLite series with an internal benchmark-session gap is refreshed", async () => {
  writePriceSeriesToDb("GAPFIXTURE", [
    {
      date: "2024-01-02",
      close: 101,
      adjustedClose: 101
    },
    {
      date: "2024-01-04",
      close: 103,
      adjustedClose: 103
    }
  ], "gap-fixture");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704153600, 1704240000, 1704326400],
            indicators: {
              quote: [{ close: [101, 102, 103] }],
              adjclose: [{ adjclose: [101, 102, 103] }]
            }
          }]
        }
      })
    };
  };

  try {
    const series = await loadPriceSeries("GAPFIXTURE", {
      start: "2024-01-02",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(fetchCalls, 1);
    assert.equal(series.source, "yahoo+sqlite-merged");
    assert.deepEqual(series.points.map((point) => point.date), [
      "2024-01-02",
      "2024-01-03",
      "2024-01-04"
    ]);

    globalThis.fetch = async () => {
      throw new Error("complete SQLite history should not refetch");
    };
    const cached = await loadPriceSeries("GAPFIXTURE", {
      start: "2024-01-02",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(cached.source, "sqlite");
    assert.equal(cached.points.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a fresh provider internal-session gap is retried once with provider rows only", async () => {
  writePriceSeriesToDb("RETRYFIXTURE", [
    { date: "2024-01-02", close: 101, adjustedClose: 101 },
    { date: "2024-01-03", close: 999, adjustedClose: 999 },
    { date: "2024-01-04", close: 103, adjustedClose: 103 }
  ], "unledgered-stale-row");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    const retry = fetchCalls === 2;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: retry
              ? [1704240000]
              : [1704153600, 1704326400],
            indicators: {
              quote: [{ close: retry ? [102] : [101, 103] }],
              adjclose: [{ adjclose: retry ? [102] : [101, 103] }]
            }
          }]
        }
      })
    };
  };

  try {
    const series = await loadPriceSeries("RETRYFIXTURE", {
      start: "2023-01-01",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(fetchCalls, 2);
    assert.equal(series.providerAttempts, 2);
    assert.deepEqual(series.expectedInternalSessionRetry, {
      attempted: true,
      initialMissingDates: ["2024-01-03"],
      remainingMissingDates: []
    });
    assert.deepEqual(series.points.map((point) => point.date), [
      "2024-01-02",
      "2024-01-03",
      "2024-01-04"
    ]);
    assert.equal(series.points[1].adjustedClose, 102);
    assert.equal(
      readPriceSeriesFromDb("RETRYFIXTURE", "2024-01-03", "2024-01-03")[0].source,
      "yahoo"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an audited SQLite point is merged after an upstream IPO-range refresh", async () => {
  writePriceSeriesToDb("SPY", [
    { date: "2024-01-02", close: 470, adjustedClose: 470 },
    { date: "2024-01-03", close: 471, adjustedClose: 471 },
    { date: "2024-01-04", close: 472, adjustedClose: 472 }
  ], "fixture");
  writePriceSeriesToDb("AUDMERGE", [
    {
      date: "2024-01-02",
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      adjustedClose: 101,
      volume: 1000
    },
    {
      date: "2024-01-04",
      open: 102,
      high: 104,
      low: 101,
      close: 103,
      adjustedClose: 103,
      volume: 1200
    }
  ], "old-yahoo-cache");
  writeAuditedPriceRepair([{
    symbol: "AUDMERGE",
    date: "2024-01-03",
    open: 101,
    high: 103,
    low: 100,
    close: 102,
    adjustedClose: 102,
    volume: 1100
  }], {
    provider: "fixture-provider",
    reason: "Restore the independently verified missing internal session.",
    snapshotId: "snap-00000000000000000",
    sourceReference: "Fixture provider request dated 2024-01-03.",
    operator: "node-test",
    affectedGuruIds: ["bill-ackman"]
  });

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704153600, 1704326400],
            indicators: {
              quote: [{ close: [101, 103] }],
              adjclose: [{ adjclose: [101, 103] }]
            }
          }]
        }
      })
    };
  };

  try {
    const series = await loadPriceSeries("AUDMERGE", {
      start: "2023-01-01",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(fetchCalls, 2);
    assert.equal(series.source, "yahoo+sqlite-merged");
    assert.equal(series.cache, "refreshed-merged");
    assert.deepEqual(series.points.map((point) => point.date), [
      "2024-01-02",
      "2024-01-03",
      "2024-01-04"
    ]);
    assert.equal(series.points[1].source, "audited:fixture-provider");

    globalThis.fetch = async () => {
      throw new Error("the merged JSON cache should satisfy the second request");
    };
    const cached = await loadPriceSeries("AUDMERGE", {
      start: "2023-01-01",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(cached.cache, "hit");
    assert.equal(fetchCalls, 2);
    assert.equal(
      readPriceSeriesFromDb("AUDMERGE", "2024-01-03", "2024-01-03")[0].source,
      "audited:fixture-provider"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unledgered stale SQLite point cannot fill a fresh upstream gap", async () => {
  writePriceSeriesToDb("UNTRUSTEDMERGEFIXTURE", [
    { date: "2024-01-02", close: 101, adjustedClose: 101 },
    { date: "2024-01-03", close: 102, adjustedClose: 102 },
    { date: "2024-01-04", close: 103, adjustedClose: 103 }
  ], "old-yahoo-cache");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704153600, 1704326400],
            indicators: {
              quote: [{ close: [101, 103] }],
              adjclose: [{ adjclose: [101, 103] }]
            }
          }]
        }
      })
    };
  };

  try {
    const series = await loadPriceSeries("UNTRUSTEDMERGEFIXTURE", {
      start: "2023-01-01",
      end: "2024-01-04",
      requireAdjusted: true,
      expectedTradingDates: ["2024-01-02", "2024-01-03", "2024-01-04"]
    });
    assert.equal(fetchCalls, 2);
    assert.equal(series.source, "unavailable");
    assert.equal(series.upstreamSource, "yahoo");
    assert.equal(series.returnBasis, "unavailable");
    assert.deepEqual(series.points, []);
    assert.deepEqual(
      series.observedAdjustedPoints.map((point) => point.date),
      ["2024-01-02", "2024-01-04"]
    );
    assert.equal(series.failure.code, "expected_internal_session_gap");
    assert.equal(
      series.failure.policy,
      "fail_closed_after_single_provider_retry_without_unledgered_db_fill"
    );
    assert.equal(series.failure.providerAttempts, 2);
    assert.deepEqual(series.failure.missingDates, ["2024-01-03"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a fresh upstream row without adjusted close cannot inherit a stale DB value", async () => {
  writePriceSeriesToDb("FRESHNULL", [{
    date: "2024-01-02",
    close: 101,
    adjustedClose: 99
  }], "old-yahoo-cache");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      chart: {
        result: [{
          timestamp: [1704153600],
          indicators: {
            quote: [{ close: [101] }],
            adjclose: [{ adjclose: [null] }]
          }
        }]
      }
    })
  });

  try {
    const series = await loadPriceSeries("FRESHNULL", {
      start: "2023-01-01",
      end: "2024-01-02",
      requireAdjusted: true
    });
    assert.equal(series.source, "unavailable");
    assert.equal(series.returnBasis, "unavailable");
    assert.deepEqual(series.points, []);
    assert.equal(series.failure.adjustedPointCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a rejected Yahoo refresh cannot poison the next adjusted-price call", async () => {
  writePriceSeriesToDb("FRESHNULLTWICE", [{
    date: "2024-01-10",
    close: 110,
    adjustedClose: 90
  }], "old-yahoo-cache");

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1704153600, 1704844800],
            indicators: {
              quote: [{ close: [100, 110] }],
              adjclose: [{ adjclose: [100, null] }]
            }
          }]
        }
      })
    };
  };

  const request = {
    start: "2024-01-01",
    end: "2024-01-10",
    requireAdjusted: true
  };

  try {
    const first = await loadPriceSeries("FRESHNULLTWICE", request);
    const second = await loadPriceSeries("FRESHNULLTWICE", request);

    for (const series of [first, second]) {
      assert.equal(series.source, "unavailable");
      assert.equal(series.returnBasis, "unavailable");
      assert.deepEqual(series.points, []);
      assert.equal(series.failure.code, "adjusted_close_unavailable");
      assert.equal(series.failure.adjustedPointCount, 1);
    }
    assert.equal(fetchCalls, 2);
    assert.deepEqual(
      readPriceSeriesFromDb("FRESHNULLTWICE", "2024-01-01", "2024-01-10")
        .map((point) => [point.date, point.adjustedClose, point.source]),
      [["2024-01-10", 90, "old-yahoo-cache"]]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fully adjusted delisted history can defer endpoint coverage to active-holding checks", () => {
  const payload = {
    symbol: "DELISTED",
    source: "yahoo",
    returnBasis: "total_return_adjusted_close",
    points: [
      { date: "2024-01-02", close: 100, adjustedClose: 100 },
      { date: "2024-01-03", close: 101, adjustedClose: 101 }
    ]
  };
  const securitySeries = enforceAdjustedPriceRequirement(payload, {
    start: "2024-01-02",
    end: "2024-02-01",
    requireAdjusted: true
  });
  assert.equal(securitySeries.source, "yahoo");
  assert.equal(securitySeries.points.length, 2);

  const benchmarkSeries = enforceAdjustedPriceRequirement(payload, {
    start: "2024-01-02",
    end: "2024-02-01",
    requireAdjusted: true,
    requireFullRange: true
  });
  assert.equal(benchmarkSeries.source, "unavailable");
  assert.equal(benchmarkSeries.failure.requireFullRange, true);
  assert.equal(benchmarkSeries.failure.rangeCovered, false);
});
