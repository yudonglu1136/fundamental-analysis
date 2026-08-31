import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";

import {
  compactTickerDetail,
  valuationDetailLevel
} from "./valuationClient.js";

function syntheticTicker() {
  const history = Array.from({ length: 64 }, (_, index) => ({
    periodId: `period-${index}`,
    label: `FY${2010 + Math.floor(index / 4)} Q${(index % 4) + 1}`,
    asOfDate: `${2010 + Math.floor(index / 4)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    fiscalYear: 2010 + Math.floor(index / 4),
    fiscalQuarter: `Q${(index % 4) + 1}`,
    currentPrice: 40 + index,
    fairValue: 45 + index,
    upsideDownside: 0.1,
    targetPrice3Y: 60 + index,
    expectedReturn3Y: 0.12,
    priceDate: "2026-08-28",
    priceAtDate: 40 + index,
    methodOutputs: Array.from({ length: 8 }, (_, methodIndex) => ({
      key: `method-${methodIndex}`,
      value: index * 10 + methodIndex,
      description: `period-${index}-method-${methodIndex}-full-research-explanation`
    })),
    dataSnapshot: {
      selectedFinancialPeriod: {
        periodEndDate: "2026-06-30",
        sourceType: "synthetic-full-research-source"
      },
      evidence: Array.from({ length: 40 }, (_, evidenceIndex) => ({
        metricName: `metric-${evidenceIndex}`,
        excerpt: `period-${index}-evidence-${evidenceIndex}-${(index + 17) * (evidenceIndex + 31)}`
      })),
      youtubeEarnings: {
        qa: Array.from({ length: 10 }, (_, qaIndex) => ({
          question: `question-${index}-${qaIndex}`,
          answer: `answer-${index}-${qaIndex}-${(index + 3) * (qaIndex + 5)}`
        }))
      },
      valuationSemantics: {
        fairValueFormula: "full formula retained only by the full response",
        scoreInputs: {
          revenueGuidanceM: 10_000 + index,
          valuationRevenue: 9_500 + index,
          fcfGuidanceM: 2_100 + index,
          valuationFreeCashFlow: 2_000 + index,
          ttmFreeCashFlow: 1_900 + index,
          methodWeights: { dcf: 0.5, earnings: 0.5 },
          manyOtherFullResearchInputs: Array.from(
            { length: 30 },
            (_, inputIndex) => `input-${index}-${inputIndex}`
          )
        }
      }
    }
  }));

  return {
    generatedAt: "2026-08-30T00:00:00.000Z",
    ticker: "TEST",
    key: "test",
    name: "Test Company",
    sector: "Information services",
    currency: "USD",
    description: "Synthetic valuation fixture",
    cik: "0000000001",
    latest: {
      latestPrice: 100,
      baseFairValue: 120,
      upsideToBase: 0.2,
      targetPrice3Y: 150
    },
    priceHistory: Array.from({ length: 900 }, (_, index) => ({
      date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
      close: 50 + index / 10,
      open: 49 + index / 10,
      high: 51 + index / 10,
      low: 48 + index / 10,
      volume: 1_000_000 + index * 101
    })),
    history,
    methodCards: [{ key: "dcf", description: "full method card" }],
    warnings: ["full warning"],
    podcastInsights: [{ summary: "full podcast note" }],
    dataQuality: { pricePoints: 900, valuationCoverageKind: "full" }
  };
}

test("valuation detail level is opt-in summary and defaults to compatible full", () => {
  assert.equal(valuationDetailLevel("summary"), "summary");
  assert.equal(valuationDetailLevel("SUMMARY"), "summary");
  assert.equal(valuationDetailLevel(undefined), "full");
  assert.equal(valuationDetailLevel("unexpected"), "full");
});

test("summary keeps overview inputs while full research remains lossless", () => {
  const ticker = syntheticTicker();
  const full = compactTickerDetail(ticker, { pricePoints: 900, detail: "full" });
  const summary = compactTickerDetail(ticker, {
    pricePoints: 300,
    detail: "summary"
  });

  assert.strictEqual(full, ticker);
  assert.deepEqual(full.history[0].dataSnapshot, ticker.history[0].dataSnapshot);
  assert.equal(summary.ticker, ticker.ticker);
  assert.deepEqual(summary.latest, ticker.latest);
  assert.equal(summary.history.length, ticker.history.length);
  assert.equal(summary.priceHistory.length, 300);
  assert.equal(summary.dataQuality.pricePointsAvailable, 900);
  assert.equal(summary.dataQuality.pricePointsReturned, 300);
  assert.equal(
    summary.history.at(-1).dataSnapshot.valuationSemantics.scoreInputs.valuationFreeCashFlow,
    ticker.history.at(-1).dataSnapshot.valuationSemantics.scoreInputs.valuationFreeCashFlow
  );
  assert.equal("methodOutputs" in summary.history[0], false);
  assert.equal("youtubeEarnings" in summary.history[0].dataSnapshot, false);
  assert.equal("methodCards" in summary, false);
  assert.equal("podcastInsights" in summary, false);
});

test("summary payload stays within the initial-view byte budget", () => {
  const ticker = syntheticTicker();
  const fullJson = JSON.stringify(
    compactTickerDetail(ticker, { pricePoints: 900, detail: "full" })
  );
  const summaryJson = JSON.stringify(
    compactTickerDetail(ticker, { pricePoints: 300, detail: "summary" })
  );
  const fullBytes = Buffer.byteLength(fullJson);
  const summaryBytes = Buffer.byteLength(summaryJson);
  const fullGzipBytes = gzipSync(fullJson).byteLength;
  const summaryGzipBytes = gzipSync(summaryJson).byteLength;

  assert.ok(summaryBytes <= 150_000, `summary is ${summaryBytes} bytes`);
  assert.ok(
    summaryBytes <= fullBytes * 0.35,
    `summary/full raw ratio is ${(summaryBytes / fullBytes).toFixed(3)}`
  );
  assert.ok(
    summaryGzipBytes <= fullGzipBytes * 0.55,
    `summary/full gzip ratio is ${(summaryGzipBytes / fullGzipBytes).toFixed(3)}`
  );
});
