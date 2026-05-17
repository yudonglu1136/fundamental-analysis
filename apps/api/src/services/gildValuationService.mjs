import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { execute, query } from "../db/client.mjs";
import { GILD_BACKEND_DB_PATH } from "../../../../modules/gild/db/schema.mjs";
import { GILD_BACKEND_MODEL_VERSION } from "../../../../modules/gild/valuation/modelVersion.mjs";
import { runGildBackendValuation } from "../../../../modules/gild/valuation/adapter.mjs";
import { getGildReportingEvents, getGildSnapshot } from "./gildSnapshotService.mjs";

const TICKER = "GILD";

const batchInsertPython = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(payload["dbPath"])
try:
    for row in payload["valuationRows"]:
        keys = list(row.keys())
        placeholders = ",".join(["?"] * len(keys))
        conn.execute(f"INSERT INTO valuation_runs ({','.join(keys)}) VALUES ({placeholders})", [row.get(key) for key in keys])
    for row in payload["pipelineRows"]:
        keys = list(row.keys())
        placeholders = ",".join(["?"] * len(keys))
        conn.execute(f"INSERT INTO pipeline_rnpv_components ({','.join(keys)}) VALUES ({placeholders})", [row.get(key) for key in keys])
    conn.commit()
    print(json.dumps({"valuationRows": len(payload["valuationRows"]), "pipelineRows": len(payload["pipelineRows"])}))
finally:
    conn.close()
`;

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonField(row, field) {
  if (!row?.[field]) return row;
  try {
    return { ...row, [field]: JSON.parse(row[field]) };
  } catch {
    return row;
  }
}

function parseRows(rows, fields = ["rawJson", "metadataJson", "assumptionsJson", "valuationMethodsJson", "assumptionSchemaJson", "erosionCurveJson", "rampCurveJson"]) {
  return rows.map((row) => fields.reduce((acc, field) => parseJsonField(acc, field), row));
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketSnapshotWithDailyPrice(snapshot, dailyPriceBar) {
  if (!dailyPriceBar) return snapshot;
  const adjustedClose = finiteNumber(dailyPriceBar.adjustedClose);
  const close = finiteNumber(dailyPriceBar.close);
  const price = adjustedClose ?? close;
  if (price == null) return snapshot;
  const marketSnapshot = snapshot.marketSnapshot ?? {};
  const sharesOutstanding = finiteNumber(marketSnapshot.sharesOutstanding);
  const netDebt = finiteNumber(marketSnapshot.enterpriseValue) != null && finiteNumber(marketSnapshot.marketCap) != null
    ? finiteNumber(marketSnapshot.enterpriseValue) - finiteNumber(marketSnapshot.marketCap)
    : null;
  const marketCap = sharesOutstanding != null ? price * sharesOutstanding : finiteNumber(marketSnapshot.marketCap);
  return {
    ...snapshot,
    dailyPriceBar,
    asOfPriceSource: {
      table: "daily_price_bars",
      rowId: dailyPriceBar.id,
      priceDate: dailyPriceBar.priceDate,
      source: dailyPriceBar.source,
      sourceType: dailyPriceBar.sourceType,
      adjustedCloseUsed: adjustedClose != null,
      closeUsedAsFallback: adjustedClose == null && close != null,
    },
    marketSnapshot: {
      ...marketSnapshot,
      currentPrice: price,
      priceDate: dailyPriceBar.priceDate,
      marketCap,
      enterpriseValue: marketCap != null && netDebt != null ? marketCap + netDebt : finiteNumber(marketSnapshot.enterpriseValue),
      source: `${marketSnapshot.source ?? "event market snapshot"}; ${dailyPriceBar.source ?? "daily_price_bars"}`,
    },
  };
}

function getAsOfDailyPrice(asOfDate) {
  if (!asOfDate) return null;
  const row = query(
    `SELECT id, ticker, priceDate, close, adjustedClose, source, sourceType
     FROM daily_price_bars
     WHERE ticker = ? AND priceDate <= ? AND (adjustedClose IS NOT NULL OR close IS NOT NULL)
     ORDER BY priceDate DESC
     LIMIT 1`,
    [TICKER, asOfDate],
    GILD_BACKEND_DB_PATH,
  )[0] ?? null;
  return row;
}

function latestDailyPriceFromRows(rows, asOfDate) {
  return [...rows]
    .filter((row) => String(row.priceDate ?? "") <= String(asOfDate ?? "9999-12-31") && (finiteNumber(row.adjustedClose) != null || finiteNumber(row.close) != null))
    .sort((left, right) => String(right.priceDate).localeCompare(String(left.priceDate)))[0] ?? null;
}

export function getGildValuationRuns({ asOfDate, eventId, scenario, modelVersion } = {}) {
  const clauses = ["ticker = ?"];
  const params = [TICKER];
  if (asOfDate) {
    clauses.push("asOfDate = ?");
    params.push(asOfDate);
  }
  if (eventId) {
    clauses.push("reportingEventId = ?");
    params.push(eventId);
  }
  if (scenario) {
    clauses.push("scenario = ?");
    params.push(scenario);
  }
  if (modelVersion) {
    clauses.push("modelVersion = ?");
    params.push(modelVersion);
  }
  return query(`SELECT * FROM valuation_runs WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`, params, GILD_BACKEND_DB_PATH).map((row) => ({
    ...row,
    methodOutputsJson: parseJson(row.methodOutputsJson, []),
    sensitivityTablesJson: parseJson(row.sensitivityTablesJson, []),
    warningsJson: parseJson(row.warningsJson, []),
    dataSnapshotJson: parseJson(row.dataSnapshotJson, {}),
  }));
}

export function getGildHistoricalValuations({ scenario = "Base", modelVersion = GILD_BACKEND_MODEL_VERSION.version } = {}) {
  const events = getGildReportingEvents();
  const runs = getGildValuationRuns({ scenario, modelVersion });
  const latestRunByEvent = new Map();
  for (const run of runs) {
    if (!latestRunByEvent.has(run.reportingEventId)) latestRunByEvent.set(run.reportingEventId, run);
  }
  return events.map((event) => ({
    event,
    valuationRun: latestRunByEvent.get(event.id) ?? null,
  }));
}

function getAssumptionSet({ eventId, scenario, modelVersion, asOfDate }) {
  return query(
    `SELECT * FROM assumption_sets
     WHERE ticker = ?
       AND scenario = ?
       AND modelVersion = ?
       AND (reportingEventId = ? OR asOfDate <= ?)
     ORDER BY CASE WHEN reportingEventId = ? THEN 0 ELSE 1 END, asOfDate DESC
     LIMIT 1`,
    [TICKER, scenario, modelVersion, eventId, asOfDate, eventId],
    GILD_BACKEND_DB_PATH,
  )[0] ?? null;
}

export async function createGildValuationRun({
  eventId,
  asOfDate,
  scenario = "Base",
  modelVersion = GILD_BACKEND_MODEL_VERSION.version,
  assumptions = {},
} = {}) {
  const baseSnapshot = getGildSnapshot({ eventId, asOfDate });
  if (!baseSnapshot.reportingEvent) {
    throw new Error("No GILD reporting event matched the supplied eventId/asOfDate.");
  }
  const dailyAnchoredSnapshot = marketSnapshotWithDailyPrice(baseSnapshot, getAsOfDailyPrice(baseSnapshot.asOfDate));
  const assumptionSet = getAssumptionSet({
    eventId: dailyAnchoredSnapshot.reportingEvent.id,
    scenario,
    modelVersion,
    asOfDate: dailyAnchoredSnapshot.asOfDate,
  });
  const baseAssumptions = parseJson(assumptionSet?.assumptionsJson, {});
  const valuationResult = await runGildBackendValuation({
    snapshot: { ...dailyAnchoredSnapshot, assumptionSet },
    scenario,
    modelVersion,
    assumptions: { ...baseAssumptions, ...assumptions },
  });

  const backendSnapshot = valuationResult.backendSnapshot ?? {};
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  execute(
    `INSERT INTO valuation_runs (
      id, ticker, asOfDate, reportingEventId, fiscalPeriod, scenario, modelVersion, assumptionSetId,
      valuationPeriodId, marketSnapshotId, guidanceSourceId, pipelineAssumptionSetId, patentAssumptionSetId,
      currentPrice, fairValue, targetPrice3Y, expectedShareholderCagr, upsideDownside,
      probabilityWeightedFairValue, methodOutputsJson, sensitivityTablesJson, warningsJson, dataSnapshotJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      TICKER,
      dailyAnchoredSnapshot.asOfDate,
      dailyAnchoredSnapshot.reportingEvent.id,
      dailyAnchoredSnapshot.reportingEvent.fiscalPeriod,
      scenario,
      modelVersion,
      assumptionSet?.id ?? null,
      backendSnapshot.valuationPeriodId ?? null,
      backendSnapshot.marketSnapshotId ?? null,
      backendSnapshot.guidanceSourceId ?? null,
      backendSnapshot.pipelineAssumptionSetId ?? null,
      backendSnapshot.patentAssumptionSetId ?? null,
      valuationResult.currentPrice ?? null,
      valuationResult.recommendedFairValue ?? valuationResult.blendedFairValue ?? null,
      valuationResult.targetPrice3Y ?? null,
      valuationResult.expectedReturn3Y ?? null,
      valuationResult.upsideDownside ?? null,
      valuationResult.probabilityWeightedFairValue ?? null,
      JSON.stringify(valuationResult.methodCards ?? []),
      JSON.stringify(valuationResult.sensitivityTables ?? []),
      JSON.stringify(valuationResult.validationWarnings ?? []),
      JSON.stringify(backendSnapshot),
      createdAt,
    ],
    GILD_BACKEND_DB_PATH,
  );

  for (const component of valuationResult.pipelineComponents ?? []) {
    execute(
      `INSERT INTO pipeline_rnpv_components (
        id, ticker, assetId, valuationRunId, asOfDate, probabilityOfSuccess,
        peakSalesOrEconomicsEstimate, launchYear, margin, discountRate, rnpv, sourceType, rawJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${id}-${component.assetId}`,
        TICKER,
        component.assetId,
        id,
        component.asOfDate,
        component.probabilityOfSuccess,
        component.peakSalesOrEconomicsEstimate,
        component.launchYear,
        component.margin,
        component.discountRate,
        component.rnpv,
        component.sourceType,
        JSON.stringify(component),
      ],
      GILD_BACKEND_DB_PATH,
    );
  }

  return {
    id,
    persisted: true,
    valuationRun: getGildValuationRuns({ eventId: dailyAnchoredSnapshot.reportingEvent.id, scenario, modelVersion })[0],
    valuationResult,
  };
}

export async function backfillGildValuationRuns({
  scenarios = ["Bear", "Base", "Bull"],
  modelVersion = GILD_BACKEND_MODEL_VERSION.version,
  replace = true,
} = {}) {
  if (replace) {
    execute("DELETE FROM pipeline_rnpv_components WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH);
    execute("DELETE FROM valuation_runs WHERE ticker = ? AND modelVersion = ?", [TICKER, modelVersion], GILD_BACKEND_DB_PATH);
  }
  const events = getGildReportingEvents().slice().sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const allRows = {
    financialPeriods: parseRows(query("SELECT * FROM financial_periods WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    productFinancials: parseRows(query("SELECT * FROM product_financials WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    franchiseFinancials: parseRows(query("SELECT * FROM franchise_financials WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    marketSnapshots: parseRows(query("SELECT * FROM market_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    peerSnapshots: parseRows(query("SELECT * FROM peer_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    guidanceItems: parseRows(query("SELECT * FROM guidance_items WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    transcriptEvents: parseRows(query("SELECT * FROM transcript_events WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH), ["metadataJson"]),
    transcriptExtractions: parseRows(query("SELECT * FROM transcript_extractions WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    assumptionSets: parseRows(query("SELECT * FROM assumption_sets WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH), ["assumptionsJson"]),
    modelVersions: parseRows(query("SELECT * FROM model_versions WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH), ["valuationMethodsJson", "assumptionSchemaJson"]),
    sourceDocuments: parseRows(query("SELECT * FROM source_documents WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH), ["metadataJson"]),
    productLifecycleEvents: parseRows(query("SELECT * FROM product_lifecycle_events WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    patentExclusivityEvents: parseRows(query("SELECT * FROM patent_exclusivity_events WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    pipelineAssets: parseRows(query("SELECT * FROM pipeline_assets WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    pipelineMilestones: parseRows(query("SELECT * FROM pipeline_milestones WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    dividendBuybackSnapshots: parseRows(query("SELECT * FROM dividend_buyback_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    cashDebtSnapshots: parseRows(query("SELECT * FROM cash_debt_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    acquisitionBdEvents: parseRows(query("SELECT * FROM acquisition_bd_events WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    vekluryNormalizationSnapshots: parseRows(query("SELECT * FROM veklury_normalization_snapshots WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
    validationWarnings: query("SELECT * FROM validation_warnings WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH),
    dailyPriceBars: parseRows(query("SELECT * FROM daily_price_bars WHERE ticker = ?", [TICKER], GILD_BACKEND_DB_PATH)),
  };
  const rowsAsOf = (rows, date, dateField = "asOfDate") => rows.filter((row) => String(row[dateField] ?? "") <= String(date));
  const latestAsOf = (rows, date) => rowsAsOf(rows, date).sort((left, right) => String(right.asOfDate).localeCompare(String(left.asOfDate)))[0] ?? null;
  const assumptionFor = (event, scenario) =>
    allRows.assumptionSets
      .filter((row) => row.scenario === scenario && row.modelVersion === modelVersion && (row.reportingEventId === event.id || row.asOfDate <= event.eventDate))
      .sort((left, right) => (left.reportingEventId === event.id ? -1 : right.reportingEventId === event.id ? 1 : String(right.asOfDate).localeCompare(String(left.asOfDate))))[0] ?? null;
  const created = [];
  const failed = [];
  const valuationRows = [];
  const pipelineRows = [];
  for (const event of events) {
    for (const scenario of scenarios) {
      try {
        const assumptionSet = assumptionFor(event, scenario);
        const snapshot = marketSnapshotWithDailyPrice({
          reportingEvent: event,
          asOfDate: event.eventDate,
          financialPeriods: rowsAsOf(allRows.financialPeriods, event.eventDate),
          productFinancials: rowsAsOf(allRows.productFinancials, event.eventDate),
          franchiseFinancials: rowsAsOf(allRows.franchiseFinancials, event.eventDate),
          marketSnapshot: latestAsOf(allRows.marketSnapshots, event.eventDate),
          peerSnapshots: rowsAsOf(allRows.peerSnapshots, event.eventDate),
          guidanceItems: rowsAsOf(allRows.guidanceItems, event.eventDate),
          transcriptEvents: rowsAsOf(allRows.transcriptEvents, event.eventDate, "eventDate"),
          transcriptExtractions: allRows.transcriptExtractions.filter((row) => row.eventId === event.id),
          assumptionSets: rowsAsOf(allRows.assumptionSets, event.eventDate),
          assumptionSet,
          modelVersions: allRows.modelVersions,
          sourceDocuments: allRows.sourceDocuments,
          productLifecycleEvents: rowsAsOf(allRows.productLifecycleEvents, event.eventDate, "eventDate"),
          patentExclusivityEvents: rowsAsOf(allRows.patentExclusivityEvents, event.eventDate),
          pipelineAssets: rowsAsOf(allRows.pipelineAssets, event.eventDate),
          pipelineMilestones: rowsAsOf(allRows.pipelineMilestones, event.eventDate, "milestoneDate"),
          dividendBuybackSnapshots: rowsAsOf(allRows.dividendBuybackSnapshots, event.eventDate),
          cashDebtSnapshots: rowsAsOf(allRows.cashDebtSnapshots, event.eventDate),
          acquisitionBdEvents: rowsAsOf(allRows.acquisitionBdEvents, event.eventDate, "eventDate"),
          vekluryNormalizationSnapshots: rowsAsOf(allRows.vekluryNormalizationSnapshots, event.eventDate),
          validationWarnings: allRows.validationWarnings,
        }, latestDailyPriceFromRows(allRows.dailyPriceBars, event.eventDate));
        const baseAssumptions = assumptionSet?.assumptionsJson ?? {};
        const valuationResult = await runGildBackendValuation({
          snapshot,
          scenario,
          modelVersion,
          assumptions: baseAssumptions,
        });
        const backendSnapshot = valuationResult.backendSnapshot ?? {};
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        valuationRows.push({
          id,
          ticker: TICKER,
          asOfDate: event.eventDate,
          reportingEventId: event.id,
          fiscalPeriod: event.fiscalPeriod,
          scenario,
          modelVersion,
          assumptionSetId: assumptionSet?.id ?? null,
          valuationPeriodId: backendSnapshot.valuationPeriodId ?? null,
          marketSnapshotId: backendSnapshot.marketSnapshotId ?? null,
          guidanceSourceId: backendSnapshot.guidanceSourceId ?? null,
          pipelineAssumptionSetId: backendSnapshot.pipelineAssumptionSetId ?? null,
          patentAssumptionSetId: backendSnapshot.patentAssumptionSetId ?? null,
          currentPrice: valuationResult.currentPrice ?? null,
          fairValue: valuationResult.recommendedFairValue ?? valuationResult.blendedFairValue ?? null,
          targetPrice3Y: valuationResult.targetPrice3Y ?? null,
          expectedShareholderCagr: valuationResult.expectedReturn3Y ?? null,
          upsideDownside: valuationResult.upsideDownside ?? null,
          probabilityWeightedFairValue: valuationResult.probabilityWeightedFairValue ?? null,
          methodOutputsJson: JSON.stringify(valuationResult.methodCards ?? []),
          sensitivityTablesJson: JSON.stringify(valuationResult.sensitivityTables ?? []),
          warningsJson: JSON.stringify(valuationResult.validationWarnings ?? []),
          dataSnapshotJson: JSON.stringify(backendSnapshot),
          createdAt,
        });
        for (const component of valuationResult.pipelineComponents ?? []) {
          pipelineRows.push({
            id: `${id}-${component.assetId}`,
            ticker: TICKER,
            assetId: component.assetId,
            valuationRunId: id,
            asOfDate: component.asOfDate,
            probabilityOfSuccess: component.probabilityOfSuccess,
            peakSalesOrEconomicsEstimate: component.peakSalesOrEconomicsEstimate,
            launchYear: component.launchYear,
            margin: component.margin,
            discountRate: component.discountRate,
            rnpv: component.rnpv,
            sourceType: component.sourceType,
            rawJson: JSON.stringify(component),
          });
        }
        created.push({
          eventId: event.id,
          eventDate: event.eventDate,
          eventType: event.eventType,
          scenario,
          valuationRunId: id,
          fairValue: valuationRows[valuationRows.length - 1]?.fairValue ?? null,
          currentPrice: valuationRows[valuationRows.length - 1]?.currentPrice ?? null,
        });
      } catch (error) {
        failed.push({ eventId: event.id, scenario, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (valuationRows.length) {
    const result = spawnSync("python3", ["-c", batchInsertPython], {
      input: JSON.stringify({
        dbPath: GILD_BACKEND_DB_PATH,
        valuationRows,
        pipelineRows,
      }),
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
  }
  return {
    ticker: TICKER,
    modelVersion,
    scenarios,
    replace,
    created,
    failed,
    createdCount: created.length,
    failedCount: failed.length,
  };
}
