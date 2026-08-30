import test from "node:test";
import assert from "node:assert/strict";
import { classifyMaterialTransition } from "./valuationTemporalAudit.js";

function row({
  ticker = "TEST",
  period,
  date,
  fairValue,
  shares = 100,
  revenue = 1000,
  netIncome = 100,
  fcf = 100,
  operatingMargin = 10,
  method = "DCF + earnings",
  components = ["normalized-earnings-power", "fcfe-dcf"]
}) {
  return {
    ticker,
    fiscal_period: period,
    as_of_date: date,
    financial_available_at: date,
    guidance_max_observed_at: null,
    input: {
      valuationSemantics: {
        priceExcludedFromFairValue: true,
        scoreInputs: {
          profile: "operating_company",
          sharesM: shares,
          ttmRevenue: revenue,
          ttmNetIncome: netIncome,
          ttmFreeCashFlow: fcf,
          observedOperatingMargin: operatingMargin
        }
      },
      sourceRecord: { currency: "USD", currencyScale: 1 }
    },
    output: {
      fairValue,
      method,
      methodOutputs: components.map((key) => ({ key, value: 10 }))
    }
  };
}

test("a generic method change cannot explain a fourfold move", () => {
  const previous = row({ period: "2024-Q1", date: "2024-05-01", fairValue: 10 });
  const current = row({ period: "2024-Q2", date: "2024-08-01", fairValue: 50, method: "new method" });
  const result = classifyMaterialTransition(previous, current);
  assert.equal(result.status, "blocker");
  assert.equal(result.classification, "unresolved");
});

test("an exact registered corporate action explains a share-basis jump", () => {
  const previous = row({ ticker: "KDP", period: "2018-Q1", date: "2018-04-25", fairValue: 100, shares: 180 });
  const current = row({ ticker: "KDP", period: "2018-Q2", date: "2018-08-08", fairValue: 12, shares: 1388 });
  const result = classifyMaterialTransition(previous, current);
  assert.equal(result.status, "pass");
  assert.equal(result.classification, "documented_corporate_action");
  assert.equal(result.corporateAction.eventDate, "2018-07-09");
});

test("two independent reported operating changes support a business inflection", () => {
  const previous = row({ period: "2024-Q1", date: "2024-05-01", fairValue: 10, netIncome: 20, fcf: 20 });
  const current = row({ period: "2024-Q2", date: "2024-08-01", fairValue: 60, netIncome: 100, fcf: 100 });
  const result = classifyMaterialTransition(previous, current);
  assert.equal(result.status, "pass");
  assert.equal(result.classification, "audited_business_inflection");
  assert.ok(result.quantitativeSignals.length >= 2);
});

test("a share jump without an exact corporate action remains a blocker", () => {
  const previous = row({ period: "2024-Q1", date: "2024-05-01", fairValue: 100, shares: 100 });
  const current = row({ period: "2024-Q2", date: "2024-08-01", fairValue: 20, shares: 300, revenue: 3000, netIncome: 500 });
  const result = classifyMaterialTransition(previous, current);
  assert.equal(result.status, "blocker");
  assert.ok(result.integrityFindings.includes("share_jump_without_registered_corporate_action"));
});

test("an explicitly classified intermediate PIT period explains a reporting gap", () => {
  const previous = row({ period: "2023-Q4", date: "2024-02-01", fairValue: 10 });
  const current = row({ period: "2024-Q2", date: "2024-08-01", fairValue: 50 });
  const result = classifyMaterialTransition(previous, current, {
    unmodeledGaps: [{
      ticker: "TEST",
      fiscalPeriod: "2024-Q1",
      availableAt: "2024-05-01",
      reason: "no_economically_material_earnings_or_owner_cash_flow"
    }]
  });
  assert.equal(result.status, "pass");
  assert.equal(result.classification, "explicit_unmodeled_reporting_gap");
});
