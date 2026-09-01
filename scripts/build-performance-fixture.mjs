#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const managerMethodVersion = "manager13f-drifted-total-return-v5";
const congressMethodVersion = "stock-act-disclosure-fail-closed-v1";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requiredArgument(name) {
  const value = String(argument(name) || "").trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function isoDate(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("--as-of must use YYYY-MM-DD");
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error("--as-of is not a valid calendar date");
  }
  return normalized;
}

function snapshotGuru(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload_json || "{}");
  } catch {}
  return {
    id: row.guru_id,
    name: payload.name || payload.guru?.name || row.guru_id,
    chineseName: payload.chineseName || payload.guru?.chineseName || "",
    entityName: payload.entityName || payload.guru?.entityName || "",
    type: row.type,
    thesisTag: payload.thesisTag || payload.guru?.thesisTag || ""
  };
}

function failClosedPayload(guru, asOf, generatedAt) {
  const manager = guru.type === "manager13f";
  const evidence = manager ? "Form 13F filing" : "STOCK Act disclosure";
  const method = {
    version: manager ? managerMethodVersion : congressMethodVersion,
    years: "all",
    benchmark: "SPY",
    fixtureMode: "deterministic_fail_closed",
    reason:
      `Authoritative offline ${evidence} archives are unavailable in this deterministic performance fixture. ` +
      "No legacy result was promoted, converted, or relabeled."
  };
  if (manager) {
    Object.assign(method, {
      rawFilings: 0,
      amendmentPolicy: "not_evaluated_without_authoritative_offline_filings",
      executionPolicy: "not_evaluated_without_authoritative_offline_filings",
      returnBasis: "not_evaluated"
    });
  } else {
    Object.assign(method, {
      rawTransactions: 0,
      executionPolicy: "not_evaluated_without_authoritative_offline_disclosures"
    });
  }

  return {
    generatedAt,
    status: "insufficient_data",
    guru,
    tag: {
      label: "Deterministic benchmark fixture — evidence unavailable",
      tone: "muted"
    },
    window: { start: null, end: asOf },
    method,
    dataQuality: {
      fixtureOnly: true,
      networkAllowed: false,
      failurePolicy: "fail_closed",
      legacyResultPromoted: false,
      resultFabricated: false,
      returnBasis: "unavailable"
    },
    summary: {},
    equity: [],
    rebalances: [],
    quarterContributions: [],
    cache: {
      status: "performance-fixture",
      source: "deterministic offline fixture"
    }
  };
}

function ensureFixtureSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS guru_backtests (
      guru_id TEXT NOT NULL,
      years INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (guru_id, years)
    );
    CREATE TABLE IF NOT EXISTS cache_revisions (
      scope TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO cache_revisions (scope, revision) VALUES ('guru_backtests', 0);
    CREATE TRIGGER IF NOT EXISTS guru_backtests_revision_insert
    AFTER INSERT ON guru_backtests BEGIN
      UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_backtests';
    END;
    CREATE TRIGGER IF NOT EXISTS guru_backtests_revision_update
    AFTER UPDATE ON guru_backtests BEGIN
      UPDATE cache_revisions SET revision = revision + 1 WHERE scope = 'guru_backtests';
    END;
  `);

  const priceColumns = new Set(
    database.prepare("PRAGMA table_info(price_points)").all().map((column) => column.name)
  );
  if (priceColumns.size && !priceColumns.has("adjusted_close")) {
    database.exec("ALTER TABLE price_points ADD COLUMN adjusted_close REAL");
  }
}

const source = path.resolve(requiredArgument("source"));
const output = path.resolve(requiredArgument("output"));
const asOf = isoDate(requiredArgument("as-of"));
const generatedAt = argument("generated-at", `${asOf}T00:00:00.000Z`);
const manifestPath = path.resolve(argument("manifest", `${output}.manifest.json`));

if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
  throw new Error(`Source SQLite file does not exist: ${source}`);
}
if (source === output) throw new Error("Output must not overwrite the source SQLite database");
if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
if (fs.existsSync(`${source}-wal`) || fs.existsSync(`${source}-shm`)) {
  throw new Error("Source has SQLite WAL/SHM sidecars; freeze or checkpoint it before building a fixture");
}
if (manifestPath === source || manifestPath === output) {
  throw new Error("Manifest must be a separate file");
}
if (fs.existsSync(manifestPath)) throw new Error(`Manifest already exists: ${manifestPath}`);

const sourceBytes = fs.statSync(source).size;
const sourceSha256Before = sha256(source);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(source, output, fs.constants.COPYFILE_EXCL);

let supported = [];
let database;
try {
  database = new DatabaseSync(output);
  database.exec("PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
  ensureFixtureSchema(database);

  const snapshotTable = database.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'guru_snapshots'
  `).get();
  if (!snapshotTable) throw new Error("Source fixture has no guru_snapshots table");

  supported = database.prepare(`
    SELECT guru_id, type, payload_json
    FROM guru_snapshots
    WHERE type IN ('manager13f', 'congress')
    ORDER BY guru_id
  `).all();
  if (!supported.length) {
    throw new Error("Source fixture has no manager13f or congress route members");
  }

  const write = database.prepare(`
    INSERT INTO guru_backtests (
      guru_id, years, generated_at, start_date, end_date, payload_json
    ) VALUES (?, 0, ?, '', ?, ?)
    ON CONFLICT(guru_id, years) DO UPDATE SET
      generated_at = excluded.generated_at,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      payload_json = excluded.payload_json
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of supported) {
      const guru = snapshotGuru(row);
      const payload = failClosedPayload(guru, asOf, generatedAt);
      write.run(guru.id, generatedAt, asOf, JSON.stringify(payload));
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("PRAGMA wal_checkpoint(TRUNCATE);");
} catch (error) {
  database?.close();
  fs.rmSync(output, { force: true });
  throw error;
}
database.close();

const sourceSha256After = sha256(source);
if (sourceSha256After !== sourceSha256Before || fs.statSync(source).size !== sourceBytes) {
  fs.rmSync(output, { force: true });
  throw new Error("Source SQLite identity changed while the fixture was built");
}

const outputSha256 = sha256(output);
const managerCount = supported.filter((row) => row.type === "manager13f").length;
const congressCount = supported.filter((row) => row.type === "congress").length;
const manifest = {
  schemaVersion: 1,
  fixtureKind: "performance_fail_closed_backtests",
  asOf,
  generatedAt,
  source: {
    path: source,
    bytes: sourceBytes,
    sha256Before: sourceSha256Before,
    sha256After: sourceSha256After,
    mutationDetected: false
  },
  output: {
    path: output,
    bytes: fs.statSync(output).size,
    sha256: outputSha256
  },
  prices: {
    adjustedCloseColumnPresent: true,
    adjustedCloseValuesSeeded: 0,
    status: "not_seeded",
    reason:
      "Sharadar SEP does not contain SPY or the required ETF holdings, so a partial price backfill is not used to imply complete total-return coverage."
  },
  backtests: {
    yearsKey: 0,
    managerMethodVersion,
    congressMethodVersion,
    managerCount,
    congressCount,
    total: supported.length,
    guruIds: supported.map((row) => row.guru_id),
    status: "insufficient_data",
    networkAllowed: false,
    legacyResultPromoted: false,
    resultFabricated: false
  }
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
