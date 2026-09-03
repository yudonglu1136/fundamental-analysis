#!/usr/bin/env node

/**
 * Derive minimum paid-price intervals from the same official SEC histories,
 * execution calendar, top-60 selection, and corporate-action policy used by
 * manager13f backtests. Output contains public schedule metadata only.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedExpectedStatuses = ["ready", "proxy_ready"];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`Invalid argument: ${argument}`);
    options[match[1]] = match[2];
  }
  return options;
}

function normalizedDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid ISO date: ${date || "<empty>"}.`);
  }
  return date;
}

function yearsAgo(end, years) {
  const date = new Date(`${end}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is missing.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is unreadable or corrupt: ${error.message}`);
  }
}

function writeJsonExclusive(filePath, payload) {
  const resolved = path.resolve(filePath);
  if (isWithin(resolved, repository)) {
    throw new Error("Active-price plans must be generated outside the repository.");
  }
  if (fs.existsSync(resolved)) throw new Error("Refusing to overwrite an existing plan.");
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
}

function readSpyDates(database, start, end) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return db.prepare(`
      SELECT date
      FROM price_points
      WHERE symbol = 'SPY' AND date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(start, end).map((row) => String(row.date));
  } finally {
    db.close();
  }
}

export function inclusivePlanIntervals(window, spyDates) {
  const intervals = Array.isArray(window?.intervals) ? window.intervals : [];
  return intervals.map((interval) => {
    const dates = spyDates.filter((date) => date >= interval.start &&
      (interval.endExclusive ? date < interval.endExclusive : date <= interval.end));
    if (!dates.length) return null;
    return {
      startDate: dates[0],
      endDate: dates.at(-1),
      ...(interval.endExclusive ? { sourceEndExclusive: interval.endExclusive } : {})
    };
  }).filter(Boolean);
}

export function normalizeExplicitRefreshTargets(rawTargets, requiredWindows) {
  const windows = [...new Set((requiredWindows || []).map(Number))]
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
  if (!windows.length) throw new Error("Required Guru curve windows are missing.");
  if (!Array.isArray(rawTargets) || !rawTargets.length) {
    throw new Error(
      "Active-price target manifest requires explicit per-Guru/window refreshTargets."
    );
  }
  const targetIdentities = new Set();
  const targets = rawTargets.map((target, index) => {
    const guruId = String(target?.guruId || "").trim();
    const years = Number(target?.years);
    const expectedStatus = String(target?.expectedStatus || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(guruId) ||
        !Number.isInteger(years) || !windows.includes(years) ||
        !allowedExpectedStatuses.includes(expectedStatus)) {
      throw new Error(
        `Active-price refresh target ${index} must explicitly declare a valid ` +
        "guruId, required window, and expectedStatus (ready or proxy_ready)."
      );
    }
    const identity = `${guruId}:${years}`;
    if (targetIdentities.has(identity)) {
      throw new Error(`Duplicate active-price refresh target: ${identity}.`);
    }
    targetIdentities.add(identity);
    return { guruId, years, expectedStatus };
  }).sort((left, right) =>
    left.guruId.localeCompare(right.guruId) || left.years - right.years
  );
  const guruIds = [...new Set(targets.map((target) => target.guruId))].sort();
  for (const guruId of guruIds) {
    const declaredWindows = targets
      .filter((target) => target.guruId === guruId)
      .map((target) => target.years)
      .sort((left, right) => left - right);
    if (declaredWindows.length !== windows.length ||
        declaredWindows.some((years, index) => years !== windows[index])) {
      throw new Error(
        `Active-price refresh targets for ${guruId} must explicitly declare every ` +
        `required window: ${windows.map((years) => `${years}Y`).join(", ")}.`
      );
    }
  }
  return targets;
}

export function validateActivePriceTargetManifest(payload, requiredWindows) {
  if (payload?.schemaVersion !== 2 || payload?.kind !== "guru_active_price_targets" ||
      !Array.isArray(payload.targets) || !payload.targets.length) {
    throw new Error(
      "Active-price target manifest must use schemaVersion 2 with explicit refreshTargets."
    );
  }
  if (Object.hasOwn(payload, "refreshGuruIds")) {
    throw new Error(
      "Legacy refreshGuruIds is not accepted; declare expectedStatus for every Guru/window."
    );
  }
  const targets = payload.targets.map((target, index) => {
    const symbol = String(target?.symbol || "").trim().toUpperCase();
    const guruIds = [...new Set(
      (Array.isArray(target?.guruIds) ? target.guruIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )].sort();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || !guruIds.length ||
        guruIds.some((guruId) => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(guruId))) {
      throw new Error(`Active-price target ${index} is invalid.`);
    }
    return { symbol, guruIds };
  });
  const refreshTargets = normalizeExplicitRefreshTargets(
    payload.refreshTargets,
    requiredWindows
  );
  const affectedGuruIds = new Set(targets.flatMap((target) => target.guruIds));
  const refreshGuruIds = new Set(refreshTargets.map((target) => target.guruId));
  const untargetedGuruIds = [...affectedGuruIds]
    .filter((guruId) => !refreshGuruIds.has(guruId))
    .sort();
  if (untargetedGuruIds.length) {
    throw new Error(
      `Active-price series lack explicit refresh targets for: ${untargetedGuruIds.join(", ")}.`
    );
  }
  return { targets, refreshTargets };
}

async function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  const database = path.resolve(options.database || "");
  const targetsPath = path.resolve(options.targets || "");
  const output = path.resolve(options.output || "");
  const endDate = normalizedDate(options["end-date"]);
  const years = Number(options.years || 10);
  if (years !== 10) throw new Error("The catalog release plan must replicate the required 10Y window.");
  if (!fs.existsSync(database) || !fs.statSync(database).isFile()) {
    throw new Error("--database must identify the read-only candidate SQLite database.");
  }
  const startDate = yearsAgo(endDate, years);
  const spyDates = readSpyDates(database, startDate, endDate);
  const calendarLag = (left, right) => Math.round(
    (new Date(`${right}T00:00:00.000Z`) - new Date(`${left}T00:00:00.000Z`)) / 86400000
  );
  if (spyDates.length < 30 ||
      calendarLag(startDate, spyDates[0]) > 7 ||
      calendarLag(spyDates.at(-1), endDate) > 7 ||
      spyDates.some((date, index) => index > 0 &&
        calendarLag(spyDates[index - 1], date) > 7)) {
    throw new Error("Candidate SPY does not cover the exact requested 10Y calendar window.");
  }
  const targetsPayload = readJson(targetsPath, "Active-price target manifest");
  // SEC loading imports localDatabase for shared cache helpers. Point it at a
  // disposable scratch database so plan derivation cannot mutate the candidate.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "guru-active-price-plan-"));
  process.env.SQLITE_DB_PATH = path.join(scratch, "scratch.sqlite");
  process.env.PRICE_CACHE_DIR = path.join(scratch, "prices");
  process.env.SYNC_BUNDLED_VALUATION_SNAPSHOTS = "false";
  process.env.SYNC_BUNDLED_GURU_BACKTESTS = "false";
  process.env.SYNC_BUNDLED_DIVIDEND_CALENDAR = "false";
  process.env.SYNC_BUNDLED_PODCAST_INSIGHTS = "false";
  try {
    const [{ gurus, expectedGuruCurveRows, requiredGuruCurveWindows }, {
      load13fHoldingHistory
    }, {
      filingExecutionDecision
    }, {
      collapseSupersededSameSessionSnapshots,
      manager13fActivePriceWindows
    }, {
      manager13fBacktestMethodVersion,
      manager13fProxyMethodVersion,
      manager13fSecurityMasterVersion,
      manager13fPriceRequirements
    }, {
      selectUnambiguous13fOriginals
    }] = await Promise.all([
      import("../server/gurus.js"),
      import("../server/secClient.js"),
      import("../server/backtestEngine.js"),
      import("../server/backtestSchedule.js"),
      import("../server/backtest.js"),
      import("../server/thirteenF.js")
    ]);
    const { targets, refreshTargets } = validateActivePriceTargetManifest(
      targetsPayload,
      requiredGuruCurveWindows
    );
    const refreshGuruIds = [...new Set(refreshTargets.map((target) => target.guruId))].sort();
    const known = new Map(gurus.map((guru) => [guru.id, guru]));
    for (const guruId of new Set([...refreshGuruIds, ...targets.flatMap((row) => row.guruIds)])) {
      const guru = known.get(guruId);
      if (!guru || guru.type !== "manager13f" || guru.disableSimulation) {
        throw new Error(`Target identifies an unknown or disabled manager13f Guru: ${guruId}.`);
      }
    }

    const windowsByGuru = new Map();
    const managerAudit = [];
    for (const guruId of [...new Set(targets.flatMap((row) => row.guruIds))].sort()) {
      const guru = known.get(guruId);
      const rawHistory = await load13fHoldingHistory(guru, { years: 10, limit: 44 });
      const history = selectUnambiguous13fOriginals(rawHistory).history;
      const candidates = history.map((snapshot) => {
        const decision = filingExecutionDecision(snapshot, spyDates);
        const requirements = decision.executionDate
          ? manager13fPriceRequirements(
              snapshot,
              decision.executionDate,
              { guruId: guru.id }
            )
          : [];
        return {
          snapshot,
          decision,
          selectedTickers: requirements.map((row) => row.ticker),
          selectedPriceRequirements: requirements
        };
      }).filter((candidate) => candidate.decision.executionDate);
      const normalized = collapseSupersededSameSessionSnapshots(candidates);
      const windows = manager13fActivePriceWindows(normalized.schedule, endDate);
      windowsByGuru.set(guruId, windows);
      managerAudit.push({
        guruId,
        rawHistory: rawHistory.length,
        normalizedHistory: history.length,
        executionSchedule: normalized.schedule.length,
        sameSessionExclusions: normalized.exclusions.length,
        firstExecution: normalized.schedule[0]?.decision?.executionDate || null,
        lastExecution: normalized.schedule.at(-1)?.decision?.executionDate || null
      });
    }

    const series = [];
    const missingTargets = [];
    for (const target of targets) {
      for (const guruId of target.guruIds) {
        const window = windowsByGuru.get(guruId)?.get(target.symbol);
        const intervals = inclusivePlanIntervals(window, spyDates);
        if (!intervals.length) {
          missingTargets.push({ symbol: target.symbol, guruId });
          continue;
        }
        for (const interval of intervals) {
          series.push({
            symbol: target.symbol,
            startDate: interval.startDate,
            endDate: interval.endDate,
            affectedGuruIds: [guruId]
          });
        }
      }
    }
    if (missingTargets.length) {
      throw new Error(
        `Target symbols are absent from modeled active schedules: ${JSON.stringify(missingTargets)}`
      );
    }
    series.sort((left, right) =>
      left.symbol.localeCompare(right.symbol) ||
      left.startDate.localeCompare(right.startDate) ||
      left.affectedGuruIds[0].localeCompare(right.affectedGuruIds[0])
    );
    const payload = {
      schemaVersion: 1,
      kind: "guru_sharadar_price_repair_plan",
      generatedFrom: {
        source: "official SEC 13F information tables",
        policy: "manager13f_10y_modeled_active_price_windows",
        years,
        startDate,
        endDate,
        refreshTargetContract: {
          mode: "explicit_per_guru_window",
          targetManifestSchemaVersion: 2,
          targetManifestSha256: sha256Json(targetsPayload),
          refreshTargetsSha256: sha256Json(refreshTargets),
          allowedExpectedStatuses,
          requiredWindows: [...requiredGuruCurveWindows].sort((left, right) => left - right),
          targetCount: refreshTargets.length,
          proxyTargets: refreshTargets.filter(
            (target) => target.expectedStatus === "proxy_ready"
          )
        },
        managerAudit
      },
      series,
      refreshTargets,
      expectations: {
        strictMethodVersion: manager13fBacktestMethodVersion,
        proxyMethodVersion: manager13fProxyMethodVersion,
        securityMasterVersion: manager13fSecurityMasterVersion,
        expectedDisplayableRows: expectedGuruCurveRows
      }
    };
    writeJsonExclusive(output, payload);
    process.stdout.write(`${JSON.stringify({
      status: "built_active_price_plan",
      output,
      managers: managerAudit.length,
      series: series.length,
      symbols: [...new Set(series.map((row) => row.symbol))].length,
      startDate,
      endDate
    })}\n`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
