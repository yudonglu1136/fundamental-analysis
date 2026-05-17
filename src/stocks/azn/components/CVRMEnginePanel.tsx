import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function CVRMEnginePanel({ dashboard }: { dashboard: AznDashboard }) {
  const cvrm = dashboard.cvrm;
  const scenarioRows = Object.entries(cvrm.loeAdjustedScenario).map(([scenarioName, revenue]) => ({ scenarioName, revenue }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="CVRM Revenue">{formatUsdM(cvrm.cvrmRevenue)} in Q1 2026, with Farxiga doing the heavy lifting.</AznTextPanel>
        <AznTextPanel title="Farxiga Trajectory">The engine explicitly models post-LOE erosion rather than extrapolating current growth.</AznTextPanel>
        <AznTextPanel title="Pipeline Offset">{formatUsdM(cvrm.cvrmPipelineValue)} probability-adjusted value from hypertension, CKD and metabolic follow-ons.</AznTextPanel>
        <AznTextPanel title="GLP-1 Risk"><AznBadge tone={toneForRisk(cvrm.glp1DisplacementRisk.level)}>{cvrm.glp1DisplacementRisk.level}</AznBadge><span className="ml-2">{cvrm.glp1DisplacementRisk.thesis}</span></AznTextPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Farxiga Revenue Trajectory</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cvrm.farxigaRevenueTrajectory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <Tooltip formatter={(value) => formatUsdM(Number(value))} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">LOE Adjusted Scenario</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scenarioRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="scenarioName" />
                <YAxis tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <Tooltip formatter={(value) => formatUsdM(Number(value))} />
                <Bar dataKey="revenue" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {cvrm.indicationExpansionMap.map((item) => (
          <div key={item.indication} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">{item.indication}</p>
            <p className="mt-2 text-sm text-slate-600">{item.status}</p>
            <p className="mt-2 text-xs text-rose-700">{item.risk}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
