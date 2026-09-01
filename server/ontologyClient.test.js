import assert from "node:assert/strict";
import { mkdtempSync, utimesSync } from "node:fs";
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
    { ticker: "AAA", name: "Alpha", industry: "Software", marketcap_usd: 10, revenue_yoy: 0.1, ontology_score: 1.1, signal_state: "green_peer_capture" },
    { ticker: "BBB", name: "Beta", industry: "Energy", marketcap_usd: 20, revenue_yoy: 0.2, ontology_score: 1.5, signal_state: "invalid_or_watch" }
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
put("fixed:decision_overview", { marker: "overview-v1", rows: [{ ticker: "AAA" }] });
put("fixed:graph", { marker: "graph-v1", nodes: [{ id: "AAA" }] });
put("fixed:market_home", { metadata: { as_of: "2026-08-01" }, market_groups: [] });
put("fixed:valuation_heatmap", {
  dates: ["2026-08-01"],
  sectors: [{ group_id: "technology", name: "Technology" }]
});
put("fixed:overview", { totals: { companies: 1 }, build: { as_of: "2026-08-01" } });
put("fixed:methodology", { signal_definition: {}, field_notes: [], sources: [] });
put("fixed:timeline", { points: [] });
put("fixed:strategies", {
  version: "strategy-showcase-v1",
  strategies: [{ id: "ontology-rules-6m", name: "Ontology 固定规则" }]
});
put("strategy_detail:ontology-rules-6m", {
  id: "ontology-rules-6m",
  periods: { evaluation_2018_2026: { nav: [{ date: "2026-08-01" }] } }
});
put("strategy_snapshot:ontology-rules-6m:evaluation_2018_2026:2026-08-01", {
  strategy_id: "ontology-rules-6m",
  period: "evaluation_2018_2026",
  snapshot_date: "2026-08-01",
  positions: [{ ticker: "AAA" }]
});
database.prepare("INSERT INTO metadata VALUES (?, ?)").run(
  "manifest",
  JSON.stringify({
    schema_version: 2,
    generated_at: "2026-08-01T00:00:00.000Z",
    responses: 14,
    critical_failure_count: 0
  })
);
database.prepare("INSERT INTO metadata VALUES (?, ?)").run("schema_version", "2");
database.close();

process.env.ONTOLOGY_SNAPSHOT_PATH = snapshotPath;
process.env.ONTOLOGY_SNAPSHOT_VERSION_CHECK_MS = "0";
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

  const eventRanked = ontology.loadMarketGroupCompanies({
    groupId: "market-all",
    sort: "ontology_score",
    limit: 20
  });
  assert.deepEqual(eventRanked.companies.map((row) => row.ticker), ["AAA", "BBB"]);
});

test("search prioritizes an exact ticker", () => {
  const payload = ontology.searchMarketCompanies("bbb", 2);
  assert.equal(payload.companies[0].ticker, "BBB");
});

test("loads strategy catalog, detail and dated portfolio snapshot", () => {
  assert.equal(ontology.loadStrategyCatalog().strategies[0].id, "ontology-rules-6m");
  assert.equal(ontology.loadStrategyDetail("ontology-rules-6m").id, "ontology-rules-6m");
  const snapshot = ontology.loadStrategySnapshot({
    strategyId: "ontology-rules-6m",
    period: "evaluation_2018_2026",
    asOf: "2026-08-01"
  });
  assert.equal(snapshot.positions[0].ticker, "AAA");
});

test("loads the required valuation heatmap catalog", () => {
  const heatmap = ontology.loadValuationHeatmap();
  assert.deepEqual(heatmap.dates, ["2026-08-01"]);
  assert.equal(heatmap.sectors[0].group_id, "technology");
});

test("health validates the embedded manifest, schema and required fixed routes", () => {
  const health = ontology.publicOntologySnapshotInfo();
  assert.equal(health.ok, true);
  assert.equal(health.responseCount, 14);
  assert.equal(health.manifest.schema_version, 2);
  assert.equal("path" in health, false);
});

test("fixed payloads reuse objects and invalidate after the read-only snapshot version changes", () => {
  const overview = ontology.loadOntologyOverview();
  const overviewHit = ontology.loadOntologyOverview();
  const graph = ontology.loadFixedOntologyPayload("graph");
  const graphHit = ontology.loadFixedOntologyPayload("graph");
  assert.strictEqual(overviewHit, overview);
  assert.strictEqual(graphHit, graph);

  const writer = new DatabaseSync(snapshotPath);
  const replacement = Buffer.from(JSON.stringify({
    marker: "overview-v2",
    rows: [{ ticker: "BBB" }]
  }));
  writer.prepare(`
    UPDATE responses
    SET payload_gzip = ?, json_bytes = ?, updated_at = ?
    WHERE route_key = 'fixed:decision_overview'
  `).run(gzipSync(replacement), replacement.length, new Date().toISOString());
  writer.close();
  const future = new Date(Date.now() + 2000);
  utimesSync(snapshotPath, future, future);

  const refreshed = ontology.loadOntologyOverview();
  assert.notStrictEqual(refreshed, overview);
  assert.equal(refreshed.marker, "overview-v2");
  assert.equal(ontology.ontologyPayloadCacheStats().snapshotVersionCheckMs, 0);
});
