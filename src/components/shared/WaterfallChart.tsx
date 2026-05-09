import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildWaterfall } from "../../utils/chartHelpers";

export function WaterfallChart({
  rows,
  formatter,
}: {
  rows: Array<{ label: string; value: number; type: "base" | "positive" | "negative" | "total" }>;
  formatter?: (value: number) => string;
}) {
  const data = buildWaterfall(rows);
  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" interval={0} angle={-16} textAnchor="end" height={76} />
          <YAxis />
          <Tooltip formatter={(value: number) => (formatter ? formatter(value) : value.toFixed(2))} />
          <Bar dataKey="base" stackId="wf" fill="transparent" />
          <Bar dataKey="value" stackId="wf" radius={[10, 10, 0, 0]}>
            {data.map((row) => (
              <Cell key={row.label} fill={row.kind === "negative" ? "#b54743" : row.kind === "total" ? "#21486f" : row.kind === "base" ? "#94a3b8" : "#0f8f6f"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
