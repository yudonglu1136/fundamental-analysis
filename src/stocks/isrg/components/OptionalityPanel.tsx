import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatNumber, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function OptionalityPanel({ dashboard }: IsrgComponentProps) {
  const ionCurve = dashboard.ionEngine.earlyStageCurve.map((row) => ({
    period: row.period,
    installedBase: row.installedBase,
    placements: row.placements,
  }));
  return (
    <SectionCard title="Ion / SP Optionality" description="Ion and SP are strategic growth options, not full-TAM valuation claims. The model uses probability weighting and a de-duplication haircut.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Ion Installed Base" value={formatNumber(dashboard.ionEngine.installedBase)} text={`${formatPct(dashboard.ionEngine.installedBaseGrowth)} YoY.`} />
        <KpiTile label="Ion Placements" value={formatNumber(dashboard.ionEngine.placements)} text={`${formatPct(dashboard.ionEngine.placementGrowth)} YoY.`} />
        <KpiTile label="Ion Procedure Growth" value={formatPct(dashboard.ionEngine.procedureGrowth)} text="Early-stage platform adoption signal." tone="positive" />
        <KpiTile label="Ion Optionality / Share" value={formatUsd(dashboard.ionEngine.optionality.valuePerShare, "")} text="Probability-weighted and haircut." tone="warning" />
        <KpiTile label="SP Placements" value={formatNumber(dashboard.spEngine.placements)} text={dashboard.spEngine.status} />
        <KpiTile label="SP Optionality / Share" value={formatUsd(dashboard.spEngine.optionality.valuePerShare, "")} text="Research-only optionality." />
        <KpiTile label="De-Dup Haircut" value={formatPct(dashboard.ionEngine.optionality.deDuplicationHaircut)} text="Prevents double counting with core DCF." tone="warning" />
        <KpiTile label="Total Optionality / Share" value={formatUsd(dashboard.valuation.segmentValuation.optionality.valuePerShare, "")} text="Ion plus SP after haircut." />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ionCurve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line dataKey="installedBase" name="Ion installed base" stroke="#0f766e" strokeWidth={2} dot />
              <Line dataKey="placements" name="Ion placements" stroke="#2563eb" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="SP Strategic Questions">
          <BulletList items={dashboard.spEngine.strategicQuestions} />
        </InsightBox>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Ion Bull Case">{dashboard.ionEngine.bullCase}</InsightBox>
        <InsightBox title="Ion Bear Case">{dashboard.ionEngine.bearCase}</InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>{dashboard.ionEngine.optionality.note}</SourceNote>
      </div>
    </SectionCard>
  );
}
