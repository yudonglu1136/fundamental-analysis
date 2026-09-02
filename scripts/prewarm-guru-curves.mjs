#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Invalid argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function loopbackBaseUrl(value) {
  const url = new URL(value || "http://127.0.0.1:8080");
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "::1"].includes(url.hostname)) {
    throw new Error("Guru prewarm may connect only to a loopback HTTP origin.");
  }
  url.pathname = "/";
  url.search = "";
  return url;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function atomicWriteJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const temporary = `${path.resolve(filePath)}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, path.resolve(filePath));
}

async function waitForApi(baseUrl, secret, attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL("api/internal/backtests/status", baseUrl), {
        headers: { authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      if (response.status >= 200 && response.status < 600) return;
    } catch {
      // Elastic Beanstalk can still be switching the application process.
    }
    await delay(2000);
  }
  throw new Error("Local Guru API did not become reachable before prewarm timeout.");
}

async function waitForBulkRefreshIdle(baseUrl, secret, attempts = 720) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(new URL("api/internal/backtests/status", baseUrl), {
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new Error(`Guru refresh status returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    if (!body.running) return;
    await delay(5000);
  }
  throw new Error("An older Guru bulk refresh did not finish before the prewarm timeout.");
}

function validIsoDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function curveAvailability(health) {
  return (health?.modules || []).find((module) => module?.id === "guru_backtests")
    ?.details?.curveAvailability || null;
}

function auditWindowResults(body, {
  years,
  refreshGeneration,
  notBefore,
  strictMethodVersion,
  proxyMethodVersion,
  securityMasterVersion
}) {
  if (body?.refreshGeneration !== refreshGeneration || !Array.isArray(body?.results)) {
    throw new Error(`Guru ${years}Y prewarm response lacks its exact refresh generation results.`);
  }
  const managers = body.results.filter((row) =>
    row?.guruType === "manager13f" && row?.disabled !== true
  );
  const identities = new Set(managers.map((row) => row.guruId));
  if (managers.length !== 18 || identities.size !== 18) {
    throw new Error(`Guru ${years}Y prewarm returned ${managers.length}/18 unique manager results.`);
  }
  const failures = managers.filter((row) => {
    const generatedAt = validIsoDate(row.generatedAt);
    const common = Number(row.years) === years &&
      row.refreshGeneration === refreshGeneration &&
      generatedAt && Date.parse(generatedAt) >= Date.parse(notBefore) &&
      row.methodVersion === strictMethodVersion &&
      row.securityMasterVersion === securityMasterVersion;
    if (!common || !["ready", "proxy_ready"].includes(row.status)) return true;
    return row.status === "proxy_ready" && (
      row.proxyMethodVersion !== proxyMethodVersion ||
      row.proxySecurityMasterVersion !== securityMasterVersion
    );
  });
  if (failures.length) {
    throw new Error(
      `Guru ${years}Y prewarm failed current-generation validation for ${failures.length}/18 managers.`
    );
  }
  return {
    managerCount: managers.length,
    ready: managers.filter((row) => row.status === "ready").length,
    proxyReady: managers.filter((row) => row.status === "proxy_ready").length
  };
}

const options = parseArgs(process.argv.slice(2));
const baseUrl = loopbackBaseUrl(options["base-url"]);
const secret = String(process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || "");
if (!secret) throw new Error("Guru prewarm requires INTERNAL_CRON_SECRET in process memory.");
const refreshGeneration = String(options["refresh-generation"] || "").trim().toLowerCase();
if (!/^[a-f0-9]{64}$/.test(refreshGeneration)) {
  throw new Error("Guru prewarm requires the repair artifact SHA-256 as refresh generation.");
}
const notBefore = validIsoDate(options["not-before"]);
if (!notBefore) throw new Error("Guru prewarm requires a valid post-repair not-before timestamp.");
const strictMethodVersion = String(options["strict-method-version"] || "").trim();
const proxyMethodVersion = String(options["proxy-method-version"] || "").trim();
const securityMasterVersion = String(options["security-master-version"] || "").trim();
if (!strictMethodVersion || !proxyMethodVersion || !securityMasterVersion) {
  throw new Error("Guru prewarm requires strict, proxy, and security-master release identities.");
}
const windows = String(options.windows || "5,10")
  .split(",")
  .map((value) => Number(value.trim()));
if (!windows.length || windows.some((years) => ![5, 10].includes(years)) ||
    new Set(windows).size !== windows.length) {
  throw new Error("Guru prewarm windows must be the unique values 5 and/or 10.");
}

const report = {
  schemaVersion: 1,
  kind: "guru_curve_production_prewarm",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  windows: [],
  healthHttpStatus: null,
  curveAvailability: null,
  pass: false
};
await waitForApi(baseUrl, secret);
for (const years of windows) {
  await waitForBulkRefreshIdle(baseUrl, secret);
  const url = new URL("api/internal/backtests/refresh", baseUrl);
  url.searchParams.set("years", String(years));
  url.searchParams.set("detail", "compact");
  url.searchParams.set("refreshGeneration", `${refreshGeneration}:${years}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.alreadyRunning) {
    throw new Error(
      `Guru ${years}Y prewarm did not execute (HTTP ${response.status}, alreadyRunning=${Boolean(body.alreadyRunning)}).`
    );
  }
  const startedAt = validIsoDate(body.startedAt);
  const finishedAt = validIsoDate(body.finishedAt);
  if (!startedAt || !finishedAt || Date.parse(startedAt) < Date.parse(notBefore)) {
    throw new Error(`Guru ${years}Y prewarm is not bound to the post-repair generation.`);
  }
  const generation = `${refreshGeneration}:${years}`;
  const resultAudit = auditWindowResults(body, {
    years,
    refreshGeneration: generation,
    notBefore,
    strictMethodVersion,
    proxyMethodVersion,
    securityMasterVersion
  });
  const item = {
    years,
    httpStatus: response.status,
    startedAt,
    finishedAt,
    ok: Number(body?.ok || 0),
    failed: Number(body?.failed || 0),
    proxyAvailable: Number(body?.proxyAvailable || 0),
    alreadyRunning: Boolean(body?.alreadyRunning),
    errorCount: Array.isArray(body?.errors) ? body.errors.length : 0,
    ...resultAudit
  };
  report.windows.push(item);
  console.log(JSON.stringify({ status: "window-finished", ...item }));
}

const healthResponse = await fetch(new URL("api/health", baseUrl), {
  redirect: "error",
  signal: AbortSignal.timeout(30_000)
});
const health = await healthResponse.json().catch(() => ({}));
report.healthHttpStatus = healthResponse.status;
report.curveAvailability = curveAvailability(health);
report.pass = Boolean(
  healthResponse.ok &&
  report.curveAvailability?.ok &&
  Number(report.curveAvailability?.expectedRows) === 36 &&
  Number(report.curveAvailability?.displayable) === 36 &&
  Number(report.curveAvailability?.failures?.length || 0) === 0
);
report.finishedAt = new Date().toISOString();
atomicWriteJson(options.output, report);
console.log(JSON.stringify({
  status: report.pass ? "pass" : "fail",
  displayable: Number(report.curveAvailability?.displayable || 0),
  expectedRows: Number(report.curveAvailability?.expectedRows || 0),
  failures: Number(report.curveAvailability?.failures?.length || 0)
}));
if (!report.pass) {
  process.exitCode = 2;
} else if (options["success-marker"]) {
  atomicWriteJson(options["success-marker"], {
    status: "complete",
    recordsSha256: refreshGeneration,
    completedAt: report.finishedAt,
    displayable: report.curveAvailability.displayable,
    expectedRows: report.curveAvailability.expectedRows
  });
}
