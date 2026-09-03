import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { tickerResolutionForHolding } from "./cusipOverrides.js";
import {
  guruSecurityForCusip,
  guruSecurityMasterEntries,
  guruSecurityMasterSummary,
  guruSecurityMasterVersion,
  loadGuruSecurityMaster
} from "./guruSecurityMaster.js";
import { sp500PriceTickerForCusip } from "./sp500ValuationUniverse.js";

test("Guru security master is exact, unique, public-source-audited, and versioned", () => {
  const summary = guruSecurityMasterSummary();
  assert.equal(summary.schemaVersion, 2);
  assert.equal(summary.identifierProvider, "OpenFIGI");
  assert.equal(summary.holdingProvider, "U.S. Securities and Exchange Commission");
  assert.equal(
    summary.holdingManifestPolicy,
    "direct_official_sec_submissions_and_archive_documents_no_derived_cache"
  );
  assert.equal(
    summary.holdingSelectionPolicy,
    "top_60_common_long_shares_excluding_explicit_non_common_titles_by_reported_value_per_filing"
  );
  assert.match(summary.holdingManifestRecordsSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    summary.holdingManifestPath,
    "server/config/guru-sec-cusip-manifest.json",
    "the packaged runtime must not depend on a build-machine temporary path"
  );
  assert.match(summary.openFigiResponseSha256, /^[a-f0-9]{64}$/);
  assert.match(summary.providerValidationResponseSha256, /^[a-f0-9]{64}$/);
  assert.match(summary.recordsSha256, /^[a-f0-9]{64}$/);
  assert.match(summary.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(summary.resolvedCusips, guruSecurityMasterEntries().length);
  assert.equal(
    summary.observedCusips,
    summary.resolvedCusips + summary.unresolvedCusips + summary.ambiguousCusips
  );
  assert.equal(
    guruSecurityMasterVersion(),
    `openfigi-sec-v2-${summary.recordsSha256.slice(0, 16)}`
  );
  assert.equal(guruSecurityForCusip(" 888787108 ")?.ticker, "TOST");
  assert.equal(guruSecurityForCusip("not-a-cusip"), null);
});

test("public security master is fallback-only and never auto-adjudicates curated conflicts", () => {
  for (const [cusip, ticker] of [
    ["278768106", "ECHO"],
    ["337738108", "FISV"],
    ["571748102", "MRSH"],
    ["21036P108", "STZ"]
  ]) {
    assert.equal(sp500PriceTickerForCusip(cusip), ticker);
    assert.deepEqual(tickerResolutionForHolding({ cusip }), {
      status: "resolved",
      ticker,
      securityId: null,
      source: "sp500_valuation_manifest",
      rule: "exact_cusip",
      candidates: [ticker]
    });
  }
  const toast = guruSecurityForCusip("888787108");
  assert.deepEqual(tickerResolutionForHolding({ cusip: "888787108" }), {
    status: "resolved",
    ticker: "TOST",
    securityId: toast.securityId,
    source: "guru_security_master",
    rule: "exact_cusip_openfigi_us_equity_provider_validated",
    candidates: ["TOST"]
  });
});

test("all curated and S&P CUSIP collisions are explicitly aligned", async () => {
  for (const [cusip, security] of guruSecurityMasterEntries()) {
    const resolution = tickerResolutionForHolding({ cusip });
    assert.notEqual(resolution.status, "conflict", `${cusip}: ${resolution.candidates.join(",")}`);
    assert.equal(
      resolution.ticker,
      security.ticker,
      `${cusip}: runtime ${resolution.ticker} must match audited master ${security.ticker}`
    );
  }
});

test("runtime hard-fails when the required artifact is missing, corrupt, or tampered", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guru-master-loader-test-"));
  const missing = path.join(directory, "missing.json");
  assert.throws(() => loadGuruSecurityMaster(missing), /required artifact is missing or unreadable/i);

  const corrupt = path.join(directory, "corrupt.json");
  fs.writeFileSync(corrupt, "{not-json");
  assert.throws(() => loadGuruSecurityMaster(corrupt), /artifact JSON is corrupt/i);

  const tampered = path.join(directory, "tampered.json");
  const payload = JSON.parse(fs.readFileSync(guruSecurityMasterSummary().masterPath, "utf8"));
  payload.securities[0].ticker = `${payload.securities[0].ticker}X`;
  fs.writeFileSync(tampered, JSON.stringify(payload));
  assert.throws(() => loadGuruSecurityMaster(tampered), /records hash mismatch/i);

  const future = path.join(directory, "future.json");
  const futurePayload = JSON.parse(fs.readFileSync(guruSecurityMasterSummary().masterPath, "utf8"));
  futurePayload.generatedAt = "2999-01-01T00:00:00Z";
  fs.writeFileSync(future, JSON.stringify(futurePayload));
  assert.throws(() => loadGuruSecurityMaster(future), /materially in the future/i);
});
