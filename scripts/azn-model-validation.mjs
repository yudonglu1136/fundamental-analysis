import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function finite(value, label) {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/azn/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/azn/data/index.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/azn/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const dataset = dataModule.aznDataset;
  const periodId = calculations.getDefaultAznPeriod();
  const dashboard = calculations.buildAznDashboardData(dataset, periodId, "Base");
  const valuation = calculations.calculateAznValuation(dataset, periodId, "Base");
  const aznModule = configModule.aznModule;

  assert(registryModule.stockRegistry.AZN === aznModule, "AZN must be registered through stockRegistry.");
  assert(aznModule.data, "AZN module must expose module.data.");
  assert(typeof aznModule.calculateSummary === "function", "AZN module must expose calculateSummary.");
  assert(typeof aznModule.calculateValuation === "function", "AZN module must expose calculateValuation.");
  assert(typeof aznModule.Dashboard === "function", "AZN module must expose Dashboard.");
  assert(typeof aznModule.valuationConfig?.calculateValuation === "function", "AZN valuationConfig must expose calculateValuation.");

  const period = dataset.periods.find((item) => item.id === periodId);
  assert(period, "Default AZN period must exist.");
  const therapyRows = dataset.reportedData.therapyAreas.filter((row) => row.periodId === periodId);
  const therapyRevenueSum = therapyRows.reduce((sum, row) => sum + row.revenue, 0);
  assert(closeTo(therapyRevenueSum, period.totalRevenue, 1), "Therapy area revenue must reconcile to total revenue.");

  dataset.reportedData.drugRevenue.forEach((drug) => {
    const area = therapyRows.find((row) => row.therapyArea === drug.therapyArea);
    assert(area, `${drug.drugName} must have a therapy area row.`);
    assert(drug.currentRevenue <= area.revenue, `${drug.drugName} revenue must not exceed ${drug.therapyArea} revenue.`);
  });

  dataset.periods.forEach((row) => {
    assert(row.coreEps !== row.reportedEps, `${row.id} must keep core EPS distinct from reported EPS.`);
    assert(row.coreOperatingProfit !== row.reportedOperatingProfit, `${row.id} must keep core operating profit distinct from reported operating profit.`);
  });

  assert(closeTo(dataset.marketData.londonPriceGbp, dataset.marketData.londonPriceGbx / 100), "AZN.L GBX must be divided by 100 to get GBP.");
  assert(dataset.marketData.londonPriceGbp > 50 && dataset.marketData.londonPriceGbp < 250, "Normalized London price must be in GBP-share range.");
  assert(dataset.marketData.gbpUsd > 1 && dataset.marketData.gbpUsd < 2, "GBP/USD must be a currency rate, not a percent or pence value.");
  assert(closeTo(dashboard.valuation.nyseOrdinaryFairValueUsd, dashboard.valuation.blendedFairValueUsd * dataset.marketData.currentUsListingOrdinaryShareRatio), "Current NYSE ordinary fair value conversion must be correct.");
  assert(closeTo(dashboard.valuation.formerAdrFairValueUsd, dashboard.valuation.blendedFairValueUsd * dataset.marketData.historicalAdrRatioOrdinarySharePerAdr), "Former ADR equivalent conversion must be correct.");

  assert(dataset.pipelineData.every((asset) => asset.researchOnlyEstimate === true), "Pipeline peak-sales and POS assumptions must be research-only.");
  assert(dashboard.pipeline.valuedAssets.every((asset) => asset.probabilityAdjustedPipelineValue > 0), "Pipeline rNPV outputs must be positive.");
  assert(dashboard.pipeline.valuedAssets.every((asset) => asset.researchOnlyEstimate === true), "Pipeline rNPV outputs must remain research-only.");
  assert(valuation.methodCards.some((card) => /Pipeline rNPV/i.test(card.label)), "Valuation output must explicitly label pipeline rNPV.");

  dataset.patentRiskData.forEach((risk) => {
    const drug = dataset.reportedData.drugRevenue.find((row) => risk.product.includes(row.drugName) || row.drugName === risk.product);
    assert(drug, `${risk.product} must have a matching drug revenue row.`);
    assert(risk.revenueAtRisk <= drug.currentRevenue * 4 * 1.2, `${risk.product} revenue at risk must not exceed corresponding annualized product revenue by more than audit tolerance.`);
  });

  assert(dashboard.financialQuality.dividendCoverageByFcf > 1, "Dividend coverage must use FCF and be above 1x in the base dataset.");
  assert(dashboard.financialQuality.dividendCoverageByCoreEps > 1, "Dividend coverage by core EPS must be above 1x in the base dataset.");
  assert(dashboard.financialQuality.warnings.some((warning) => /reported EPS/i.test(warning)), "Financial quality engine must warn against mixing reported EPS and core EPS.");

  valuation.fairValues.forEach((row) => {
    finite(row.fairValue, `${row.scenario} fair value`);
    finite(row.upsideDownside, `${row.scenario} upside/downside`);
    finite(row.expectedReturn3Y, `${row.scenario} expected return`);
  });
  valuation.methodCards.forEach((card) => finite(card.value, `${card.label} method card`));
  valuation.sensitivityTables.forEach((table) => {
    assert(Array.isArray(table.table) && table.table.length >= 2, `${table.title} sensitivity table must have rows.`);
    table.table.slice(1).forEach((row) => row.slice(1).forEach((cell) => finite(Number(cell), `${table.title} sensitivity cell`)));
  });

  assert(dashboard.evidenceAudit.missingEvidenceIds.length === 0, `AZN source evidence is missing: ${dashboard.evidenceAudit.missingEvidenceIds.join(", ")}`);
  assert(dashboard.evidenceAudit.valuationUsableEvidenceCount > 0, "AZN must expose valuation-usable official/market evidence.");
  ["segment revenue", "key drug revenue", "guidance", "dividend", "pipeline", "patent", "WACC", "China", "FCF", "net debt"].forEach((keyword) => {
    assert(
      dashboard.evidenceAudit.evidence.some((item) => `${item.sourceName} ${item.excerpt}`.toLowerCase().includes(keyword.toLowerCase())) ||
        (keyword === "WACC" && dataset.researchEstimates.some((item) => /wacc|discount/i.test(`${item.label} ${item.rationale}`))),
      `Evidence/audit trail should include ${keyword}.`,
    );
  });

  assert(dashboard.drugDurability.matrix.length >= 12, "Drug durability matrix must cover core blockbuster drugs.");
  assert(dashboard.earningsCall.events.length === 8, "Earnings-call intelligence must cover the past eight quarters.");
  assert(dashboard.earningsCall.events.every((event) => event.webcastReplayAvailable === true), "Every tracked earnings-call event should have an official webcast replay available.");
  assert(dashboard.earningsCall.events.every((event) => event.valuationImpactAllowed === false && event.displayOnly === true), "Earnings-call AI layer must remain display-only and excluded from valuation.");
  assert(dashboard.earningsCall.marketFocusTrend.length >= 6, "Earnings-call intelligence must expose market focus trend rows.");
  assert(dashboard.earningsCall.aiOverview.narrative.toLowerCase().includes("pipeline"), "Earnings-call AI overview must summarize focus migration.");
  assert(dashboard.patentCliff.timeline.some((row) => row.year >= 2025 && row.year <= 2035), "Patent cliff timeline must cover 2025-2035.");
  assert(dashboard.oncology.oncologyRevenueBridge.length > 0, "Oncology engine must expose revenue bridge.");
  assert(dashboard.rareDisease.solirisToUltomirisTransition.length === 2, "Rare disease engine must expose Soliris-to-Ultomiris transition.");
  assert(dashboard.cvrm.farxigaRevenueTrajectory.length >= 5, "CVRM engine must expose Farxiga trajectory.");
  assert(dashboard.china.chinaRevenue > 0, "China engine must expose China revenue.");
  assert(dashboard.risks.risks.length >= 7, "Risk radar must expose core pharma risk categories.");

  const html = renderToStaticMarkup(
    React.createElement(aznModule.Dashboard, {
      module: aznModule,
      scenario: "Base",
      onScenarioChange: () => {},
      period: periodId,
      onPeriodChange: () => {},
      dataSourceType: "mock",
      onDataSourceChange: () => {},
    }),
  );
  assert(html.includes("AZN Research Cockpit"), "AZN dashboard must render the cockpit shell.");

  const componentChecks = [
    ["/src/stocks/azn/components/AZNInvestmentSnapshot.tsx", "AZNInvestmentSnapshot"],
    ["/src/stocks/azn/components/TherapyAreaDashboard.tsx", "TherapyAreaDashboard"],
    ["/src/stocks/azn/components/DrugDurabilityMatrix.tsx", "DrugDurabilityMatrix"],
    ["/src/stocks/azn/components/EarningsCallIntelligencePanel.tsx", "EarningsCallIntelligencePanel"],
    ["/src/stocks/azn/components/PatentCliffMonitor.tsx", "PatentCliffMonitor"],
    ["/src/stocks/azn/components/PipelineIntelligenceLab.tsx", "PipelineIntelligenceLab"],
    ["/src/stocks/azn/components/OncologyEnginePanel.tsx", "OncologyEnginePanel"],
    ["/src/stocks/azn/components/RareDiseaseEnginePanel.tsx", "RareDiseaseEnginePanel"],
    ["/src/stocks/azn/components/CVRMEnginePanel.tsx", "CVRMEnginePanel"],
    ["/src/stocks/azn/components/ChinaExposurePanel.tsx", "ChinaExposurePanel"],
    ["/src/stocks/azn/components/FinancialQualityPanel.tsx", "FinancialQualityPanel"],
    ["/src/stocks/azn/components/ValuationTriangulationPanel.tsx", "ValuationTriangulationPanel"],
    ["/src/stocks/azn/components/RiskRadarPanel.tsx", "RiskRadarPanel"],
    ["/src/stocks/azn/components/CatalystCalendar.tsx", "CatalystCalendar"],
    ["/src/stocks/azn/components/SourceEvidencePanel.tsx", "SourceEvidencePanel"],
  ];
  for (const [modulePath, exportName] of componentChecks) {
    const componentModule = await server.ssrLoadModule(modulePath);
    const Component = componentModule[exportName];
    assert(typeof Component === "function", `${exportName} must be exported.`);
    const componentHtml = renderToStaticMarkup(React.createElement(Component, { dashboard }));
    assert(componentHtml.length > 0, `${exportName} must render non-empty markup.`);
  }

  console.log("AZN model validation passed.");
  console.log(`Therapy revenue reconciles to $${therapyRevenueSum.toFixed(0)}m.`);
  console.log(`Base fair value: £${dashboard.valuation.blendedFairValueGbp.toFixed(2)}; London price: £${dataset.marketData.londonPriceGbp.toFixed(2)}.`);
} finally {
  await server.close();
}
