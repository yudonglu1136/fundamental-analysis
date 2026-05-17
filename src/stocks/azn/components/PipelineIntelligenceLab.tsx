import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import type { AznPipelinePhase, AznTherapyArea } from "../types";
import { AznBadge, formatPct, formatUsdM, toneForRisk } from "./AznUi";
import { CatalystCalendar } from "./CatalystCalendar";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function PipelineIntelligenceLab({ dashboard }: { dashboard: AznDashboard }) {
  const [therapy, setTherapy] = useState<AznTherapyArea | "All">("All");
  const [phase, setPhase] = useState<AznPipelinePhase | "All">("All");
  const therapies = useMemo(() => ["All", ...Array.from(new Set(dashboard.pipeline.valuedAssets.map((asset) => asset.therapyArea)))] as Array<AznTherapyArea | "All">, [dashboard.pipeline.valuedAssets]);
  const phases = useMemo(() => ["All", ...Array.from(new Set(dashboard.pipeline.valuedAssets.map((asset) => asset.phase)))] as Array<AznPipelinePhase | "All">, [dashboard.pipeline.valuedAssets]);
  const assets = dashboard.pipeline.valuedAssets.filter((asset) => (therapy === "All" || asset.therapyArea === therapy) && (phase === "All" || asset.phase === phase));
  const bubbleData = assets.map((asset) => ({
    name: asset.assetName,
    launchYear: asset.launchYearEstimate,
    peakSales: asset.peakSalesEstimate,
    rnpv: asset.probabilityAdjustedPipelineValue,
    probability: asset.probabilityOfSuccess,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <select value={therapy} onChange={(event) => setTherapy(event.target.value as AznTherapyArea | "All")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {therapies.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={phase} onChange={(event) => setPhase(event.target.value as AznPipelinePhase | "All")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {phases.map((item) => <option key={item}>{item}</option>)}
        </select>
        <AznBadge tone="blue">{formatUsdM(dashboard.pipeline.totalProbabilityAdjustedPipelineValue)} probability-adjusted value</AznBadge>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Pipeline Bubble Chart</h3>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="launchYear" name="Launch year" type="number" domain={[2026, 2032]} />
                <YAxis dataKey="peakSales" name="Peak sales" tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <ZAxis dataKey="rnpv" range={[80, 800]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => name === "probability" ? formatPct(Number(value)) : formatUsdM(Number(value))} />
                <Scatter data={bubbleData} fill="#2563eb" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Phase Funnel</h3>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.pipeline.phaseTransitionFunnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="phase" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {assets.slice(0, 8).map((asset) => (
          <div key={asset.assetName} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">{asset.assetName}</h3>
                <p className="text-sm text-slate-500">{asset.trialName} · {asset.indication}</p>
              </div>
              <AznBadge tone={toneForRisk(asset.riskLevel)}>{asset.phase}</AznBadge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div><p className="text-xs text-slate-500">Peak sales</p><p className="font-semibold">{formatUsdM(asset.peakSalesEstimate)}</p></div>
              <div><p className="text-xs text-slate-500">POS</p><p className="font-semibold">{formatPct(asset.probabilityOfSuccess)}</p></div>
              <div><p className="text-xs text-slate-500">rNPV</p><p className="font-semibold">{formatUsdM(asset.probabilityAdjustedPipelineValue)}</p></div>
            </div>
            <p className="mt-3 text-sm text-slate-600">{asset.regulatoryMilestone}</p>
          </div>
        ))}
      </div>
      <CatalystCalendar dashboard={dashboard} />
    </div>
  );
}
