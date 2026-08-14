import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSnapshotPath = path.join(__dirname, "data", "ontology-snapshot.sqlite");
const snapshotPath = process.env.ONTOLOGY_SNAPSHOT_PATH || defaultSnapshotPath;
let database = null;
const payloadCache = new Map();
const cacheLimit = 48;

const marketSortFields = new Set([
  "marketcap",
  "revenue_yoy",
  "operating_income_yoy",
  "operating_margin",
  "net_margin"
]);
const rankingSortFields = new Set([
  "heat_score",
  "revenue_yoy",
  "revenue_acceleration",
  "operating_income_yoy",
  "operating_margin_delta",
  "gross_margin_delta",
  "fcf_yoy",
  "capex_yoy",
  "marketcap"
]);

function ontologyError(message, code = "ontology_snapshot_unavailable") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function connection() {
  if (database) return database;
  if (!fs.existsSync(snapshotPath)) {
    throw ontologyError(`Ontology snapshot is missing: ${snapshotPath}`);
  }
  database = new DatabaseSync(snapshotPath, { readOnly: true });
  return database;
}

function remember(key, value) {
  if (payloadCache.has(key)) payloadCache.delete(key);
  payloadCache.set(key, value);
  while (payloadCache.size > cacheLimit) {
    payloadCache.delete(payloadCache.keys().next().value);
  }
  return value;
}

function loadPayload(key, { optional = false } = {}) {
  if (payloadCache.has(key)) return payloadCache.get(key);
  const row = connection()
    .prepare("SELECT payload_gzip FROM responses WHERE route_key = ?")
    .get(key);
  if (!row) {
    if (optional) return null;
    throw ontologyError(`Ontology payload is missing: ${key}`, "ontology_payload_missing");
  }
  const payload = JSON.parse(gunzipSync(Buffer.from(row.payload_gzip)).toString("utf8"));
  return remember(key, payload);
}

function number(value, fallback = Number.NEGATIVE_INFINITY) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function text(value) {
  return String(value || "").trim();
}

function isoDate(value) {
  const result = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw ontologyError(`Invalid ontology as_of date: ${value}`, "ontology_invalid_date");
  }
  return result;
}

function marketSortValue(row, sort) {
  if (sort === "marketcap") return number(row.marketcap_usd);
  return number(row[sort]);
}

function rankingSortValue(row, sort) {
  const field = {
    operating_margin_delta: "operating_margin_delta_yoy",
    gross_margin_delta: "gross_margin_delta_yoy",
    marketcap: "marketcap_usd"
  }[sort] || sort;
  return number(row[field]);
}

function sortRows(rows, accessor) {
  return [...rows].sort((left, right) => {
    const delta = accessor(right) - accessor(left);
    if (Number.isFinite(delta) && delta !== 0) return delta;
    return text(left.ticker).localeCompare(text(right.ticker));
  });
}

export function ontologySnapshotInfo() {
  const stats = fs.existsSync(snapshotPath) ? fs.statSync(snapshotPath) : null;
  let manifest = null;
  try {
    const row = connection().prepare("SELECT value FROM metadata WHERE key = 'manifest'").get();
    manifest = row ? JSON.parse(row.value) : null;
  } catch (error) {
    return {
      ok: false,
      path: snapshotPath,
      exists: Boolean(stats),
      sizeBytes: stats?.size || 0,
      error: error.message
    };
  }
  return {
    ok: true,
    path: snapshotPath,
    exists: true,
    sizeBytes: stats?.size || 0,
    updatedAt: stats?.mtime?.toISOString() || null,
    manifest
  };
}

export function loadOntologyOverview() {
  return loadPayload("fixed:decision_overview");
}

export function loadDecisionSnapshot({ asOf, sector, limit }) {
  const date = isoDate(asOf);
  const payload = loadPayload(`decision_snapshot:${date}`);
  const sectorFilter = text(sector).toLowerCase();
  const maxRows = boundedInteger(limit, 80, 1, 200);
  const signals = (payload.signals || []).filter((row) => {
    if (!sectorFilter) return true;
    return text(row.sector).toLowerCase() === sectorFilter;
  });
  const visibleSignals = signals.slice(0, maxRows);
  return { ...payload, count: visibleSignals.length, signals: visibleSignals };
}

export function loadDecisionCompany(ticker) {
  return loadPayload(`decision_company:${text(ticker).toUpperCase()}`);
}

export function loadMarketGroup(groupId) {
  return loadPayload(`market_group:${text(groupId)}`);
}

export function loadMarketGroupSnapshot(groupId, asOf) {
  return loadPayload(`market_group_snapshot:${text(groupId)}:${isoDate(asOf)}`);
}

export function loadMarketGroupCompanies({
  groupId,
  industry,
  stage,
  search,
  sort = "marketcap",
  limit = 120,
  offset = 0
}) {
  if (!marketSortFields.has(sort)) {
    throw ontologyError(`Unsupported ontology company sort: ${sort}`, "ontology_invalid_sort");
  }
  const stageKey = text(stage);
  const payload = stageKey
    ? loadPayload(`market_group_companies:${text(groupId)}:stage:${stageKey}`)
    : loadPayload(`market_group_companies:${text(groupId)}`);
  const industryFilter = text(industry).toLowerCase();
  const searchFilter = text(search).toLowerCase();
  let companies = (payload.companies || []).filter((row) => {
    if (industryFilter && text(row.industry || "Unclassified").toLowerCase() !== industryFilter) {
      return false;
    }
    if (searchFilter) {
      const haystack = `${text(row.ticker)} ${text(row.name)}`.toLowerCase();
      if (!haystack.includes(searchFilter)) return false;
    }
    return true;
  });
  companies = sortRows(companies, (row) => marketSortValue(row, sort));
  const start = boundedInteger(offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const pageSize = boundedInteger(limit, 120, 1, 500);
  return {
    group_id: text(groupId),
    industry: text(industry) || null,
    stage: stageKey || null,
    sort,
    offset: start,
    limit: pageSize,
    total: companies.length,
    companies: companies.slice(start, start + pageSize)
  };
}

export function loadMarketCompany(ticker) {
  return loadPayload(`market_company:${text(ticker).toUpperCase()}`);
}

export function searchMarketCompanies(query, limit = 20) {
  const token = text(query).toLowerCase();
  if (!token) return { query: "", companies: [] };
  const payload = loadPayload("market_group_companies:market-all");
  const maxRows = boundedInteger(limit, 20, 1, 50);
  const companies = (payload.companies || [])
    .filter((row) => `${text(row.ticker)} ${text(row.name)}`.toLowerCase().includes(token))
    .sort((left, right) => {
      const leftExact = text(left.ticker).toLowerCase() === token ? 0 : 1;
      const rightExact = text(right.ticker).toLowerCase() === token ? 0 : 1;
      return leftExact - rightExact || number(right.marketcap_usd) - number(left.marketcap_usd);
    })
    .slice(0, maxRows)
    .map(({ ticker, name, sector, industry, marketcap_usd, revenue_yoy }) => ({
      ticker,
      name,
      sector,
      industry,
      marketcap_usd,
      revenue_yoy
    }));
  return { query: text(query), companies };
}

export function loadRankings({ sort = "heat_score", layer, state, search, limit = 100 }) {
  if (!rankingSortFields.has(sort)) {
    throw ontologyError(`Unsupported ontology ranking sort: ${sort}`, "ontology_invalid_sort");
  }
  const payload = loadPayload("fixed:rankings_all");
  const layerFilter = text(layer).toLowerCase();
  const stateFilter = text(state).toLowerCase();
  const searchFilter = text(search).toLowerCase();
  let companies = (payload.companies || []).filter((row) => {
    if (layerFilter && text(row.primary_layer).toLowerCase() !== layerFilter) return false;
    if (stateFilter && text(row.signal_state).toLowerCase() !== stateFilter) return false;
    if (searchFilter && !`${text(row.ticker)} ${text(row.name)}`.toLowerCase().includes(searchFilter)) {
      return false;
    }
    return true;
  });
  companies = sortRows(companies, (row) => rankingSortValue(row, sort));
  companies = companies.slice(0, boundedInteger(limit, 100, 1, 200));
  return { sort, count: companies.length, companies };
}

export function loadCompany(ticker, asOf = null) {
  const normalized = text(ticker).toUpperCase();
  const payload = loadPayload(`company:${normalized}`);
  if (!asOf) return payload;
  const date = isoDate(asOf);
  const snapshot = loadPayload(`snapshot:${date}`, { optional: true });
  const company = snapshot?.companies?.find((row) => text(row.ticker).toUpperCase() === normalized);
  if (!company) return payload;
  return {
    ...payload,
    company: { ...payload.company, ...company },
    history: (payload.history || []).filter((row) => text(row.datekey || row.reportperiod).slice(0, 10) <= date)
  };
}

export function loadFixedOntologyPayload(name) {
  return loadPayload(`fixed:${name}`);
}

export function loadOntologySnapshot(asOf) {
  return loadPayload(`snapshot:${isoDate(asOf)}`);
}

export function registerOntologyRoutes(app) {
  const send = (response, callback) => {
    try {
      response.setHeader("Cache-Control", "private, max-age=300");
      response.json(callback());
    } catch (error) {
      const status = error.code === "ontology_invalid_date" || error.code === "ontology_invalid_sort"
        ? 400
        : error.code === "ontology_payload_missing"
          ? 404
          : 503;
      response.status(status).json({ error: error.code || "ontology_error", message: error.message });
    }
  };

  app.get("/api/ontology/health", (_request, response) => send(response, ontologySnapshotInfo));
  app.get("/api/ontology/overview", (_request, response) => send(response, loadOntologyOverview));
  app.get("/api/decision/overview", (_request, response) => send(response, loadOntologyOverview));
  app.get("/api/decision/snapshot", (request, response) => send(response, () => loadDecisionSnapshot({
    asOf: request.query.as_of,
    sector: request.query.sector,
    limit: request.query.limit
  })));
  app.get("/api/decision/company/:ticker", (request, response) => send(response, () => loadDecisionCompany(request.params.ticker)));

  app.get("/api/market/health", (_request, response) => send(response, ontologySnapshotInfo));
  app.get("/api/market/home", (_request, response) => send(response, () => loadFixedOntologyPayload("market_home")));
  app.get("/api/market/groups/:groupId", (request, response) => send(response, () => loadMarketGroup(request.params.groupId)));
  app.get("/api/market/groups/:groupId/snapshot", (request, response) => send(response, () => loadMarketGroupSnapshot(request.params.groupId, request.query.as_of)));
  app.get("/api/market/groups/:groupId/companies", (request, response) => send(response, () => loadMarketGroupCompanies({
    groupId: request.params.groupId,
    industry: request.query.industry,
    stage: request.query.stage,
    search: request.query.search,
    sort: request.query.sort,
    limit: request.query.limit,
    offset: request.query.offset
  })));
  app.get("/api/market/companies/:ticker", (request, response) => send(response, () => loadMarketCompany(request.params.ticker)));
  app.get("/api/market/search", (request, response) => send(response, () => searchMarketCompanies(request.query.q, request.query.limit)));

  app.get("/api/overview", (_request, response) => send(response, () => loadFixedOntologyPayload("overview")));
  app.get("/api/graph", (_request, response) => send(response, () => loadFixedOntologyPayload("graph")));
  app.get("/api/methodology", (_request, response) => send(response, () => loadFixedOntologyPayload("methodology")));
  app.get("/api/timeline", (_request, response) => send(response, () => loadFixedOntologyPayload("timeline")));
  app.get("/api/rankings", (request, response) => send(response, () => loadRankings(request.query)));
  app.get("/api/company/:ticker", (request, response) => send(response, () => loadCompany(request.params.ticker, request.query.as_of)));
  app.get("/api/snapshot", (request, response) => send(response, () => loadOntologySnapshot(request.query.as_of)));
}
