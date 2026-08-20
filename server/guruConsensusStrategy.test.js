import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.SQLITE_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "guru-consensus-test-")), "test.sqlite");

const {
  buildConsensusRebalances,
  mergeManagerTopHoldings,
  runConsensusBacktest
} = await import(`./guruConsensusStrategy.js?test=${Date.now()}`);

function filing(executionDate, tickers) {
  return {
    reportDate: executionDate,
    filingDate: executionDate,
    executionDate,
    topHoldings: tickers.map((ticker) => ({ ticker, issuer: `${ticker} Inc.` }))
  };
}

function sources() {
  return new Map([
    ["gavin-baker", { rebalances: [filing("2024-01-02", ["AAA", "BBB", "CCC"]), filing("2024-02-01", ["HHH", "AAA", "BBB"])] }],
    ["bill-ackman", { rebalances: [filing("2024-01-02", ["BBB", "DDD", "EEE"])] }],
    ["stanley-druckenmiller", { rebalances: [filing("2024-01-02", ["AAA", "FFF", "GGG"])] }]
  ]);
}

test("merges duplicate Top 3 holdings and preserves every manager source", () => {
  const rebalances = buildConsensusRebalances(sources());
  assert.equal(rebalances.length, 2);
  assert.equal(rebalances[0].holdings.length, 7);
  assert.ok(rebalances[0].holdings.every((row) => Math.abs(row.weight - 1 / 7) < 1e-12));

  const aaa = rebalances[0].holdings.find((row) => row.ticker === "AAA");
  const bbb = rebalances[0].holdings.find((row) => row.ticker === "BBB");
  assert.deepEqual(aaa.managerNames, ["Gavin Baker", "Stanley Druckenmiller"]);
  assert.deepEqual(bbb.managerNames, ["Gavin Baker", "Bill Ackman"]);
  assert.equal(rebalances[0].holdings.filter((row) => row.ticker === "AAA").length, 1);
});

test("rebalances when one manager files and keeps the other managers' latest Top 3", () => {
  const rebalances = buildConsensusRebalances(sources());
  const latest = rebalances[1];
  assert.equal(latest.executionDate, "2024-02-01");
  assert.deepEqual(latest.updatedManagers, ["Gavin Baker"]);
  assert.ok(latest.holdings.some((row) => row.ticker === "HHH"));
  assert.ok(latest.holdings.some((row) => row.ticker === "DDD"));
  assert.ok(latest.holdings.some((row) => row.ticker === "FFF"));
  assert.equal(latest.holdings.filter((row) => row.ticker === "AAA").length, 1);
});

test("runs a daily NAV backtest with equal-weight unique holdings", () => {
  const dates = Array.from({ length: 45 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 2 + index));
    return date.toISOString().slice(0, 10);
  });
  const priceReader = (ticker, start, end) => dates
    .filter((date) => date >= start && date <= end)
    .map((date, index) => ({
      symbol: ticker,
      date,
      close: ticker === "SPY" ? 100 + index * 0.1 : 100 + index
    }));
  const result = runConsensusBacktest({ sourceBacktests: sources(), priceReader });

  assert.equal(result.nav.length, 45);
  assert.equal(result.rebalances.length, 2);
  assert.equal(result.rebalances[0].holdings.length, 7);
  assert.ok(result.strategyMetrics.total_return > result.benchmarkMetrics.total_return);
  assert.ok(result.rebalances[0].holdings.every((row) => Math.abs(row.weight - 1 / 7) < 1e-12));
});

test("lets weights drift between filing-driven rebalances", () => {
  const dates = Array.from({ length: 31 }, (_, index) => (
    new Date(Date.UTC(2024, 0, 2 + index)).toISOString().slice(0, 10)
  ));
  const priceReader = (ticker) => dates.map((date, index) => ({
    symbol: ticker,
    date,
    close: ticker === "AAA" ? 100 * (1.1 ** index) : 100
  }));
  const sourceBacktests = new Map([
    ["gavin-baker", { rebalances: [filing("2024-01-02", ["AAA", "BBB", "CCC"])] }],
    ["bill-ackman", { rebalances: [filing("2024-01-02", ["BBB", "DDD", "EEE"])] }],
    ["stanley-druckenmiller", { rebalances: [filing("2024-01-02", ["AAA", "FFF", "GGG"])] }]
  ]);
  const result = runConsensusBacktest({ sourceBacktests, priceReader });

  assert.ok(result.nav[2].daily_return > result.nav[1].daily_return);
});

test("merge helper never stacks weight for the same ticker", () => {
  const latest = new Map([
    ["gavin-baker", filing("2024-01-02", ["AAA", "BBB", "CCC"])],
    ["bill-ackman", filing("2024-01-02", ["AAA", "DDD", "EEE"])],
    ["stanley-druckenmiller", filing("2024-01-02", ["AAA", "FFF", "GGG"])]
  ]);
  const holdings = mergeManagerTopHoldings(latest);
  assert.equal(holdings.length, 7);
  assert.equal(holdings.find((row) => row.ticker === "AAA").weight, 1 / 7);
  assert.equal(holdings.find((row) => row.ticker === "AAA").managerNames.length, 3);
});
