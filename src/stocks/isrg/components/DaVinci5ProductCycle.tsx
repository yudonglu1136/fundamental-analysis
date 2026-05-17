import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatNumber, formatPct, type IsrgComponentProps } from "./ISRGPrimitives";

export function DaVinci5ProductCycle({ dashboard }: IsrgComponentProps) {
  const curve = dashboard.daVinci5Engine.adoptionCurve.map((row) => ({
    period: row.period,
    placementShare: row.placementShare * 100,
    leaseMix: row.leaseMix * 100,
  }));
  return (
    <SectionCard title="da Vinci 5 Product Cycle" description="da Vinci 5 can matter through placements, replacement cycle, ASP, margin, utilization, and digital capability. The module keeps narrative out of valuation unless assumptions are changed.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Latest DV5 Placements" value={formatNumber(dashboard.daVinci5Engine.latestDaVinci5Placements)} text="Latest official quarter." tone="positive" />
        <KpiTile label="Placement Share" value={formatPct(dashboard.daVinci5Engine.latestPlacementShare)} text="DV5 / total da Vinci placements." tone="positive" />
        <KpiTile label="Upgrade Cycle Proxy" value={formatPct(dashboard.installedBaseEngine.replacementCycleMix)} text="Latest replacement proxy." tone="warning" />
        <KpiTile label="Lease Mix" value={formatPct(dashboard.installedBaseEngine.leaseMix)} text="Lease mix can change system revenue timing." />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Line dataKey="placementShare" name="DV5 placement share" stroke="#2563eb" strokeWidth={2} dot />
              <Line dataKey="leaseMix" name="Operating lease mix" stroke="#f59e0b" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="Feature Map">
          <BulletList items={dashboard.daVinci5Engine.features} />
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {dashboard.daVinci5Engine.approvalTimeline.map((event) => (
          <InsightBox key={event.id} title={event.title}>
            <p>{event.date} / {event.geography}</p>
            <p className="mt-2">{event.description}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.daVinci5Engine.warning}</SourceNote>
      </div>
    </SectionCard>
  );
}
