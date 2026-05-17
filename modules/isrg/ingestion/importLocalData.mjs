import { createHash } from "node:crypto";
import { ISRG_BACKEND_MODEL_VERSION } from "../valuation/modelVersion.mjs";

const TICKER = "ISRG";
const CREATED_AT = "2026-05-13T00:00:00.000Z";

function json(value) {
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function event({ id, eventDate, fiscalPeriod, fiscalYear, fiscalQuarter, eventType, label, sourceType = "earnings_release", sourcePath = null }) {
  return {
    id,
    ticker: TICKER,
    eventDate,
    fiscalPeriod,
    fiscalYear,
    fiscalQuarter,
    eventType,
    label,
    sourceType,
    sourcePath,
    createdAt: CREATED_AT,
  };
}

const historicalAnnualSeedRows = [
  { fiscalYear: 2017, annualEventDate: "2018-01-25", revenue: 3128.9, instrumentsAccessoriesRevenue: 1635, systemsRevenue: 930, servicesRevenue: 563.9, grossMargin: 0.708, operatingMargin: 0.318, dilutedShares: 357.0, cashInvestments: 3300, worldwideDaVinciProcedures: 877000, daVinciProcedureGrowth: 0.16, daVinciInstalledBase: 4409, ionInstalledBase: 0, daVinciPlacements: 684, daVinci5Placements: 0, ionPlacements: 0, operatingLeasePlacements: 185, usageBasedLeasePlacements: 0, marketPrice: 137 },
  { fiscalYear: 2018, annualEventDate: "2019-01-24", revenue: 3724.2, instrumentsAccessoriesRevenue: 2025, systemsRevenue: 1130, servicesRevenue: 569.2, grossMargin: 0.705, operatingMargin: 0.315, dilutedShares: 360.0, cashInvestments: 4100, worldwideDaVinciProcedures: 1037000, daVinciProcedureGrowth: 0.18, daVinciInstalledBase: 4986, ionInstalledBase: 0, daVinciPlacements: 926, daVinci5Placements: 0, ionPlacements: 0, operatingLeasePlacements: 250, usageBasedLeasePlacements: 0, marketPrice: 183 },
  { fiscalYear: 2019, annualEventDate: "2020-01-23", revenue: 4478.5, instrumentsAccessoriesRevenue: 2410, systemsRevenue: 1410, servicesRevenue: 658.5, grossMargin: 0.704, operatingMargin: 0.32, dilutedShares: 360.0, cashInvestments: 5200, worldwideDaVinciProcedures: 1229000, daVinciProcedureGrowth: 0.185, daVinciInstalledBase: 5582, ionInstalledBase: 10, daVinciPlacements: 1119, daVinci5Placements: 0, ionPlacements: 10, operatingLeasePlacements: 335, usageBasedLeasePlacements: 0, marketPrice: 200 },
  { fiscalYear: 2020, annualEventDate: "2021-01-21", revenue: 4358.4, instrumentsAccessoriesRevenue: 2455, systemsRevenue: 1178, servicesRevenue: 725.4, grossMargin: 0.66, operatingMargin: 0.255, dilutedShares: 361.0, cashInvestments: 6900, worldwideDaVinciProcedures: 1243000, daVinciProcedureGrowth: 0.01, daVinciInstalledBase: 5989, ionInstalledBase: 74, daVinciPlacements: 936, daVinci5Placements: 0, ionPlacements: 64, operatingLeasePlacements: 360, usageBasedLeasePlacements: 40, marketPrice: 260 },
  { fiscalYear: 2021, annualEventDate: "2022-01-20", revenue: 5710.1, instrumentsAccessoriesRevenue: 3225, systemsRevenue: 1745, servicesRevenue: 740.1, grossMargin: 0.69, operatingMargin: 0.315, dilutedShares: 362.0, cashInvestments: 8300, worldwideDaVinciProcedures: 1594000, daVinciProcedureGrowth: 0.28, daVinciInstalledBase: 6730, ionInstalledBase: 152, daVinciPlacements: 1347, daVinci5Placements: 0, ionPlacements: 78, operatingLeasePlacements: 545, usageBasedLeasePlacements: 120, marketPrice: 280 },
  { fiscalYear: 2022, annualEventDate: "2023-01-24", revenue: 6222.2, instrumentsAccessoriesRevenue: 3680, systemsRevenue: 1675, servicesRevenue: 867.2, grossMargin: 0.67, operatingMargin: 0.27, dilutedShares: 363.0, cashInvestments: 7600, worldwideDaVinciProcedures: 1875000, daVinciProcedureGrowth: 0.18, daVinciInstalledBase: 7544, ionInstalledBase: 297, daVinciPlacements: 1264, daVinci5Placements: 0, ionPlacements: 145, operatingLeasePlacements: 610, usageBasedLeasePlacements: 230, marketPrice: 250 },
  { fiscalYear: 2023, annualEventDate: "2024-01-23", revenue: 7124.1, instrumentsAccessoriesRevenue: 4320, systemsRevenue: 1650, servicesRevenue: 1154.1, grossMargin: 0.668, operatingMargin: 0.262, dilutedShares: 362.5, cashInvestments: 7200, worldwideDaVinciProcedures: 2294000, daVinciProcedureGrowth: 0.22, daVinciInstalledBase: 8606, ionInstalledBase: 534, daVinciPlacements: 1370, daVinci5Placements: 0, ionPlacements: 237, operatingLeasePlacements: 700, usageBasedLeasePlacements: 375, marketPrice: 370 },
];

const historicalQuarterEventDates = {
  2017: { 1: "2017-04-18", 2: "2017-07-20", 3: "2017-10-19" },
  2018: { 1: "2018-04-17", 2: "2018-07-19", 3: "2018-10-18" },
  2019: { 1: "2019-04-18", 2: "2019-07-18", 3: "2019-10-17" },
  2020: { 1: "2020-04-16", 2: "2020-07-21", 3: "2020-10-15" },
  2021: { 1: "2021-04-20", 2: "2021-07-20", 3: "2021-10-19" },
  2022: { 1: "2022-04-21", 2: "2022-07-21", 3: "2022-10-18" },
  2023: { 1: "2023-04-18", 2: "2023-07-20", 3: "2023-10-19" },
};

function historicalEventId(fiscalYear, fiscalQuarter) {
  if (fiscalQuarter === 4) return `isrg-fy-${fiscalYear}-earnings-${historicalAnnualSeedRows.find((row) => row.fiscalYear === fiscalYear)?.annualEventDate}`;
  return `isrg-q${fiscalQuarter}-${fiscalYear}-earnings-${historicalQuarterEventDates[fiscalYear]?.[fiscalQuarter]}`;
}

const historicalIsrgQuarterEvents = historicalAnnualSeedRows.flatMap((row) =>
  [1, 2, 3].map((quarter) =>
    event({
      id: historicalEventId(row.fiscalYear, quarter),
      eventDate: historicalQuarterEventDates[row.fiscalYear][quarter],
      fiscalPeriod: `Q${quarter} ${row.fiscalYear}`,
      fiscalYear: row.fiscalYear,
      fiscalQuarter: quarter,
      eventType: "quarterly_earnings_release",
      label: `Q${quarter} ${row.fiscalYear} Earnings Release / Historical Backend Seed`,
      sourceType: "historical_seed",
    }),
  ),
);

const historicalIsrgAnnualEvents = historicalAnnualSeedRows.map((row) =>
  event({
    id: historicalEventId(row.fiscalYear, 4),
    eventDate: row.annualEventDate,
    fiscalPeriod: `FY ${row.fiscalYear}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: 4,
    eventType: "fy_earnings_release",
    label: `FY ${row.fiscalYear} Earnings Release / Historical Backend Seed`,
    sourceType: "historical_seed",
  }),
);

const historicalIsrgEvents = [...historicalIsrgQuarterEvents, ...historicalIsrgAnnualEvents].sort((left, right) => left.eventDate.localeCompare(right.eventDate));

export const isrgReportingEvents = [
  ...historicalIsrgEvents,
  event({ id: "isrg-q2-2024-earnings-2024-07-18", eventDate: "2024-07-18", fiscalPeriod: "Q2 2024", fiscalYear: 2024, fiscalQuarter: 2, eventType: "quarterly_earnings_release", label: "Q2 2024 Earnings Release / Call" }),
  event({ id: "isrg-q3-2024-earnings-2024-10-17", eventDate: "2024-10-17", fiscalPeriod: "Q3 2024", fiscalYear: 2024, fiscalQuarter: 3, eventType: "quarterly_earnings_release", label: "Q3 2024 Earnings Release / Call" }),
  event({ id: "isrg-fy-2024-earnings-2025-01-23", eventDate: "2025-01-23", fiscalPeriod: "FY 2024", fiscalYear: 2024, fiscalQuarter: 4, eventType: "fy_earnings_release", label: "FY 2024 Earnings Release / Call" }),
  event({ id: "isrg-q1-2025-earnings-2025-04-22", eventDate: "2025-04-22", fiscalPeriod: "Q1 2025", fiscalYear: 2025, fiscalQuarter: 1, eventType: "quarterly_earnings_release", label: "Q1 2025 Earnings Release / Call" }),
  event({ id: "isrg-q2-2025-earnings-2025-07-22", eventDate: "2025-07-22", fiscalPeriod: "Q2 2025", fiscalYear: 2025, fiscalQuarter: 2, eventType: "quarterly_earnings_release", label: "Q2 2025 Earnings Release / Call" }),
  event({ id: "isrg-q3-2025-earnings-2025-10-21", eventDate: "2025-10-21", fiscalPeriod: "Q3 2025", fiscalYear: 2025, fiscalQuarter: 3, eventType: "quarterly_earnings_release", label: "Q3 2025 Earnings Release / Call" }),
  event({ id: "isrg-fy-2025-earnings-2026-01-22", eventDate: "2026-01-22", fiscalPeriod: "FY 2025", fiscalYear: 2025, fiscalQuarter: 4, eventType: "fy_earnings_release", label: "FY 2025 Earnings Release / Call" }),
  event({ id: "isrg-q1-2026-earnings-2026-04-21", eventDate: "2026-04-21", fiscalPeriod: "Q1 2026", fiscalYear: 2026, fiscalQuarter: 1, eventType: "quarterly_earnings_release", label: "Q1 2026 Earnings Release / Call", sourcePath: "data/local/isrg/official/q1_2026_earnings_release.html" }),
];

function financial(row) {
  const totalInstalledBase = row.totalInstalledBase ?? row.daVinciInstalledBase + row.ionInstalledBase;
  const systemAsp = row.systemAsp ?? row.systemsRevenue / Math.max(row.daVinciPlacements, 1);
  const leaseMix = row.leaseMix ?? row.operatingLeasePlacements / Math.max(row.daVinciPlacements, 1);
  const usageBasedLeaseMix = row.usageBasedLeaseMix ?? row.usageBasedLeasePlacements / Math.max(row.operatingLeasePlacements, 1);
  const utilizationPerSystem = row.utilizationPerSystem ?? row.worldwideDaVinciProcedures / Math.max(row.daVinciInstalledBase, 1);
  const iaRevenuePerProcedure = row.iaRevenuePerProcedure ?? (row.instrumentsAccessoriesRevenue * 1_000_000) / Math.max(row.worldwideDaVinciProcedures, 1);
  const serviceRevenuePerSystem = row.serviceRevenuePerSystem ?? (row.servicesRevenue * 1_000_000) / Math.max(row.daVinciInstalledBase, 1);
  return {
    id: row.id,
    ticker: TICKER,
    periodId: row.periodId,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: row.fiscalQuarter ?? null,
    periodType: row.periodType,
    eventId: row.eventId,
    asOfDate: row.asOfDate,
    sourceType: row.sourceType,
    sourceStatus: row.sourceStatus,
    revenue: row.revenue,
    systemsRevenue: row.systemsRevenue,
    instrumentsAccessoriesRevenue: row.instrumentsAccessoriesRevenue,
    servicesRevenue: row.servicesRevenue,
    grossProfit: row.grossProfit ?? row.revenue * row.grossMargin,
    grossMargin: row.grossMargin,
    nonGaapGrossMargin: row.nonGaapGrossMargin ?? null,
    operatingIncome: row.operatingIncome ?? row.revenue * row.operatingMargin,
    operatingMargin: row.operatingMargin,
    nonGaapOperatingIncome: row.nonGaapOperatingIncome ?? null,
    netIncome: row.netIncome ?? row.revenue * row.operatingMargin * 0.79,
    dilutedEps: row.dilutedEps ?? null,
    nonGaapEps: row.nonGaapEps ?? null,
    dilutedShares: row.dilutedShares,
    cashInvestments: row.cashInvestments,
    buybackAmount: row.buybackAmount ?? 0,
    sbcExpense: row.sbcExpense ?? null,
    rdExpense: row.rdExpense ?? row.revenue * (row.rdIntensity ?? 0.15),
    rdIntensity: row.rdIntensity ?? 0.15,
    worldwideDaVinciProcedures: row.worldwideDaVinciProcedures,
    daVinciProcedureGrowth: row.daVinciProcedureGrowth,
    combinedProcedureGrowth: row.combinedProcedureGrowth ?? row.daVinciProcedureGrowth,
    usProcedureGrowth: row.usProcedureGrowth ?? null,
    ousProcedureGrowth: row.ousProcedureGrowth ?? null,
    ionProcedureGrowth: row.ionProcedureGrowth ?? null,
    daVinciInstalledBase: row.daVinciInstalledBase,
    ionInstalledBase: row.ionInstalledBase,
    totalInstalledBase,
    daVinciPlacements: row.daVinciPlacements,
    daVinci5Placements: row.daVinci5Placements,
    ionPlacements: row.ionPlacements,
    spPlacements: row.spPlacements ?? null,
    operatingLeasePlacements: row.operatingLeasePlacements,
    usageBasedLeasePlacements: row.usageBasedLeasePlacements,
    systemAsp,
    leaseMix,
    usageBasedLeaseMix,
    utilizationPerSystem,
    instrumentsAccessoriesRevenuePerProcedure: iaRevenuePerProcedure,
    serviceRevenuePerSystem,
    servicesAttachRate: row.servicesRevenue / Math.max(totalInstalledBase, 1),
    rawJson: json({
      sourceNote: row.sourceNote,
      annualizedRunRate: row.periodType === "reporting_event_run_rate",
      kpiSnapshotId: `${row.id}-kpi`,
      sourceStatus: row.sourceStatus,
    }),
  };
}

function interpolate(previous, current, progress) {
  return previous + (current - previous) * progress;
}

function historicalQuarterRunRateRow(row, previousRow, quarter) {
  const progress = quarter / 4;
  const id = `isrg-q${quarter}-fy${row.fiscalYear}-historical-seed`;
  const eventDate = historicalQuarterEventDates[row.fiscalYear][quarter];
  const previous = previousRow ?? {
    ...row,
    revenue: row.revenue / (1 + Math.max(row.daVinciProcedureGrowth, 0.01)),
    instrumentsAccessoriesRevenue: row.instrumentsAccessoriesRevenue / (1 + Math.max(row.daVinciProcedureGrowth, 0.01)),
    systemsRevenue: row.systemsRevenue * 0.92,
    servicesRevenue: row.servicesRevenue * 0.94,
    worldwideDaVinciProcedures: row.worldwideDaVinciProcedures / (1 + Math.max(row.daVinciProcedureGrowth, 0.01)),
    daVinciInstalledBase: row.daVinciInstalledBase * 0.9,
    ionInstalledBase: Math.max(0, row.ionInstalledBase * 0.5),
    daVinciPlacements: row.daVinciPlacements * 0.9,
    ionPlacements: Math.max(0, row.ionPlacements * 0.5),
    operatingLeasePlacements: row.operatingLeasePlacements * 0.85,
    usageBasedLeasePlacements: row.usageBasedLeasePlacements * 0.75,
    cashInvestments: row.cashInvestments * 0.9,
    dilutedShares: row.dilutedShares,
    grossMargin: row.grossMargin,
    operatingMargin: row.operatingMargin,
  };
  return financial({
    id,
    periodId: `q${quarter}_${row.fiscalYear}_snapshot`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: quarter,
    periodType: "reporting_event_run_rate",
    eventId: historicalEventId(row.fiscalYear, quarter),
    asOfDate: eventDate,
    sourceType: "historical_seed",
    sourceStatus: "historical_seed",
    revenue: interpolate(previous.revenue, row.revenue, progress),
    instrumentsAccessoriesRevenue: interpolate(previous.instrumentsAccessoriesRevenue, row.instrumentsAccessoriesRevenue, progress),
    systemsRevenue: interpolate(previous.systemsRevenue, row.systemsRevenue, progress),
    servicesRevenue: interpolate(previous.servicesRevenue, row.servicesRevenue, progress),
    grossMargin: interpolate(previous.grossMargin, row.grossMargin, progress),
    operatingMargin: interpolate(previous.operatingMargin, row.operatingMargin, progress),
    dilutedShares: interpolate(previous.dilutedShares, row.dilutedShares, progress),
    cashInvestments: interpolate(previous.cashInvestments, row.cashInvestments, progress),
    worldwideDaVinciProcedures: interpolate(previous.worldwideDaVinciProcedures, row.worldwideDaVinciProcedures, progress),
    daVinciProcedureGrowth: interpolate(previous.daVinciProcedureGrowth ?? row.daVinciProcedureGrowth, row.daVinciProcedureGrowth, progress),
    daVinciInstalledBase: interpolate(previous.daVinciInstalledBase, row.daVinciInstalledBase, progress),
    ionInstalledBase: interpolate(previous.ionInstalledBase, row.ionInstalledBase, progress),
    daVinciPlacements: interpolate(previous.daVinciPlacements, row.daVinciPlacements, progress),
    daVinci5Placements: 0,
    ionPlacements: interpolate(previous.ionPlacements, row.ionPlacements, progress),
    operatingLeasePlacements: interpolate(previous.operatingLeasePlacements, row.operatingLeasePlacements, progress),
    usageBasedLeasePlacements: interpolate(previous.usageBasedLeasePlacements, row.usageBasedLeasePlacements, progress),
    sourceNote: `Q${quarter} FY${row.fiscalYear} event-visible historical run-rate seed. It interpolates from prior FY actual history toward FY${row.fiscalYear} annual history so quarterly valuations do not reuse stale annual anchors. Pending official 10-Q parser backfill.`,
  });
}

function historicalAnnualFinancialRow(row) {
  return financial({
    id: `isrg-fy${row.fiscalYear}-historical-seed`,
    periodId: `fy${row.fiscalYear}`,
    fiscalYear: row.fiscalYear,
    fiscalQuarter: 4,
    periodType: "FY",
    eventId: historicalEventId(row.fiscalYear, 4),
    asOfDate: row.annualEventDate,
    sourceType: "historical_seed",
    sourceStatus: "historical_seed",
    revenue: row.revenue,
    instrumentsAccessoriesRevenue: row.instrumentsAccessoriesRevenue,
    systemsRevenue: row.systemsRevenue,
    servicesRevenue: row.servicesRevenue,
    grossMargin: row.grossMargin,
    operatingMargin: row.operatingMargin,
    dilutedShares: row.dilutedShares,
    cashInvestments: row.cashInvestments,
    worldwideDaVinciProcedures: row.worldwideDaVinciProcedures,
    daVinciProcedureGrowth: row.daVinciProcedureGrowth,
    daVinciInstalledBase: row.daVinciInstalledBase,
    ionInstalledBase: row.ionInstalledBase,
    daVinciPlacements: row.daVinciPlacements,
    daVinci5Placements: row.daVinci5Placements,
    ionPlacements: row.ionPlacements,
    operatingLeasePlacements: row.operatingLeasePlacements,
    usageBasedLeasePlacements: row.usageBasedLeasePlacements,
    sourceNote: `FY${row.fiscalYear} historical annual seed. Revenue is public annual history; procedure, installed-base, placement, lease and segment fields are historical seed fields pending official 10-K parser backfill.`,
  });
}

const historicalIsrgFinancialPeriods = historicalAnnualSeedRows.flatMap((row, index) => {
  const previousRow = historicalAnnualSeedRows[index - 1] ?? null;
  return [
    historicalQuarterRunRateRow(row, previousRow, 1),
    historicalQuarterRunRateRow(row, previousRow, 2),
    historicalQuarterRunRateRow(row, previousRow, 3),
    historicalAnnualFinancialRow(row),
  ];
});

export const isrgFinancialPeriods = [
  ...historicalIsrgFinancialPeriods,
  financial({ id: "isrg-q2-2024-run-rate", periodId: "q2_2024_snapshot", fiscalYear: 2024, fiscalQuarter: 2, periodType: "reporting_event_run_rate", eventId: "isrg-q2-2024-earnings-2024-07-18", asOfDate: "2024-07-18", sourceType: "forecast_assumption", sourceStatus: "forecast_assumption", revenue: 7800, instrumentsAccessoriesRevenue: 4700, systemsRevenue: 1850, servicesRevenue: 1250, grossMargin: 0.67, operatingMargin: 0.29, dilutedShares: 362, cashInvestments: 7200, worldwideDaVinciProcedures: 2500000, daVinciProcedureGrowth: 0.15, daVinciInstalledBase: 9600, ionInstalledBase: 730, daVinciPlacements: 1450, daVinci5Placements: 180, ionPlacements: 260, operatingLeasePlacements: 700, usageBasedLeasePlacements: 400, sourceNote: "Event-visible annualized run-rate seed pending official Q2 2024 table import." }),
  financial({ id: "isrg-q3-2024-run-rate", periodId: "q3_2024_snapshot", fiscalYear: 2024, fiscalQuarter: 3, periodType: "reporting_event_run_rate", eventId: "isrg-q3-2024-earnings-2024-10-17", asOfDate: "2024-10-17", sourceType: "forecast_assumption", sourceStatus: "forecast_assumption", revenue: 8100, instrumentsAccessoriesRevenue: 4920, systemsRevenue: 1910, servicesRevenue: 1270, grossMargin: 0.672, operatingMargin: 0.292, dilutedShares: 362, cashInvestments: 7450, worldwideDaVinciProcedures: 2600000, daVinciProcedureGrowth: 0.16, daVinciInstalledBase: 9750, ionInstalledBase: 770, daVinciPlacements: 1500, daVinci5Placements: 280, ionPlacements: 265, operatingLeasePlacements: 735, usageBasedLeasePlacements: 430, sourceNote: "Event-visible annualized run-rate seed pending official Q3 2024 table import." }),
  financial({ id: "isrg-fy2024-actual", periodId: "fy2024", fiscalYear: 2024, fiscalQuarter: 4, periodType: "FY", eventId: "isrg-fy-2024-earnings-2025-01-23", asOfDate: "2025-01-23", sourceType: "earnings_release", sourceStatus: "official_actual", revenue: 8352.1, instrumentsAccessoriesRevenue: 5079.0, systemsRevenue: 1966.0, servicesRevenue: 1307.1, grossProfit: 5634.2, grossMargin: 5634.2 / 8352.1, operatingIncome: 2348.9, operatingMargin: 2348.9 / 8352.1, netIncome: 2322.6, dilutedEps: 6.42, dilutedShares: 362.0, cashInvestments: 7600, worldwideDaVinciProcedures: 2683000, daVinciProcedureGrowth: 0.17, daVinciInstalledBase: 9902, ionInstalledBase: 805, daVinciPlacements: 1526, daVinci5Placements: 362, ionPlacements: 271, operatingLeasePlacements: 776, usageBasedLeasePlacements: 467, sourceNote: "FY2024 official seed from ISRG earnings release." }),
  financial({ id: "isrg-q1-2025-run-rate", periodId: "q1_2025_snapshot", fiscalYear: 2025, fiscalQuarter: 1, periodType: "reporting_event_run_rate", eventId: "isrg-q1-2025-earnings-2025-04-22", asOfDate: "2025-04-22", sourceType: "derived", sourceStatus: "derived", revenue: 2253.4 * 4, instrumentsAccessoriesRevenue: 1367.7 * 4, systemsRevenue: 522.7 * 4, servicesRevenue: 363.0 * 4, grossProfit: 1457.7 * 4, grossMargin: 0.647, nonGaapGrossMargin: 0.664, operatingIncome: 578.1 * 4, operatingMargin: 578.1 / 2253.4, nonGaapOperatingIncome: 767.5 * 4, netIncome: 698.4 * 4, dilutedEps: 1.92 * 4, nonGaapEps: 1.81 * 4, dilutedShares: 364.6, cashInvestments: 8000, worldwideDaVinciProcedures: 2850000, daVinciProcedureGrowth: 0.16, daVinciInstalledBase: 10189, ionInstalledBase: 853, daVinciPlacements: 367 * 4, daVinci5Placements: 147 * 4, ionPlacements: 49 * 4, operatingLeasePlacements: 198 * 4, usageBasedLeasePlacements: 107 * 4, sbcExpense: 190 * 4, sourceNote: "Q1 2025 official quarter annualized for event-visible valuation." }),
  financial({ id: "isrg-q2-2025-run-rate", periodId: "q2_2025_snapshot", fiscalYear: 2025, fiscalQuarter: 2, periodType: "reporting_event_run_rate", eventId: "isrg-q2-2025-earnings-2025-07-22", asOfDate: "2025-07-22", sourceType: "forecast_assumption", sourceStatus: "forecast_assumption", revenue: 9400, instrumentsAccessoriesRevenue: 5650, systemsRevenue: 2250, servicesRevenue: 1500, grossMargin: 0.66, operatingMargin: 0.29, dilutedShares: 363.5, cashInvestments: 8300, worldwideDaVinciProcedures: 2950000, daVinciProcedureGrowth: 0.17, ousProcedureGrowth: 0.22, daVinciInstalledBase: 10450, ionInstalledBase: 895, daVinciPlacements: 1580, daVinci5Placements: 680, ionPlacements: 210, operatingLeasePlacements: 815, usageBasedLeasePlacements: 465, sourceNote: "Event-visible Q2 2025 run-rate seed pending official table import." }),
  financial({ id: "isrg-q3-2025-run-rate", periodId: "q3_2025_snapshot", fiscalYear: 2025, fiscalQuarter: 3, periodType: "reporting_event_run_rate", eventId: "isrg-q3-2025-earnings-2025-10-21", asOfDate: "2025-10-21", sourceType: "forecast_assumption", sourceStatus: "forecast_assumption", revenue: 9800, instrumentsAccessoriesRevenue: 5900, systemsRevenue: 2400, servicesRevenue: 1500, grossMargin: 0.662, operatingMargin: 0.30, dilutedShares: 363.0, cashInvestments: 8650, worldwideDaVinciProcedures: 3070000, daVinciProcedureGrowth: 0.18, ousProcedureGrowth: 0.23, ionProcedureGrowth: 0.48, daVinciInstalledBase: 10800, ionInstalledBase: 945, daVinciPlacements: 1660, daVinci5Placements: 780, ionPlacements: 205, operatingLeasePlacements: 850, usageBasedLeasePlacements: 480, sourceNote: "Event-visible Q3 2025 run-rate seed pending official table import." }),
  financial({ id: "isrg-fy2025-actual", periodId: "fy2025", fiscalYear: 2025, fiscalQuarter: 4, periodType: "FY", eventId: "isrg-fy-2025-earnings-2026-01-22", asOfDate: "2026-01-22", sourceType: "earnings_release", sourceStatus: "official_actual", revenue: 10064.7, instrumentsAccessoriesRevenue: 6018.9, systemsRevenue: 2473.7, servicesRevenue: 1572.1, grossProfit: 6642.3, grossMargin: 6642.3 / 10064.7, nonGaapGrossMargin: 0.676, operatingIncome: 2945.5, operatingMargin: 2945.5 / 10064.7, netIncome: 2856.0, dilutedEps: 7.87, dilutedShares: 362.7, cashInvestments: 9034.1, worldwideDaVinciProcedures: 3153000, daVinciProcedureGrowth: 0.18, combinedProcedureGrowth: 0.19, ousProcedureGrowth: 0.23, ionProcedureGrowth: 0.51, daVinciInstalledBase: 11106, ionInstalledBase: 995, daVinciPlacements: 1721, daVinci5Placements: 870, ionPlacements: 195, operatingLeasePlacements: 872, usageBasedLeasePlacements: 496, sbcExpense: 788.1, sourceNote: "FY2025 official seed from ISRG earnings release." }),
  financial({ id: "isrg-q1-2026-run-rate", periodId: "q1_2026_snapshot", fiscalYear: 2026, fiscalQuarter: 1, periodType: "reporting_event_run_rate", eventId: "isrg-q1-2026-earnings-2026-04-21", asOfDate: "2026-04-21", sourceType: "derived", sourceStatus: "derived", revenue: 2770.8 * 4, instrumentsAccessoriesRevenue: 1686.4 * 4, systemsRevenue: 650.7 * 4, servicesRevenue: 433.7 * 4, grossProfit: 1830.5 * 4, grossMargin: 0.661, nonGaapGrossMargin: 0.678, operatingIncome: 855.3 * 4, operatingMargin: 855.3 / 2770.8, nonGaapOperatingIncome: 1076.8 * 4, netIncome: 821.5 * 4, dilutedEps: 2.28 * 4, nonGaapEps: 2.5 * 4, dilutedShares: 359.8, cashInvestments: 7979.2, worldwideDaVinciProcedures: 3153000 * 1.16, daVinciProcedureGrowth: 0.16, combinedProcedureGrowth: 0.17, ionProcedureGrowth: 0.39, daVinciInstalledBase: 11395, ionInstalledBase: 1041, daVinciPlacements: 431 * 4, daVinci5Placements: 232 * 4, ionPlacements: 52 * 4, operatingLeasePlacements: 243 * 4, usageBasedLeasePlacements: 118 * 4, sbcExpense: 213 * 4, buybackAmount: 1100, sourceNote: "Q1 2026 official quarter annualized for event-visible valuation." }),
];

const segmentNames = [
  ["Systems", "systemsRevenue"],
  ["Instruments & Accessories", "instrumentsAccessoriesRevenue"],
  ["Services", "servicesRevenue"],
];

export const isrgSegmentFinancials = isrgFinancialPeriods.flatMap((period) =>
  segmentNames.map(([segment, key]) => ({
    id: `${period.id}-${segment.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    ticker: TICKER,
    periodId: period.periodId,
    eventId: period.eventId,
    asOfDate: period.asOfDate,
    segment,
    taxonomy: "isrg_operating_revenue",
    revenueDefinition: segment === "Instruments & Accessories" ? "procedure_linked_recurring_revenue" : "reported_revenue",
    revenue: period[key],
    grossProfit: null,
    grossMargin: null,
    sourceType: period.sourceType,
    sourceStatus: period.sourceStatus,
    splitSource: period.sourceStatus === "official_actual" ? "reported_segment" : "event_visible_run_rate",
    parentReportedSegment: null,
    notes:
      segment === "Instruments & Accessories"
        ? "Procedure-linked recurring revenue segment."
        : segment === "Systems"
          ? "Capital equipment placement and lease mix segment."
          : "Installed-base attached services segment.",
    rawJson: json({ optionalSegments: ["Ion / SP / digital ecosystem tracked in research fields unless separately disclosed"] }),
  })),
);

function historicalMarketSnapshotForEvent(eventRow) {
  const current = historicalAnnualSeedRows.find((row) => row.fiscalYear === eventRow.fiscalYear);
  const previous = historicalAnnualSeedRows.find((row) => row.fiscalYear === eventRow.fiscalYear - 1) ?? {
    ...current,
    marketPrice: (current?.marketPrice ?? 100) * 0.85,
    dilutedShares: current?.dilutedShares ?? 360,
    cashInvestments: (current?.cashInvestments ?? 3000) * 0.9,
  };
  const progress = eventRow.fiscalQuarter === 4 ? 1 : eventRow.fiscalQuarter / 4;
  const currentPrice = interpolate(previous.marketPrice, current.marketPrice, progress);
  const sharesOutstanding = interpolate(previous.dilutedShares, current.dilutedShares, progress);
  const cashInvestments = interpolate(previous.cashInvestments, current.cashInvestments, progress);
  const marketCap = currentPrice * sharesOutstanding;
  const enterpriseValue = Math.max(marketCap - cashInvestments, marketCap * 0.85);
  return [eventRow.eventDate, Number(currentPrice.toFixed(3)), Number(marketCap.toFixed(1)), Number(enterpriseValue.toFixed(1)), Number(sharesOutstanding.toFixed(2))];
}

const historicalIsrgMarketSnapshotRows = historicalIsrgEvents.map(historicalMarketSnapshotForEvent);

export const isrgMarketSnapshots = [
  ...historicalIsrgMarketSnapshotRows,
  ["2024-07-18", 440, 156000, 149000, 362.0],
  ["2024-10-17", 490, 176000, 168500, 362.0],
  ["2025-01-23", 570, 206000, 198500, 362.0],
  ["2025-04-22", 515, 187000, 179000, 364.6],
  ["2025-07-22", 510, 185000, 176700, 363.5],
  ["2025-10-21", 455, 165000, 156500, 363.0],
  ["2026-01-22", 560, 203000, 194000, 362.7],
  ["2026-04-21", 418.885, 148352.3, 140373.1, 354.16],
].map(([asOfDate, currentPrice, marketCap, enterpriseValue, sharesOutstanding]) => ({
  id: `isrg-market-${asOfDate}`,
  ticker: TICKER,
  asOfDate,
  priceDate: asOfDate,
  currentPrice,
  currency: "USD",
  marketCap,
  enterpriseValue,
  sharesOutstanding,
  previousClose: null,
  fiftyTwoWeekHigh: null,
  fiftyTwoWeekLow: null,
  forwardPe: null,
  evSales: enterpriseValue / 11000,
  evEbit: null,
  fcfYield: null,
  beta: 1.51,
  source: "local_market_snapshot_seed",
  fetchedAt: CREATED_AT,
  rawJson: json({ sourceStatus: "market_data", valuationUse: "currentPrice/reverse valuation only" }),
}));

export const isrgPeerSnapshots = [
  ["MDT", "Medtronic", "Hugo robotic surgery competitor"],
  ["JNJ", "Johnson & Johnson", "Ottava robotic surgery competitor"],
  ["CMR", "CMR Surgical", "Versius competitor, private-company research-only row"],
  ["SYK", "Stryker", "Mako orthopedic robotics adjacency"],
].map(([peerTicker, peerName, note]) => ({
  id: `isrg-peer-${peerTicker.toLowerCase()}`,
  ticker: TICKER,
  asOfDate: "2026-04-21",
  peerTicker,
  peerName,
  companyName: peerName,
  category: "robotic_surgery_competition",
  peerGroup: "research_only_competitor_tracker",
  marketCap: null,
  enterpriseValue: null,
  trailingPe: null,
  forwardPe: null,
  forwardEvEbitda: null,
  priceToSales: null,
  dividendYield: null,
  beta: null,
  currency: "USD",
  source: "research_only_competitor_seed",
  fetchedAt: CREATED_AT,
  confidenceLevel: "low",
  absoluteValueUse: "metadata_only_research_only",
  rawJson: json({ note, valuationImpactAllowed: false }),
}));

export const isrgGuidanceItems = [
  { id: "isrg-guidance-2026-procedure-growth", eventId: "isrg-q1-2026-earnings-2026-04-21", asOfDate: "2026-04-21", fiscalPeriodTarget: "FY 2026", metric: "daVinciProcedureGrowth", guidanceType: "official_guidance", lowValue: 0.135, highValue: 0.155, midpointValue: 0.145, unit: "percent", quote: "Worldwide da Vinci procedure growth of approximately 13.5% to 15.5% in 2026.", confidence: "high", modelReady: 0, valuationImpactAllowed: 0 },
  { id: "isrg-guidance-2026-nongaap-gm", eventId: "isrg-q1-2026-earnings-2026-04-21", asOfDate: "2026-04-21", fiscalPeriodTarget: "FY 2026", metric: "nonGaapGrossMargin", guidanceType: "official_guidance", lowValue: 0.675, highValue: 0.685, midpointValue: 0.68, unit: "percent", quote: "Non-GAAP gross profit margin to be within a range of 67.5% and 68.5% of revenue in 2026, including tariff impact.", confidence: "high", modelReady: 0, valuationImpactAllowed: 0 },
].map((row) => ({
  ...row,
  ticker: TICKER,
  speaker: "management",
  sourcePath: "data/local/isrg/official/q1_2026_earnings_release.html",
  humanReviewStatus: "reviewed_official_guidance_not_auto_promoted",
  rawJson: json({ sourceStatus: "management_guidance", promotionRule: "May affect valuation only through explicit forecast assumptions." }),
}));

const aiDigitalFields = [
  "AI-assisted workflow",
  "analytics",
  "simulation/training",
  "surgeon productivity",
  "imaging/data platform",
  "automation roadmap",
  "AI expands utilization versus commoditizes workflow",
];

export const isrgTranscriptEvents = isrgReportingEvents.map((eventRow) => ({
  id: `${eventRow.id}-transcript`,
  ticker: TICKER,
  eventId: eventRow.id,
  eventDate: eventRow.eventDate,
  fiscalPeriod: eventRow.fiscalPeriod,
  eventType: "earnings_call",
  transcriptId: `${eventRow.id}-call`,
  hasQa: 1,
  sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
  provenance: "manifest_and_ai_research_only_summary",
  confidence: eventRow.eventDate >= "2026-01-01" ? "medium" : "low",
  metadataJson: json({ researchOnly: true, aiDigitalFields }),
}));

const focusByPeriod = {
  "Q2 2024": ["procedure growth", "hospital budgets", "capital cycle"],
  "Q3 2024": ["da Vinci 5 rollout", "system placements", "replacement cycle"],
  "FY 2024": ["procedure guidance", "GLP-1 and bariatric", "OUS adoption"],
  "Q1 2025": ["lease mix", "usage-based leasing", "da Vinci 5 placement share"],
  "Q2 2025": ["China pressure", "Ion adoption", "competition"],
  "Q3 2025": ["gross margin", "tariffs", "manufacturing/supply chain"],
  "FY 2025": ["2026 guidance", "da Vinci 5 upgrade cycle", "valuation sensitivity"],
  "Q1 2026": ["tariffs", "procedure guidance", "lease quality", "AI/digital platform"],
};

export const isrgTranscriptExtractions = isrgTranscriptEvents.flatMap((transcript) => {
  const eventRow = isrgReportingEvents.find((eventItem) => eventItem.id === transcript.eventId);
  const topics = focusByPeriod[eventRow?.fiscalPeriod] ?? ["procedure growth"];
  return [
    ...topics.map((topic, index) => ({
      id: `${transcript.id}-topic-${index + 1}`,
      ticker: TICKER,
      transcriptId: transcript.transcriptId,
      eventId: transcript.eventId,
      extractionType: "market_concern",
      topic,
      segment: null,
      speaker: "analyst/management",
      section: "earnings_call_ai_research_summary",
      supportingQuoteShort: `Research-only focus area: ${topic}.`,
      confidence: "low",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({ candidateOnly: true, sourceStatus: "transcript_commentary" }),
    })),
    {
      id: `${transcript.id}-ai-digital`,
      ticker: TICKER,
      transcriptId: transcript.transcriptId,
      eventId: transcript.eventId,
      extractionType: "ai_digital_progress",
      topic: "AI / digital ecosystem",
      segment: "Digital ecosystem",
      speaker: "management",
      section: "research_only_ai_synthesis",
      supportingQuoteShort: "AI-assisted workflow, analytics, simulation/training, surgeon productivity, imaging/data platform, and automation roadmap are tracked as explicit research fields.",
      confidence: "low",
      needsHumanReview: 1,
      modelReady: 0,
      valuationImpactAllowed: 0,
      rawJson: json({
        aiDigitalFields,
        utilizationExpansionQuestion: "Could AI/digital features expand utilization per system?",
        commoditizationQuestion: "Could AI commoditize parts of workflow and compress pricing power?",
      }),
    },
  ];
});

export const isrgSourceDocuments = [
  {
    id: "isrg-eight-year-history-seed",
    ticker: TICKER,
    eventId: null,
    sourceType: "historical_seed",
    sourceStatus: "historical_seed",
    sourceName: "ISRG eight-year quarterly history seed",
    sourcePath: null,
    sourceUrl: "https://stockanalysis.com/stocks/isrg/revenue/",
    retrievedAt: CREATED_AT,
    publishedDate: null,
    provenance: "public_annual_history_seed_pending_official_parser_backfill",
    confidence: "medium",
    checksum: hash("isrg-eight-year-history-seed"),
    usedInValuation: 1,
    researchOnly: 0,
    metadataJson: json({
      contains: ["quarterly reporting events", "annual revenue history", "modeled revenue segment split", "installed base", "procedure count", "placement context"],
      limitation: "Detailed older quarterly segment/KPI fields are event-visible historical seeds pending official 10-Q / 10-K parser backfill.",
    }),
  },
  {
    id: "isrg-q1-2026-release",
    ticker: TICKER,
    eventId: "isrg-q1-2026-earnings-2026-04-21",
    sourceType: "earnings_release",
    sourceStatus: "official_actual",
    sourceName: "Q1 2026 earnings release",
    sourcePath: "data/local/isrg/official/q1_2026_earnings_release.html",
    sourceUrl: "https://www.globenewswire.com/de/news-release/2026/04/21/3278489/7637/en/intuitive-announces-first-quarter-earnings.html",
    retrievedAt: CREATED_AT,
    publishedDate: "2026-04-21",
    provenance: "official_release_cache",
    confidence: "high",
    checksum: hash("isrg-q1-2026-release"),
    usedInValuation: 1,
    researchOnly: 0,
    metadataJson: json({ contains: ["revenue", "procedure growth", "installed base", "placements", "lease mix", "guidance"] }),
  },
  {
    id: "isrg-transcript-manifest",
    ticker: TICKER,
    eventId: null,
    sourceType: "transcript",
    sourceStatus: "transcript_commentary",
    sourceName: "ISRG transcript manifest",
    sourcePath: "data/local/isrg/transcripts/transcript_manifest.json",
    sourceUrl: null,
    retrievedAt: CREATED_AT,
    publishedDate: null,
    provenance: "local_manifest",
    confidence: "low",
    checksum: hash("isrg-transcript-manifest"),
    usedInValuation: 0,
    researchOnly: 1,
    metadataJson: json({ modelReady: false, valuationImpactAllowed: false }),
  },
];

const modelVersionRow = {
  id: ISRG_BACKEND_MODEL_VERSION.version,
  ticker: TICKER,
  version: ISRG_BACKEND_MODEL_VERSION.version,
  name: ISRG_BACKEND_MODEL_VERSION.name,
  description: ISRG_BACKEND_MODEL_VERSION.description,
  codeCommitSha: null,
  valuationMethodsJson: json(ISRG_BACKEND_MODEL_VERSION.valuationMethods),
  assumptionSchemaJson: json({
    importantForecastAssumptions: [
      "installedBaseCagr",
      "procedureCagr",
      "utilizationGrowth",
      "revenuePerProcedureGrowth",
      "systemPlacementCagr",
      "systemAspGrowth",
      "daVinci5ReplacementCycleUplift",
      "operatingMargin",
      "fcfMargin",
      "ionProbability",
      "spProbability",
      "competitionAspPressure",
      "tariffGrossMarginDrag",
    ],
  }),
  createdAt: CREATED_AT,
};

const assumptionDefaults = {
  Bear: {
    installedBaseCagr: 0.06,
    procedureCagr: 0.085,
    utilizationGrowth: 0.004,
    revenuePerProcedureGrowth: 0.01,
    systemPlacementCagr: 0.015,
    systemAspGrowth: -0.015,
    operatingMargin: 0.27,
    fcfMargin: 0.225,
    ionProbability: 0.15,
    spProbability: 0.08,
    competitionAspPressure: 0.02,
    tariffGrossMarginDrag: 0.02,
  },
  Base: {
    installedBaseCagr: 0.085,
    procedureCagr: 0.125,
    utilizationGrowth: 0.018,
    revenuePerProcedureGrowth: 0.025,
    systemPlacementCagr: 0.055,
    systemAspGrowth: 0.015,
    operatingMargin: 0.31,
    fcfMargin: 0.27,
    ionProbability: 0.35,
    spProbability: 0.18,
    competitionAspPressure: 0.005,
    tariffGrossMarginDrag: 0.01,
  },
  Bull: {
    installedBaseCagr: 0.105,
    procedureCagr: 0.155,
    utilizationGrowth: 0.03,
    revenuePerProcedureGrowth: 0.035,
    systemPlacementCagr: 0.085,
    systemAspGrowth: 0.025,
    operatingMargin: 0.35,
    fcfMargin: 0.315,
    ionProbability: 0.55,
    spProbability: 0.28,
    competitionAspPressure: 0.002,
    tariffGrossMarginDrag: 0.004,
  },
};

export const isrgAssumptionSets = Object.entries(assumptionDefaults).map(([scenario, assumptions]) => ({
  id: `isrg-${scenario.toLowerCase()}-${ISRG_BACKEND_MODEL_VERSION.version}`,
  ticker: TICKER,
  name: `${scenario} backend pilot assumptions`,
  scenario,
  modelVersion: ISRG_BACKEND_MODEL_VERSION.version,
  asOfDate: "2017-04-18",
  assumptionsJson: json({
    ...assumptions,
    sourceType: "forecast_assumption",
    notes: "Backend scenario assumptions are forecast_assumption, not official_actual.",
  }),
  sourceType: "forecast_assumption",
  createdAt: CREATED_AT,
}));

export const isrgValidationWarnings = [
  {
    id: "isrg-backend-parser-gaps",
    ticker: TICKER,
    scope: "ingestion",
    severity: "medium",
    title: "Historical quarterly rows include event-visible run-rate seeds",
    detail: "FY2017-FY2023 Q1/Q2/Q3 rows and selected 2024/2025 rows are event-visible run-rate snapshots pending table-level official extraction.",
    relatedTable: "financial_periods",
    relatedRecordId: null,
    createdAt: CREATED_AT,
  },
  {
    id: "isrg-eight-year-history-seed",
    ticker: TICKER,
    scope: "historical_backfill",
    severity: "medium",
    title: "Eight-year quarterly history includes historical seed fields",
    detail: "FY2017-FY2023 quarterly rows expand backend history with public annual revenue history plus modeled ISRG-specific KPI and segment fields pending official 10-Q / 10-K parser backfill.",
    relatedTable: "financial_periods",
    relatedRecordId: null,
    createdAt: CREATED_AT,
  },
  {
    id: "isrg-transcript-candidates-research-only",
    ticker: TICKER,
    scope: "transcripts",
    severity: "low",
    title: "Transcript candidates are research-only",
    detail: "AI/digital and Q&A fields are explicit but cannot affect valuation unless promoted through forecast assumptions.",
    relatedTable: "transcript_extractions",
    relatedRecordId: null,
    createdAt: CREATED_AT,
  },
];

export function buildIsrgBackendSeedPayload() {
  return {
    reportingEvents: isrgReportingEvents,
    sourceDocuments: isrgSourceDocuments,
    financialPeriods: isrgFinancialPeriods,
    segmentFinancials: isrgSegmentFinancials,
    marketSnapshots: isrgMarketSnapshots,
    peerSnapshots: isrgPeerSnapshots,
    guidanceItems: isrgGuidanceItems,
    transcriptEvents: isrgTranscriptEvents,
    transcriptExtractions: isrgTranscriptExtractions,
    modelVersions: [modelVersionRow],
    assumptionSets: isrgAssumptionSets,
    validationWarnings: isrgValidationWarnings,
  };
}
