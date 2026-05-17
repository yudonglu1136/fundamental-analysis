import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OFFICIAL_DATASET = path.join(ROOT, "data/local/meta/official/meta_official_dataset.json");
const OUTPUT_PATH = path.join(ROOT, "data/local/meta/meta_metric_database.json");

const raw = JSON.parse(await fs.readFile(OFFICIAL_DATASET, "utf8"));

const metrics = [];
for (const period of raw.periods) {
  metrics.push(
    { period_id: period.id, metric: "revenue", value: period.revenue, unit: "USD billions", source_status: "official_actual", source_id: period.source_id, lineage: period.lineage },
    { period_id: period.id, metric: "operating_income", value: period.operatingIncome, unit: "USD billions", source_status: "official_actual", source_id: period.source_id, lineage: period.lineage },
    { period_id: period.id, metric: "free_cash_flow", value: period.freeCashFlow, unit: "USD billions", source_status: "official_actual", source_id: period.source_id, lineage: period.lineage },
    { period_id: period.id, metric: "capex_incl_finance_leases", value: period.capexInclFinanceLeases, unit: "USD billions", source_status: "official_actual", source_id: period.source_id, lineage: period.lineage },
    { period_id: period.id, metric: "diluted_eps", value: period.dilutedEps, unit: "USD / share", source_status: "official_actual", source_id: period.source_id, lineage: period.lineage },
  );
}

for (const segment of raw.segments) {
  metrics.push(
    { period_id: segment.period_id, metric: `${segment.segment.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_revenue`, value: segment.revenue, unit: "USD billions", source_status: "official_actual", source_id: segment.source_id, lineage: segment.lineage },
    { period_id: segment.period_id, metric: `${segment.segment.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_operating_income`, value: segment.operatingIncome, unit: "USD billions", source_status: "official_actual", source_id: segment.source_id, lineage: segment.lineage },
  );
}

metrics.push(
  { period_id: "q2_2026e", metric: "revenue_guidance_low", value: raw.guidance.q2_2026_revenue_range[0], unit: "USD billions", source_status: "management_guidance", source_id: "meta-q1-2026-pr", lineage: raw.guidance.lineage },
  { period_id: "q2_2026e", metric: "revenue_guidance_high", value: raw.guidance.q2_2026_revenue_range[1], unit: "USD billions", source_status: "management_guidance", source_id: "meta-q1-2026-pr", lineage: raw.guidance.lineage },
  { period_id: "fy2026e", metric: "capex_guidance_low", value: raw.guidance.fy2026_capex_range[0], unit: "USD billions", source_status: "management_guidance", source_id: "meta-q1-2026-pr", lineage: raw.guidance.lineage },
  { period_id: "fy2026e", metric: "capex_guidance_high", value: raw.guidance.fy2026_capex_range[1], unit: "USD billions", source_status: "management_guidance", source_id: "meta-q1-2026-pr", lineage: raw.guidance.lineage },
);

await fs.writeFile(OUTPUT_PATH, JSON.stringify({
  company: raw.company,
  ticker: raw.ticker,
  built_at: new Date().toISOString(),
  metrics,
}, null, 2));

console.log(`META metric database saved to ${OUTPUT_PATH} with ${metrics.length} metric rows.`);
