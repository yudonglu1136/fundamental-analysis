import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric, PanelTable, SignalPill } from "./MckPrimitives";

export function SpecialtyOncologyEngine({ dashboard }: { dashboard: MckDashboardDataset }) {
  const oncology = dashboard.oncology;
  return (
    <SectionCard title="Specialty / Oncology Deep Dive" description="MCK's highest-quality thesis area: specialty distribution, US Oncology Network, practice services and manufacturer feedback loops.">
      <div className="grid gap-4 md:grid-cols-3">
        <MiniMetric label="Contribution" value={oncology.segment ? `$${(oncology.segment.adjustedOperatingProfit / 1000).toFixed(1)}B` : "n/a"} subtext="FY2026 adjusted operating profit" badge="Actual" />
        <MiniMetric label="Margin" value={oncology.segment ? `${(oncology.segment.margin * 100).toFixed(1)}%` : "n/a"} subtext="Higher than core distribution" badge="Actual" />
        <MiniMetric label="Profit growth" value={oncology.segment ? `${(oncology.segment.adjustedOperatingProfitGrowth * 100).toFixed(0)}%` : "n/a"} subtext="Monitor organic/acquired split" badge="Actual" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="font-semibold text-ink">Oncology Ecosystem Map</p>
          <div className="mt-4 space-y-3">
            {oncology.ecosystem.map((edge) => (
              <div key={`${edge.from}-${edge.to}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-ink">{edge.from}</span>
                <span className="text-slate-400">→</span>
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-ink">{edge.to}</span>
                <span className="text-slate-500">{edge.label}</span>
              </div>
            ))}
          </div>
        </div>
        <PanelTable
          headers={["Tailwind", "Assessment", "Signal"]}
          rows={oncology.tailwinds.map((row) => [row.theme, row.assessment, <SignalPill signal={row.signal} />])}
        />
      </div>
    </SectionCard>
  );
}
