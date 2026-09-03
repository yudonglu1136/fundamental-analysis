import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fixtureDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guru-security-master-test-"));
  const records = {
    managers: [{ id: "fixture-manager", ciks: ["0000000001"] }],
    filings: [{
      managerId: "fixture-manager",
      cik: "0000000001",
      accessionNumber: "0000000001-26-000001",
      form: "13F-HR",
      reportDate: "2026-06-30",
      filingDate: "2026-08-14",
      documentUrl: "https://www.sec.gov/Archives/edgar/data/1/1/infotable.xml",
      documentSha256: "1".repeat(64),
      cusipCount: 1
    }],
    cusips: [{
      cusip: "037833100",
      managerIds: ["fixture-manager"],
      issuerNames: ["APPLE INC"],
      titles: ["COM"],
      observationCount: 1,
      firstReportDate: "2026-06-30",
      lastReportDate: "2026-06-30"
    }]
  };
  const manifest = {
    schemaVersion: 1,
    generatedAt: "2020-01-01T00:00:00.000Z",
    sourcePolicy: "direct_official_sec_submissions_and_archive_documents_no_derived_cache",
    holdingSelectionPolicy: "top_60_common_long_shares_excluding_explicit_non_common_titles_by_reported_value_per_filing",
    recordsSha256: sha256(stableJson(records)),
    ...records
  };
  fs.writeFileSync(path.join(directory, "sec.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, "openfigi.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "openfigi_mapping",
    responses: {
      "037833100": { data: [
        {
          figi: "BBG000B9XRY4",
          compositeFIGI: "BBG000B9XRY4",
          shareClassFIGI: "BBG001S5N8V8",
          ticker: "AAPL",
          name: "APPLE INC",
          exchCode: "US",
          marketSector: "Equity",
          securityType: "Common Stock",
          securityType2: "Common Stock"
        },
        {
          figi: "BBG000B9Y5X2",
          compositeFIGI: "BBG000B9Y5X2",
          shareClassFIGI: "BBG001S5N8V8",
          ticker: "APC",
          name: "APPLE INC",
          exchCode: "GR",
          marketSector: "Equity",
          securityType: "Common Stock",
          securityType2: "Common Stock"
        }
      ] }
    }
  }));
  fs.writeFileSync(path.join(directory, "yahoo.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "yahoo_provider_validation",
    responses: {
      AAPL: {
        status: "available",
        symbol: "AAPL",
        longName: "Apple Inc.",
        shortName: "Apple Inc.",
        instrumentType: "EQUITY",
        exchangeName: "NMS",
        firstTradeDate: 345479400,
        firstObservedDate: "2016-09-01",
        lastObservedDate: "2026-09-01"
      }
    }
  }));
  return directory;
}

function runBuilder(directory, output, hashSeed = "1", generatedAt = "2020-01-01T00:00:00Z") {
  return spawnSync("python3", [
    "scripts/build-guru-security-master.py",
    "--sec-manifest", path.join(directory, "sec.json"),
    "--sec-manifest-reference", "server/config/guru-sec-cusip-manifest.json",
    "--openfigi-cache", path.join(directory, "openfigi.json"),
    "--yahoo-cache", path.join(directory, "yahoo.json"),
    "--output", output,
    "--generated-at", generatedAt,
    "--offline"
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PYTHONHASHSEED: hashSeed }
  });
}

test("public security-master builder is deterministic across Python hash seeds", () => {
  const directory = fixtureDirectory();
  const first = path.join(directory, "first.json");
  const second = path.join(directory, "second.json");
  const firstRun = runBuilder(directory, first, "1");
  const openFigiCachePath = path.join(directory, "openfigi.json");
  const openFigiCache = JSON.parse(fs.readFileSync(openFigiCachePath, "utf8"));
  openFigiCache.responses["037833100"].data.reverse();
  openFigiCache.responses["999999999"] = { data: [{ ticker: "UNUSED" }] };
  fs.writeFileSync(openFigiCachePath, JSON.stringify(openFigiCache));
  const yahooCachePath = path.join(directory, "yahoo.json");
  const yahooCache = JSON.parse(fs.readFileSync(yahooCachePath, "utf8"));
  yahooCache.responses.UNUSED = { status: "available", symbol: "UNUSED" };
  fs.writeFileSync(yahooCachePath, JSON.stringify(yahooCache));
  const secondRun = runBuilder(directory, second, "8675309");
  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.equal(fs.readFileSync(first, "utf8"), fs.readFileSync(second, "utf8"));
  const payload = JSON.parse(fs.readFileSync(first, "utf8"));
  assert.equal(payload.source.identifierProvider, "OpenFIGI");
  assert.equal(payload.source.holdingProvider, "U.S. Securities and Exchange Commission");
  assert.equal(
    payload.source.holdingManifestPath,
    "server/config/guru-sec-cusip-manifest.json"
  );
  assert.equal(payload.selection.resolvedCusips, 1);
  assert.equal(payload.securities[0].ticker, "AAPL");
});

test("public security-master builder rejects an absolute runtime manifest reference", () => {
  const directory = fixtureDirectory();
  const result = spawnSync("python3", [
    "scripts/build-guru-security-master.py",
    "--sec-manifest", path.join(directory, "sec.json"),
    "--sec-manifest-reference", path.join(directory, "sec.json"),
    "--openfigi-cache", path.join(directory, "openfigi.json"),
    "--yahoo-cache", path.join(directory, "yahoo.json"),
    "--output", path.join(directory, "output.json"),
    "--generated-at", "2020-01-01T00:00:00Z",
    "--offline"
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absolute build-machine paths are not distributable/i);
});

test("public security-master builder rejects a corrupt SEC source manifest", () => {
  const directory = fixtureDirectory();
  const manifestPath = path.join(directory, "sec.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.cusips[0].issuerNames = ["TAMPERED"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = runBuilder(directory, path.join(directory, "output.json"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /records hash mismatch/i);
});

test("public security-master builder rejects a materially future audit timestamp", () => {
  const directory = fixtureDirectory();
  const result = runBuilder(
    directory,
    path.join(directory, "output.json"),
    "1",
    "2999-01-01T00:00:00Z"
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be more than five minutes in the future/i);
});
