#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Invalid argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function atomicWriteJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const temporary = `${path.resolve(filePath)}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, path.resolve(filePath));
}

function loopbackBaseUrl(value) {
  const url = new URL(value || "http://127.0.0.1:8080");
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "::1"].includes(url.hostname)) {
    throw new Error("Guru price repair may connect only to a loopback HTTP origin.");
  }
  url.pathname = "/";
  url.search = "";
  return url;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForApi(baseUrl, secret, attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL("api/internal/backtests/status", baseUrl), {
        headers: { authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      if (response.status >= 200 && response.status < 600) return;
    } catch {
      // The EB application process can still be switching during postdeploy.
    }
    await delay(2000);
  }
  throw new Error("Local Guru API did not become reachable before repair timeout.");
}

const options = parseArgs(process.argv.slice(2));
const artifactPath = path.resolve(options.artifact || "");
const snapshotId = String(options["snapshot-id"] || "").trim();
const encryptedSnapshotId = String(options["encrypted-snapshot-id"] || "").trim();
const sourceVolumeId = String(options["source-volume-id"] || "").trim();
const releaseId = String(options["release-id"] || "").trim();
const operator = String(options.operator || "").trim();
const baseUrl = loopbackBaseUrl(options["base-url"]);
if (!artifactPath || !fs.existsSync(artifactPath)) {
  throw new Error("--artifact must identify an existing JSON artifact.");
}
if (!/^snap-[a-f0-9]{8,}$/.test(snapshotId)) {
  throw new Error("--snapshot-id must identify the completed pre-write EBS snapshot.");
}
if (!/^snap-[a-f0-9]{8,}$/.test(encryptedSnapshotId) ||
    !/^vol-[a-f0-9]{8,}$/.test(sourceVolumeId) ||
    !/^guru-curves-[A-Za-z0-9._-]{8,80}$/.test(releaseId)) {
  throw new Error("Guru price repair requires bound release, volume, and rollback snapshot ids.");
}
if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,79}$/.test(operator)) {
  throw new Error("--operator is invalid.");
}
const secret = String(process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || "");
if (!secret) throw new Error("Guru price repair requires INTERNAL_CRON_SECRET in process memory.");

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
await waitForApi(baseUrl, secret);
const response = await fetch(new URL("api/internal/release/guru-price-repair", baseUrl), {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    artifact,
    snapshotId,
    snapshotState: "completed",
    encryptedSnapshotId,
    sourceVolumeId,
    releaseId,
    operator
  }),
  redirect: "error",
  signal: AbortSignal.timeout(2 * 60 * 60 * 1000)
});
const report = await response.json().catch(() => ({}));
if (!response.ok || !report.pass || report.recordsSha256 !== artifact.recordsSha256) {
  const code = String(report.error || `http_${response.status}`);
  const message = String(report.message || "Guru price repair did not pass its target refresh gate.");
  throw new Error(`${code}: ${message}`);
}
atomicWriteJson(options.output, report);
console.log(JSON.stringify({
  status: "installed",
  recordsSha256: report.recordsSha256,
  series: report.series,
  totalRows: report.totalRows,
  importedRows: report.importedRows,
  verifiedExistingRows: report.verifiedExistingRows,
  auditCount: Array.isArray(report.auditIds) ? report.auditIds.length : 0,
  batchAuditId: report.batchAuditId,
  refreshedTargets: Array.isArray(report.refreshes) ? report.refreshes.length : 0
}));
