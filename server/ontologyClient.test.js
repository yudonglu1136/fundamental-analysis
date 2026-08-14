import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "guru-ontology-test-"));
const snapshotPath = path.join(directory, "snapshot.sqlite");
const database = new DatabaseSync(snapshotPath);
database.exec(`
  CREATE TABLE responses (
    route_key TEXT PRIMARY KEY,
    payload_gzip BLOB NOT NULL,
    json_bytes INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const insert = database.prepare("INSERT INTO responses VALUES (?, ?, ?, ?)");
function put(key, payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  insert.run(key, gzipSync(raw), raw.length, new Date().toISOString());
}

put("decision_snapshot:2026-08-01", {
  as_of: "2026-08-01",
  count: 3,
  signals: [
    { ticker: "AAA", sector: "Technology" },
    { ticker: "BBB", sector: "Energy" },
    { ticker: "CCC", sector: "Technology" }
  ]
});
put("market_group_companies:market-all", {
  companies: [
    { ticker: "AAA", name: "Alpha", industry: "Software", marketcap_usd: 10, revenue_yoy: 0.1 },
    { ticker: "BBB", name: "Beta", industry: "Energy", marketcap_usd: 20, revenue_yoy: 0.2 }
  ]
});
put("market_group_companies:market-all:stage:software", {
  companies: [
    { ticker: "AAA", name: "Alpha", industry: "Software", marketcap_usd: 10, revenue_yoy: 0.1 }
  ]
});
put("fixed:rankings_all", {
  companies: [
    { ticker: "AAA", primary_layer: "apps", signal_state: "surging", heat_score: 50, fcf_yoy: 0.1 },
    { ticker: "BBB", primary_layer: "chips", signal_state: "mixed", heat_score: 80, fcf_yoy: -0.1 }
  ]
});
database.prepare("INSERT INTO metadata VALUES (?, ?)").run(
  "manifest",
  JSON.stringify({ schema_version: 1 })
);
database.close();

process.env.ONTOLOGY_SNAPSHOT_PATH = snapshotPath;
const ontology = await import(`./ontologyClient.js?test=${Date.now()}`);

test("filters and limits decision snapshots", () => {
  const payload = ontology.loadDecisionSnapshot({
    asOf: "2026-08-01",
    sector: "Technology",
    limit: 1
  });
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.signals.map((row) => row.ticker), ["AAA"]);
});

test("filters market stages and ranks requested metrics", () => {
  const staged = ontology.loadMarketGroupCompanies({
    groupId: "market-all",
    stage: "software",
    sort: "marketcap",
    limit: 20
  });
  assert.equal(staged.total, 1);
  assert.equal(staged.companies[0].ticker, "AAA");

  const rankings = ontology.loadRankings({ sort: "heat_score", limit: 2 });
  assert.deepEqual(rankings.companies.map((row) => row.ticker), ["BBB", "AAA"]);
});

test("search prioritizes an exact ticker", () => {
  const payload = ontology.searchMarketCompanies("bbb", 2);
  assert.equal(payload.companies[0].ticker, "BBB");
});
