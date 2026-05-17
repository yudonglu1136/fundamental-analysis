import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, SourceNote, formatNumber, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function CustomerCohortEngine({ dashboard }: PltrComponentProps) {
  return (
    <SectionCard
      title="Customer Cohort / Land-and-Expand Engine"
      description="Investor question: is growth broad-based customer expansion, or a smaller set of large customers spending more?"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboard.cohorts.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="customerCount" name="Total customers" stroke="#0f172a" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="commercialCustomers" name="Commercial customers" stroke="#14b8a6" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="usCommercialCustomers" name="US commercial customers" stroke="#2563eb" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboard.cohorts.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value) => formatUsd(Number(value))} />
              <Legend />
              <Line type="monotone" dataKey="revenuePerCustomer" name="Revenue / customer" stroke="#7c3aed" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="commercialRevenuePerCommercialCustomer" name="Commercial revenue / customer" stroke="#ea580c" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {dashboard.cohorts.rows.slice(-3).map((row) => (
          <InsightBox key={String(row.period)} title={String(row.period)}>
            <p>Total customers: {formatNumber(Number(row.customerCount ?? 0))}</p>
            <p>Commercial customers: {formatNumber(Number(row.commercialCustomers ?? 0))}</p>
            <p>Revenue per customer: {formatUsd(Number(row.revenuePerCustomer ?? 0))}</p>
            <p>Signal: {String(row.broadBasedSignal)}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>Top-customer concentration and exact NDR history are not fully loaded yet. Those are required before concluding growth is broad-based.</SourceNote>
      </div>
    </SectionCard>
  );
}
