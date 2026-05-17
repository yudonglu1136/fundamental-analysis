import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function RevenueQualityDashboard({ dashboard }: IsrgComponentProps) {
  const rows = dashboard.recurringRevenueEngine.segmentRows.map((row) => ({
    segment: row.segment,
    revenue: row.revenue,
    mix: row.mix * 100,
  }));
  return (
    <SectionCard title="Revenue Quality Dashboard" description="ISRG's revenue is not one growth line: instruments and accessories monetize procedures, systems seed future utilization, and services attach to installed base.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="I&A Revenue" value={formatUsd(dashboard.recurringRevenueEngine.instrumentsAccessoriesRevenue)} text="Procedure-linked recurring-like revenue." tone="positive" />
        <KpiTile label="Systems Revenue" value={formatUsd(dashboard.recurringRevenueEngine.systemsRevenue)} text="Placement and lease-cycle driven." />
        <KpiTile label="Service Revenue" value={formatUsd(dashboard.recurringRevenueEngine.servicesRevenue)} text="Installed-base attached revenue." />
        <KpiTile label="Recurring Revenue Mix" value={formatPct(dashboard.recurringRevenueEngine.recurringRevenueMix)} text="I&A plus services / total revenue." tone="positive" />
        <KpiTile label="Revenue / Procedure" value={formatUsd(dashboard.recurringRevenueEngine.revenuePerProcedure, "")} text="FY I&A revenue / da Vinci procedures." />
        <KpiTile label="Service / System" value={formatUsd(dashboard.recurringRevenueEngine.serviceRevenuePerInstalledSystem, "K")} text="Latest quarter service revenue per installed system proxy." />
        <KpiTile label="System ASP Proxy" value={formatUsd(dashboard.recurringRevenueEngine.systemAspProxy)} text="Systems revenue / placements; lease mix distorts this." tone="warning" />
        <KpiTile label="FY ASP Proxy" value={formatUsd(dashboard.recurringRevenueEngine.fySystemAspProxy)} text="Full-year systems revenue / placements." />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="segment" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="revenue" name="Revenue ($m)" fill="#2563eb" />
              <Bar yAxisId="right" dataKey="mix" name="% of total" fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="Segment Quality">
          <div className="space-y-3">
            {dashboard.valuation.segmentValuation.segmentQualityScores.map((score) => (
              <div key={score.segment} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-ink">{score.segment}: {score.overall.toFixed(0)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Recurrence {score.revenueRecurrence}, margin {score.marginDurability}, cyclicality {score.cyclicality}, pricing {score.pricingPower}, competition {score.competitiveIntensity}, data {score.dataConfidence}.
                </p>
              </div>
            ))}
          </div>
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.recurringRevenueEngine.flywheelReadThrough}</SourceNote>
      </div>
    </SectionCard>
  );
}
