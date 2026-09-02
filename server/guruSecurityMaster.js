import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const defaultMasterPath = path.join(process.cwd(), "server/config/guru-security-master.json");
const masterPath = process.env.GURU_SECURITY_MASTER_PATH || defaultMasterPath;

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

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

function securityMasterError(message, filePath) {
  const error = new Error(`Guru security master rejected: ${message} (${filePath})`);
  error.code = "GURU_SECURITY_MASTER_INVALID";
  return error;
}

function requiredArray(master, field, filePath) {
  if (!Array.isArray(master[field])) {
    throw securityMasterError(`${field} must be an array`, filePath);
  }
  return master[field];
}

export function loadGuruSecurityMaster(filePath = masterPath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw securityMasterError(`required artifact is missing or unreadable: ${error.message}`, filePath);
  }

  let master;
  try {
    master = JSON.parse(raw);
  } catch (error) {
    throw securityMasterError(`artifact JSON is corrupt: ${error.message}`, filePath);
  }
  if (master?.schemaVersion !== 2) {
    throw securityMasterError(`schemaVersion must be 2, received ${master?.schemaVersion ?? "missing"}`, filePath);
  }
  const generatedAtMs = Date.parse(master?.generatedAt || "");
  if (!Number.isFinite(generatedAtMs) || generatedAtMs > Date.now() + 5 * 60 * 1000) {
    throw securityMasterError("generatedAt is missing, invalid, or materially in the future", filePath);
  }
  if (master?.source?.identifierProvider !== "OpenFIGI") {
    throw securityMasterError("identifierProvider must be OpenFIGI", filePath);
  }
  if (master?.source?.holdingManifestPolicy !==
      "direct_official_sec_submissions_and_archive_documents_no_derived_cache") {
    throw securityMasterError("holding input is not an official SEC-source manifest", filePath);
  }
  if (master?.source?.holdingSelectionPolicy !==
      "top_60_common_long_shares_excluding_explicit_non_common_titles_by_reported_value_per_filing") {
    throw securityMasterError("holding input does not match the top-60 common-long engine scope", filePath);
  }
  if (!/^[a-f0-9]{64}$/.test(master?.source?.holdingManifestRecordsSha256 || "")) {
    throw securityMasterError("holding manifest hash is missing", filePath);
  }
  const holdingManifestReference = String(master?.source?.holdingManifestPath || "").trim();
  if (!holdingManifestReference) {
    throw securityMasterError("holding manifest path is missing", filePath);
  }
  const holdingManifestPath = path.isAbsolute(holdingManifestReference)
    ? holdingManifestReference
    : path.join(process.cwd(), holdingManifestReference);
  let holdingManifest;
  try {
    holdingManifest = JSON.parse(fs.readFileSync(holdingManifestPath, "utf8"));
  } catch (error) {
    throw securityMasterError(
      `official SEC holding manifest is missing or corrupt: ${error.message}`,
      holdingManifestPath
    );
  }
  const holdingGeneratedAtMs = Date.parse(holdingManifest?.generatedAt || "");
  if (!Number.isFinite(holdingGeneratedAtMs) || holdingGeneratedAtMs > Date.now() + 5 * 60 * 1000) {
    throw securityMasterError(
      "official SEC holding manifest generatedAt is missing, invalid, or materially in the future",
      holdingManifestPath
    );
  }
  const holdingRecords = {
    managers: holdingManifest?.managers,
    filings: holdingManifest?.filings,
    cusips: holdingManifest?.cusips
  };
  const holdingRecordsSha256 = sha256(stableJson(holdingRecords));
  if (holdingManifest?.sourcePolicy !== master.source.holdingManifestPolicy ||
      holdingManifest?.holdingSelectionPolicy !== master.source.holdingSelectionPolicy ||
      holdingManifest?.recordsSha256 !== holdingRecordsSha256 ||
      holdingRecordsSha256 !== master.source.holdingManifestRecordsSha256) {
    throw securityMasterError("official SEC holding manifest lineage/hash mismatch", holdingManifestPath);
  }

  const securities = requiredArray(master, "securities", filePath);
  const unresolved = requiredArray(master, "unresolved", filePath);
  const ambiguous = requiredArray(master, "ambiguous", filePath);
  const records = { securities, unresolved, ambiguous };
  const actualRecordsSha256 = sha256(stableJson(records));
  if (!/^[a-f0-9]{64}$/.test(master.recordsSha256 || "") ||
      master.recordsSha256 !== actualRecordsSha256) {
    throw securityMasterError(
      `records hash mismatch; expected ${master.recordsSha256 || "missing"}, ` +
      `calculated ${actualRecordsSha256}`,
      filePath
    );
  }

  const byCusip = new Map();
  const partition = new Map();
  const markPartition = (rawRow, bucket) => {
    const cusip = normalize(rawRow?.cusip);
    if (!/^[A-Z0-9]{8,9}$/.test(cusip)) {
      throw securityMasterError(`${bucket} contains invalid CUSIP ${cusip || "<empty>"}`, filePath);
    }
    if (partition.has(cusip)) {
      throw securityMasterError(
        `CUSIP ${cusip} appears in both ${partition.get(cusip)} and ${bucket}`,
        filePath
      );
    }
    partition.set(cusip, bucket);
    return cusip;
  };

  for (const rawRow of securities) {
    const cusip = markPartition(rawRow, "securities");
    const ticker = normalize(rawRow?.ticker);
    const securityId = String(rawRow?.securityId || "").trim();
    if (!ticker || !securityId) {
      throw securityMasterError(`resolved CUSIP ${cusip} lacks ticker/securityId`, filePath);
    }
    if (rawRow?.exchangeCode !== "US" || rawRow?.providerValidation?.status !== "available") {
      throw securityMasterError(
        `resolved CUSIP ${cusip} lacks US-composite/provider validation`,
        filePath
      );
    }
    byCusip.set(cusip, {
      ...rawRow,
      cusip,
      ticker,
      securityId,
      relatedTickers: []
    });
  }
  for (const row of unresolved) markPartition(row, "unresolved");
  for (const row of ambiguous) markPartition(row, "ambiguous");

  const observed = Number(master?.selection?.observedCusips);
  if (!Number.isInteger(observed) || observed !== partition.size ||
      Number(master?.selection?.resolvedCusips) !== byCusip.size ||
      Number(master?.selection?.unresolvedCusips) !== unresolved.length ||
      Number(master?.selection?.ambiguousCusips) !== ambiguous.length) {
    throw securityMasterError("selection counts do not reconcile to record partitions", filePath);
  }

  return {
    master,
    byCusip,
    masterPath: filePath,
    artifactSha256: sha256(raw),
    recordsSha256: actualRecordsSha256
  };
}

const loaded = loadGuruSecurityMaster();

export function guruSecurityForCusip(value) {
  return loaded.byCusip.get(normalize(value)) || null;
}

export function guruSecurityMasterEntries() {
  return [...loaded.byCusip.entries()];
}

export function guruSecurityMasterVersion() {
  return `openfigi-sec-v2-${loaded.recordsSha256.slice(0, 16)}`;
}

export function guruSecurityMasterSummary() {
  const { master } = loaded;
  return {
    schemaVersion: master.schemaVersion,
    generatedAt: master.generatedAt || null,
    matchingPolicy: master.matchingPolicy || null,
    identifierProvider: master.source.identifierProvider,
    identifierApiUrl: master.source.identifierApiUrl || null,
    identifierDocumentationUrl: master.source.identifierDocumentationUrl || null,
    identifierOpenDataBenefitsUrl: master.source.identifierOpenDataBenefitsUrl || null,
    identifierTermsUrl: master.source.identifierTermsUrl || null,
    identifierLicense: master.source.identifierLicense || null,
    holdingProvider: master.source.holdingProvider || null,
    holdingManifestPolicy: master.source.holdingManifestPolicy,
    holdingManifestPath: master.source.holdingManifestPath,
    holdingSelectionPolicy: master.source.holdingSelectionPolicy,
    holdingManifestRecordsSha256: master.source.holdingManifestRecordsSha256,
    openFigiResponseSha256: master.source.openFigiResponseSha256 || null,
    providerValidationResponseSha256: master.source.providerValidationResponseSha256 || null,
    observedCusips: Number(master.selection.observedCusips),
    resolvedCusips: loaded.byCusip.size,
    unresolvedCusips: master.unresolved.length,
    ambiguousCusips: master.ambiguous.length,
    recordsSha256: loaded.recordsSha256,
    artifactSha256: loaded.artifactSha256,
    securityMasterVersion: guruSecurityMasterVersion(),
    masterPath: loaded.masterPath
  };
}
