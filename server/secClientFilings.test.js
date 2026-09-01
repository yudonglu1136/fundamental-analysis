import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
const { readPriceSeriesFromDb, writePriceSeriesToDb } = await import("./localDatabase.js");
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
    assert.equal(series.source, "yahoo");
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
    assert.equal(series.source, "yahoo");
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
