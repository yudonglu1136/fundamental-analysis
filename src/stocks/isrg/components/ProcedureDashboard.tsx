import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, formatNumber, formatPct, type IsrgComponentProps } from "./ISRGPrimitives";

export function ProcedureDashboard({ dashboard }: IsrgComponentProps) {
  const bridge = dashboard.procedureEngine.bridge.map((item) => ({
    driver: item.label,
    value: item.value * 100,
  }));
  return (
    <SectionCard title="Procedure Dashboard" description="The procedure layer separates installed-base growth from utilization and procedure mix. This is the heartbeat of ISRG's recurring revenue engine.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Worldwide Procedures" value={formatNumber(dashboard.procedureEngine.worldwideDaVinciProcedures)} text={dashboard.procedureEngine.latestFullYear} />
        <KpiTile label="Procedure Growth" value={formatPct(dashboard.procedureEngine.procedureGrowth)} text="Latest official da Vinci procedure growth." tone="positive" />
        <KpiTile label="OUS Growth" value={formatPct(dashboard.procedureEngine.ousProcedureGrowth)} text="OUS procedure growth is a long-run TAM signal." />
        <KpiTile label="Guidance Midpoint" value={formatPct(dashboard.procedureEngine.procedureGuidanceMidpoint)} text="Updated FY 2026 da Vinci procedure guide." tone="warning" />
        <KpiTile label="Procedures / System" value={formatNumber(dashboard.procedureEngine.proceduresPerSystem)} text="Full-year procedures divided by average installed base." />
        <KpiTile label="Utilization Contribution" value={formatPct(dashboard.procedureEngine.utilizationGrowth)} text="Procedure growth above installed-base growth." tone="positive" />
        <KpiTile label="Ion Procedure Growth" value={formatPct(dashboard.procedureEngine.ionProcedureGrowth)} text="Second-platform adoption signal." />
        <KpiTile label="Installed Base Growth" value={formatPct(dashboard.procedureEngine.installedBaseGrowth)} text="Core system base expansion." />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bridge}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="driver" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
              <Legend />
              <Bar dataKey="value" name="Growth contribution" fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <InsightBox title="Procedure Debate">
          <BulletList items={dashboard.procedureEngine.keyQuestions} />
        </InsightBox>
      </div>
    </SectionCard>
  );
}
