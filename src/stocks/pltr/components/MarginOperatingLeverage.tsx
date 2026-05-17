import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { InsightBox, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function MarginOperatingLeverage({ dashboard }: PltrComponentProps) {
  return (
    <InsightBox title="Adjusted vs GAAP Margin">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dashboard.ruleOf40}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis tickFormatter={(value) => `${Number(value * 100).toFixed(0)}%`} />
            <Tooltip formatter={(value, name) => (String(name).includes("Income") ? formatUsd(Number(value)) : formatPct(Number(value)))} />
            <Legend />
            <Bar dataKey="adjustedOperatingMargin" name="Adjusted operating margin" fill="#2563eb" />
            <Bar dataKey="gaapOperatingMargin" name="GAAP operating margin" fill="#94a3b8" />
            <Bar dataKey="fcfMargin" name="FCF margin" fill="#14b8a6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p>
        This bridge keeps adjusted and GAAP profitability side by side. If adjusted margin rises while GAAP margin or per-share FCF stalls, the operating leverage thesis needs more skepticism.
      </p>
    </InsightBox>
  );
}
