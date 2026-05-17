import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckSegmentEconomicsOutput } from "../types";
import { bps, millions, MiniMetric, multiple, PanelTable, pct } from "./MckPrimitives";

export function BusinessSegmentDashboard({ data }: { data: MckSegmentEconomicsOutput }) {
  const chartData = data.segments.map((segment) => ({
    segment: segment.segment.replace("Prescription Technology Solutions", "RxTS").replace("North American Pharmaceutical", "North Am Pharma"),
    revenue: segment.revenue / 1000,
    profit: segment.adjustedOperatingProfit / 1000,
    margin: segment.margin * 100,
  }));
  return (
    <SectionCard title="Segment Economics" description="Segment view separates low-margin scale distribution from higher-margin oncology, Rx technology, and Med-Surg economics.">
      <div className="grid gap-4 md:grid-cols-3">
        <MiniMetric label="Segment revenue" value={millions(data.groupRevenue)} subtext="FY2026 reported segment revenue" badge="Actual" />
        <MiniMetric label="Adjusted op profit" value={millions(data.groupAdjustedOperatingProfit)} subtext="FY2026 adjusted segment operating profit" badge="Actual" />
        <MiniMetric label="Group margin" value={bps(data.groupMarginBps)} subtext="Low by design; profit dollars and turns matter" badge="Derived" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="h-80 lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="segment" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" name="Revenue ($B)" fill="#21486f" radius={[6, 6, 0, 0]} />
              <Bar dataKey="profit" name="Adj. op profit ($B)" fill="#0f8f6f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-3">
          <PanelTable
            headers={["Segment", "Revenue", "Profit", "Margin", "Growth", "Moat", "Multiple", "Read"]}
            rows={data.segments.map((segment) => [
              segment.segment,
              millions(segment.revenue),
              millions(segment.adjustedOperatingProfit),
              pct(segment.margin),
              pct(segment.adjustedOperatingProfitGrowth),
              segment.moatScore,
              multiple(segment.multipleAssumption),
              <span className="text-slate-600">{segment.investmentRead}</span>,
            ])}
          />
        </div>
      </div>
    </SectionCard>
  );
}
