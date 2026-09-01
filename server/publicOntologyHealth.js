import { publicOntologySnapshotInfo } from "./ontologyClient.js";

const DEFAULT_TIMEOUT_MS = 2500;
const EXPECTED_SERVICE = "ontology-api";
const EXPECTED_SCHEMA_VERSION = 2;

function text(value) {
  return String(value || "").trim();
}

function validDate(value) {
  return Boolean(text(value) && Number.isFinite(Date.parse(value)));
}

function externalFailure(message) {
  return {
    ok: false,
    exists: false,
    sizeBytes: 0,
    mode: "external",
    verified: false,
    service: "",
    expectedService: EXPECTED_SERVICE,
    error: message
  };
}

export function validateOntologyHealthUrl(value, environment = process.env.NODE_ENV || "development") {
  const raw = text(value);
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ONTOLOGY_HEALTH_URL must be an absolute URL.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error("ONTOLOGY_HEALTH_URL must not contain credentials, a query, or a fragment.");
  }
  if (url.pathname !== "/ontology-health") {
    throw new Error("ONTOLOGY_HEALTH_URL must target the dedicated /ontology-health endpoint.");
  }
  const localDevelopment = environment !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("ONTOLOGY_HEALTH_URL must use HTTPS outside local development.");
  }
  return url;
}

export function externalOntologyHealthErrors(payload) {
  const errors = [];
  const manifest = payload?.manifest;
  const responseCount = Number(payload?.responseCount);
  const jsonBytes = Number(payload?.jsonBytes);
  if (payload?.service !== EXPECTED_SERVICE) errors.push(`service must be ${EXPECTED_SERVICE}`);
  if (payload?.ok !== true) errors.push("upstream health must report ok=true");
  if (payload?.exists !== true) errors.push("upstream snapshot must exist");
  if (!(Number(payload?.sizeBytes) > 0)) errors.push("upstream snapshot must be non-empty");
  if (!Number.isInteger(responseCount) || responseCount <= 0) {
    errors.push("upstream response count must be a positive integer");
  }
  if (!Number.isInteger(jsonBytes) || jsonBytes <= 0) {
    errors.push("upstream JSON byte count must be a positive integer");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("upstream manifest must be an object");
    return errors;
  }
  if (Number(manifest.schema_version) !== EXPECTED_SCHEMA_VERSION) {
    errors.push(`upstream schema version must be ${EXPECTED_SCHEMA_VERSION}`);
  }
  if (!validDate(manifest.generated_at)) errors.push("upstream generated_at must be a valid timestamp");
  if (!validDate(manifest.financial_as_of)) errors.push("upstream financial_as_of must be a valid date");
  if (!validDate(manifest.decision_latest)) errors.push("upstream decision_latest must be a valid date");
  if (Number(manifest.responses) !== responseCount) {
    errors.push("upstream manifest response count must match snapshot metadata");
  }
  if (Number(manifest.uncompressed_json_bytes) !== jsonBytes) {
    errors.push("upstream manifest JSON byte count must match snapshot metadata");
  }
  if (Number(manifest.critical_failure_count || 0) > 0) {
    errors.push("upstream manifest records critical export failures");
  }
  return errors;
}

export async function resolvePublicOntologyHealth({
  healthUrl = process.env.ONTOLOGY_HEALTH_URL,
  environment = process.env.NODE_ENV || "development",
  fetchImpl = globalThis.fetch,
  localReader = publicOntologySnapshotInfo,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  let url;
  try {
    url = validateOntologyHealthUrl(healthUrl, environment);
  } catch (error) {
    return externalFailure(error.message);
  }

  if (!url) {
    try {
      const local = localReader();
      return {
        ...local,
        mode: "local",
        verified: local?.ok === true
      };
    } catch (error) {
      return {
        ok: false,
        exists: false,
        sizeBytes: 0,
        mode: "local",
        verified: false,
        error: `Local Ontology health check failed: ${error.message}`
      };
    }
  }

  if (typeof fetchImpl !== "function") {
    return externalFailure("Delegated Ontology health transport is unavailable.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    if (!response?.ok) {
      return externalFailure(`Delegated Ontology health returned HTTP ${response?.status || "unknown"}.`);
    }
    const payload = await response.json();
    const errors = externalOntologyHealthErrors(payload);
    if (errors.length) {
      return externalFailure(`Delegated Ontology health failed validation: ${errors.join("; ")}`);
    }
    return {
      ok: true,
      exists: true,
      sizeBytes: Number(payload.sizeBytes),
      updatedAt: payload.updatedAt || null,
      responseCount: Number(payload.responseCount),
      jsonBytes: Number(payload.jsonBytes),
      manifest: payload.manifest,
      mode: "external",
      verified: true,
      service: EXPECTED_SERVICE
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timed out" : "was unreachable";
    return externalFailure(`Delegated Ontology health ${reason}.`);
  } finally {
    clearTimeout(timer);
  }
}
