import assert from "node:assert/strict";
import test from "node:test";

import {
  externalOntologyHealthErrors,
  resolvePublicOntologyHealth,
  validateOntologyHealthUrl
} from "./publicOntologyHealth.js";

function upstreamPayload() {
  return {
    service: "ontology-api",
    ok: true,
    exists: true,
    sizeBytes: 4096,
    responseCount: 10,
    jsonBytes: 8192,
    updatedAt: "2026-08-30T12:00:00.000Z",
    manifest: {
      schema_version: 2,
      generated_at: "2026-08-30T12:00:00.000Z",
      financial_as_of: "2026-08-28",
      decision_latest: "2026-08-27T00:00:00.000Z",
      responses: 10,
      uncompressed_json_bytes: 8192,
      critical_failure_count: 0
    }
  };
}

test("uses the integrity-checked local reader when delegation is not configured", async () => {
  const payload = upstreamPayload();
  const health = await resolvePublicOntologyHealth({
    healthUrl: "",
    localReader: () => payload
  });
  assert.equal(health.mode, "local");
  assert.equal(health.verified, true);
  assert.equal(health.manifest.financial_as_of, "2026-08-28");
});

test("verifies the dedicated external Ontology health endpoint", async () => {
  let requestedUrl = "";
  const payload = upstreamPayload();
  const health = await resolvePublicOntologyHealth({
    healthUrl: "https://api.thesisforge.tech/ontology-health",
    environment: "production",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      return { ok: true, status: 200, json: async () => payload };
    }
  });
  assert.equal(requestedUrl, "https://api.thesisforge.tech/ontology-health");
  assert.equal(health.mode, "external");
  assert.equal(health.verified, true);
  assert.equal(health.ok, true);
  assert.equal(health.responseCount, 10);
});

test("external delegation fails closed for the wrong endpoint or transport", async () => {
  assert.throws(
    () => validateOntologyHealthUrl("https://api.thesisforge.tech/health", "production"),
    /dedicated \/ontology-health/
  );
  assert.throws(
    () => validateOntologyHealthUrl("https://api.thesisforge.tech/ontology-health/", "production"),
    /dedicated \/ontology-health/
  );
  const insecure = await resolvePublicOntologyHealth({
    healthUrl: "http://api.thesisforge.tech/ontology-health",
    environment: "production"
  });
  assert.equal(insecure.ok, false);
  assert.equal(insecure.verified, false);
  assert.match(insecure.error, /HTTPS/);
});

test("external delegation rejects an unverified or incomplete snapshot response", async () => {
  const payload = upstreamPayload();
  payload.manifest.decision_latest = "";
  payload.responseCount = 9;
  const errors = externalOntologyHealthErrors(payload);
  assert.equal(errors.some((error) => error.includes("decision_latest")), true);
  assert.equal(errors.some((error) => error.includes("response count")), true);

  const health = await resolvePublicOntologyHealth({
    healthUrl: "https://api.thesisforge.tech/ontology-health",
    environment: "production",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload })
  });
  assert.equal(health.ok, false);
  assert.equal(health.verified, false);
  assert.match(health.error, /failed validation/);
});

test("external delegation does not fall back to local data when unreachable", async () => {
  let localReads = 0;
  const health = await resolvePublicOntologyHealth({
    healthUrl: "https://api.thesisforge.tech/ontology-health",
    environment: "production",
    fetchImpl: async () => {
      throw new Error("offline");
    },
    localReader: () => {
      localReads += 1;
      return upstreamPayload();
    }
  });
  assert.equal(health.ok, false);
  assert.equal(health.mode, "external");
  assert.equal(localReads, 0);
});

test("external delegation times out and remains fail-closed", async () => {
  const health = await resolvePublicOntologyHealth({
    healthUrl: "https://api.thesisforge.tech/ontology-health",
    environment: "production",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  });
  assert.equal(health.ok, false);
  assert.equal(health.verified, false);
  assert.match(health.error, /timed out/);
});
