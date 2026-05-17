import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, KpiTile, SourceNote, formatPct, formatUsd, getMetric, type PltrComponentProps } from "./PLTRPrimitives";

export function SBCDilutionTracker({ dashboard }: PltrComponentProps) {
  return (
    <SectionCard
      title="SBC / Dilution Tracker"
      description="Investor question: is operating performance accruing to shareholders after stock compensation and dilution?"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="SBC Expense" value={formatUsd(getMetric(dashboard, "sbcExpense"))} text="Latest stock-based compensation expense." tone="warning" />
        <KpiTile label="SBC / Revenue" value={formatPct(getMetric(dashboard, "sbcAsPctRevenue"))} text="A direct drag on GAAP margins and dilution debate." tone="warning" />
        <KpiTile label="Adjusted FCF" value={formatUsd(getMetric(dashboard, "adjustedFreeCashFlow"))} text="Company-level cash flow before per-share dilution check." tone="positive" />
        <KpiTile label="Net Cash" value={formatUsd(getMetric(dashboard, "netCash"))} text="Balance sheet strength offsets some valuation risk." />
      </div>
      <div className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dashboard.sbc.rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip formatter={(value, name) => (String(name).includes("%") || String(name).includes("Margin") ? formatPct(Number(value)) : formatUsd(Number(value)))} />
            <Legend />
            <Line type="monotone" dataKey="sbcAsPctRevenue" name="SBC / revenue" stroke="#ea580c" strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="perShareFcf" name="FCF per share" stroke="#0f766e" strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Company-Level FCF">Adjusted free cash flow can be very strong while still overstating per-share economics if dilution is persistent.</InsightBox>
        <InsightBox title="Per-Share FCF">Per-share FCF should use diluted shares. The starter model uses a proxy until official diluted weighted-average shares are extracted.</InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.sbc.warning}</SourceNote>
      </div>
    </SectionCard>
  );
}
