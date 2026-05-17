import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function OncologyEnginePanel({ dashboard }: { dashboard: AznDashboard }) {
  const oncology = dashboard.oncology;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <AznTextPanel title="Oncology Revenue Base">{formatUsdM(oncology.currentOncologyRevenueBase)} in Q1 2026 revenue. The engine treats oncology as the core underwriting franchise, not just a segment row.</AznTextPanel>
        <AznTextPanel title="Pipeline Optionality">{formatUsdM(oncology.oncologyPipelineValue)} probability-adjusted pipeline value, led by camizestrant, Datroway, rilvegostomig and saruparib scenarios.</AznTextPanel>
        <AznTextPanel title="Collaboration Economics">{oncology.collaborationEconomics.join(" ")}</AznTextPanel>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink">Oncology Revenue Bridge</h3>
        <div className="mt-3 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={oncology.oncologyRevenueBridge}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="drugName" />
              <YAxis />
              <Tooltip formatter={(value) => formatUsdM(Number(value))} />
              <Bar dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="growthContribution" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AznTextPanel title="Growth Drivers">
          <ul className="space-y-2">{oncology.oncologyGrowthDrivers.map((item) => <li key={item}>{item}</li>)}</ul>
        </AznTextPanel>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Risk Heatmap</h3>
          <div className="mt-3 space-y-2">
            {oncology.oncologyRiskMatrix.map((risk) => (
              <div key={risk.risk} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{risk.risk}</p>
                  <AznBadge tone={toneForRisk(risk.severity)}>{risk.severity}</AznBadge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{risk.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(oncology.oncologyScenarioBearBaseBull).map(([scenario, value]) => (
          <div key={scenario} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{scenario}</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{formatUsdM(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
