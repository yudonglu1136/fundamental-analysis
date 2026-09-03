import crypto from "node:crypto";

import {
  expectedGuruCurveRows,
  requiredGuruCurveWindows
} from "./gurus.js";

const maximumSeries = 64;
const maximumRowsPerSeries = 5000;
const maximumTotalRows = 20_000;
const requiredGuruCurveWindowSet = new Set(requiredGuruCurveWindows);

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

function exactStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function positive(value) {
  return finite(value) && Number(value) > 0;
}

function nonnegative(value) {
  return finite(value) && Number(value) >= 0;
}

function completePoint(point) {
  return point &&
    positive(point.open) &&
    positive(point.high) &&
    positive(point.low) &&
    positive(point.close) &&
    positive(point.adjustedClose) &&
    nonnegative(point.volume);
}

function numericallyMatches(left, right) {
  return Math.abs(Number(left) - Number(right)) <=
    Math.max(1e-6, Math.abs(Number(right)) * 1e-6);
}

function pointMatches(existing, expected) {
  return ["open", "high", "low", "close", "adjustedClose"].every((field) =>
    numericallyMatches(existing[field], expected[field])
  ) && Number(existing.volume) === Number(expected.volume);
}

function canonicalRow(row) {
  return {
    date: String(row?.date || "").trim(),
    open: Number(row?.open),
    high: Number(row?.high),
    low: Number(row?.low),
    close: Number(row?.close),
    adjustedClose: Number(row?.adjustedClose),
    volume: Number(row?.volume)
  };
}

function canonicalSeries(series) {
  return {
    symbol: String(series?.symbol || "").trim().toUpperCase(),
    startDate: String(series?.startDate || "").trim(),
    endDate: String(series?.endDate || "").trim(),
    provider: String(series?.provider || "").trim().toLowerCase(),
    reason: String(series?.reason || "").trim(),
    sourceReference: String(series?.sourceReference || "").trim(),
    affectedGuruIds: exactStrings(series?.affectedGuruIds).sort(),
    rows: (Array.isArray(series?.rows) ? series.rows : []).map(canonicalRow)
  };
}

function canonicalRefreshTarget(target) {
  return {
    guruId: String(target?.guruId || "").trim(),
    years: Number(target?.years),
    expectedStatus: String(target?.expectedStatus || "").trim().toLowerCase()
  };
}

function canonicalExpectations(expectations) {
  return {
    strictMethodVersion: String(expectations?.strictMethodVersion || "").trim(),
    proxyMethodVersion: String(expectations?.proxyMethodVersion || "").trim(),
    securityMasterVersion: String(expectations?.securityMasterVersion || "").trim(),
    expectedDisplayableRows: Number(expectations?.expectedDisplayableRows)
  };
}

function canonicalRelease(release) {
  return {
    releaseId: String(release?.releaseId || "").trim(),
    sourceVolumeId: String(release?.sourceVolumeId || "").trim().toLowerCase(),
    sourceSnapshotId: String(release?.sourceSnapshotId || "").trim().toLowerCase(),
    encryptedSnapshotId: String(release?.encryptedSnapshotId || "").trim().toLowerCase(),
    operator: String(release?.operator || "").trim()
  };
}

export function guruPriceRepairRowsSha256(rows) {
  return sha256(stableJson((rows || []).map(canonicalRow)));
}

export function guruPriceRepairRecordsSha256(
  series,
  refreshTargets = [],
  expectations = {},
  release = {}
) {
  return sha256(stableJson({
    expectations: canonicalExpectations(expectations),
    release: canonicalRelease(release),
    refreshTargets: (refreshTargets || []).map(canonicalRefreshTarget),
    series: (series || []).map(canonicalSeries)
  }));
}

function validateSeries(raw, index, knownGuruIds) {
  const series = canonicalSeries(raw);
  if (!/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(series.symbol)) {
    throw new Error(`Price-repair series ${index} has an invalid symbol.`);
  }
  if (!series.rows.length || series.rows.length > maximumRowsPerSeries) {
    throw new Error(
      `Price-repair series ${series.symbol} must contain 1-${maximumRowsPerSeries} rows.`
    );
  }
  if (!validDate(series.startDate) || !validDate(series.endDate) ||
      series.startDate > series.endDate) {
    throw new Error(`Price-repair series ${series.symbol} has an invalid interval.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,47}$/.test(series.provider)) {
    throw new Error(`Price-repair series ${series.symbol} has an invalid provider.`);
  }
  if (series.reason.length < 12 || series.reason.length > 240) {
    throw new Error(`Price-repair series ${series.symbol} has an invalid reason.`);
  }
  if (series.sourceReference.length < 8 || series.sourceReference.length > 240) {
    throw new Error(`Price-repair series ${series.symbol} has an invalid source reference.`);
  }
  if (!series.affectedGuruIds.length || series.affectedGuruIds.length > 5) {
    throw new Error(`Price-repair series ${series.symbol} must identify 1-5 affected gurus.`);
  }
  if (knownGuruIds) {
    const unknown = series.affectedGuruIds.filter((guruId) => !knownGuruIds.has(guruId));
    if (unknown.length) {
      throw new Error(
        `Price-repair series ${series.symbol} identifies unknown gurus: ${unknown.join(", ")}.`
      );
    }
  }
  let previousDate = "";
  for (const [rowIndex, row] of series.rows.entries()) {
    if (!validDate(row.date) || row.date < series.startDate || row.date > series.endDate ||
        (previousDate && row.date <= previousDate)) {
      throw new Error(
        `Price-repair series ${series.symbol} row ${rowIndex} is outside the interval or unsorted.`
      );
    }
    if (!completePoint(row) || row.high < Math.max(row.open, row.close, row.low) ||
        row.low > Math.min(row.open, row.close, row.high)) {
      throw new Error(`Price-repair series ${series.symbol} row ${rowIndex} has invalid OHLCV.`);
    }
    previousDate = row.date;
  }
  if (series.rows[0].date !== series.startDate ||
      series.rows.at(-1).date !== series.endDate) {
    throw new Error(`Price-repair series ${series.symbol} does not span its declared interval.`);
  }
  const rowHash = String(raw?.rowsSha256 || "").trim().toLowerCase();
  const actualRowHash = guruPriceRepairRowsSha256(series.rows);
  if (!/^[a-f0-9]{64}$/.test(rowHash) || rowHash !== actualRowHash) {
    throw new Error(`Price-repair series ${series.symbol} row hash does not match.`);
  }
  return { ...series, rowsSha256: actualRowHash };
}

export function validateGuruPriceRepairArtifact(payload, { knownGuruIds } = {}) {
  if (payload?.schemaVersion !== 1 || payload?.kind !== "guru_price_series_repair_batch") {
    throw new Error("Unsupported Guru price-repair artifact schema.");
  }
  const generatedAt = Date.parse(payload.generatedAt || "");
  if (!Number.isFinite(generatedAt) || generatedAt > Date.now() + 5 * 60 * 1000) {
    throw new Error("Guru price-repair artifact generatedAt is invalid or in the future.");
  }
  if (!Array.isArray(payload.series) || !payload.series.length ||
      payload.series.length > maximumSeries) {
    throw new Error(`Guru price-repair artifact must contain 1-${maximumSeries} series.`);
  }
  const known = knownGuruIds ? new Set(knownGuruIds) : null;
  const series = payload.series.map((item, index) => validateSeries(item, index, known));
  const totalRows = series.reduce((sum, item) => sum + item.rows.length, 0);
  if (totalRows > maximumTotalRows) {
    throw new Error(`Guru price-repair artifact exceeds ${maximumTotalRows} total rows.`);
  }
  const identities = new Set();
  for (const item of series) {
    const identity = `${item.symbol}:${item.startDate}:${item.endDate}`;
    if (identities.has(identity)) throw new Error(`Duplicate price-repair series: ${identity}.`);
    identities.add(identity);
  }
  if (!Array.isArray(payload.refreshTargets) || !payload.refreshTargets.length ||
      payload.refreshTargets.length > expectedGuruCurveRows) {
    throw new Error(
      `Guru price-repair artifact must identify 1-${expectedGuruCurveRows} refresh targets.`
    );
  }
  const refreshTargets = payload.refreshTargets.map(canonicalRefreshTarget);
  const targetIdentities = new Set();
  for (const target of refreshTargets) {
    if (!target.guruId || (known && !known.has(target.guruId))) {
      throw new Error(`Guru price-repair artifact has an unknown target: ${target.guruId || "<empty>"}.`);
    }
    if (!requiredGuruCurveWindowSet.has(target.years)) {
      throw new Error(
        `Guru price-repair target ${target.guruId} must use one of the required windows: ` +
        `${requiredGuruCurveWindows.map((years) => `${years}Y`).join(" or ")}.`
      );
    }
    if (!["ready", "proxy_ready"].includes(target.expectedStatus)) {
      throw new Error(`Guru price-repair target ${target.guruId} has an invalid expected status.`);
    }
    const identity = `${target.guruId}:${target.years}`;
    if (targetIdentities.has(identity)) {
      throw new Error(`Duplicate Guru price-repair refresh target: ${identity}.`);
    }
    targetIdentities.add(identity);
  }
  const affectedGuruIds = new Set(series.flatMap((item) => item.affectedGuruIds));
  const targetGuruIds = new Set(refreshTargets.map((target) => target.guruId));
  const untargeted = [...affectedGuruIds].filter((guruId) => !targetGuruIds.has(guruId));
  if (untargeted.length) {
    throw new Error(`Guru price-repair series lack refresh targets for: ${untargeted.join(", ")}.`);
  }
  const expectations = canonicalExpectations(payload.expectations);
  if (!expectations.strictMethodVersion || !expectations.proxyMethodVersion ||
      !expectations.securityMasterVersion ||
      expectations.expectedDisplayableRows !== expectedGuruCurveRows) {
    throw new Error("Guru price-repair artifact has invalid release expectations.");
  }
  const release = canonicalRelease(payload.release);
  if (!/^guru-curves-[A-Za-z0-9._-]{8,80}$/.test(release.releaseId) ||
      !/^vol-[a-f0-9]{8,32}$/.test(release.sourceVolumeId) ||
      !/^snap-[a-f0-9]{8,32}$/.test(release.sourceSnapshotId) ||
      !/^snap-[a-f0-9]{8,32}$/.test(release.encryptedSnapshotId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,79}$/.test(release.operator)) {
    throw new Error("Guru price-repair artifact has invalid bound release context.");
  }
  const expectedHash = String(payload.recordsSha256 || "").trim().toLowerCase();
  const actualHash = guruPriceRepairRecordsSha256(
    series,
    refreshTargets,
    expectations,
    release
  );
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== actualHash) {
    throw new Error("Guru price-repair artifact records hash does not match.");
  }
  return {
    schemaVersion: 1,
    kind: payload.kind,
    generatedAt: new Date(generatedAt).toISOString(),
    recordsSha256: actualHash,
    series,
    refreshTargets,
    expectations,
    release,
    totalRows
  };
}

function pendingGroups(rows, existingByDate, symbol) {
  const groups = [];
  let current = [];
  for (const row of rows) {
    const existing = existingByDate.get(row.date);
    if (completePoint(existing)) {
      if (!pointMatches(existing, row)) {
        throw new Error(`Existing complete row conflicts with artifact: ${symbol} ${row.date}.`);
      }
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    current.push(row);
  }
  if (current.length) groups.push(current);
  return groups;
}

export function applyGuruPriceRepairArtifact(payload, {
  snapshotId,
  snapshotState = "completed",
  operator,
  knownGuruIds,
  readSeries,
  writeBatch
}) {
  if (typeof readSeries !== "function" || typeof writeBatch !== "function") {
    throw new Error("Guru price-repair application requires read and atomic batch-write adapters.");
  }
  const artifact = validateGuruPriceRepairArtifact(payload, { knownGuruIds });
  const result = {
    recordsSha256: artifact.recordsSha256,
    series: artifact.series.length,
    totalRows: artifact.totalRows,
    importedRows: 0,
    verifiedExistingRows: 0,
    auditIds: [],
    refreshTargets: artifact.refreshTargets,
    expectations: artifact.expectations
  };
  const pendingImports = [];
  for (const series of artifact.series) {
    const existing = readSeries(series.symbol, series.startDate, series.endDate) || [];
    const existingByDate = new Map(existing.map((row) => [row.date, row]));
    const groups = pendingGroups(series.rows, existingByDate, series.symbol);
    result.verifiedExistingRows += series.rows.length -
      groups.reduce((sum, group) => sum + group.length, 0);
    for (const rows of groups) {
      pendingImports.push({
        rows,
        symbol: series.symbol,
        startDate: rows[0].date,
        endDate: rows.at(-1).date,
        provider: series.provider,
        reason: series.reason,
        snapshotId,
        snapshotState,
        sourceReference: series.sourceReference,
        operator,
        affectedGuruIds: series.affectedGuruIds
      });
    }
  }
  // The database adapter commits every child import plus the artifact-level
  // records hash ledger in one SQLite transaction.
  const batch = writeBatch(pendingImports, {
    recordsSha256: artifact.recordsSha256,
    ...artifact.release,
    seriesManifest: artifact.series.map((series) => ({
      symbol: series.symbol,
      startDate: series.startDate,
      endDate: series.endDate,
      provider: series.provider,
      affectedGuruIds: series.affectedGuruIds,
      rowCount: series.rows.length,
      rowsSha256: series.rowsSha256
    })),
    refreshTargets: artifact.refreshTargets,
    expectations: artifact.expectations
  });
  const audits = batch?.audits;
  if (!batch?.batchAuditId || !Array.isArray(audits) ||
      (batch.replayed && pendingImports.length !== 0) ||
      (!batch.replayed && audits.length !== pendingImports.length) ||
      Number(batch.groupCount) !== audits.length ||
      audits.some((audit) => !audit?.auditId)) {
      throw new Error("Atomic price-repair batch returned an invalid audit result.");
  }
  result.importedRows = pendingImports.reduce((sum, request) => sum + request.rows.length, 0);
  result.auditIds = audits.map((audit) => audit.auditId);
  result.batchAuditId = batch.batchAuditId;
  result.batchAuditReplayed = Boolean(batch.replayed);
  return result;
}
