#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  guruPriceRepairRecordsSha256,
  guruPriceRepairRowsSha256,
  validateGuruPriceRepairArtifact
} from "../server/guruPriceRepairArtifact.js";

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Invalid argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function atomicWrite(filePath, payload) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, resolved);
}

const options = parseArgs(process.argv.slice(2));
const input = path.resolve(options.input || "");
const output = path.resolve(options.output || "");
if (!input || !output || !fs.existsSync(input)) {
  throw new Error("--input and --output must identify artifact JSON files.");
}
const artifact = JSON.parse(fs.readFileSync(input, "utf8"));
for (const series of artifact.series || []) {
  series.rowsSha256 = guruPriceRepairRowsSha256(series.rows);
}
artifact.release = {
  releaseId: String(options["release-id"] || "").trim(),
  sourceVolumeId: String(options["source-volume-id"] || "").trim().toLowerCase(),
  sourceSnapshotId: String(options["source-snapshot-id"] || "").trim().toLowerCase(),
  encryptedSnapshotId: String(options["encrypted-snapshot-id"] || "").trim().toLowerCase(),
  operator: String(options.operator || "").trim()
};
artifact.recordsSha256 = guruPriceRepairRecordsSha256(
  artifact.series,
  artifact.refreshTargets,
  artifact.expectations,
  artifact.release
);
const validated = validateGuruPriceRepairArtifact(artifact);
atomicWrite(output, artifact);
console.log(JSON.stringify({
  status: "bound",
  releaseId: validated.release.releaseId,
  recordsSha256: validated.recordsSha256,
  series: validated.series.length,
  totalRows: validated.totalRows,
  refreshTargets: validated.refreshTargets.length
}));
