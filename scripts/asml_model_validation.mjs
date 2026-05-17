#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "src/stocks/asml/config.ts",
  "src/stocks/asml/dashboard.tsx",
  "src/stocks/asml/calculations.ts",
  "src/stocks/asml/data.ts",
  "src/stocks/asml/assumptions.ts",
  "src/stocks/asml/model.ts",
  "src/stocks/asml/marketPrices.ts",
];

const failures = [];

for (const file of files) {
  const source = readFileSync(path.join(root, file), "utf8");
  if (!source.trim()) failures.push(`${file} is empty`);
}

const config = readFileSync(path.join(root, "src/stocks/asml/config.ts"), "utf8");
for (const signal of ["data:", "calculateSummary:", "calculateValuation:", "valuationConfig:", "Dashboard:"]) {
  if (!config.includes(signal)) failures.push(`config.ts missing ${signal}`);
}

const assumptions = readFileSync(path.join(root, "src/stocks/asml/assumptions.ts"), "utf8");
for (const key of ["currentPrice", "normalizedRevenueUsd", "ordersGrowth", "backlogConversion", "systemsRevenueMix", "serviceRevenueMix", "euvRevenueMix", "duvRevenueMix", "highNaRevenueMix", "euvDemandDurability", "highNaAdoption", "chinaRevenueExposure", "customerConcentrationHaircut", "chinaRestrictionHaircut"]) {
  if (!assumptions.includes(key)) failures.push(`assumptions.ts missing ${key}`);
}

const calculations = readFileSync(path.join(root, "src/stocks/asml/calculations.ts"), "utf8");
for (const output of ["fairValues", "methodCards", "expectedReturnBridge", "sensitivityTables", "validationWarnings"]) {
  if (!calculations.includes(output)) failures.push(`calculations.ts missing ${output}`);
}
for (const method of ["sotpFairValue", "systemsRevenue", "serviceRevenue", "highNaRevenue", "orders-growth", "effective-growth"]) {
  if (!calculations.includes(method)) failures.push(`calculations.ts missing ASML-specific driver ${method}`);
}
for (const platformOutput of ["probabilityWeightedFairValue", "dataStatus", "investmentQuestions", "valuationReliable"]) {
  if (!calculations.includes(platformOutput)) failures.push(`calculations.ts missing platform output ${platformOutput}`);
}
for (const historicalOutput of ["buildAsmlHistoricalValuationScaffold", "historicalValuations", "research_scaffold", "asml-historical-price-missing"]) {
  if (!calculations.includes(historicalOutput)) failures.push(`calculations.ts missing historical valuation output ${historicalOutput}`);
}
for (const priceOutput of ["nearestAsmlPriceOnOrBefore", "asmlDailyPriceBars", "asmlMarketPriceMetadata", "asmlEightYearPriceHistory", "asmlVsSpyEightYearReturns", "currentPrice: asOfPrice"]) {
  if (!calculations.includes(priceOutput)) failures.push(`calculations.ts missing ASML daily price comparison ${priceOutput}`);
}

const dashboard = readFileSync(path.join(root, "src/stocks/asml/dashboard.tsx"), "utf8");
for (const historicalUi of ["ASML Historical Valuation Scaffold", "Visible history window", "As-of Price", "Fair Value", "Price Series", "Eight-Year Market History", "Orders / Backlog Historical Driver Map", "EUV / High-NA Historical Driver Map", "AI Capex Cycle Historical Stress Map", "Risk Register"]) {
  if (!dashboard.includes(historicalUi)) failures.push(`dashboard.tsx missing historical valuation UI ${historicalUi}`);
}

const marketPrices = readFileSync(path.join(root, "src/stocks/asml/marketPrices.ts"), "utf8");
if (!marketPrices.includes("asmlDailyPriceBars")) failures.push("marketPrices.ts missing ASML daily price bars export");
if (!marketPrices.includes("rowCount")) failures.push("marketPrices.ts missing ASML market price metadata");
if (!marketPrices.includes("asmlEightYearPriceHistory")) failures.push("marketPrices.ts missing ASML eight-year price history export");
if (!marketPrices.includes("asmlVsSpyEightYearReturns")) failures.push("marketPrices.ts missing ASML vs SPY eight-year comparison export");

if (!calculations.includes("asml-price-anchor-missing")) {
  failures.push("calculations.ts must warn when current price is missing");
}

console.log("ASML model validation");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: ASML frontend scaffold exposes required valuation and source-gap controls.");
}
