import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { MarginOperatingLeverage } from "./MarginOperatingLeverage";
import { KpiTile, SourceNote, formatPct, getMetric, type PltrComponentProps } from "./PLTRPrimitives";

export function RuleOf40Engine({ dashboard }: PltrComponentProps) {
  return (
    <SectionCard
      title="Rule of 40 / Operating Leverage Engine"
      description="Investor question: are margins expanding from real operating leverage, or mostly from adjusted metric treatment?"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Revenue Growth" value={formatPct(getMetric(dashboard, "yoyRevenueGrowth"))} text="Latest YoY revenue growth." tone="positive" />
        <KpiTile label="Adjusted Op Margin" value={formatPct(getMetric(dashboard, "adjustedOperatingMargin"))} text="Excludes SBC and related items." tone="positive" />
        <KpiTile label="GAAP Op Margin" value={formatPct(getMetric(dashboard, "gaapOperatingMargin"))} text="Includes SBC and gives a cleaner shareholder view." />
        <KpiTile label="Rule of 40" value={formatPct(getMetric(dashboard, "ruleOf40"))} text="Strong, but adjusted metric definitions matter." tone="warning" />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="h-72 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboard.ruleOf40}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => `${Number(value * 100).toFixed(0)}%`} />
              <Tooltip formatter={(value) => formatPct(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="revenueGrowth" name="Revenue growth" stroke="#0f766e" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="ruleOf40" name="Rule of 40" stroke="#7c3aed" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <MarginOperatingLeverage dashboard={dashboard} />
      </div>
      <div className="mt-4">
        <SourceNote>Rule of 40 is useful, but PLTR requires a GAAP and per-share check because SBC can make company-level FCF look cleaner than shareholder economics.</SourceNote>
      </div>
    </SectionCard>
  );
}
