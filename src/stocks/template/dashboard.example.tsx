import { useMemo } from "react";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { buildExampleDashboardData } from "./calculations.example";
import { exampleData } from "./data.example";

function currency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "n/a";
}

function percent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

export function ExampleDashboard({ module, scenario, dataSourceType }: StockDashboardProps) {
  const dashboard = useMemo(() => buildExampleDashboardData(exampleData, scenario), [scenario]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="ontology-label">Replace with company-specific archetype</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-4xl font-semibold tracking-normal text-ink">{module.ticker} · {module.name}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Replace this template with a company-specific buy-side research framework. The final module should include deep research panels, historical valuation data, source gaps, and risk red-team logic.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-normal text-slate-500">
            <DataQualityBadge badge={dataSourceType === "api" ? "Actual" : "Placeholder"} />
            <span>{dataSourceType}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((metric) => (
          <MetricCard key={metric.key} metric={metric} currency={module.currency} />
        ))}
      </div>

      <SectionCard
        title="Company-Specific Research Framework"
        description="Replace these rows with the real investor questions, KPI map, source evidence, variant perception, and monitoring triggers."
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Investor question</th>
                <th className="px-3 py-2">Dashboard section</th>
                <th className="px-3 py-2">Model driver</th>
                <th className="px-3 py-2">Evidence needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {dashboard.researchQuestions.map((row) => (
                <tr key={row.question}>
                  <td className="px-3 py-2 font-medium text-ink">{row.question}</td>
                  <td className="px-3 py-2">{row.dashboardSection}</td>
                  <td className="px-3 py-2">{row.modelDriver}</td>
                  <td className="px-3 py-2">{row.evidenceNeeded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Historical Valuation Template"
        description="Production modules should follow the MSFT/AAPL backend historical valuation pattern or include clearly labeled local fallback rows."
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Event date</th>
                <th className="px-3 py-2">Fiscal period</th>
                <th className="px-3 py-2">As-of price</th>
                <th className="px-3 py-2">Fair value</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {dashboard.historicalValuationRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.eventDate}</td>
                  <td className="px-3 py-2 font-medium text-ink">{row.fiscalPeriod}</td>
                  <td className="px-3 py-2">{currency(row.asOfPrice)}</td>
                  <td className="px-3 py-2">{currency(row.fairValue)}</td>
                  <td className="px-3 py-2">{percent(row.gapPct)}</td>
                  <td className="px-3 py-2">{row.method}</td>
                  <td className="px-3 py-2">{row.sourceStatus.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Source Gaps" description="Keep uncertainty visible until the module has sourced actuals and backend data.">
        <ul className="space-y-2 text-sm leading-6 text-slate-600">
          {dashboard.sourceGaps.map((gap) => (
            <li key={gap}>- {gap}</li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
