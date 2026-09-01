import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  REQUIRED_ONTOLOGY_FIXED_ROUTES,
  ontologySnapshotMetadataErrors
} from "../server/ontologySnapshotValidation.js";

const sourcePath = new URL("../lib/main.dart", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const forbiddenSourceMarkers = ["_dbmfPayload", "DbmfCompactDashboard", "DBMF Exposure Book", "('dbmf', 'DBMF')"];

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a file path`);
  return value;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function parseJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object");
    return parsed;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function verifySnapshot(snapshotArgument) {
  const snapshotPath = path.resolve(snapshotArgument);
  if (!fs.existsSync(snapshotPath)) throw new Error(`Ontology snapshot is missing: ${snapshotPath}`);
  const stats = fs.statSync(snapshotPath);
  if (!stats.isFile() || stats.size <= 0) throw new Error(`Ontology snapshot is empty: ${snapshotPath}`);

  const database = new DatabaseSync(snapshotPath, { readOnly: true });
  let responseCount;
  let jsonBytes;
  try {
    const quickCheck = database.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
    if (quickCheck.length !== 1 || quickCheck[0] !== "ok") throw new Error(`SQLite quick_check failed: ${quickCheck.join("; ")}`);
    const manifestRow = database.prepare("SELECT value FROM metadata WHERE key = 'manifest'").get();
    const schemaRow = database.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
    if (!manifestRow) throw new Error("metadata.manifest is missing");
    const manifest = parseJson(manifestRow.value, "metadata.manifest");
    const aggregate = database.prepare("SELECT COUNT(*) AS response_count, COALESCE(SUM(json_bytes), 0) AS json_bytes FROM responses").get();
    responseCount = Number(aggregate.response_count);
    jsonBytes = Number(aggregate.json_bytes);
    const routeRows = database.prepare("SELECT route_key FROM responses").all();
    const errors = ontologySnapshotMetadataErrors({
      manifest,
      metadataSchemaVersion: schemaRow?.value,
      responseCount,
      jsonBytes,
      routeKeys: routeRows.map((row) => row.route_key)
    });
    if (errors.length) throw new Error(errors.join("; "));

    const payloadQuery = database.prepare("SELECT payload_gzip, json_bytes FROM responses WHERE route_key = ?");
    for (const routeKey of REQUIRED_ONTOLOGY_FIXED_ROUTES) {
      const row = payloadQuery.get(routeKey);
      const raw = gunzipSync(Buffer.from(row.payload_gzip));
      if (raw.length !== Number(row.json_bytes)) throw new Error(`${routeKey} json_bytes does not match decompressed payload`);
      parseJson(raw.toString("utf8"), routeKey);
    }
  } finally {
    database.close();
  }

  const digest = sha256(snapshotPath);
  const sidecarPath = `${snapshotPath}.manifest.json`;
  if (fs.existsSync(sidecarPath)) {
    const sidecar = parseJson(fs.readFileSync(sidecarPath, "utf8"), "snapshot sidecar manifest");
    if (sidecar.sha256 && sidecar.sha256 !== digest) throw new Error("snapshot SHA-256 does not match sidecar manifest");
    if (Number.isFinite(Number(sidecar.bytes)) && Number(sidecar.bytes) !== stats.size) throw new Error("snapshot byte size does not match sidecar manifest");
    if (Number.isFinite(Number(sidecar.responses)) && Number(sidecar.responses) !== responseCount) throw new Error("snapshot response count does not match sidecar manifest");
  }
  return { path: snapshotPath, bytes: stats.size, responses: responseCount, jsonBytes, sha256: digest };
}

for (const marker of forbiddenSourceMarkers) {
  if (source.includes(marker)) throw new Error(`Retired DBMF UI marker found in lib/main.dart: ${marker}`);
}
if (!source.includes("('ontology', 'Ontology')")) throw new Error("Ontology navigation entry is missing from lib/main.dart");

if (process.argv.includes("--built")) {
  const builtPath = new URL("../dist/main.dart.js", import.meta.url);
  const built = fs.readFileSync(builtPath, "utf8");
  if (!built.includes("Ontology Intelligence")) throw new Error("Built frontend does not contain Ontology Intelligence");
  if (built.includes("DBMF Exposure Book") || built.includes("DBMF exposure book")) throw new Error("Built frontend still contains the retired DBMF screen");
}

const snapshotArgument = argumentValue("--snapshot");
const snapshotResult = snapshotArgument ? verifySnapshot(snapshotArgument) : null;
console.log(`Ontology module verification passed${process.argv.includes("--built") ? " for dist" : ""}.`);
if (snapshotResult) console.log(`Ontology snapshot verified: ${JSON.stringify(snapshotResult)}`);
