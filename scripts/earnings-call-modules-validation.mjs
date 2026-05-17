import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const tickers = ["BMY", "GILD", "AUTL"];
const report = [];

function record(status, ticker, check, detail) {
  report.push({ status, ticker, check, detail });
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");
  const engineModule = await server.ssrLoadModule("/src/stocks/earningsCall/engine.ts");
  const biopharmaEngineModule = await server.ssrLoadModule("/src/stocks/biopharmaResearch/engine.ts");
  for (const ticker of tickers) {
    const module = registryModule.stockRegistry[ticker];
    if (!module) {
      record("FAIL", ticker, "Registry", `${ticker} module is missing from stockRegistry.`);
      continue;
    }
    const dataset = module.data;
    const earnings = dataset.earnings;
    const trend = engineModule.buildEarningsCallTrend(earnings);
    const dashboard = biopharmaEngineModule.buildBiopharmaDashboardData(dataset);
    record(module.description.includes("earnings-call intelligence only") ? "FAIL" : "PASS", ticker, "Full research module", "Module is not an earnings-only wrapper.");
    record(module.tabs.some((tab) => tab.value === "pipeline") && module.tabs.some((tab) => tab.value === "valuation") && module.tabs.some((tab) => tab.value === "strategy") ? "PASS" : "FAIL", ticker, "Research tabs", "Pipeline, valuation and strategy tabs are present.");
    record(earnings.quarters.length === 8 ? "PASS" : "FAIL", ticker, "Eight-quarter data", `${earnings.quarters.length} quarters available.`);
    record(trend.topicTrendRows.length >= 5 ? "PASS" : "FAIL", ticker, "Topic trend rows", `${trend.topicTrendRows.length} topics available.`);
    record(dataset.evidence.length >= 8 ? "PASS" : "FAIL", ticker, "Evidence coverage", `${dataset.evidence.length} evidence records available.`);
    record(dataset.financials.length >= 2 ? "PASS" : "FAIL", ticker, "Fundamentals coverage", `${dataset.financials.length} financial periods available.`);
    record(dataset.products.length >= 4 ? "PASS" : "FAIL", ticker, "Product coverage", `${dataset.products.length} products/franchises available.`);
    record(dataset.guidance.length >= 2 ? "PASS" : "FAIL", ticker, "Guidance coverage", `${dataset.guidance.length} guidance items available.`);
    record(dataset.pipeline.length >= 4 ? "PASS" : "FAIL", ticker, "Pipeline coverage", `${dataset.pipeline.length} pipeline assets available.`);
    record(
      dataset.pipeline.every((asset) => asset.assumptionType === "research_only" && asset.estimatedPeakSales > 0 && asset.probabilityOfSuccess > 0 && asset.discountRate > 0) ? "PASS" : "FAIL",
      ticker,
      "Pipeline assumptions",
      "Peak sales, POS and discount rates are research-only and populated.",
    );
    record(dataset.analystDebates.length >= 3 ? "PASS" : "FAIL", ticker, "Analyst debate coverage", `${dataset.analystDebates.length} debates available.`);
    record(dataset.risks.length >= 4 ? "PASS" : "FAIL", ticker, "Risk red-team coverage", `${dataset.risks.length} risks available.`);
    record(
      dashboard.valuationOutputs.every((item) => Number.isFinite(item.fairValue) && item.fairValue > 0) ? "PASS" : "FAIL",
      ticker,
      "Valuation outputs",
      dashboard.valuationOutputs.map((item) => `${item.scenario}: ${item.fairValue.toFixed(2)}`).join(", "),
    );
    record(
      earnings.quarters.every((quarter) => quarter.marketFocus.length >= 4 && quarter.aiSummary.length > 40) ? "PASS" : "FAIL",
      ticker,
      "Quarter summaries",
      "Each quarter has market focus rows and AI summary.",
    );
    const html = renderToStaticMarkup(
      React.createElement(module.Dashboard, {
        module,
        scenario: "Base",
        onScenarioChange: () => {},
        period: module.getDefaultPeriod(),
        onPeriodChange: () => {},
        dataSourceType: "mock",
        onDataSourceChange: () => {},
      }),
    );
    record(html.includes(`${ticker} Research Cockpit`) ? "PASS" : "FAIL", ticker, "Dashboard SSR", "Dashboard rendered.");
  }
  console.log("Biopharma research modules validation report");
  console.table(report);
  const failed = report.filter((row) => row.status === "FAIL");
  console.log(JSON.stringify({ passed: report.length - failed.length, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await server.close();
}
