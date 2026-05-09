import { Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FCFBridgeChart({
  data,
}: {
  data: Array<{ period: string; fcf: number; epsGrowth?: number; cashConversion?: number }>;
}) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="period" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Bar yAxisId="left" dataKey="fcf" fill="#21486f" radius={[8, 8, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="cashConversion" stroke="#0f8f6f" strokeWidth={3} />
          <Line yAxisId="right" type="monotone" dataKey="epsGrowth" stroke="#d97706" strokeWidth={2.5} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
