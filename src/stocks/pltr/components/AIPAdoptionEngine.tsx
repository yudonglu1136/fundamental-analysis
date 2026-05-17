import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function AIPAdoptionEngine({ dashboard }: PltrComponentProps) {
  const rows = dashboard.actuals.map((period) => ({
    period: period.label,
    usCommercialGrowth: period.metrics.usCommercialGrowth.value,
    usCommercialRevenue: period.metrics.usCommercialRevenue.value,
    usCommercialCustomers: period.metrics.usCommercialCustomerCount.value,
    commercialRevenuePerCustomer:
      period.metrics.commercialRevenue.value && period.metrics.commercialCustomerCount.value
        ? period.metrics.commercialRevenue.value / period.metrics.commercialCustomerCount.value
        : null,
  }));
  return (
    <SectionCard
      title="AIP Adoption Engine"
      description="Investor question: is AIP converting hype into measurable commercial revenue, customer expansion, and durable pricing power?"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="AIP Adoption Score" value={`${dashboard.aip.score}/100`} text="Research-only score. Not a direct valuation input." tone="positive" />
        <KpiTile label="US Comm Revenue" value={formatUsd(rows[rows.length - 1]?.usCommercialRevenue)} text="Latest reported US commercial revenue." tone="positive" />
        <KpiTile label="US Comm Customers" value={`${rows[rows.length - 1]?.usCommercialCustomers ?? "N/A"}`} text="TTM customer count, not weighted by revenue size." />
        <KpiTile label="Revenue / Comm Customer" value={formatUsd(rows[rows.length - 1]?.commercialRevenuePerCustomer)} text="Quarterly commercial revenue per commercial customer." />
      </div>
      <div className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value, name) => (String(name).includes("Growth") ? formatPct(Number(value)) : formatUsd(Number(value)))} />
            <Legend />
            <Line type="monotone" dataKey="usCommercialGrowth" name="US commercial growth" stroke="#0f766e" strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="commercialRevenuePerCustomer" name="Commercial revenue / customer" stroke="#7c3aed" strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <InsightBox title="Observed Evidence"><BulletList items={dashboard.aip.observedEvidence} /></InsightBox>
        <InsightBox title="Inferred Trend"><BulletList items={dashboard.aip.inferredTrend} /></InsightBox>
        <InsightBox title="Model Assumption"><BulletList items={dashboard.aip.modelAssumptions} /></InsightBox>
        <InsightBox title="Valuation Impact"><BulletList items={dashboard.aip.valuationImpact} /></InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>AIP score is research-only. It can support an explicit revenue, retention, pricing, or margin assumption, but it cannot alter valuation by itself.</SourceNote>
      </div>
    </SectionCard>
  );
}
