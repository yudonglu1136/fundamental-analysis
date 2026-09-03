import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import express from "express";

import { expectedGuruCurveRows } from "./gurus.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-price-series-import-test-"));
const databasePath = path.join(tempDir, "series.sqlite");
fs.closeSync(fs.openSync(databasePath, "w"));
process.env.SQLITE_DB_PATH = databasePath;
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
process.env.PRICE_CACHE_DIR = path.join(tempDir, "prices");

const {
  filterLedgerAuditedPriceRepairPoints,
  readPriceSeriesFromDb,
  readPriceSeriesImportBatchAudit,
  readPriceSeriesImportAudit,
  writeAuditedPriceSeriesImport,
  writeAuditedPriceSeriesImportBatch,
  writePriceSeriesToDb
} = await import("./localDatabase.js");
const { requireInternalCron } = await import("./internalCronAuth.js");
const { registerAuditedPriceSeriesImportRoute } = await import(
  "./auditedPriceSeriesImportRoute.js"
);

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function weekdays(start, count) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  while (dates.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function fullRows(dates, symbol = undefined) {
  return dates.map((date, index) => {
    const close = 10 + index / 100;
    return {
      ...(symbol ? { symbol } : {}),
      date,
      open: close - 0.1,
      high: close + 0.4,
      low: close - 0.4,
      close,
      adjustedClose: close - 0.03,
      volume: 1_000_000 + index
    };
  });
}

function seedSpy(dates) {
  writePriceSeriesToDb("SPY", fullRows(dates, "SPY"), "fixture");
}

function importOptions(symbol, dates, overrides = {}) {
  return {
    symbol,
    startDate: dates[0],
    endDate: dates.at(-1),
    provider: "fixture-provider",
    reason: "Restore an independently verified complete historical price series.",
    snapshotId: "snap-00000000000000000",
    snapshotState: "completed",
    sourceReference: "Provider export request fixture dated 2026-08-28.",
    operator: "node-test",
    affectedGuruIds: ["li-lu"],
    ...overrides
  };
}

test("audited series import accepts the 5,000-row maximum for a previously absent symbol", () => {
  const dates = weekdays("2000-01-03", 5000);
  seedSpy(dates);
  const imported = writeAuditedPriceSeriesImport(
    fullRows(dates),
    importOptions("SINA", dates)
  );

  assert.equal(imported.symbol, "SINA");
  assert.equal(imported.rowCount, 5000);
  assert.equal(imported.insertedRows, 5000);
  assert.equal(imported.completedRows, 0);
  assert.equal(imported.snapshotState, "completed");
  assert.match(imported.auditId, /^price-series-import-/);
  assert.match(imported.payloadSha256, /^[a-f0-9]{64}$/);

  const stored = readPriceSeriesFromDb("SINA", dates[0], dates.at(-1));
  assert.equal(stored.length, 5000);
  assert.ok(stored.every((row) => row.source === "audited-series:fixture-provider"));
  assert.equal(filterLedgerAuditedPriceRepairPoints(stored.slice(0, 3)).length, 3);
  assert.equal(filterLedgerAuditedPriceRepairPoints([{
    ...stored[0],
    source: "audited-series:forged-provider"
  }]).length, 0);
  assert.equal(filterLedgerAuditedPriceRepairPoints([{
    ...stored[0],
    close: stored[0].close + 0.01
  }]).length, 0);

  const audit = readPriceSeriesImportAudit(imported.auditId);
  assert.equal(audit.symbol, "SINA");
  assert.equal(audit.startDate, dates[0]);
  assert.equal(audit.endDate, dates.at(-1));
  assert.equal(audit.snapshotId, "snap-00000000000000000");
  assert.equal(audit.snapshotState, "completed");
  assert.equal(audit.rowCount, 5000);
  assert.deepEqual(audit.affectedGuruIds, ["li-lu"]);
  assert.equal(audit.rows.length, 5000);
});

test("series import rejects partial, non-session, unsorted, and non-completed-snapshot inputs", () => {
  const dates = weekdays("2018-01-02", 5);
  seedSpy(dates);

  assert.throws(() => writeAuditedPriceSeriesImport(
    fullRows(dates.filter((_, index) => index !== 2)),
    importOptions("PARTIAL", dates)
  ), /cover every stored SPY session.*missing/);
  assert.deepEqual(readPriceSeriesFromDb("PARTIAL", dates[0], dates.at(-1)), []);

  const sparseSpyDates = ["2026-08-10", "2026-08-14"];
  seedSpy(sparseSpyDates);
  const replacementRows = fullRows(["2026-08-10", "2026-08-11", "2026-08-14"]);
  assert.throws(() => writeAuditedPriceSeriesImport(
    replacementRows,
    importOptions("EXTRADATE", sparseSpyDates)
  ), /not SPY sessions/);

  const unsortedRows = fullRows(dates);
  [unsortedRows[1], unsortedRows[2]] = [unsortedRows[2], unsortedRows[1]];
  assert.throws(() => writeAuditedPriceSeriesImport(
    unsortedRows,
    importOptions("UNSORTED", dates)
  ), /unique and strictly sorted/);

  assert.throws(() => writeAuditedPriceSeriesImport(
    fullRows(dates),
    importOptions("NOSNAPSHOT", dates, { snapshotState: "pending" })
  ), /completed pre-write EBS snapshot/);
});

test("series import never overwrites an existing complete row", () => {
  const dates = weekdays("2017-01-03", 3);
  seedSpy(dates);
  const original = {
    ...fullRows([dates[0]], "EXISTING")[0],
    close: 77,
    adjustedClose: 76
  };
  original.high = 78;
  original.low = 75;
  original.open = 76;
  writePriceSeriesToDb("EXISTING", [original], "original-source");

  assert.throws(() => writeAuditedPriceSeriesImport(
    fullRows(dates),
    importOptions("EXISTING", dates)
  ), /may not overwrite a complete row/);
  const stored = readPriceSeriesFromDb("EXISTING", dates[0], dates.at(-1));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].close, 77);
  assert.equal(stored[0].adjustedClose, 76);
  assert.equal(stored[0].source, "original-source");
});

test("series rows and audit ledger roll back together after a write failure", () => {
  const dates = weekdays("2016-01-04", 4);
  seedSpy(dates);
  const failureDb = new DatabaseSync(databasePath);
  failureDb.exec(`
    CREATE TRIGGER abort_test_price_series_import
    BEFORE INSERT ON price_points
    WHEN NEW.symbol = 'ROLLBACKSERIES' AND NEW.date = '${dates[2]}'
    BEGIN
      SELECT RAISE(ABORT, 'forced series import failure');
    END;
  `);
  failureDb.close();

  assert.throws(() => writeAuditedPriceSeriesImport(
    fullRows(dates),
    importOptions("ROLLBACKSERIES", dates)
  ), /forced series import failure/);
  assert.deepEqual(readPriceSeriesFromDb("ROLLBACKSERIES", dates[0], dates.at(-1)), []);
  const verifyDb = new DatabaseSync(databasePath, { readOnly: true });
  const count = verifyDb.prepare(`
    SELECT COUNT(*) AS count
    FROM price_series_import_audits
    WHERE symbol = 'ROLLBACKSERIES'
  `).get().count;
  verifyDb.close();
  assert.equal(count, 0);
});

test("a release batch commits all series and its records-hash ledger atomically", () => {
  const dates = weekdays("2015-01-05", 3);
  seedSpy(dates);
  const recordsSha256 = "b".repeat(64);
  const requests = ["BATCHA", "BATCHB"].map((symbol) => ({
    rows: fullRows(dates),
    ...importOptions(symbol, dates)
  }));
  const context = {
    recordsSha256,
    releaseId: "guru-curves-atomic-test",
    sourceVolumeId: "vol-12345678",
    sourceSnapshotId: "snap-12345678",
    encryptedSnapshotId: "snap-87654321",
    operator: "node-test",
    seriesManifest: requests.map((request) => ({
      symbol: request.symbol,
      startDate: request.startDate,
      endDate: request.endDate,
      rowCount: request.rows.length,
      rowsSha256: "c".repeat(64)
    })),
    refreshTargets: [{ guruId: "li-lu", years: 10, expectedStatus: "ready" }],
    expectations: { expectedDisplayableRows: expectedGuruCurveRows }
  };
  const failureDb = new DatabaseSync(databasePath);
  failureDb.exec(`
    CREATE TRIGGER abort_test_price_series_batch
    BEFORE INSERT ON price_points
    WHEN NEW.symbol = 'BATCHB' AND NEW.date = '${dates[1]}'
    BEGIN
      SELECT RAISE(ABORT, 'forced batch import failure');
    END;
  `);
  failureDb.close();

  assert.throws(() => writeAuditedPriceSeriesImportBatch(requests, context),
    /forced batch import failure/);
  assert.deepEqual(readPriceSeriesFromDb("BATCHA", dates[0], dates.at(-1)), []);
  assert.deepEqual(readPriceSeriesFromDb("BATCHB", dates[0], dates.at(-1)), []);
  assert.equal(readPriceSeriesImportBatchAudit(recordsSha256), null);

  const repairDb = new DatabaseSync(databasePath);
  repairDb.exec("DROP TRIGGER abort_test_price_series_batch");
  repairDb.close();
  const result = writeAuditedPriceSeriesImportBatch(requests, context);
  assert.match(result.batchAuditId, /^price-series-batch-/);
  assert.equal(result.audits.length, 2);
  assert.equal(result.rowCount, 6);
  const audit = readPriceSeriesImportBatchAudit(recordsSha256);
  assert.equal(audit.releaseId, context.releaseId);
  assert.equal(audit.childAuditIds.length, 2);
  assert.equal(audit.groupCount, 2);
  assert.equal(audit.rowCount, 6);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("protected import route rejects unauthorized calls and refreshes the requested 10Y window", async () => {
  const previousSecret = process.env.INTERNAL_CRON_SECRET;
  process.env.INTERNAL_CRON_SECRET = "series-route-secret";
  const writes = [];
  const refreshes = [];
  const app = express();
  registerAuditedPriceSeriesImportRoute(app, {
    requireInternalCron,
    gurus: [{ id: "li-lu", type: "manager13f", disableSimulation: false }],
    writeAuditedPriceSeriesImport(rows, options) {
      writes.push({ rows, options });
      return {
        auditId: "price-series-import-route-fixture",
        symbol: options.symbol,
        rowCount: rows.length
      };
    },
    async loadGuruBacktest(guruId, options) {
      refreshes.push({ guruId, options });
      return {
        status: "ready",
        window: { start: "2016-08-28", end: "2026-08-28" },
        dataQuality: { minimumObservedExecutionCoverage: 0.95 }
      };
    }
  });
  const server = await listen(http.createServer(app));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/internal/prices/import-series`;
  const body = {
    symbol: "SINA",
    startDate: "2016-08-29",
    endDate: "2016-08-29",
    rows: fullRows(["2016-08-29"]),
    refreshGuruIds: ["li-lu"],
    years: 10,
    provider: "fixture-provider",
    reason: "Fixture reason for route validation.",
    snapshotId: "snap-00000000000000000",
    snapshotState: "completed",
    sourceReference: "Fixture source reference.",
    operator: "node-test"
  };
  try {
    const unauthorized = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(unauthorized.status, 403);
    assert.equal((await unauthorized.json()).error, "cron_forbidden");
    assert.equal(writes.length, 0);

    const wrongSecret = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    assert.equal(wrongSecret.status, 403);
    assert.equal(writes.length, 0);

    const accepted = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer series-route-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    assert.equal(accepted.status, 201);
    const payload = await accepted.json();
    assert.equal(payload.years, 10);
    assert.equal(payload.allRequestedBacktestsReady, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].options.snapshotState, "completed");
    assert.deepEqual(writes[0].options.affectedGuruIds, ["li-lu"]);
    assert.deepEqual(refreshes, [{
      guruId: "li-lu",
      options: {
        refresh: true,
        years: 10,
        detail: "compact",
        refreshGeneration: "price-series-import-route-fixture"
      }
    }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.INTERNAL_CRON_SECRET;
    else process.env.INTERNAL_CRON_SECRET = previousSecret;
  }
});

test("import route returns 422 when an affected guru is not strictly ready", async () => {
  const previousSecret = process.env.INTERNAL_CRON_SECRET;
  process.env.INTERNAL_CRON_SECRET = "series-route-secret";
  const app = express();
  registerAuditedPriceSeriesImportRoute(app, {
    requireInternalCron,
    gurus: [{ id: "li-lu", type: "manager13f", disableSimulation: false }],
    writeAuditedPriceSeriesImport(rows, options) {
      return {
        auditId: "price-series-import-route-nonready",
        symbol: options.symbol,
        rowCount: rows.length
      };
    },
    async loadGuruBacktest() {
      return { status: "proxy_ready", window: { start: "2016-08-28", end: "2026-08-28" } };
    }
  });
  const server = await listen(http.createServer(app));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/internal/prices/import-series`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer series-route-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        symbol: "SINA",
        startDate: "2016-08-29",
        endDate: "2016-08-29",
        rows: fullRows(["2016-08-29"]),
        refreshGuruIds: ["li-lu"],
        provider: "fixture-provider",
        reason: "Fixture reason for route validation.",
        snapshotId: "snap-00000000000000000",
        snapshotState: "completed",
        sourceReference: "Fixture source reference.",
        operator: "node-test"
      })
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error, "price_series_import_backtest_refresh_failed");
    assert.equal(payload.allRequestedBacktestsReady, false);
    assert.equal(payload.backtests[0].status, "proxy_ready");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.INTERNAL_CRON_SECRET;
    else process.env.INTERNAL_CRON_SECRET = previousSecret;
  }
});
