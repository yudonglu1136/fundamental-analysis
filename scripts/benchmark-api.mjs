#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function integerArgument(name, fallback) {
  const value = Number.parseInt(argument(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))];
}

function timingStats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    minMs: sorted[0],
    maxMs: sorted.at(-1)
  };
}

const volatileSemanticKeys = new Set(["cache", "generatedAt", "localDatabase"]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !volatileSemanticKeys.has(key))
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function semanticHash(body) {
  const parsed = JSON.parse(body.toString("utf8"));
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(parsed))).digest("hex");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function apiRequest(port, route, { encoding = "gzip, br", etag = "" } = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const call = http.request({
      host: "127.0.0.1",
      port,
      path: route,
      headers: {
        authorization: "Bearer local-dev-token",
        "accept-encoding": encoding,
        ...(etag ? { "if-none-match": etag } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        durationMs: performance.now() - started,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    call.on("error", reject);
    call.end();
  });
}

async function waitUntilReady(port, child, timeoutMs = 20_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Benchmark server exited with ${child.exitCode}`);
    try {
      const response = await apiRequest(port, "/api/health", { encoding: "identity" });
      if (response.status === 200) return performance.now() - started;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Benchmark server was not ready after ${timeoutMs}ms`);
}

async function benchmarkRoute(port, route, { samples, concurrency }) {
  const cold = await apiRequest(port, route);
  if (cold.status !== 200) throw new Error(`${route} cold request returned ${cold.status}`);

  const identity = await apiRequest(port, route, { encoding: "identity" });
  if (identity.status !== 200) throw new Error(`${route} identity request returned ${identity.status}`);
  const decoded = cold.headers["content-encoding"] === "gzip"
    ? gunzipSync(cold.body)
    : cold.headers["content-encoding"] === "br"
      ? brotliDecompressSync(cold.body)
      : cold.body;
  if (semanticHash(decoded) !== semanticHash(identity.body)) {
    throw new Error(`${route} encoded response changed JSON semantics`);
  }

  for (let index = 0; index < 5; index += 1) await apiRequest(port, route);
  const sequential = [];
  for (let index = 0; index < samples; index += 1) {
    sequential.push(await apiRequest(port, route));
  }

  const concurrentRows = [];
  const concurrentStarted = performance.now();
  for (let offset = 0; offset < samples; offset += concurrency) {
    concurrentRows.push(...await Promise.all(
      Array.from({ length: Math.min(concurrency, samples - offset) }, () => apiRequest(port, route))
    ));
  }
  const concurrentElapsedMs = performance.now() - concurrentStarted;
  const failed = [...sequential, ...concurrentRows].filter((row) => row.status !== 200);
  if (failed.length) throw new Error(`${route} produced ${failed.length} failed requests`);

  const etag = sequential.at(-1).headers.etag || "";
  const conditional = etag ? await apiRequest(port, route, { etag }) : null;
  return {
    route,
    coldMs: cold.durationMs,
    status: cold.status,
    contentEncoding: cold.headers["content-encoding"] || "identity",
    vary: cold.headers.vary || "",
    identityBytes: identity.body.length,
    encodedBytes: cold.body.length,
    reductionPct: identity.body.length
      ? (1 - cold.body.length / identity.body.length) * 100
      : 0,
    semanticSha256: semanticHash(identity.body),
    conditionalStatus: conditional?.status || null,
    sequential: timingStats(sequential.map((row) => row.durationMs)),
    concurrent: {
      concurrency,
      requests: concurrentRows.length,
      rps: concurrentRows.length / (concurrentElapsedMs / 1000),
      ...timingStats(concurrentRows.map((row) => row.durationMs))
    }
  };
}

function processRssBytes(pid) {
  try {
    const rssKb = Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim());
    return Number.isFinite(rssKb) ? rssKb * 1024 : null;
  } catch {
    return null;
  }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const project = path.resolve(argument("project", process.cwd()));
const database = path.resolve(argument("database", path.join(project, "server/data/guru-analysis.sqlite")));
const ontology = path.resolve(argument("ontology", path.join(project, "server/data/ontology-snapshot.sqlite")));
const output = argument("output");
const label = argument("label", "unlabeled");
const samples = integerArgument("samples", 50);
const concurrency = integerArgument("concurrency", 20);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "guru-api-benchmark-"));
const benchmarkDatabase = path.join(temporaryDirectory, "guru-analysis.sqlite");
fs.copyFileSync(database, benchmarkDatabase);

const port = await freePort();
const logs = [];
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: project,
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    API_AUTH_DEV_BYPASS: "true",
    PORTFOLIO_NAV_AUTO_CAPTURE: "false",
    DIVIDEND_CALENDAR_AUTO_REFRESH: "false",
    GURU_BACKTEST_AUTO_REFRESH: "false",
    BACKTEST_STALE_BACKGROUND_REFRESH: "false",
    SYNC_BUNDLED_VALUATION_SNAPSHOTS: "false",
    SYNC_BUNDLED_GURU_BACKTESTS: "false",
    SYNC_BUNDLED_DIVIDEND_CALENDAR: "false",
    SYNC_BUNDLED_PODCAST_INSIGHTS: "false",
    SQLITE_DB_PATH: benchmarkDatabase,
    ONTOLOGY_SNAPSHOT_PATH: ontology
  },
  stdio: ["ignore", "pipe", "pipe"]
});
child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

try {
  const startupReadyMs = await waitUntilReady(port, child);
  const routes = [
    "/api/valuation",
    "/api/valuation/LSEG?pricePoints=900",
    "/api/gurus",
    "/api/backtests?years=all&detail=compact",
    "/api/ontology/overview",
    "/api/graph"
  ];
  const results = [];
  for (const route of routes) {
    results.push(await benchmarkRoute(port, route, { samples, concurrency }));
  }
  const report = {
    schemaVersion: 1,
    label,
    generatedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim(),
    workingTreeDirty: execFileSync("git", ["status", "--porcelain"], {
      cwd: project,
      encoding: "utf8"
    }).trim().length > 0,
    runtime: { node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch() },
    inputs: {
      databaseBytes: fs.statSync(database).size,
      databaseSha256: await hashFile(database),
      ontologyBytes: fs.statSync(ontology).size,
      ontologySha256: await hashFile(ontology),
      samples,
      concurrency
    },
    process: {
      startupReadyMs,
      rssBytes: processRssBytes(child.pid)
    },
    routes: results
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n${logs.join("").slice(-4000)}`);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
