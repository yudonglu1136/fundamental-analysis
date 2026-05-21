#!/usr/bin/env node
import {
  deleteHistoryPoint,
  getPortfolioSnapshot,
  saveHistoryPoint,
} from "../apps/api/src/services/portfolioService.mjs";
import { fetchFxRateWithCache, normalizeYahooPriceQuote } from "../apps/api/src/services/portfolioMarketData.mjs";

const OWNER_EMAIL = "luyudong1136@gmail.com";
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function approxEqual(actual, expected, tolerance = 0.05) {
  return Math.abs(Number(actual) - expected) <= tolerance;
}

const lsegPenceQuote = normalizeYahooPriceQuote("LSEG", 9274, "GBp", { exchangeName: "LSE" });
const gbpUsdRate = await fetchFxRateWithCache("GBP", "USD", { maxAgeMs: 24 * 60 * 60 * 1000 });

const ownerSnapshot = getPortfolioSnapshot({
  auth: { claims: { localDev: true } },
  user: { id: "local-dev-user", email: "local-dev@fundamental-analysis.test" },
});

const isolatedSnapshot = getPortfolioSnapshot({
  auth: { claims: {} },
  user: { id: "portfolio-validation-user", email: "portfolio-validation@example.com" },
});
const firstNavRequest = {
  auth: { claims: {} },
  user: { id: "portfolio-first-nav-validation-user", email: "portfolio-first-nav-validation@example.com" },
};
deleteHistoryPoint(firstNavRequest, "portfolio-history-2001-02-01");
const firstNavBefore = getPortfolioSnapshot(firstNavRequest);
const firstNavAfterSave = await saveHistoryPoint(firstNavRequest, {
  date: "2001-02-01",
  portfolioValue: 12345,
  cashFunds: 678,
  source: "validation_first_nav",
});
const firstNavAfterDelete = deleteHistoryPoint(firstNavRequest, "portfolio-history-2001-02-01");
const ownerLsegHolding = ownerSnapshot.holdings.find((holding) => holding.symbol === "LSEG");

assert(ownerSnapshot.account.email === OWNER_EMAIL, `Expected local dev portfolio owner ${OWNER_EMAIL}.`);
assert(ownerSnapshot.account.seededFromWorkbook === true, "Owner account should be seeded from the workbook.");
assert(ownerSnapshot.history.length >= 12, `Expected at least 12 owner history rows, found ${ownerSnapshot.history.length}.`);
assert(ownerSnapshot.history[0]?.date === "2025-06-01", `Expected first history month 2025-06-01, found ${ownerSnapshot.history[0]?.date}.`);
assert(ownerSnapshot.history.at(-1)?.date >= "2026-05-01", `Expected owner history to cover at least 2026-05-01, found ${ownerSnapshot.history.at(-1)?.date}.`);
assert(Number(ownerSnapshot.summary.latestPortfolioValue) > 0, "Latest owner portfolio value should be positive.");
assert(approxEqual(ownerSnapshot.summary.totalDeposited, 112066.46), `Unexpected total deposits ${ownerSnapshot.summary.totalDeposited}.`);

assert(isolatedSnapshot.account.email !== OWNER_EMAIL, "Validation account should not resolve to owner email.");
assert(isolatedSnapshot.account.accountKey !== ownerSnapshot.account.accountKey, "Different emails must map to different account databases.");
assert(isolatedSnapshot.account.seededFromWorkbook === false, "Non-owner account must not be seeded from the owner workbook.");
assert(isolatedSnapshot.history.length === 0, `Non-owner account should not see owner history rows, found ${isolatedSnapshot.history.length}.`);
assert(firstNavBefore.account.email !== OWNER_EMAIL, "First-NAV validation account should not resolve to owner email.");
assert(firstNavBefore.history.length === 0, `First-NAV validation account should start empty, found ${firstNavBefore.history.length}.`);
assert(firstNavAfterSave.history.length === 1, `First NAV save should create one isolated history row, found ${firstNavAfterSave.history.length}.`);
assert(
  approxEqual(firstNavAfterSave.history[0]?.portfolioValue, 12345),
  `First NAV save wrote unexpected value ${firstNavAfterSave.history[0]?.portfolioValue}.`,
);
assert(firstNavAfterDelete.history.length === 0, "First-NAV validation cleanup should remove the test row.");
assert(lsegPenceQuote.currency === "GBP", `LSEG GBp quote should normalize to GBP, found ${lsegPenceQuote.currency}.`);
assert(approxEqual(lsegPenceQuote.price, 92.74, 0.001), `LSEG 9274 GBp should normalize to 92.74 GBP, found ${lsegPenceQuote.price}.`);
assert(gbpUsdRate.rate > 1 && gbpUsdRate.rate < 2, `GBP/USD rate should be a usable USD conversion rate, found ${gbpUsdRate.rate}.`);
if (ownerLsegHolding) {
  assert(ownerLsegHolding.marketValueCurrency === "GBP", `Owner LSEG local market value should be GBP, found ${ownerLsegHolding.marketValueCurrency}.`);
  assert(ownerLsegHolding.baseCurrency === "USD", `Owner LSEG base currency should be USD, found ${ownerLsegHolding.baseCurrency}.`);
  assert(
    Number(ownerLsegHolding.marketValueBase) > Number(ownerLsegHolding.marketValue),
    `Owner LSEG USD market value should exceed GBP local value, found ${ownerLsegHolding.marketValueBase} vs ${ownerLsegHolding.marketValue}.`,
  );
}

const output = {
  ok: failures.length === 0,
  owner: {
    email: ownerSnapshot.account.email,
    historyRows: ownerSnapshot.history.length,
    latestMonth: ownerSnapshot.summary.latestMonth,
    latestPortfolioValue: ownerSnapshot.summary.latestPortfolioValue,
    totalDeposited: ownerSnapshot.summary.totalDeposited,
  },
  isolationCheck: {
    email: isolatedSnapshot.account.email,
    historyRows: isolatedSnapshot.history.length,
    distinctAccountKey: isolatedSnapshot.account.accountKey !== ownerSnapshot.account.accountKey,
  },
  firstNavCheck: {
    email: firstNavBefore.account.email,
    beforeRows: firstNavBefore.history.length,
    afterSaveRows: firstNavAfterSave.history.length,
    afterCleanupRows: firstNavAfterDelete.history.length,
  },
  lsePenceCheck: {
    symbol: "LSEG",
    rawPrice: 9274,
    rawCurrency: "GBp",
    normalizedPrice: lsegPenceQuote.price,
    normalizedCurrency: lsegPenceQuote.currency,
    gbpUsdRate: gbpUsdRate.rate,
    sampleUsdValue: lsegPenceQuote.price * 200 * gbpUsdRate.rate,
  },
  failures,
};

console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
