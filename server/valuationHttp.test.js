import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createValuationTickerHandler, ValuationNotCoveredError } from "./valuationHttp.js";

async function endpoint(t, load) {
  const app = express();
  app.get("/api/valuation/:ticker", createValuationTickerHandler(load));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (ticker, query = "") => fetch(`http://127.0.0.1:${server.address().port}/api/valuation/${encodeURIComponent(ticker)}${query}`);
}

test("missing CRDO publication has a typed, non-cacheable coverage response", async (t) => {
  let reads = 0;
  const get = await endpoint(t, async (ticker) => {
    reads++;
    throw new ValuationNotCoveredError(ticker);
  });
  const response = await get("CRDO");
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "valuation_not_covered", ticker: "CRDO", coverageStatus: "not_published",
    message: "No released valuation model is available for this security."
  });
  assert.equal(reads, 1);
});

test("storage and JSON failures are 503, not false missing coverage or leaked diagnostics", async (t) => {
  const get = await endpoint(t, async () => { throw new Error("private/path.sqlite secret details"); });
  const response = await get("CRDO");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "valuation_request_failed", ticker: "CRDO",
    message: "The valuation service is temporarily unavailable."
  });
});

test("a generic not-found exception is not evidence of issuer coverage", async (t) => {
  const get = await endpoint(t, async () => { throw new Error("Valuation ticker not found: CRDO"); });
  assert.equal((await get("CRDO")).status, 503);
});

test("published response preserves summary/full options, identity and cache contract", async (t) => {
  const payload = { ticker: { ticker: "CRDO", latest: { baseFairValue: 123 } } }; // Synthetic only.
  const get = await endpoint(t, async (ticker, options) => {
    assert.equal(ticker, "CRDO");
    assert.deepEqual(options, { detail: "summary", pricePoints: "300" });
    return payload;
  });
  const response = await get("crdo", "?detail=summary&pricePoints=300");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, max-age=120");
  assert.deepEqual(await response.json(), payload);
});

test("invalid symbols never resolve by stripping characters to a different security", async (t) => {
  const get = await endpoint(t, () => assert.fail("invalid ticker reached the model reader"));
  for (const ticker of ["CRDO!", "../CRDO", "CRDO MSFT", "A".repeat(21)]) {
    const response = await get(ticker);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_valuation_ticker" });
  }
});
