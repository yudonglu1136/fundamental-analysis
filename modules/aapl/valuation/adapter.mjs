import { createServer } from "vite";
import { AAPL_BACKEND_MODEL_VERSION } from "./modelVersion.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finiteObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
}

function clamp(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function latestByAsOfDate(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  return sorted[sorted.length - 1];
}

function selectValuationFinancial(snapshot) {
  const financials = snapshot?.financialPeriods ?? [];
  const eventId = snapshot?.reportingEvent?.id;
  const eventMatched = financials.find((row) => row.eventId === eventId);
  return eventMatched ?? latestByAsOfDate(financials);
}

function annualizeFinancial(row) {
  if (!row) return {};
  const multiplier = row.periodType === "quarter" ? 4 : 1;
  return {
    revenue: row.revenue != null ? row.revenue * multiplier : undefined,
    grossProfit: row.grossProfit != null ? row.grossProfit * multiplier : undefined,
    operatingIncome: row.operatingIncome != null ? row.operatingIncome * multiplier : undefined,
    netIncome: row.netIncome != null ? row.netIncome * multiplier : undefined,
    operatingCashFlow: row.operatingCashFlow != null ? row.operatingCashFlow * multiplier : undefined,
    capex: row.capex != null ? row.capex * multiplier : undefined,
    freeCashFlow: row.freeCashFlow != null ? row.freeCashFlow * multiplier : undefined,
    dividendsPaid: row.dividendsPaid != null ? row.dividendsPaid * multiplier : undefined,
    buybacks: row.buybacks != null ? row.buybacks * multiplier : undefined,
  };
}

const AAPL_FOUR_FOR_ONE_SPLIT_DATE = "2020-08-31";

function adjustedDilutedShares(shares, asOfDate) {
  if (typeof shares !== "number" || !Number.isFinite(shares)) return undefined;
  // Yahoo adjustedClose is split-adjusted across the full history. Pre-split
  // AAPL filing share counts must therefore be adjusted to the same basis.
  if (asOfDate && asOfDate < AAPL_FOUR_FOR_ONE_SPLIT_DATE && shares < 10_000) return shares * 4;
  return shares;
}

function numericSum(rows, key) {
  const values = rows.map((row) => Number(row?.[key])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function trailingQuarterRowsForSelected(allFinancials = [], selected) {
  if (!selected) return [];
  const quarters = [...allFinancials]
    .filter((row) => row?.periodType === "quarter" && row?.asOfDate && row.asOfDate <= selected.asOfDate)
    .sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const selectedIndex = quarters.findIndex((row) => row.periodId === selected.periodId || row.eventId === selected.eventId);
  const endIndex = selectedIndex >= 0 ? selectedIndex : quarters.length - 1;
  return quarters.slice(Math.max(0, endIndex - 3), endIndex + 1);
}

function annualizedWindowValue(rows, key) {
  if (!rows.length) return undefined;
  const value = numericSum(rows, key);
  if (value == null) return undefined;
  return value * (4 / rows.length);
}

function buildAsOfFinancialBaseline(snapshot, selected) {
  if (!selected) return null;
  const windowRows = trailingQuarterRowsForSelected(snapshot?.financialPeriods ?? [], selected);
  const selectedAnnualized = annualizeFinancial(selected);
  const revenue = annualizedWindowValue(windowRows, "revenue") ?? selectedAnnualized.revenue ?? selected.revenue;
  const grossProfit = annualizedWindowValue(windowRows, "grossProfit") ?? selectedAnnualized.grossProfit ?? selected.grossProfit;
  const operatingIncome = annualizedWindowValue(windowRows, "operatingIncome") ?? selectedAnnualized.operatingIncome ?? selected.operatingIncome;
  const netIncome = annualizedWindowValue(windowRows, "netIncome") ?? selectedAnnualized.netIncome ?? selected.netIncome;
  const operatingCashFlow =
    annualizedWindowValue(windowRows, "operatingCashFlow") ?? selectedAnnualized.operatingCashFlow ?? selected.operatingCashFlow;
  const capex = annualizedWindowValue(windowRows, "capex") ?? selectedAnnualized.capex ?? selected.capex;
  const freeCashFlow =
    annualizedWindowValue(windowRows, "freeCashFlow") ?? selectedAnnualized.freeCashFlow ?? selected.freeCashFlow;
  const dividendsPaid =
    annualizedWindowValue(windowRows, "dividendsPaid") ?? selectedAnnualized.dividendsPaid ?? selected.dividendsPaid;
  const buybacks = annualizedWindowValue(windowRows, "buybacks") ?? selectedAnnualized.buybacks ?? selected.buybacks;
  const dilutedShares = adjustedDilutedShares(selected.dilutedShares, selected.asOfDate);
  return {
    ...selected,
    id: "aapl-asof-baseline",
    periodId: "aapl-asof-baseline",
    label: `${selected.fiscalPeriod ?? `FY${selected.fiscalYear} ${selected.fiscalQuarter ?? ""}`.trim()} as-of normalized baseline`,
    periodType: "forecast",
    revenue,
    costOfRevenue: revenue != null && grossProfit != null ? revenue - grossProfit : selected.costOfRevenue,
    grossProfit,
    grossMargin: revenue && grossProfit != null ? grossProfit / revenue : selected.grossMargin,
    operatingIncome,
    operatingMargin: revenue && operatingIncome != null ? operatingIncome / revenue : selected.operatingMargin,
    netIncome,
    dilutedShares,
    dilutedEps: netIncome != null && dilutedShares ? netIncome / dilutedShares : selected.dilutedEps,
    operatingCashFlow,
    capex,
    freeCashFlow,
    dividendsPaid,
    buybacks,
    rawJson: {
      ...(parseJson(selected.rawJson, {}) ?? {}),
      label: `${selected.fiscalPeriod ?? selected.periodId} as-of normalized baseline`,
      notes:
        windowRows.length >= 4
          ? "TTM baseline from the latest four quarterly rows available as of the reporting event."
          : `YTD annualized baseline from ${windowRows.length || 1} quarterly row(s) available as of the reporting event.`,
      baselineWindowQuarterCount: windowRows.length,
      splitAdjustedDilutedShares: dilutedShares,
    },
  };
}

function slug(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildAsOfProductBaselines(productRows = [], financialRows = [], selected) {
  const windowRows = trailingQuarterRowsForSelected(financialRows, selected);
  if (!windowRows.length) return [];
  const periodIds = new Set(windowRows.map((row) => row.periodId));
  const annualizationFactor = 4 / windowRows.length;
  const rowsInWindow = productRows.filter((row) => periodIds.has(row.periodId));
  const categories = [...new Set(rowsInWindow.map((row) => row.productCategory).filter(Boolean))];
  return categories.map((category) => {
    const rows = rowsInWindow.filter((row) => row.productCategory === category);
    const latest = latestByAsOfDate(rows) ?? rows[rows.length - 1] ?? {};
    const revenue = numericSum(rows, "revenue");
    const grossProfit = numericSum(rows, "grossProfit");
    return {
      ...latest,
      id: `aapl-baseline-product-${slug(category)}`,
      periodId: "aapl-asof-baseline",
      productCategory: category,
      asOfDate: selected.asOfDate,
      revenue: revenue != null ? revenue * annualizationFactor : null,
      grossProfit: grossProfit != null ? grossProfit * annualizationFactor : null,
      grossMargin: revenue && grossProfit != null ? grossProfit / revenue : latest.grossMargin,
      sourceType: latest.sourceType ?? "official_actual",
      notes:
        windowRows.length >= 4
          ? `TTM ${category} baseline from official quarterly rows available as of ${selected.asOfDate}.`
          : `YTD annualized ${category} baseline from official quarterly rows available as of ${selected.asOfDate}.`,
    };
  });
}

function buildAsOfGeographicBaselines(geoRows = [], financialRows = [], selected) {
  const windowRows = trailingQuarterRowsForSelected(financialRows, selected);
  if (!windowRows.length) return [];
  const periodIds = new Set(windowRows.map((row) => row.periodId));
  const annualizationFactor = 4 / windowRows.length;
  const rowsInWindow = geoRows.filter((row) => periodIds.has(row.periodId));
  const geographies = [...new Set(rowsInWindow.map((row) => row.geography).filter(Boolean))];
  return geographies.map((geography) => {
    const rows = rowsInWindow.filter((row) => row.geography === geography);
    const latest = latestByAsOfDate(rows) ?? rows[rows.length - 1] ?? {};
    const revenue = numericSum(rows, "revenue");
    return {
      ...latest,
      id: `aapl-baseline-geo-${slug(geography)}`,
      periodId: "aapl-asof-baseline",
      geography,
      asOfDate: selected.asOfDate,
      revenue: revenue != null ? revenue * annualizationFactor : null,
      sourceType: latest.sourceType ?? "official_actual",
      notes:
        windowRows.length >= 4
          ? `TTM ${geography} baseline from official quarterly rows available as of ${selected.asOfDate}.`
          : `YTD annualized ${geography} baseline from official quarterly rows available as of ${selected.asOfDate}.`,
    };
  });
}

function fiscalYearProgress(asOfDate, fiscalYear) {
  const year = Number(String(asOfDate ?? "").slice(0, 4)) || fiscalYear || 2026;
  return clamp((year - 2018) / 8, 0, 1) ?? 0;
}

function mapFinancial(row) {
  if (!row) return {};
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    id: row.periodId,
    label: raw.label ?? `FY${row.fiscalYear} ${row.fiscalQuarter ?? ""}`.trim(),
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter,
    periodType: row.periodType,
    periodStartDate: row.periodStartDate,
    periodEndDate: row.periodEndDate,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : row.sourceType ?? "research_only",
    sourceId: row.eventId ?? row.id,
    asOfDate: row.asOfDate,
    revenue: row.revenue,
    costOfRevenue: row.costOfRevenue,
    grossProfit: row.grossProfit,
    grossMargin: row.grossMargin,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.operatingMargin,
    netIncome: row.netIncome,
    dilutedEps: row.dilutedEps,
    dilutedShares: row.dilutedShares,
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    freeCashFlow: row.freeCashFlow,
    dividendsPaid: row.dividendsPaid,
    buybacks: row.buybacks,
    cashAndMarketableSecurities: row.cashAndMarketableSecurities,
    debt: row.debt,
    netCashDebt: row.netCashDebt,
    notes: raw.notes ?? `Backend AAPL financial row ${row.id}`,
  };
}

function mapProduct(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    productCategory: row.productCategory,
    label: raw.label ?? row.periodId,
    revenue: row.revenue,
    costOfRevenue: row.costOfRevenue,
    grossProfit: row.grossProfit,
    grossMargin: row.grossMargin,
    growth: row.growth,
    asOfDate: row.asOfDate,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : row.sourceType ?? "research_only",
    notes: row.notes,
  };
}

function mapGeography(row) {
  const raw = parseJson(row.rawJson, {});
  return {
    ...raw,
    periodId: row.periodId,
    geography: row.geography,
    revenue: row.revenue,
    growth: row.growth,
    asOfDate: row.asOfDate,
    sourceStatus: row.sourceType === "official_actual" ? "official_actual" : row.sourceType ?? "research_only",
    notes: row.notes,
  };
}

function mapOperatingMetric(row) {
  return {
    periodId: row.periodId,
    asOfDate: row.asOfDate,
    sourceStatus: row.sourceType ?? "research_only",
    installedBaseCommentary: row.installedBaseCommentary,
    activeDevicesCommentary: row.activeDevicesCommentary,
    paidSubscriptionsCommentary: row.paidSubscriptionsCommentary,
    appStoreRegulationCommentary: row.appStoreRegulationCommentary,
    chinaCommentary: row.chinaCommentary,
    fxImpactCommentary: row.fxImpactCommentary,
    iphoneCycleCommentary: row.iphoneCycleCommentary,
    aiAppleIntelligenceCommentary: row.aiAppleIntelligenceCommentary,
    visionProCommentary: row.visionProCommentary,
    supplyChainCommentary: row.supplyChainCommentary,
    capitalReturnCommentary: row.capitalReturnCommentary,
    normalizedFcfCommentary: row.normalizedFcfCommentary,
    notes: row.notes,
  };
}

function latestProduct(rows, category) {
  return latestByAsOfDate(rows.filter((row) => row.productCategory === category && row.revenue != null));
}

function latestGeo(rows, geography) {
  return latestByAsOfDate(rows.filter((row) => row.geography === geography && row.revenue != null));
}

function buildDatasetFromSnapshot(baseDataset, snapshot, valuationFinancial) {
  const dataset = cloneJson(baseDataset);
  const financials = [...(snapshot?.financialPeriods ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const products = [...(snapshot?.productFinancials ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const geographies = [...(snapshot?.geographicFinancials ?? [])].sort((left, right) => left.asOfDate.localeCompare(right.asOfDate));
  const baselineFinancial = buildAsOfFinancialBaseline(snapshot, valuationFinancial);
  const baselineProducts = buildAsOfProductBaselines(products, financials, valuationFinancial);
  const baselineGeographies = buildAsOfGeographicBaselines(geographies, financials, valuationFinancial);
  dataset.periods = financials.map(mapFinancial);
  dataset.productFinancials = [...products, ...baselineProducts].map(mapProduct);
  dataset.geographicFinancials = [...geographies, ...baselineGeographies].map(mapGeography);
  dataset.operatingMetrics = (snapshot?.operatingMetricSnapshots ?? []).map(mapOperatingMetric);
  const selected = baselineFinancial ? mapFinancial(baselineFinancial) : valuationFinancial ? mapFinancial(valuationFinancial) : dataset.periods[dataset.periods.length - 1];
  if (selected) {
    dataset.periods = [...dataset.periods.filter((row) => row.id !== selected.id), selected];
  }
  const market = snapshot?.marketSnapshot;
  if (market) {
    dataset.marketData = {
      ...dataset.marketData,
      sourceStatus: "market_data",
      sourceId: market.id,
      currentPrice: market.currentPrice,
      priceDate: market.priceDate ?? market.asOfDate,
      source: market.source,
      sharesForMarketCap: market.sharesOutstanding ?? dataset.marketData.sharesForMarketCap,
      marketCap: market.marketCap ?? market.currentPrice * (market.sharesOutstanding ?? dataset.marketData.sharesForMarketCap),
    };
  }
  dataset.latestReportingPeriod = snapshot?.reportingEvent?.fiscalPeriod ?? dataset.latestReportingPeriod;
  return dataset;
}

function buildAsOfAssumptionOverrides({ snapshot, scenarioPreset = {}, payloadAssumptions = {}, latestFinancial }) {
  const financial = mapFinancial(latestFinancial);
  const annualized = annualizeFinancial(financial);
  const baselineProductRows = buildAsOfProductBaselines(snapshot?.productFinancials ?? [], snapshot?.financialPeriods ?? [], latestFinancial);
  const baselineGeoRows = buildAsOfGeographicBaselines(snapshot?.geographicFinancials ?? [], snapshot?.financialPeriods ?? [], latestFinancial);
  const productRows = (baselineProductRows.length ? baselineProductRows : snapshot?.productFinancials ?? []).map(mapProduct);
  const geoRows = (baselineGeoRows.length ? baselineGeoRows : snapshot?.geographicFinancials ?? []).map(mapGeography);
  const productsSegment = latestProduct(productRows, "Products");
  const servicesSegment = latestProduct(productRows, "Services");
  const iphone = latestProduct(productRows, "iPhone");
  const mac = latestProduct(productRows, "Mac");
  const ipad = latestProduct(productRows, "iPad");
  const wearables = latestProduct(productRows, "Wearables, Home and Accessories");
  const china = latestGeo(geoRows, "Greater China");
  const base = { ...scenarioPreset, ...payloadAssumptions };
  const progress = fiscalYearProgress(snapshot?.asOfDate, financial?.fiscalYear);
  const preAppleIntelligence = snapshot?.asOfDate && snapshot.asOfDate < "2024-06-10";
  const revenue = annualized.revenue ?? financial?.revenue ?? 0;
  const fcf = annualized.freeCashFlow ?? financial?.freeCashFlow ?? revenue * 0.25;
  const normalizedFcfMargin = revenue ? clamp(fcf / revenue, 0.18, 0.34) : undefined;
  const actualOperatingMargin =
    revenue && annualized.operatingIncome != null
      ? clamp(annualized.operatingIncome / revenue, 0.22, 0.40)
      : clamp(financial?.operatingMargin ?? base.operatingMargin ?? 0.32, 0.22, 0.40);
  const servicesGrossMarginFallback =
    snapshot?.asOfDate < "2020-01-01"
      ? 0.68
      : snapshot?.asOfDate < "2022-01-01"
        ? 0.70
        : snapshot?.asOfDate < "2024-01-01"
          ? 0.715
          : 0.735;
  const servicesGrossMarginScenarioSpread =
    typeof base.servicesGrossMargin === "number" ? base.servicesGrossMargin - 0.74 : 0;
  const productsGrossMargin = clamp(productsSegment?.grossMargin ?? base.productsGrossMargin ?? 0.36, 0.30, 0.43);
  const servicesGrossMargin = clamp(
    servicesSegment?.grossMargin ?? servicesGrossMarginFallback + servicesGrossMarginScenarioSpread,
    0.58,
    0.80,
  );
  const servicesGrowth = clamp(servicesSegment?.growth ?? base.servicesGrowth ?? 0.08, -0.02, 0.20);
  const iPhoneGrowth = clamp(iphone?.growth ?? base.iPhoneGrowth ?? 0.01, -0.12, 0.14);
  const otherProductsGrowth = clamp(
    [mac?.growth, ipad?.growth, wearables?.growth].filter((value) => typeof value === "number").reduce((sum, value, _index, array) => sum + value / array.length, 0) ||
      base.otherProductsGrowth ||
      0.01,
    -0.12,
    0.14,
  );
  const chinaGrowth = typeof china?.growth === "number" ? china.growth : null;
  const servicesRegulatoryHaircut =
    snapshot?.asOfDate < "2020-01-01"
      ? 0.02
      : snapshot?.asOfDate < "2023-01-01"
        ? 0.04
        : snapshot?.asOfDate < "2024-03-01"
          ? 0.055
          : base.servicesRegulatoryHaircut ?? 0.06;
  const chinaRiskHaircut =
    chinaGrowth == null
      ? (snapshot?.asOfDate < "2020-01-01" ? 0.045 : 0.06)
      : chinaGrowth < -0.08
        ? 0.09
        : chinaGrowth < 0
          ? 0.07
          : 0.045;
  const netCashDebt =
    financial?.netCashDebt ??
    ((financial?.cashAndMarketableSecurities ?? 0) - (financial?.debt ?? 0));
  const buybackYield = revenue && annualized.buybacks ? clamp(annualized.buybacks / Math.max(revenue * 7, 1), 0.01, 0.06) : base.buybackYield;
  const qualityPremium = clamp((servicesGrowth ?? 0.08) * 1.2 + (actualOperatingMargin ?? 0.31) - 0.30, -0.04, 0.08) ?? 0;
  const aiOptionalityPerShare = preAppleIntelligence
    ? 0
    : clamp((base.aiOptionalityPerShare ?? 8) * (0.30 + progress * 0.70), 0, 22);

  return finiteObject({
    currentPrice: snapshot?.marketSnapshot?.currentPrice,
    dilutedShares: adjustedDilutedShares(financial?.dilutedShares, snapshot?.asOfDate),
    netCashDebt,
    iPhoneGrowth,
    servicesGrowth,
    otherProductsGrowth,
    productsGrossMargin,
    servicesGrossMargin,
    operatingMargin: actualOperatingMargin,
    normalizedFcfMargin,
    targetFcfYield: clamp((base.targetFcfYield ?? 0.038) - qualityPremium * 0.06 + (1 - progress) * 0.006, 0.030, 0.060),
    targetPe: clamp((base.targetPe ?? 27) * (0.72 + progress * 0.28) + qualityPremium * 18, 16, 34),
    targetEvEbit: clamp((base.targetEvEbit ?? 24) * (0.72 + progress * 0.28) + qualityPremium * 14, 14, 31),
    productsSalesMultiple: clamp((base.productsSalesMultiple ?? 5) * (0.68 + progress * 0.32), 3.0, 6.5),
    servicesSalesMultiple: clamp((base.servicesSalesMultiple ?? 8.5) * (0.58 + progress * 0.42), 4.5, 11.0),
    aiOptionalityPerShare,
    servicesRegulatoryHaircut,
    chinaRiskHaircut,
    buybackYield,
  });
}

export function buildAaplBackendValuationPayload({ snapshot, scenario = "Base", modelVersion = AAPL_BACKEND_MODEL_VERSION.version, assumptions = {} }) {
  return {
    ticker: "AAPL",
    scenario,
    modelVersion,
    asOfDate: snapshot?.asOfDate,
    reportingEventId: snapshot?.reportingEvent?.id,
    assumptions,
    snapshot,
    adapterWarnings: [
      "AAPL adapter maps SQLite reporting-event snapshots into the AAPL frontend valuation engine.",
      "Historical runs use event-dated financials, product mix, geography, and market prices available on or before the reporting event date.",
      "Apple Intelligence optionality is forced to zero before WWDC 2024 to avoid future leakage.",
      "Services regulation and China risk haircuts are event-dated and not copied from the latest quarter into old years.",
      "Transcript/guidance candidates are not valuation-impacting unless explicitly promoted through reviewed assumptions.",
    ],
  };
}

export async function runAaplBackendValuation(input) {
  const payload = buildAaplBackendValuationPayload(input);
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
  try {
    const calculations = await server.ssrLoadModule("/src/stocks/aapl/calculations.ts");
    const dataModule = await server.ssrLoadModule("/src/stocks/aapl/data.ts");
    const assumptionsModule = await server.ssrLoadModule("/src/stocks/aapl/assumptions.ts");
    const selectedSnapshotFinancial = selectValuationFinancial(payload.snapshot);
    const valuationBaselineFinancial = buildAsOfFinancialBaseline(payload.snapshot, selectedSnapshotFinancial) ?? selectedSnapshotFinancial;
    const backendDataset = buildDatasetFromSnapshot(dataModule.aaplDataset, payload.snapshot, selectedSnapshotFinancial);
    const scenarioPreset = assumptionsModule.aaplScenarioPresets?.[payload.scenario] ?? {};
    const asOfOverrides = buildAsOfAssumptionOverrides({
      snapshot: payload.snapshot,
      scenarioPreset,
      payloadAssumptions: payload.assumptions,
      latestFinancial: valuationBaselineFinancial,
    });
    const backendAssumptions = {
      ...asOfOverrides,
      ...payload.assumptions,
    };
    const valuation = calculations.calculateAaplValuation(backendDataset, backendAssumptions, payload.scenario);
    const latestProductDate = latestByAsOfDate(payload.snapshot?.productFinancials ?? [])?.asOfDate ?? null;
    const latestGeoDate = latestByAsOfDate(payload.snapshot?.geographicFinancials ?? [])?.asOfDate ?? null;
    const latestFinancialDate = selectedSnapshotFinancial?.asOfDate ?? null;
    return {
      ...valuation,
      backendModelVersion: payload.modelVersion,
      backendSnapshot: {
        asOfDate: payload.asOfDate,
        reportingEventId: payload.reportingEventId,
        financialPeriodCount: payload.snapshot?.financialPeriods?.length ?? 0,
        productFinancialCount: payload.snapshot?.productFinancials?.length ?? 0,
        geographicFinancialCount: payload.snapshot?.geographicFinancials?.length ?? 0,
        operatingMetricSnapshotCount: payload.snapshot?.operatingMetricSnapshots?.length ?? 0,
        marketSnapshotId: payload.snapshot?.marketSnapshot?.id ?? null,
        valuationPeriodId: selectedSnapshotFinancial?.periodId ?? null,
        valuationBaselinePeriodId: valuationBaselineFinancial?.periodId ?? null,
        priceDate: backendDataset.marketData.priceDate,
        latestFinancialAsOfDate: latestFinancialDate,
        latestProductAsOfDate: latestProductDate,
        latestGeographicAsOfDate: latestGeoDate,
        sourceMaxAsOfDate: [latestFinancialDate, latestProductDate, latestGeoDate].filter(Boolean).sort().at(-1) ?? null,
        latestAnnualizedRevenue: valuationBaselineFinancial?.revenue ?? annualizeFinancial(selectedSnapshotFinancial).revenue ?? null,
        baselineWindowQuarterCount: parseJson(valuationBaselineFinancial?.rawJson, {})?.baselineWindowQuarterCount ?? null,
        splitAdjustedDilutedShares: adjustedDilutedShares(selectedSnapshotFinancial?.dilutedShares, payload.snapshot?.asOfDate) ?? null,
        asOfAssumptionOverrides: asOfOverrides,
        adapterWarnings: payload.adapterWarnings,
      },
      validationWarnings: [
        ...(valuation.validationWarnings ?? []),
        ...payload.adapterWarnings.map((detail, index) => ({
          id: `aapl-backend-adapter-${index + 1}`,
          title: "AAPL backend adapter note",
          detail,
          severity: "low",
        })),
      ],
    };
  } finally {
    await server.close();
  }
}
