import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { InsightBox, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function GovernmentBusinessEngine({ dashboard }: PltrComponentProps) {
  const rows = dashboard.actuals.map((period) => ({
    period: period.label,
    governmentRevenue: period.metrics.governmentRevenue.value,
    usGovernmentRevenue: period.metrics.usGovernmentRevenue.value,
    mix: period.metrics.governmentRevenue.value && period.metrics.revenue.value ? period.metrics.governmentRevenue.value / period.metrics.revenue.value : null,
  }));
  return (
    <InsightBox title="Government Engine">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value) => formatUsd(Number(value))} />
            <Legend />
            <Line type="monotone" dataKey="governmentRevenue" name="Government revenue" stroke="#0f172a" strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="usGovernmentRevenue" name="US government revenue" stroke="#2563eb" strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <p>Government is sticky and mission-critical, especially in defense, intelligence, national security, and regulated operations.</p>
        <p>Key risks are procurement timing, contract concentration, political scrutiny, budget cycles, and international volatility.</p>
      </div>
      <SourceNote>Latest government mix: {formatPct(rows[rows.length - 1]?.mix)}. Missing period values remain visible instead of being invented.</SourceNote>
    </InsightBox>
  );
}
