import { ArrowRight } from "lucide-react";
import { SectionCard } from "../../../components/shared/SectionCard";
import { KpiTile, SourceNote, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function ISRGFlywheel({ dashboard }: IsrgComponentProps) {
  const nodes = [
    {
      label: "Installed Base",
      value: dashboard.installedBaseEngine.daVinciInstalledBase.toLocaleString("en-US"),
      subtext: `${formatPct(dashboard.installedBaseEngine.daVinciInstalledBaseGrowth)} YoY`,
    },
    {
      label: "Procedures",
      value: formatPct(dashboard.procedureEngine.procedureGrowth),
      subtext: "Worldwide da Vinci procedure growth",
    },
    {
      label: "I&A Revenue",
      value: formatUsd(dashboard.recurringRevenueEngine.instrumentsAccessoriesRevenue),
      subtext: `${formatPct(dashboard.recurringRevenueEngine.segmentRows[0]?.revenueGrowth)} YoY`,
    },
    {
      label: "Utilization",
      value: formatPct(dashboard.procedureEngine.utilizationGrowth),
      subtext: `${dashboard.procedureEngine.proceduresPerSystem.toFixed(0)} procedures/system`,
    },
    {
      label: "Switching Cost",
      value: dashboard.moatEngine.valuationRelevantScore.toFixed(0),
      subtext: "Valuation-relevant moat score",
    },
    {
      label: "Placements / Upgrades",
      value: formatPct(dashboard.daVinci5Engine.latestPlacementShare),
      subtext: "da Vinci 5 placement share",
    },
  ];

  return (
    <SectionCard title="ISRG Flywheel" description="Installed base drives procedures; procedures drive instruments and accessories; familiarity and workflow integration reinforce placements and upgrades.">
      <div className="grid gap-3 xl:grid-cols-6">
        {nodes.map((node, index) => (
          <div key={node.label} className="flex items-stretch gap-3">
            <div className="flex min-h-32 flex-1 flex-col justify-between rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{node.label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{node.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{node.subtext}</p>
            </div>
            {index < nodes.length - 1 ? (
              <div className="hidden items-center xl:flex">
                <ArrowRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <KpiTile label="Recurring Mix" value={formatPct(dashboard.recurringRevenueEngine.recurringRevenueMix)} text="I&A plus services as percent of total revenue." tone="positive" />
        <KpiTile label="Service / System" value={formatUsd(dashboard.recurringRevenueEngine.serviceRevenuePerInstalledSystem, "K")} text="Latest quarter service revenue per installed da Vinci system proxy." />
        <KpiTile label="Replacement Proxy" value={formatPct(dashboard.installedBaseEngine.replacementCycleMix)} text="Placements not explained by net-new installed-base growth." tone="warning" />
      </div>
      <div className="mt-4">
        <SourceNote>
          The flywheel is data-driven where disclosed. Switching-cost and familiarity nodes are research judgments that do not directly change valuation without explicit assumption changes.
        </SourceNote>
      </div>
    </SectionCard>
  );
}
