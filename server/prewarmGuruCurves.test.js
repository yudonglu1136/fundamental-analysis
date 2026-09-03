import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gurus } from "./gurus.js";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const prewarmScript = path.join(repoRoot, "scripts", "prewarm-guru-curves.mjs");
const generation = "a".repeat(64);
const strictMethodVersion = "strict-v1";
const proxyMethodVersion = "proxy-v1";
const securityMasterVersion = "security-v1";
const expectedManagerIds = gurus.filter((guru) =>
  guru.type === "manager13f" && !guru.disableSimulation
).map((guru) => guru.id);
const expectedManagerCount = expectedManagerIds.length;
const expectedCurveRows = expectedManagerCount * 2;

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function runPrewarm({
  port,
  output,
  marker,
  notBefore,
  refreshTimeoutMs,
  statusRequestTimeoutMs,
  idlePollIntervalMs
}) {
  const argumentsList = [
    prewarmScript,
    `--base-url=http://127.0.0.1:${port}`,
    "--windows=5,10",
    `--refresh-generation=${generation}`,
    `--not-before=${notBefore}`,
    `--strict-method-version=${strictMethodVersion}`,
    `--proxy-method-version=${proxyMethodVersion}`,
    `--security-master-version=${securityMasterVersion}`,
    `--output=${output}`,
    `--success-marker=${marker}`
  ];
  if (refreshTimeoutMs) argumentsList.push(`--refresh-timeout-ms=${refreshTimeoutMs}`);
  if (statusRequestTimeoutMs) {
    argumentsList.push(`--status-request-timeout-ms=${statusRequestTimeoutMs}`);
  }
  if (idlePollIntervalMs) {
    argumentsList.push(`--idle-poll-interval-ms=${idlePollIntervalMs}`);
  }
  const child = spawn(process.execPath, argumentsList, {
    cwd: repoRoot,
    env: { ...process.env, INTERNAL_CRON_SECRET: "test-secret" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
  });
}

test("prewarm uses the explicit loopback client instead of fetch's hidden header timeout", () => {
  const source = fs.readFileSync(prewarmScript, "utf8");
  assert.match(source, /requestLoopbackJson/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.match(source, /DEFAULT_REFRESH_TIMEOUT_MS = 25 \* 60 \* 1000/);
});

function managerResults(years, refreshGeneration, generatedAt = new Date().toISOString()) {
  return Array.from({ length: expectedManagerCount }, (_, index) => {
    const proxy = index >= 8;
    return {
      guruId: expectedManagerIds[index],
      guruType: "manager13f",
      disabled: false,
      years,
      status: proxy ? "proxy_ready" : "ready",
      generatedAt,
      methodVersion: strictMethodVersion,
      securityMasterVersion,
      proxyMethodVersion: proxy ? proxyMethodVersion : "",
      proxySecurityMasterVersion: proxy ? securityMasterVersion : "",
      refreshGeneration
    };
  });
}

function healthPayload() {
  return {
    modules: [{
      id: "guru_backtests",
      details: {
        curveAvailability: {
          ok: true,
          expectedRows: expectedCurveRows,
          displayable: expectedCurveRows,
          failures: []
        }
      }
    }]
  };
}

test("prewarm writes its success marker only after both windows cover every configured manager", async (context) => {
  const requestedGenerations = [];
  const requestedPopulations = [];
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/health") {
      response.end(JSON.stringify(healthPayload()));
      return;
    }
    if (url.pathname === "/api/internal/backtests/status") {
      response.end(JSON.stringify({ running: false }));
      return;
    }
    if (url.pathname === "/api/internal/backtests/refresh") {
      const refreshGeneration = url.searchParams.get("refreshGeneration");
      const years = Number(url.searchParams.get("years"));
      requestedGenerations.push(refreshGeneration);
      requestedPopulations.push(url.searchParams.get("population"));
      response.end(JSON.stringify({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        ok: 8,
        failed: 10,
        proxyAvailable: 10,
        errors: [],
        refreshGeneration,
        results: managerResults(years, refreshGeneration)
      }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const output = path.join(tempDir, "report.json");
  const marker = path.join(tempDir, "done.json");
  const result = await runPrewarm({
    port: server.address().port,
    output,
    marker,
    notBefore: new Date(Date.now() - 1000).toISOString()
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(requestedGenerations, [`${generation}:5`, `${generation}:10`]);
  assert.deepEqual(requestedPopulations, ["enabled-manager13f", "enabled-manager13f"]);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).pass, true);
  assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).displayable, expectedCurveRows);
});

test("prewarm retries a transient idle-status response timeout within the refresh deadline", async (context) => {
  let statusRequests = 0;
  let refreshRequests = 0;
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/health") {
      response.end(JSON.stringify(healthPayload()));
      return;
    }
    if (url.pathname === "/api/internal/backtests/status") {
      statusRequests += 1;
      if (statusRequests === 2) {
        setTimeout(() => response.end(JSON.stringify({ running: false })), 100);
        return;
      }
      response.end(JSON.stringify({ running: false }));
      return;
    }
    if (url.pathname === "/api/internal/backtests/refresh") {
      refreshRequests += 1;
      const refreshGeneration = url.searchParams.get("refreshGeneration");
      const years = Number(url.searchParams.get("years"));
      response.end(JSON.stringify({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        refreshGeneration,
        results: managerResults(years, refreshGeneration)
      }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-idle-retry-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const marker = path.join(tempDir, "done.json");
  const result = await runPrewarm({
    port: server.address().port,
    output: path.join(tempDir, "report.json"),
    marker,
    notBefore: new Date(Date.now() - 1000).toISOString(),
    refreshTimeoutMs: 300,
    statusRequestTimeoutMs: 20,
    idlePollIntervalMs: 5
  });

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.ok(statusRequests >= 4, `expected retry plus window checks, received ${statusRequests}`);
  assert.equal(refreshRequests, 2);
  assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).displayable, expectedCurveRows);
});

test("prewarm fails immediately when idle-status returns non-2xx", async (context) => {
  let statusRequests = 0;
  let refreshRequests = 0;
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/internal/backtests/status") {
      statusRequests += 1;
      response.statusCode = statusRequests === 1 ? 200 : 503;
      response.end(JSON.stringify({ running: false }));
      return;
    }
    if (url.pathname === "/api/internal/backtests/refresh") refreshRequests += 1;
    response.statusCode = 404;
    response.end("{}");
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-idle-http-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const result = await runPrewarm({
    port: server.address().port,
    output: path.join(tempDir, "report.json"),
    marker: path.join(tempDir, "done.json"),
    notBefore: new Date(Date.now() - 1000).toISOString(),
    refreshTimeoutMs: 300,
    statusRequestTimeoutMs: 20,
    idlePollIntervalMs: 5
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Guru refresh status returned HTTP 503/);
  assert.equal(statusRequests, 2);
  assert.equal(refreshRequests, 0);
});

test("prewarm bounds idle-status retries by the refresh timeout", async (context) => {
  let statusRequests = 0;
  let refreshRequests = 0;
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/internal/backtests/status") {
      statusRequests += 1;
      if (statusRequests === 1) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ running: false }));
      }
      return;
    }
    if (url.pathname === "/api/internal/backtests/refresh") refreshRequests += 1;
    response.statusCode = 404;
    response.end("{}");
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-idle-deadline-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const startedAt = Date.now();
  const result = await runPrewarm({
    port: server.address().port,
    output: path.join(tempDir, "report.json"),
    marker: path.join(tempDir, "done.json"),
    notBefore: new Date(Date.now() - 1000).toISOString(),
    refreshTimeoutMs: 80,
    statusRequestTimeoutMs: 20,
    idlePollIntervalMs: 5
  });
  const elapsedMs = Date.now() - startedAt;

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /did not finish within 80ms/);
  assert.match(result.stderr, /Last transport error: ETIMEDOUT/);
  assert.ok(statusRequests >= 3, `expected multiple bounded retries, received ${statusRequests}`);
  assert.equal(refreshRequests, 0);
  assert.ok(elapsedMs < 1000, `deadline exceeded test budget: ${elapsedMs}ms`);
});

test("old green health cannot hide a missing current-generation manager result", async (context) => {
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/health") {
      response.end(JSON.stringify(healthPayload()));
    } else if (url.pathname === "/api/internal/backtests/status") {
      response.end(JSON.stringify({ running: false }));
    } else if (url.pathname === "/api/internal/backtests/refresh") {
      const refreshGeneration = url.searchParams.get("refreshGeneration");
      const years = Number(url.searchParams.get("years"));
      response.end(JSON.stringify({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        refreshGeneration,
        results: managerResults(years, refreshGeneration).slice(0, expectedManagerCount - 1)
      }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-incomplete-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const marker = path.join(tempDir, "done.json");
  const result = await runPrewarm({
    port: server.address().port,
    output: path.join(tempDir, "report.json"),
    marker,
    notBefore: new Date(Date.now() - 1000).toISOString()
  });

  assert.notEqual(result.code, 0);
  assert.equal(fs.existsSync(marker), false);
  assert.match(
    result.stderr,
    new RegExp(`${expectedManagerCount - 1}/${expectedManagerCount} unique manager results`)
  );
});

test("an already-running response cannot reuse an old green health state", async (context) => {
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/health") {
      response.end(JSON.stringify(healthPayload()));
    } else if (url.pathname === "/api/internal/backtests/status") {
      response.end(JSON.stringify({ running: false }));
    } else if (url.pathname === "/api/internal/backtests/refresh") {
      response.end(JSON.stringify({ alreadyRunning: true }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-old-green-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const marker = path.join(tempDir, "done.json");
  const result = await runPrewarm({
    port: server.address().port,
    output: path.join(tempDir, "report.json"),
    marker,
    notBefore: new Date(Date.now() - 1000).toISOString()
  });

  assert.notEqual(result.code, 0);
  assert.equal(fs.existsSync(marker), false);
  assert.match(result.stderr, /alreadyRunning=true/);
});

test("HTTP 503 health cannot write a marker even when every Guru curve is available", async (context) => {
  const server = await listen(http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/health") {
      response.statusCode = 503;
      response.end(JSON.stringify(healthPayload()));
    } else if (url.pathname === "/api/internal/backtests/status") {
      response.end(JSON.stringify({ running: false }));
    } else if (url.pathname === "/api/internal/backtests/refresh") {
      const refreshGeneration = url.searchParams.get("refreshGeneration");
      const years = Number(url.searchParams.get("years"));
      response.end(JSON.stringify({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        refreshGeneration,
        results: managerResults(years, refreshGeneration)
      }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  }));
  context.after(() => server.close());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guru-prewarm-health-503-test-"));
  context.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const output = path.join(tempDir, "report.json");
  const marker = path.join(tempDir, "done.json");
  const result = await runPrewarm({
    port: server.address().port,
    output,
    marker,
    notBefore: new Date(Date.now() - 1000).toISOString()
  });

  assert.equal(result.code, 2);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).healthHttpStatus, 503);
});
