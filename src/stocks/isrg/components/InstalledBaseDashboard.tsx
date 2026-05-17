import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatNumber, formatPct, type IsrgComponentProps } from "./ISRGPrimitives";

export function InstalledBaseDashboard({ dashboard }: IsrgComponentProps) {
  const installedBaseRows = dashboard.actualData.map((period) => ({
    period: period.label,
    daVinci: period.installedBase.daVinciInstalledBase.value ?? 0,
    Ion: period.installedBase.ionInstalledBase.value ?? 0,
  }));
  return (
    <SectionCard title="Installed Base Dashboard" description="This layer asks whether new systems are incremental demand, replacements, da Vinci 5 upgrades, or lease-enabled adoption.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="da Vinci Installed Base" value={formatNumber(dashboard.installedBaseEngine.daVinciInstalledBase)} text={`${formatPct(dashboard.installedBaseEngine.daVinciInstalledBaseGrowth)} YoY.`} tone="positive" />
        <KpiTile label="Ion Installed Base" value={formatNumber(dashboard.installedBaseEngine.ionInstalledBase)} text={`${formatPct(dashboard.installedBaseEngine.ionInstalledBaseGrowth)} YoY.`} />
        <KpiTile label="da Vinci Placements" value={formatNumber(dashboard.installedBaseEngine.daVinciPlacements)} text={`${formatPct(dashboard.installedBaseEngine.daVinciPlacementGrowth)} YoY.`} />
        <KpiTile label="da Vinci 5 Share" value={formatPct(dashboard.installedBaseEngine.daVinci5PlacementShare)} text="Latest placement mix." tone="positive" />
        <KpiTile label="Lease Mix" value={formatPct(dashboard.installedBaseEngine.leaseMix)} text="Operating lease placements / placements." tone="warning" />
        <KpiTile label="Usage-Based Lease Mix" value={formatPct(dashboard.installedBaseEngine.usageBasedLeaseMix)} text="Usage-based leases / operating leases." tone="warning" />
        <KpiTile label="Net New Systems" value={formatNumber(dashboard.installedBaseEngine.netNewSystems)} text="Latest YoY net additions." />
        <KpiTile label="Replacement Proxy" value={formatPct(dashboard.installedBaseEngine.replacementCycleMix)} text="Placements not explained by net-new base." />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={installedBaseRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line dataKey="daVinci" name="da Vinci systems" stroke="#2563eb" strokeWidth={2} dot />
              <Line dataKey="Ion" name="Ion systems" stroke="#059669" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="Installed Base Questions">
          <BulletList items={dashboard.installedBaseEngine.keyQuestions} />
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.installedBaseEngine.capitalIntensityFrame}</SourceNote>
      </div>
    </SectionCard>
  );
}
