import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InsightBox, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function CommercialExpansionEngine({ dashboard }: PltrComponentProps) {
  const rows = dashboard.actuals.map((period) => ({
    period: period.label,
    commercialRevenue: period.metrics.commercialRevenue.value,
    usCommercialRevenue: period.metrics.usCommercialRevenue.value,
    usCommercialGrowth: period.metrics.usCommercialGrowth.value,
    commercialCustomers: period.metrics.commercialCustomerCount.value,
  }));
  return (
    <InsightBox title="Commercial Engine">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value, name) => (String(name).includes("Growth") ? formatPct(Number(value)) : formatUsd(Number(value)))} />
            <Legend />
            <Bar dataKey="commercialRevenue" name="Commercial revenue" fill="#14b8a6" />
            <Bar dataKey="usCommercialRevenue" name="US commercial revenue" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p>
        Commercial is the AIP proving ground. The main question is whether bootcamp-driven adoption becomes production revenue, larger deal sizes, faster sales cycles, and higher retention.
      </p>
      <p className="mt-2">Latest US commercial growth: {formatPct(rows[rows.length - 1]?.usCommercialGrowth)}.</p>
    </InsightBox>
  );
}
