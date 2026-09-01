import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { REQUIRED_ONTOLOGY_FIXED_ROUTES } from "../server/ontologySnapshotValidation.js";

const root = path.resolve(import.meta.dirname, "..");
const directory = mkdtempSync(path.join(os.tmpdir(), "ontology-verifier-test-"));

function fixture(name, routes = REQUIRED_ONTOLOGY_FIXED_ROUTES) {
  const filePath = path.join(directory, name);
  const database = new DatabaseSync(filePath);
  database.exec(`
    CREATE TABLE responses (route_key TEXT PRIMARY KEY, payload_gzip BLOB NOT NULL, json_bytes INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  let jsonBytes = 0;
  const insert = database.prepare("INSERT INTO responses VALUES (?, ?, ?, ?)");
  for (const routeKey of routes) {
    const raw = Buffer.from(JSON.stringify({ route: routeKey }));
    jsonBytes += raw.length;
    insert.run(routeKey, gzipSync(raw), raw.length, "2026-09-01T00:00:00.000Z");
  }
  database.prepare("INSERT INTO metadata VALUES (?, ?)").run("schema_version", "2");
  database.prepare("INSERT INTO metadata VALUES (?, ?)").run("manifest", JSON.stringify({
    schema_version: 2,
    generated_at: "2026-09-01T00:00:00.000Z",
    responses: routes.length,
    uncompressed_json_bytes: jsonBytes,
    critical_failure_count: 0
  }));
  database.close();
  return filePath;
}

function verify(filePath) {
  return spawnSync(process.execPath, ["scripts/verify-ontology-module.mjs", "--snapshot", filePath], {
    cwd: root,
    encoding: "utf8"
  });
}

test("strict verifier accepts a complete deterministic snapshot and reports its SHA", () => {
  const result = verify(fixture("valid.sqlite"));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Ontology snapshot verified/);
  assert.match(result.stdout, /"responses":8/);
  assert.match(result.stdout, /"sha256":"[a-f0-9]{64}"/);
});

test("strict verifier rejects a snapshot missing a required fixed route", () => {
  const routes = REQUIRED_ONTOLOGY_FIXED_ROUTES.filter((route) => route !== "fixed:graph");
  const result = verify(fixture("missing-route.sqlite", routes));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required payload is missing: fixed:graph/);
});
