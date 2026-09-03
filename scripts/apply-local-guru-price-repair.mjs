#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  applyGuruPriceRepairArtifact,
  guruPriceRepairRecordsSha256,
  guruPriceRepairRowsSha256,
  validateGuruPriceRepairArtifact
} from "../server/guruPriceRepairArtifact.js";
import { gurus } from "../server/gurus.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Invalid argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is missing.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is unreadable or corrupt: ${error.message}`);
  }
}

function atomicWritePrivateJson(filePath, payload) {
  const resolved = path.resolve(filePath);
  if (isWithin(resolved, repository)) {
    throw new Error("Local candidate reports containing repair identities must stay outside Git.");
  }
  if (fs.existsSync(resolved)) {
    throw new Error("Refusing to overwrite an existing local candidate report.");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
  fs.renameSync(temporary, resolved);
  fs.chmodSync(resolved, 0o600);
}

function sha256File(filePath) {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function onlineSqliteBackup(database, backup) {
  if (fs.existsSync(backup)) throw new Error("Refusing to overwrite the local candidate backup.");
  fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
  const program = [
    "import os,sqlite3,sys",
    "source_path,backup_path=sys.argv[1:3]",
    "source=sqlite3.connect(source_path,timeout=180)",
    "target=sqlite3.connect(backup_path,timeout=180)",
    "try:",
    " source.backup(target)",
    " result=target.execute('PRAGMA integrity_check').fetchone()[0]",
    " if result!='ok': raise RuntimeError('backup integrity_check failed: '+str(result))",
    "finally:",
    " target.close(); source.close()",
    "os.chmod(backup_path,0o600)"
  ].join("\n");
  const result = spawnSync("python3", ["-c", program, database, backup], {
    encoding: "utf8",
    timeout: 5 * 60 * 1000
  });
  if (result.status !== 0) {
    try { fs.rmSync(backup, { force: true }); } catch { /* Keep the original error. */ }
    throw new Error(`Consistent local candidate backup failed: ${String(result.stderr || "").trim()}`);
  }
}

function bindLocalCandidateArtifact(payload, { releaseId, operator, backupSha256 }) {
  if (payload?.buildMode !== "unbound_private_sharadar_active_intervals" ||
      payload?.recordsSha256 || Object.values(payload?.release || {}).some(Boolean)) {
    throw new Error("Local candidate mode accepts only an unbound private Sharadar artifact.");
  }
  const artifact = structuredClone(payload);
  for (const series of artifact.series || []) {
    series.rowsSha256 = guruPriceRepairRowsSha256(series.rows);
  }
  artifact.release = {
    releaseId,
    sourceVolumeId: `vol-${backupSha256.slice(0, 16)}`,
    sourceSnapshotId: `snap-${backupSha256.slice(16, 32)}`,
    encryptedSnapshotId: `snap-${backupSha256.slice(32, 48)}`,
    operator
  };
  artifact.recordsSha256 = guruPriceRepairRecordsSha256(
    artifact.series,
    artifact.refreshTargets,
    artifact.expectations,
    artifact.release
  );
  return validateGuruPriceRepairArtifact(artifact, { knownGuruIds: gurus.map((guru) => guru.id) });
}

const options = parseArgs(process.argv.slice(2));
const requestedDatabase = path.resolve(options.database || "");
const database = fs.existsSync(requestedDatabase)
  ? fs.realpathSync(requestedDatabase)
  : requestedDatabase;
const artifactPath = path.resolve(options.artifact || "");
const backup = path.resolve(options.backup || "");
const reportPath = path.resolve(options.output || "");
const releaseId = String(options["release-id"] || "").trim();
const operator = String(options.operator || "").trim();
const apply = options.apply === "true";

if (process.env.NODE_ENV === "production" || database.startsWith("/var/app/")) {
  throw new Error("Local candidate import is disabled for production paths and NODE_ENV=production.");
}
if (!database || !fs.existsSync(database) || !fs.statSync(database).isFile()) {
  throw new Error("--database must identify an existing offline candidate SQLite file.");
}
if (isWithin(database, repository)) {
  throw new Error("Local candidate import refuses the repository's bundled/runtime database.");
}
if (!/^guru-curves-local-candidate-[A-Za-z0-9._-]{4,64}$/.test(releaseId)) {
  throw new Error("--release-id must start with guru-curves-local-candidate-.");
}
if (!/^local-candidate\/[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(operator)) {
  throw new Error("--operator must use the explicit local-candidate/<name> identity.");
}
const unbound = readJson(artifactPath, "Unbound private Sharadar artifact");

if (!apply) {
  const syntheticBackupHash = crypto.createHash("sha256")
    .update(`dry-run:${database}:${fs.statSync(database).size}`)
    .digest("hex");
  const validated = bindLocalCandidateArtifact(unbound, {
    releaseId,
    operator,
    backupSha256: syntheticBackupHash
  });
  console.log(JSON.stringify({
    status: "validated_local_candidate_dry_run",
    series: validated.series.length,
    rows: validated.totalRows,
    refreshTargets: validated.refreshTargets.length
  }));
  process.exit(0);
}

if (options.confirm !== "offline-candidate-write" || !backup || !reportPath) {
  throw new Error(
    "Writing requires --apply=true --confirm=offline-candidate-write plus --backup and --output."
  );
}
if (isWithin(backup, repository) || isWithin(reportPath, repository) || backup === database) {
  throw new Error("Candidate backup/report paths must be outside Git and distinct from the database.");
}
onlineSqliteBackup(database, backup);
const backupSha256 = sha256File(backup);
const artifact = bindLocalCandidateArtifact(unbound, { releaseId, operator, backupSha256 });

process.env.SQLITE_DB_PATH = database;
process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
const {
  readPriceSeriesFromDb,
  writeAuditedPriceSeriesImportBatch
} = await import("../server/localDatabase.js");
const result = applyGuruPriceRepairArtifact(artifact, {
  snapshotId: artifact.release.sourceSnapshotId,
  snapshotState: "completed",
  operator,
  knownGuruIds: gurus.map((guru) => guru.id),
  readSeries: readPriceSeriesFromDb,
  writeBatch: writeAuditedPriceSeriesImportBatch
});
const report = {
  status: "applied_to_offline_local_candidate",
  nonProduction: true,
  releaseId,
  operator,
  databaseSha256BeforeWrite: backupSha256,
  backupPath: backup,
  recordsSha256: result.recordsSha256,
  series: result.series,
  totalRows: result.totalRows,
  importedRows: result.importedRows,
  verifiedExistingRows: result.verifiedExistingRows,
  batchAuditId: result.batchAuditId,
  auditIds: result.auditIds,
  refreshTargets: result.refreshTargets
};
atomicWritePrivateJson(reportPath, report);
console.log(JSON.stringify({
  status: report.status,
  nonProduction: true,
  recordsSha256: report.recordsSha256,
  importedRows: report.importedRows,
  verifiedExistingRows: report.verifiedExistingRows,
  auditCount: report.auditIds.length
}));
