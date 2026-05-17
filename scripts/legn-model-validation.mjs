import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const report = [];

function record(status, check, detail, field = "") {
  report.push({ status, check, field, detail });
}

function pass(check, detail, field = "") {
  record("PASS", check, detail, field);
}

function warn(check, detail, field = "") {
  record("WARN", check, detail, field);
}

function fail(check, detail, field = "") {
  record("FAIL", check, detail, field);
}

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function finite(value, field) {
  if (!Number.isFinite(value)) fail("Finite output", `${field} must be finite; found ${value}.`, field);
}

function assertPass(condition, check, passDetail, failDetail, field = "") {
  if (condition) pass(check, passDetail, field);
  else fail(check, failDetail, field);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "silent",
});

try {
  const calculations = await server.ssrLoadModule("/src/stocks/legn/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/legn/data/index.ts");
  const configModule = await server.ssrLoadModule("/src/stocks/legn/config.ts");
  const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");

  const dataset = dataModule.legnDataset;
  const periodId = calculations.getDefaultLegnPeriod();
  const dashboard = calculations.buildLegnDashboardData(dataset, periodId, "Base");
  const valuation = calculations.calculateLegnValuation(dataset, periodId, "Base");
  const legnModule = configModule.legnModule;

  assertPass(registryModule.stockRegistry.LEGN === legnModule, "Registry", "LEGN is registered through stockRegistry.", "LEGN module is not registered.", "stockRegistry.LEGN");
  assertPass(Boolean(legnModule.data), "Module contract", "module.data exposed.", "module.data missing.", "legnModule.data");
  assertPass(typeof legnModule.calculateSummary === "function", "Module contract", "calculateSummary exposed.", "calculateSummary missing.", "legnModule.calculateSummary");
  assertPass(typeof legnModule.calculateValuation === "function", "Module contract", "calculateValuation exposed.", "calculateValuation missing.", "legnModule.calculateValuation");
  assertPass(typeof legnModule.Dashboard === "function", "Module contract", "Dashboard exposed.", "Dashboard missing.", "legnModule.Dashboard");

  const fy = dataset.reportedPeriods.find((row) => row.id === "fy2025");
  const q4 = dataset.reportedPeriods.find((row) => row.id === "q4-2025");
  const q1Prelim = dataset.carvyktiQuarters.find((row) => row.id === "q1-2026");
  const fyCarvyktiNts = dataset.carvyktiQuarters
    .filter((row) => row.periodEnd.startsWith("2025"))
    .reduce((sum, row) => sum + row.globalNetTradeSales, 0);

  assertPass(
    fyCarvyktiNts !== fy.totalRevenue,
    "NTS separation",
    `FY 2025 CARVYKTI NTS $${fyCarvyktiNts.toFixed(1)}m is separate from LEGN reported revenue $${fy.totalRevenue.toFixed(1)}m.`,
    "CARVYKTI NTS equals LEGN reported revenue.",
    "carvyktiQuarters / reportedPeriods.fy2025.totalRevenue",
  );

  const bridgedCollaborationRevenue = fyCarvyktiNts * dataset.collaborationEconomicsBridge.ntsToCollaborationRevenueRatio;
  assertPass(
    closeTo(bridgedCollaborationRevenue, fy.collaborationRevenue, 0.05),
    "Collaboration revenue bridge",
    `Bridge reconciles FY 2025 collaboration revenue to $${bridgedCollaborationRevenue.toFixed(1)}m.`,
    `Bridge gives $${bridgedCollaborationRevenue.toFixed(1)}m vs reported $${fy.collaborationRevenue.toFixed(1)}m.`,
    "collaborationEconomicsBridge.ntsToCollaborationRevenueRatio",
  );

  const expectedFy = {
    totalRevenue: 1_028.9,
    collaborationRevenue: 944.8,
    costOfCollaborationRevenue: 397.1,
    rdExpense: 414.7,
    sellingAndDistributionExpense: 205.8,
    generalAndAdministrativeExpense: 135.8,
    cashAndTimeDeposits: 948.6,
    ordinarySharesOutstandingM: 369.886369,
    adsOutstandingM: 184.9431845,
  };
  Object.entries(expectedFy).forEach(([field, expected]) => {
    assertPass(
      closeTo(fy[field], expected, 0.01),
      "FY 2025 reported financials",
      `${field} matches official filing / press release.`,
      `${field} expected ${expected}, found ${fy[field]}.`,
      `reportedPeriods.fy2025.${field}`,
    );
  });
  assertPass(closeTo(q4.collaborationRevenue, 277.6, 0.01), "Q4 2025 reported financials", "Q4 collaboration revenue matches.", `Q4 collaboration revenue found ${q4.collaborationRevenue}.`, "reportedPeriods.q4-2025.collaborationRevenue");

  assertPass(
    q1Prelim.globalNetTradeSales === 597 && q1Prelim.preliminary && q1Prelim.unverified && q1Prelim.isLegendReportedRevenue === false,
    "Q1 2026 preliminary NTS",
    "Q1 2026 $597m is preliminary/unverified and not reported revenue.",
    "Q1 2026 $597m is not correctly flagged as preliminary/unverified/not reported revenue.",
    "carvyktiQuarters.q1-2026",
  );

  const pipelineResearchOnly = dataset.pipelineAssets.every(
    (asset) => asset.researchOnly === true && asset.estimatedPeakSales > 0 && asset.probabilityOfSuccess > 0 && asset.discountRate > 0,
  );
  assertPass(
    pipelineResearchOnly,
    "Pipeline research-only assumptions",
    "All pipeline peak sales, POS and discount rates are research-only.",
    "At least one pipeline asset lacks research-only peak/POS/discount flags.",
    "pipelineAssets",
  );

  assertPass(
    dataset.earningsCalls.length === 8 &&
      dataset.earningsCalls[0].label === "Q1 2024" &&
      dataset.earningsCalls[7].label === "Q4 2025",
    "Eight-quarter earnings call dataset",
    "Earnings-call dataset covers Q1 2024 through Q4 2025.",
    "Earnings-call dataset does not cover the required eight full quarters.",
    "earningsCalls",
  );
  assertPass(
    dashboard.earningsCallTrend.topicTrendRows.length >= 6 &&
      dashboard.earningsCallTrend.overview.aiTrendSummary.length > 80,
    "Earnings-call AI trend overview",
    "Earnings-call trend engine exposes topic trends and AI overview.",
    "Earnings-call trend engine missing topic trends or AI overview.",
    "earningsCallTrend",
  );

  const solidTumorAssets = dashboard.solidTumor.assets;
  assertPass(
    solidTumorAssets.length > 0 && solidTumorAssets.every((asset) => asset.notInCoreBaseCase === true) && dashboard.commercial.annualForecast.every((row) => row.ntsFrontline === 0),
    "Solid tumor core-base exclusion",
    "Solid tumor CAR-T is option value only and excluded from core commercial forecast.",
    "Solid tumor CAR-T entered core commercial base case.",
    "solidTumor.assets / commercial.annualForecast",
  );

  assertPass(
    dashboard.commercial.annualForecast.every((row) => row.ntsFrontline === 0) || dashboard.labelExpansion.totalNavUsdM === 0,
    "Frontline double-count guardrail",
    "Frontline expansion is not double counted between base CARVYKTI and Label Expansion NAV.",
    "Frontline appears in both base CARVYKTI and Label Expansion NAV.",
    "commercial.annualForecast.ntsFrontline / labelExpansion.totalNavUsdM",
  );

  assertPass(
    dashboard.collaboration.rows.some((row) => row.recoupmentOfJanssenAdvances > 0) &&
      dashboard.valuation.netCashFundingAdjustmentPerAds < dataset.marketData.cashAndTimeDepositsUsdM / dataset.marketData.adsOutstandingM,
    "Funding advance recoupment",
    "Janssen funding advance appears in bridge and net cash adjustment.",
    "Funding advance is missing from bridge or valuation adjustment.",
    "collaboration.rows.recoupmentOfJanssenAdvances / valuation.netCashFundingAdjustmentPerAds",
  );

  const dcfLanguage = JSON.stringify(valuation.methodCards).toLowerCase();
  assertPass(
    !dcfLanguage.includes("terminal") && !dcfLanguage.includes(" dcf"),
    "No mature pharma terminal DCF",
    "Primary valuation cards use biotech NAV, not terminal-growth DCF.",
    "Valuation output appears to include terminal DCF as primary method.",
    "valuation.methodCards",
  );

  assertPass(
    closeTo(dataset.marketData.adsOutstandingM * 2, dataset.marketData.ordinarySharesOutstandingM, 0.001),
    "ADS/share unit",
    "ADS count equals ordinary share count divided by two.",
    "ADS/share count unit mismatch.",
    "marketData.adsOutstandingM",
  );

  const expectedMarketCap = dataset.marketData.currentPrice * dataset.marketData.adsOutstandingM;
  const expectedEv = expectedMarketCap - dataset.marketData.netCashAfterFundingUsdM;
  assertPass(
    closeTo(dataset.marketData.marketCapUsdM, expectedMarketCap, 0.05) && closeTo(dataset.marketData.enterpriseValueUsdM, expectedEv, 0.05),
    "Market cap / EV",
    "Market cap and EV calculate correctly from ADS price, ADS count and net cash after funding.",
    "Market cap or EV calculation mismatch.",
    "marketData.marketCapUsdM / enterpriseValueUsdM",
  );

  valuation.fairValues.forEach((row) => {
    finite(row.fairValue, `${row.scenario} fairValue`);
    finite(row.upsideDownside, `${row.scenario} upsideDownside`);
    finite(row.expectedReturn3Y, `${row.scenario} expectedReturn3Y`);
  });
  valuation.methodCards.forEach((card) => finite(card.value, `methodCards.${card.key}`));
  valuation.sensitivityTables.forEach((table) => table.table.slice(1).forEach((row, rowIndex) => row.slice(1).forEach((cell, cellIndex) => finite(Number(cell), `${table.title}.${rowIndex}.${cellIndex}`))));
  pass("Finite outputs", "Fair values, method cards and sensitivity cells are finite.", "valuation");

  const html = renderToStaticMarkup(
    React.createElement(legnModule.Dashboard, {
      module: legnModule,
      scenario: "Base",
      onScenarioChange: () => {},
      period: periodId,
      onPeriodChange: () => {},
      dataSourceType: "mock",
      onDataSourceChange: () => {},
    }),
  );
  assertPass(html.includes("LEGN Research Cockpit"), "Dashboard SSR", "Dashboard SSR rendered cockpit shell.", "Dashboard SSR did not render cockpit shell.", "LegnDashboard");

  const componentChecks = [
    "CockpitPanel",
    "CarvyktiCommercialPanel",
    "CollaborationEconomicsPanel",
    "ClinicalEvidencePanel",
    "EarningsCallPanel",
    "LabelExpansionPanel",
    "SolidTumorCartPanel",
    "PipelineRnpvPanel",
    "ManufacturingAccessPanel",
    "ValuationPanel",
    "RiskRedTeamPanel",
    "EvidencePanel",
  ];
  const panelModule = await server.ssrLoadModule("/src/stocks/legn/components/LegnPanels.tsx");
  componentChecks.forEach((exportName) => {
    const Component = panelModule[exportName];
    if (typeof Component !== "function") {
      fail("Component export", `${exportName} is not exported.`, exportName);
      return;
    }
    const markup = renderToStaticMarkup(React.createElement(Component, { dashboard }));
    assertPass(markup.length > 0, "Component SSR", `${exportName} renders non-empty markup.`, `${exportName} rendered empty markup.`, exportName);
  });

  const usedEvidence = dataset.evidence.filter((item) => item.usedInModel).length;
  const coverageRatio = usedEvidence / dataset.evidence.length;
  assertPass(
    coverageRatio > 0.9,
    "Evidence coverage ratio",
    `Evidence coverage ${(coverageRatio * 100).toFixed(1)}% exceeds 90%.`,
    `Evidence coverage ${(coverageRatio * 100).toFixed(1)}% is below 90%.`,
    "evidence",
  );

  const evidenceIds = new Set(dataset.evidence.map((item) => item.id));
  const unsupportedAssumptions = [
    ...dataset.assumptions.researchAssumptions.filter((item) => !item.sourceEvidenceIds.every((id) => evidenceIds.has(id))).map((item) => item.id),
    ...dataset.pipelineAssets.filter((item) => !item.sourceEvidenceIds.every((id) => evidenceIds.has(id))).map((item) => item.assetName),
  ];
  assertPass(
    unsupportedAssumptions.length === 0,
    "Unsupported hardcoded assumptions",
    "All research assumptions and pipeline assumptions have evidence records.",
    `Unsupported assumptions: ${unsupportedAssumptions.join(", ")}`,
    "assumptions / pipelineAssets",
  );

  if (dataset.marketData.validationWarnings.length > 0) {
    warn("Market data freshness", dataset.marketData.validationWarnings.map((item) => item.detail).join(" "), "marketData");
  }

  const failed = report.filter((item) => item.status === "FAIL");
  const warned = report.filter((item) => item.status === "WARN");
  console.log("LEGN model validation report");
  console.table(report);
  console.log(JSON.stringify({ passed: report.length - failed.length - warned.length, warned: warned.length, failed: failed.length }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
