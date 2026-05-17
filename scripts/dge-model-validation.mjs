import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

const checks = [];

function record(status, title, detail) {
  checks.push({ status, title, detail });
}

function pass(title, detail = "") {
  record("PASS", title, detail);
}

function warn(title, detail = "") {
  record("WARN", title, detail);
}

function fail(title, detail = "") {
  record("FAIL", title, detail);
}

function assertCheck(condition, title, detail = "") {
  if (condition) pass(title, detail);
  else fail(title, detail);
}

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function finite(value, label) {
  assertCheck(Number.isFinite(value), `${label} is finite`, `${label}: ${value}`);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/dge/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/dge/data/index.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/dge/config.ts");
  const panelsModule = await server.ssrLoadModule("/src/stocks/dge/components/Panels.tsx");

  const dataset = dataModule.dgeDataset;
  const periodId = calculations.getDefaultDgePeriod();
  const dashboard = calculations.buildDgeDashboardData(dataset, periodId, "Base");
  const valuation = calculations.calculateDgeValuation(dataset, periodId, "Base");
  const dgeModule = configModule.dgeModule;

  const registrySource = readFileSync(new URL("../src/stocks/registry.ts", import.meta.url), "utf8");
  assertCheck(registrySource.includes('"DGE.L": dgeModule') && registrySource.includes('import { dgeModule }'), "DGE.L registered through stockRegistry");
  assertCheck(dgeModule.data && typeof dgeModule.calculateSummary === "function" && typeof dgeModule.calculateValuation === "function", "DGE module contract exposed");
  assertCheck(typeof dgeModule.Dashboard === "function" && typeof dgeModule.valuationConfig?.calculateValuation === "function", "DGE dashboard and valuationConfig exposed");

  dataset.periods.forEach((period) => {
    assertCheck(period.reportedNetSales !== period.organicNetSalesMovement, `${period.id} keeps reported and organic sales separate`);
    assertCheck(typeof period.organicNetSalesGrowth === "number", `${period.id} has organic net sales growth field`);
    if (period.volumeGrowth != null && period.priceMixGrowth != null) {
      const bridge = Number((period.volumeGrowth + period.priceMixGrowth).toFixed(3));
      const organic = Number(period.organicNetSalesGrowth.toFixed(3));
      assertCheck(Math.abs(bridge - organic) <= 0.004 || period.id === "q1-fy2026", `${period.id} volume + price/mix bridges organic growth`, `${bridge} vs ${organic}`);
    } else {
      warn(`${period.id} volume / price-mix not fully disclosed`, "Allowed only for periods where Diageo did not disclose the field.");
    }
  });

  dataset.reportedData.channelInventory.forEach((row) => {
    assertCheck("shipmentsGrowth" in row && "depletionsGrowth" in row && "consumptionGrowth" in row, `${row.periodId} ${row.region} separates shipments, depletions and consumption`);
    if (row.shipmentsGrowth != null && row.depletionsGrowth != null && row.consumptionGrowth != null) {
      assertCheck(
        !(row.shipmentsGrowth === row.depletionsGrowth && row.depletionsGrowth === row.consumptionGrowth),
        `${row.periodId} ${row.region} does not treat shipments as depletions/consumption`,
      );
    }
  });

  const northAmerica = dataset.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "North America");
  assertCheck(Boolean(northAmerica), "North America Q3 row exists");
  assertCheck(northAmerica?.sourceEvidenceIds.some((id) => id.includes("q3fy2026")) ?? false, "North America / US Spirits uses specific source evidence");
  assertCheck(dashboard.usDemand.warnings.some((warning) => /not used as a direct consumer-demand proxy/i.test(warning)), "US demand engine warns against using North America net sales as demand");

  assertCheck(dashboard.lacInventory.normalizedLacGrowth !== dataset.reportedData.regions.find((row) => row.periodId === "q3-fy2026" && row.region === "Latin America & Caribbean")?.organicNetSalesGrowth, "LAC reported growth is inventory-adjusted");
  assertCheck(dashboard.lacInventory.warnings.some((warning) => /low-base|World Cup|pull-forward/i.test(warning)), "LAC growth carries low-base / restocking / World Cup warning");

  const guidance = dataset.guidanceData[0];
  assertCheck(guidance.freeCashFlow === 3_000, "FY2026 FCF guidance aligned to $3bn");
  assertCheck(guidance.organicNetSalesGrowthLow === -0.03 && guidance.organicNetSalesGrowthHigh === -0.02, "FY2026 organic sales guidance aligned to down 2-3%");
  assertCheck(guidance.capexLow > 0 && guidance.erpInventoryBuildExcludedFromFcf > 0, "FCF guide has capex and inventory-build bridge fields");
  assertCheck(dashboard.cashFlow.warnings.some((warning) => /OCF, capex, working capital, exceptionals and inventory build/i.test(warning)), "FCF engine surfaces bridge warning");

  assertCheck(guidance.dividendFloor === 0.5 && guidance.payoutPolicyLow === 0.3 && guidance.payoutPolicyHigh === 0.5, "Dividend rebasing uses new floor and payout policy");
  assertCheck(dashboard.cashFlow.warnings.some((warning) => /old dividend history/i.test(warning)), "Dividend model rejects old dividend growth anchor");

  assertCheck(closeTo(dataset.marketData.londonPriceGbp, dataset.marketData.londonPriceGbx / 100), "DGE.L GBX converts to GBP");
  assertCheck(dataset.marketData.londonPriceGbp > 5 && dataset.marketData.londonPriceGbp < 50, "DGE.L normalized GBP price is in ordinary-share range");
  assertCheck(dataset.marketData.ordinarySharesPerAdr === 4, "DEO ADR ratio is one ADR to four ordinary shares");
  assertCheck(closeTo(dataset.marketData.marketCapGbpM, dataset.marketData.londonPriceGbp * dataset.marketData.sharesOutstandingM), "Market cap GBP calculation correct");
  assertCheck(closeTo(dataset.marketData.enterpriseValueUsdM, dataset.marketData.marketCapUsdM + dataset.marketData.netDebtUsdM), "Enterprise value calculation correct");

  assertCheck(dashboard.evidenceAudit.evidenceCoverageRatio > 0.9, "Evidence coverage ratio above 90%", `${(dashboard.evidenceAudit.evidenceCoverageRatio * 100).toFixed(1)}%`);
  const researchEvidenceIds = new Set(dataset.evidenceData.filter((item) => item.sourceType === "research_assumption").map((item) => item.id));
  const assumptionEvidenceIds = new Set(dataset.researchAssumptions.flatMap((item) => item.sourceEvidenceIds));
  assertCheck(dataset.researchAssumptions.length > 0, "Research-only assumptions appear in data/assumptions.ts");
  assertCheck(researchEvidenceIds.has("research-assumption-demand-cycle") && assumptionEvidenceIds.has("research-assumption-demand-cycle"), "Research-only assumptions appear in evidence.ts and assumptions.ts");

  assertCheck(valuation.fairValues.length === 3, "Valuation output has bear/base/bull");
  ["Bear", "Base", "Bull"].forEach((scenario) => assertCheck(valuation.fairValues.some((row) => row.scenario === scenario), `${scenario} fair value present`));
  valuation.fairValues.forEach((row) => {
    finite(row.fairValue, `${row.scenario} fair value`);
    finite(row.upsideDownside, `${row.scenario} upside/downside`);
    finite(row.expectedReturn3Y, `${row.scenario} expected return`);
  });
  valuation.methodCards.forEach((card) => finite(card.value, `${card.label} method card`));
  assertCheck(valuation.sensitivityTables.length >= 5, "Valuation exposes required sensitivity heatmaps");
  valuation.sensitivityTables.forEach((table) => {
    assertCheck(Array.isArray(table.table) && table.table.length >= 2, `${table.title} sensitivity table has rows`);
    table.table.slice(1).forEach((row) => row.slice(1).forEach((cell) => finite(Number(cell), `${table.title} sensitivity cell`)));
  });

  const html = renderToStaticMarkup(
    React.createElement(dgeModule.Dashboard, {
      module: dgeModule,
      scenario: "Base",
      onScenarioChange: () => {},
      period: periodId,
      onPeriodChange: () => {},
      dataSourceType: "mock",
      onDataSourceChange: () => {},
    }),
  );
  assertCheck(html.includes("DGE.L Research Cockpit"), "DGE dashboard SSR renders cockpit shell");

  const componentChecks = [
    "CockpitPanel",
    "UsDemandLab",
    "LacInventoryLab",
    "RegionalQualityPanel",
    "BrandPortfolioPanel",
    "PriceMixVolumePanel",
    "MarginSavingsPanel",
    "CashFlowPanel",
    "ValuationPanel",
    "RiskRedTeamPanel",
    "EvidencePanel",
  ];
  for (const exportName of componentChecks) {
    const Component = panelsModule[exportName];
    assertCheck(typeof Component === "function", `${exportName} exported`);
    const componentHtml = renderToStaticMarkup(React.createElement(Component, { dashboard }));
    assertCheck(componentHtml.length > 0, `${exportName} SSR renders non-empty markup`);
  }

  console.log("DGE model validation report");
  for (const check of checks) {
    console.log(`${check.status} | ${check.title}${check.detail ? ` | ${check.detail}` : ""}`);
  }
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  console.log(`SUMMARY | PASS ${checks.filter((check) => check.status === "PASS").length} | WARN ${warnCount} | FAIL ${failCount}`);
  if (failCount > 0) {
    throw new Error(`DGE validation failed with ${failCount} failing checks.`);
  }
} finally {
  await server.close();
}
