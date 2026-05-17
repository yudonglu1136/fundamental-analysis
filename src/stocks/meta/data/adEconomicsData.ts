import type { MetaAdEconomicsPoint } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

export const metaAdEconomicsData: MetaAdEconomicsPoint[] = [
  {
    periodId: "fy2025",
    sourceStatus: "official_actual",
    sourceId: "meta-fy2025-pr",
    lineage: metaLineage.fy2025Actual,
    fieldLineage: fieldLineage([
      "advertisingRevenue",
      "familyDailyActivePeople",
      "adImpressionsGrowth",
      "averagePricePerAdGrowth",
      "adRevenueGrowth",
    ], metaLineage.fy2025Actual),
    advertisingRevenue: 196.175,
    familyDailyActivePeople: 3.58,
    adImpressionsGrowth: 0.12,
    averagePricePerAdGrowth: 0.09,
    adRevenueGrowth: 0.22,
    impliedGrowthFromImpressionsAndPrice: (1 + 0.12) * (1 + 0.09) - 1,
    notes: "FY 2025 advertising revenue and ad impression / average price growth.",
  },
  {
    periodId: "q1_2026",
    sourceStatus: "official_actual",
    sourceId: "meta-q1-2026-pr",
    lineage: metaLineage.q1_2026Actual,
    fieldLineage: fieldLineage([
      "advertisingRevenue",
      "familyDailyActivePeople",
      "adImpressionsGrowth",
      "averagePricePerAdGrowth",
      "constantCurrencyAdRevenueGrowth",
      "adRevenueGrowth",
    ], metaLineage.q1_2026Actual),
    advertisingRevenue: 55.024,
    familyDailyActivePeople: 3.56,
    adImpressionsGrowth: 0.19,
    averagePricePerAdGrowth: 0.12,
    constantCurrencyAdRevenueGrowth: 0.27,
    adRevenueGrowth: 0.3,
    impliedGrowthFromImpressionsAndPrice: (1 + 0.19) * (1 + 0.12) - 1,
    notes: "Q1 2026 advertising revenue grew from both impression volume and price per ad.",
  },
];
