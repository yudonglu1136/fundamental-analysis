import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric } from "./MckPrimitives";

export function BiopharmaServicesEngine({ dashboard }: { dashboard: MckDashboardDataset }) {
  return (
    <SectionCard title="Biopharma Services Engine" description="Manufacturer-facing services test whether MCK is evolving from distributor into healthcare service infrastructure.">
      <div className="grid gap-4 md:grid-cols-3">
        <MiniMetric label="Quality score" value={dashboard.biopharmaServices.qualityScore} subtext="Research-only moat score" badge="Derived" />
        <MiniMetric label="Margin potential" value="Above core" subtext={dashboard.biopharmaServices.marginPotential} badge="Assumption" />
        <MiniMetric label="Valuation role" value="SOTP support" subtext="Feeds thesis, not direct automatic multiple changes" badge="Needs Review" />
      </div>
      <p className="mt-5 text-sm leading-6 text-slate-600">{dashboard.biopharmaServices.thesis}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {dashboard.biopharmaServices.evidence.map((item) => (
          <li key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{item}</li>
        ))}
      </ul>
    </SectionCard>
  );
}
