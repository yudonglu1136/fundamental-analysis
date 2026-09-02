import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import {
  guruPriceRepairRecordsSha256,
  guruPriceRepairRowsSha256
} from "./guruPriceRepairArtifact.js";
import { registerGuruPriceRepairRoute } from "./guruPriceRepairRoute.js";
import { requireLoopbackRequest } from "./internalCronAuth.js";

const strictMethodVersion = "strict-v1";
const proxyMethodVersion = "proxy-v1";
const securityMasterVersion = "security-v1";
const rows = [{
  date: "2026-08-28",
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  adjustedClose: 10.5,
  volume: 100
}];

function fixture() {
  const series = [{
    symbol: "TEST",
    startDate: rows[0].date,
    endDate: rows[0].date,
    provider: "test-provider",
    reason: "Restore an independently verified price gap.",
    sourceReference: "test-source-reference",
    affectedGuruIds: ["test-guru"],
    rows,
    rowsSha256: guruPriceRepairRowsSha256(rows)
  }];
  const refreshTargets = [{
    guruId: "test-guru",
    years: 10,
    expectedStatus: "proxy_ready"
  }];
  const expectations = {
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion,
    expectedDisplayableRows: 36
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
    generatedAt: new Date().toISOString(),
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

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("loopback install accepts a body over 100KB and refreshes the exact post-repair generation", async (context) => {
  const app = express();
  const refreshCalls = [];
  registerGuruPriceRepairRoute(app, {
    requireInternalCron: (_request, _response, next) => next(),
    requireLoopbackRequest,
    gurus: [{ id: "test-guru", type: "manager13f", disableSimulation: false }],
    readPriceSeriesFromDb: () => [],
    writeAuditedPriceSeriesImportBatch: (requests) => ({
      batchAuditId: "price-series-batch-test",
      audits: requests.map(() => ({ auditId: "price-series-import-test" })),
      groupCount: requests.length
    }),
    loadGuruBacktest: async (guruId, options) => {
      refreshCalls.push({ guruId, options });
      return {
        status: "proxy_ready",
        generatedAt: new Date().toISOString(),
        method: {
          version: strictMethodVersion,
          securityMasterVersion,
          years: 10
        },
        proxy: { methodVersion: proxyMethodVersion, securityMasterVersion }
      };
    },
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion
  });
  const server = await listen(http.createServer(app));
  context.after(() => server.close());
  const artifact = fixture();
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/internal/release/guru-price-repair`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artifact,
        snapshotId: "snap-12345678",
        snapshotState: "completed",
        encryptedSnapshotId: "snap-87654321",
        sourceVolumeId: "vol-12345678",
        releaseId: "guru-curves-test-release",
        operator: "release-test",
        padding: "x".repeat(120_000)
      })
    }
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.pass, true);
  assert.equal(body.recordsSha256, artifact.recordsSha256);
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].guruId, "test-guru");
  assert.equal(refreshCalls[0].options.years, 10);
  assert.match(refreshCalls[0].options.refreshGeneration, new RegExp(artifact.recordsSha256));
});

test("release identity mismatch fails before any database write", async (context) => {
  const app = express();
  let writes = 0;
  registerGuruPriceRepairRoute(app, {
    requireInternalCron: (_request, _response, next) => next(),
    requireLoopbackRequest,
    gurus: [{ id: "test-guru", type: "manager13f", disableSimulation: false }],
    readPriceSeriesFromDb: () => [],
    writeAuditedPriceSeriesImportBatch: () => {
      writes += 1;
      return { batchAuditId: "never", audits: [{ auditId: "never" }], groupCount: 1 };
    },
    loadGuruBacktest: async () => ({}),
    strictMethodVersion: "different-strict-version",
    proxyMethodVersion,
    securityMasterVersion
  });
  const server = await listen(http.createServer(app));
  context.after(() => server.close());
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/internal/release/guru-price-repair`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artifact: fixture(),
        snapshotId: "snap-12345678",
        snapshotState: "completed",
        encryptedSnapshotId: "snap-87654321",
        sourceVolumeId: "vol-12345678",
        releaseId: "guru-curves-test-release",
        operator: "release-test"
      })
    }
  );
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
});
