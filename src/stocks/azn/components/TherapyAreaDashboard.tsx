import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, formatPct, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

const COLORS = ["#0f766e", "#2563eb", "#9333ea", "#dc2626", "#f59e0b", "#64748b"];

export function TherapyAreaDashboard({ dashboard }: { dashboard: AznDashboard }) {
  const rows = dashboard.therapyAreaDashboard.therapyAreas;
  const chartData = rows.map((row) => ({
    name: row.therapyArea,
    revenue: row.revenue,
    growth: row.yoyGrowthCer * 100,
    mix: row.percentageOfTotal * 100,
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-[320px] lg:col-span-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip formatter={(value, name) => name === "revenue" ? formatUsdM(Number(value)) : `${Number(value).toFixed(1)}%`} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                {chartData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[320px] lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="revenue" nameKey="name" innerRadius={65} outerRadius={115} paddingAngle={2}>
                {chartData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => formatUsdM(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.therapyArea} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{row.therapyArea}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatUsdM(row.revenue)} · {formatPct(row.percentageOfTotal)} of total · {formatPct(row.yoyGrowthCer)} CER growth</p>
              </div>
              <AznBadge tone={row.yoyGrowthCer > 0.1 ? "green" : row.yoyGrowthCer < 0 ? "red" : "amber"}>{formatPct(row.yoyGrowthCer)}</AznBadge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.keyProducts.map((product) => <AznBadge key={product} tone="blue">{product}</AznBadge>)}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Drivers</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {row.growthDrivers.map((driver) => <li key={driver}>{driver}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Risks</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {row.keyRisks.map((risk) => <li key={risk}><AznBadge tone={toneForRisk(risk)}>{risk}</AznBadge></li>)}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
