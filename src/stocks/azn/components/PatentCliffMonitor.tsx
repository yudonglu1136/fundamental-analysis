import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { buildPatentCliffMonitor } from "../engines/patentCliffEngine";
import type { AznRegion } from "../types";
import { AznBadge, formatPct, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

const REGIONS: AznRegion[] = ["Global", "US", "Europe", "China", "Japan"];

export function PatentCliffMonitor({ dashboard }: { dashboard: AznDashboard }) {
  const [region, setRegion] = useState<AznRegion>("Global");
  const monitor = useMemo(() => {
    return dashboard.dataset ? buildPatentCliffMonitor(dashboard.dataset, region) : dashboard.patentCliff;
  }, [dashboard.dataset, dashboard.patentCliff, region]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((item) => (
          <button key={item} type="button" onClick={() => setRegion(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${region === item ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Revenue At Risk</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatUsdM(monitor.revenueAtRiskTotal)}</p>
          <p className="mt-1 text-sm text-slate-500">{formatPct(monitor.revenueAtRiskPctOfRevenue)} of FY 2025 revenue</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monitor.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip formatter={(value) => formatUsdM(Number(value))} />
                <Bar dataKey="revenueAtRisk" radius={[6, 6, 0, 0]}>
                  {monitor.timeline.map((row) => <Cell key={row.year} fill={row.revenueAtRisk > 5_000 ? "#dc2626" : row.revenueAtRisk > 1_000 ? "#f59e0b" : "#0f766e"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {monitor.patentRisks.map((risk) => (
          <div key={risk.product} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-ink">{risk.product}</h3>
                <p className="mt-1 text-sm text-slate-500">{risk.therapyArea} · first visible LOE {risk.firstLoeYear}</p>
              </div>
              <AznBadge tone={toneForRisk(risk.genericBiosimilarRisk)}>{risk.genericBiosimilarRisk}</AznBadge>
            </div>
            <p className="mt-3 text-sm text-slate-600">{region}: {risk.regionText}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div><p className="text-xs text-slate-500">At risk</p><p className="font-semibold">{formatUsdM(risk.revenueAtRisk)}</p></div>
              <div><p className="text-xs text-slate-500">% revenue</p><p className="font-semibold">{formatPct(risk.percentageOfTotalRevenue)}</p></div>
              <div><p className="text-xs text-slate-500">Confidence</p><p className="font-semibold">{risk.confidenceLevel}</p></div>
            </div>
            <p className="mt-3 text-sm text-slate-600"><b>Mitigation:</b> {risk.mitigationStrategy}</p>
            <p className="mt-2 text-sm text-slate-600"><b>Replacement:</b> {risk.nextGenReplacementCandidate}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Cliff-adjusted revenue scenario: bear {formatUsdM(monitor.cliffAdjustedRevenueScenario.bearCaseRevenueAfterCliff)}, base {formatUsdM(monitor.cliffAdjustedRevenueScenario.baseCaseRevenueAfterCliff)}, bull {formatUsdM(monitor.cliffAdjustedRevenueScenario.bullCaseRevenueAfterCliff)}.
      </div>
    </div>
  );
}
