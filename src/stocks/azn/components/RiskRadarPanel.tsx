import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function RiskRadarPanel({ dashboard }: { dashboard: AznDashboard }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="Aggregate Risk Score">{dashboard.risks.aggregateRiskScore}/100 across patent, clinical, pricing, China, FX, licensing and competition.</AznTextPanel>
        {dashboard.risks.monitoringTriggers.slice(0, 3).map((trigger) => (
          <AznTextPanel key={trigger} title="Monitoring Trigger">{trigger}</AznTextPanel>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink">Risk Radar</h3>
        <div className="mt-3 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dashboard.risks.risks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="category" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {dashboard.risks.risks.map((risk) => <Cell key={risk.category} fill={risk.score >= 70 ? "#dc2626" : risk.score >= 50 ? "#f59e0b" : "#0f766e"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {dashboard.risks.risks.map((risk) => (
          <div key={risk.category} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">{risk.category}</p>
              <AznBadge tone={toneForRisk(risk.level)}>{risk.level}</AznBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{risk.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
