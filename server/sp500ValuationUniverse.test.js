import test from "node:test";
import assert from "node:assert/strict";
import {
  sp500AliasEntries,
  sp500CanonicalTicker,
  sp500CusipEntries,
  sp500CompanyTickers,
  sp500PriceTickerForCusip,
  sp500UniverseSummary,
  sp500ValuationProfile
} from "./sp500ValuationUniverse.js";

test("S&P 500 valuation universe is issuer-deduplicated", () => {
  const summary = sp500UniverseSummary();
  const tickers = sp500CompanyTickers();
  assert.equal(summary.securityCount, 503);
  assert.equal(summary.companyCount, 500);
  assert.equal(summary.cusipCount, 503);
  assert.equal(new Set(tickers).size, 500);
  assert.equal(summary.asOf, "2026-08-27");
  assert.ok(tickers.every((ticker) => sp500ValuationProfile(ticker)));
});

test("official S&P security rows provide exact CUSIP-to-price-ticker mappings", () => {
  assert.equal(sp500CusipEntries().length, 503);
  assert.equal(sp500PriceTickerForCusip(" 532457108 "), "LLY");
  assert.equal(sp500PriceTickerForCusip("02079K305"), "GOOGL");
  assert.equal(sp500PriceTickerForCusip("02079K107"), "GOOG");
  assert.equal(sp500PriceTickerForCusip("missing"), "");
});

test("alternate share classes resolve to the selected canonical issuer", () => {
  assert.equal(sp500CanonicalTicker("GOOG"), "GOOGL");
  assert.equal(sp500CanonicalTicker("FOX"), "FOXA");
  assert.equal(sp500CanonicalTicker("NWS"), "NWSA");
  assert.equal(sp500CanonicalTicker("VRMK"), "VMRK");
  assert.deepEqual(sp500AliasEntries().sort(), [
    ["FOX", "FOXA"],
    ["GOOG", "GOOGL"],
    ["NWS", "NWSA"],
    ["VRMK", "VMRK"]
  ]);
});
