import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGuruPriceRepairArtifact,
  guruPriceRepairRecordsSha256,
  guruPriceRepairRowsSha256,
  validateGuruPriceRepairArtifact
} from "./guruPriceRepairArtifact.js";
import { expectedGuruCurveRows } from "./gurus.js";

const rows = [
  { date: "2026-08-28", open: 10, high: 12, low: 9, close: 11, adjustedClose: 10.5, volume: 100 },
  { date: "2026-08-31", open: 11, high: 13, low: 10, close: 12, adjustedClose: 11.5, volume: 120 },
  { date: "2026-09-01", open: 12, high: 14, low: 11, close: 13, adjustedClose: 12.5, volume: 140 }
];

function artifact(seriesRows = rows) {
  const series = [{
    symbol: "TEST",
    startDate: seriesRows[0].date,
    endDate: seriesRows.at(-1).date,
    provider: "test-provider",
    reason: "Restore a verified adjusted-close series gap.",
    sourceReference: "test-source-reference",
    affectedGuruIds: ["test-guru"],
    rows: seriesRows,
    rowsSha256: guruPriceRepairRowsSha256(seriesRows)
  }];
  const refreshTargets = [{
    guruId: "test-guru",
    years: 5,
    expectedStatus: "proxy_ready"
  }];
  const expectations = {
    strictMethodVersion: "strict-v1",
    proxyMethodVersion: "proxy-v1",
    securityMasterVersion: "security-master-v1",
    expectedDisplayableRows: expectedGuruCurveRows
  };
  const release = {
    releaseId: "guru-curves-test-release",
    sourceVolumeId: "vol-12345678",
    sourceSnapshotId: "snap-12345678",
    encryptedSnapshotId: "snap-87654321",
    operator: "release-test"
  };
  return {
    schemaVersion: 1,
    kind: "guru_price_series_repair_batch",
    generatedAt: "2026-09-02T20:00:00.000Z",
    series,
    refreshTargets,
    expectations,
    release,
    recordsSha256: guruPriceRepairRecordsSha256(
      series,
      refreshTargets,
      expectations,
      release
    )
  };
}

test("artifact validation binds both row and aggregate hashes", () => {
  const valid = artifact();
  assert.equal(validateGuruPriceRepairArtifact(valid).totalRows, 3);
  const tampered = structuredClone(valid);
  tampered.series[0].rows[1].adjustedClose = 99;
  assert.throws(() => validateGuruPriceRepairArtifact(tampered), /row hash does not match/i);
});

test("artifact hash binds exact refresh windows, statuses, and release expectations", () => {
  const tamperedTarget = artifact();
  tamperedTarget.refreshTargets[0].years = 10;
  assert.throws(
    () => validateGuruPriceRepairArtifact(tamperedTarget, { knownGuruIds: ["test-guru"] }),
    /records hash does not match/i
  );

  const missingTarget = artifact();
  missingTarget.refreshTargets = [];
  assert.throws(
    () => validateGuruPriceRepairArtifact(missingTarget, { knownGuruIds: ["test-guru"] }),
    new RegExp(`1-${expectedGuruCurveRows} refresh targets`, "i")
  );

  const reboundRelease = artifact();
  reboundRelease.release.sourceSnapshotId = "snap-abcdef12";
  assert.throws(
    () => validateGuruPriceRepairArtifact(reboundRelease, { knownGuruIds: ["test-guru"] }),
    /records hash does not match/i
  );
});

test("artifact release expectations and refresh-target limit follow the configured curve population", () => {
  const stalePopulation = artifact();
  stalePopulation.expectations.expectedDisplayableRows = expectedGuruCurveRows - 1;
  stalePopulation.recordsSha256 = guruPriceRepairRecordsSha256(
    stalePopulation.series,
    stalePopulation.refreshTargets,
    stalePopulation.expectations,
    stalePopulation.release
  );
  assert.throws(
    () => validateGuruPriceRepairArtifact(stalePopulation, { knownGuruIds: ["test-guru"] }),
    /invalid release expectations/i
  );

  const excessiveTargets = artifact();
  excessiveTargets.refreshTargets = Array.from(
    { length: expectedGuruCurveRows + 1 },
    (_, index) => ({
      guruId: `test-guru-${index}`,
      years: index % 2 === 0 ? 5 : 10,
      expectedStatus: "ready"
    })
  );
  assert.throws(
    () => validateGuruPriceRepairArtifact(excessiveTargets),
    new RegExp(`1-${expectedGuruCurveRows} refresh targets`, "i")
  );
});

test("artifact validation rejects a Renaissance 5Y proxy release target", () => {
  const invalid = artifact();
  invalid.series[0].affectedGuruIds = ["renaissance-technologies"];
  invalid.refreshTargets = [{
    guruId: "renaissance-technologies",
    years: 5,
    expectedStatus: "proxy_ready"
  }];
  invalid.recordsSha256 = guruPriceRepairRecordsSha256(
    invalid.series,
    invalid.refreshTargets,
    invalid.expectations,
    invalid.release
  );

  assert.throws(
    () => validateGuruPriceRepairArtifact(invalid, {
      knownGuruIds: ["renaissance-technologies"]
    }),
    /renaissance-technologies:5 cannot use proxy_ready/i
  );
});

test("application records or replays its batch ledger for exact complete rows", () => {
  let batchCalls = 0;
  let childRequests = -1;
  const result = applyGuruPriceRepairArtifact(artifact(), {
    snapshotId: "snap-complete",
    operator: "release-test",
    knownGuruIds: ["test-guru"],
    readSeries: () => rows,
    writeBatch: (requests) => {
      batchCalls += 1;
      childRequests = requests.length;
      return {
        batchAuditId: "batch-existing",
        audits: [{ auditId: "audit-prior-1" }, { auditId: "audit-prior-2" }],
        groupCount: 2,
        replayed: true
      };
    }
  });
  assert.equal(batchCalls, 1);
  assert.equal(childRequests, 0);
  assert.equal(result.importedRows, 0);
  assert.equal(result.verifiedExistingRows, 3);
  assert.equal(result.batchAuditId, "batch-existing");
  assert.equal(result.batchAuditReplayed, true);
  assert.deepEqual(result.auditIds, ["audit-prior-1", "audit-prior-2"]);
});

test("application splits missing sessions around an exact existing row", () => {
  let requests = [];
  const result = applyGuruPriceRepairArtifact(artifact(), {
    snapshotId: "snap-complete",
    operator: "release-test",
    knownGuruIds: ["test-guru"],
    readSeries: () => [rows[1]],
    writeBatch: (batch) => {
      requests = batch;
      return {
        batchAuditId: "batch-test",
        audits: batch.map((_, index) => ({ auditId: `audit-${index + 1}` })),
        groupCount: batch.length
      };
    }
  });
  assert.deepEqual(requests.map((request) => request.rows.map((row) => row.date)), [
    ["2026-08-28"],
    ["2026-09-01"]
  ]);
  assert.equal(requests[0].snapshotId, "snap-complete");
  assert.equal(result.importedRows, 2);
  assert.equal(result.verifiedExistingRows, 1);
  assert.deepEqual(result.auditIds, ["audit-1", "audit-2"]);
});

test("application rejects a conflicting complete production row", () => {
  const conflicting = { ...rows[1], close: 100 };
  assert.throws(() => applyGuruPriceRepairArtifact(artifact(), {
    snapshotId: "snap-complete",
    operator: "release-test",
    knownGuruIds: ["test-guru"],
    readSeries: () => [conflicting],
    writeBatch: () => ({
      batchAuditId: "never",
      audits: [{ auditId: "never" }],
      groupCount: 1
    })
  }), /conflicts with artifact/i);
});
