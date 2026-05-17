import { createServer } from "vite";
import { ISRG_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function source(metricName, row, usedInValuation = true) {
  return {
    sourceUrl: null,
    sourceType: row.sourceStatus === "official_actual" ? "earnings_release" : row.sourceStatus === "derived" ? "derived" : "assumption",
    sourceStatus: row.sourceStatus,
    publishedDate: row.asOfDate,
    retrievedAt: row.asOfDate,
    period: row.periodId,
    metricName,
    rawValue: null,
    normalizedValue: null,
    confidence: row.sourceStatus === "official_actual" ? "high" : "medium",
    usedInValuation,
    researchOnly: false,
    notes: row.sourceStatus === "forecast_assumption" ? "Backend event-visible run-rate snapshot." : "Backend event-visible official/derived snapshot.",
  };
}

function metric(key, label, value, unit, row) {
  return { key, label, value: value ?? null, unit, source: { ...source(label, row), rawValue: value ?? null, normalizedValue: value ?? null } };
}

function mapFinancialPeriod(row) {
  return {
    periodId: row.periodId,
    label: row.periodType === "reporting_event_run_rate" ? `${row.periodId.replace(/_/g, " ").toUpperCase()} run-rate` : row.periodId.toUpperCase(),
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: row.periodType === "FY" ? "FY" : "FY",
    periodEnd: row.asOfDate,
    sourceQuality: row.sourceStatus === "official_actual" ? "high" : "medium",
    revenue: {
      instrumentsAccessories: metric("instrumentsAccessoriesRevenue", "Instruments and accessories revenue", row.instrumentsAccessoriesRevenue, "USDm", row),
      systems: metric("systemsRevenue", "Systems revenue", row.systemsRevenue, "USDm", row),
      services: metric("servicesRevenue", "Services revenue", row.servicesRevenue, "USDm", row),
      total: metric("totalRevenue", "Total revenue", row.revenue, "USDm", row),
    },
    grossProfit: metric("grossProfit", "Gross profit", row.grossProfit, "USDm", row),
    gaapGrossMargin: metric("gaapGrossMargin", "GAAP gross margin", row.grossMargin, "percent", row),
    nonGaapGrossMargin: metric("nonGaapGrossMargin", "Non-GAAP gross margin", row.nonGaapGrossMargin, "percent", row),
    operatingIncome: metric("operatingIncome", "Income from operations", row.operatingIncome, "USDm", row),
    nonGaapOperatingIncome: metric("nonGaapOperatingIncome", "Non-GAAP operating income", row.nonGaapOperatingIncome, "USDm", row),
    netIncome: metric("netIncome", "Net income attributable to Intuitive", row.netIncome, "USDm", row),
    dilutedEps: metric("dilutedEps", "Diluted EPS", row.dilutedEps, "USD", row),
    nonGaapEps: metric("nonGaapEps", "Non-GAAP EPS", row.nonGaapEps, "USD", row),
    dilutedShares: metric("dilutedShares", "Diluted shares", row.dilutedShares, "shares_m", row),
    cashInvestments: metric("cashInvestments", "Cash, equivalents, and investments", row.cashInvestments, "USDm", row),
    sbcExpense: metric("sbcExpense", "Share-based compensation expense", row.sbcExpense, "USDm", row),
    buybackAmount: metric("buybackAmount", "Buyback amount", row.buybackAmount, "USDm", row),
    procedures: {
      worldwideDaVinciProcedures: metric("worldwideDaVinciProcedures", "Worldwide da Vinci procedures", row.worldwideDaVinciProcedures, "procedures", row),
      worldwideDaVinciProcedureGrowth: metric("worldwideDaVinciProcedureGrowth", "Worldwide da Vinci procedure growth", row.daVinciProcedureGrowth, "percent", row),
      worldwideCombinedProcedureGrowth: metric("worldwideCombinedProcedureGrowth", "Worldwide combined procedure growth", row.combinedProcedureGrowth, "percent", row),
      usDaVinciProcedureGrowth: metric("usDaVinciProcedureGrowth", "U.S. da Vinci procedure growth", row.usProcedureGrowth, "percent", row),
      ousDaVinciProcedureGrowth: metric("ousDaVinciProcedureGrowth", "OUS da Vinci procedure growth", row.ousProcedureGrowth, "percent", row),
      ionProcedureGrowth: metric("ionProcedureGrowth", "Ion procedure growth", row.ionProcedureGrowth, "percent", row),
      commentary: `Backend snapshot ${row.id}; sourceStatus=${row.sourceStatus}.`,
    },
    installedBase: {
      daVinciInstalledBase: metric("daVinciInstalledBase", "da Vinci installed base", row.daVinciInstalledBase, "systems", row),
      ionInstalledBase: metric("ionInstalledBase", "Ion installed base", row.ionInstalledBase, "systems", row),
      totalInstalledBase: metric("totalInstalledBase", "Total installed base", row.totalInstalledBase, "systems", row),
    },
    placements: {
      daVinciPlacements: metric("daVinciPlacements", "da Vinci placements", row.daVinciPlacements, "systems", row),
      daVinci5Placements: metric("daVinci5Placements", "da Vinci 5 placements", row.daVinci5Placements, "systems", row),
      ionPlacements: metric("ionPlacements", "Ion placements", row.ionPlacements, "systems", row),
      spPlacements: metric("spPlacements", "SP placements", row.spPlacements, "systems", row),
      operatingLeasePlacements: metric("operatingLeasePlacements", "Operating lease placements", row.operatingLeasePlacements, "systems", row),
      usageBasedLeasePlacements: metric("usageBasedLeasePlacements", "Usage-based operating lease placements", row.usageBasedLeasePlacements, "systems", row),
    },
  };
}

function buildDatasetFromSnapshot(baseDataset, snapshot) {
  const dataset = cloneJson(baseDataset);
  const periods = [...(snapshot.financialPeriods ?? [])]
    .filter((row) => row.asOfDate <= snapshot.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  if (periods.length) dataset.actualData = periods.map(mapFinancialPeriod);
  const latest = periods[periods.length - 1] ?? null;
  const market = snapshot.marketSnapshot;
  if (market) {
    dataset.marketData = {
      ...dataset.marketData,
      currentPrice: market.currentPrice,
      priceDate: market.priceDate ?? market.asOfDate,
      marketCap: market.marketCap,
      enterpriseValue: market.enterpriseValue,
      sharesOutstanding: market.sharesOutstanding,
      beta: market.beta,
      forwardPe: market.forwardPe,
      evSales: market.evSales,
      evEbit: market.evEbit,
      fcfYield: market.fcfYield,
      notes: `Backend market snapshot ${market.id}`,
    };
  }
  dataset.valuationInputs = {
    ...dataset.valuationInputs,
    latestFullYearPeriodId: latest?.periodId ?? dataset.valuationInputs.latestFullYearPeriodId,
    latestQuarterPeriodId: latest?.periodId ?? dataset.valuationInputs.latestQuarterPeriodId,
    notes: [
      ...(dataset.valuationInputs.notes ?? []),
      "Backend adapter replaced static actualData with event-visible financial/KPI snapshots.",
    ],
  };
  return dataset;
}

export function buildIsrgBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = ISRG_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "ISRG",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "Phase 1 ISRG backend adapter maps SQLite event snapshots into the existing ISRG valuation engine.",
      "Q1/Q2/Q3 valuation rows use event-visible run-rate snapshots so they do not reuse stale annual anchors.",
      "AI/digital, transcript, competition and guidance candidates remain research-only unless promoted through forecast assumptions.",
      "No ISRG valuation formula is intentionally duplicated or changed in the backend pilot.",
    ],
  };
}

export async function runIsrgBackendValuation(input) {
  const payload = buildIsrgBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/isrg/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/isrg/data/index.ts");
    const backendDataset = buildDatasetFromSnapshot(dataModule.isrgData, payload.snapshot);
    const latest = backendDataset.actualData[backendDataset.actualData.length - 1];
    const market = backendDataset.marketData;
    const backendAssumptions = {
      currentPrice: market.currentPrice,
      baseDaVinciInstalledBase: latest?.installedBase?.daVinciInstalledBase?.value,
      netCash: latest?.cashInvestments?.value,
      dilutedShares: latest?.dilutedShares?.value,
      ...payload.assumptions,
    };
    const valuation = calculations.calculateIsrgValuation(backendDataset, backendAssumptions, payload.scenario);
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        valuationPeriodId: latest?.periodId ?? null,
        financialPeriodId: latest?.source?.sourceId ?? latest?.periodId ?? null,
        financialSnapshotIds: (payload.snapshot?.financialPeriods ?? []).map((row) => row.id),
        segmentSnapshotIds: (payload.snapshot?.segmentFinancials ?? []).map((row) => row.id),
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        kpiSnapshotIds: (payload.snapshot?.financialPeriods ?? []).map((row) => `${row.id}-kpi`),
        latestFinancialAsOfDate: latest?.periodEnd ?? null,
        eventType: payload.snapshot?.reportingEvent?.eventType ?? null,
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `isrg-backend-adapter-gap-${index + 1}`,
          title: "ISRG backend adapter gap",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}

