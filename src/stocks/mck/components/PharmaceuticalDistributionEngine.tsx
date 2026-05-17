import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDistributionEconomicsOutput } from "../types";
import { bps, MiniMetric, money, PanelTable, SignalPill } from "./MckPrimitives";

export function PharmaceuticalDistributionEngine({ data }: { data: MckDistributionEconomicsOutput }) {
  return (
    <SectionCard title="Pharmaceutical Distribution Engine" description="The core question is margin bps and working-capital control, not headline revenue growth.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="Revenue base" value={`$${(data.segment.revenue / 1000).toFixed(0)}B`} subtext="Scale is the moat" badge="Actual" />
        <MiniMetric label="Margin" value={bps(data.segment.marginBps)} subtext="Thin margin, huge dollar base" badge="Actual" />
        <MiniMetric label="Scale score" value={data.scaleAdvantageScore} subtext="Research-only moat score" badge="Derived" />
        <MiniMetric label="Operating leverage" value={<SignalPill signal={data.operatingLeverageSignal} />} subtext={data.marginCompressionFlag ? "Margin compression flag active" : "Profit growth supports leverage"} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PanelTable
          headers={["Margin bps", "Pretax impact", "After-tax impact", "EPS impact", "FCF impact"]}
          rows={data.marginSensitivity.map((row) => [
            `${row.bpsChange > 0 ? "+" : ""}${row.bpsChange}`,
            money(row.pretaxProfitImpact),
            money(row.afterTaxImpact),
            money(row.epsImpact, 2),
            money(row.fcfImpact),
          ])}
        />
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-ink">GLP-1 read-through</p>
          <p className="mt-2">{data.glp1Impact.revenueTailwind}</p>
          <p>{data.glp1Impact.marginCaveat}</p>
          <p>{data.glp1Impact.inventoryRisk}</p>
          <div className="mt-3"><SignalPill signal={data.glp1Impact.netAssessment} /></div>
        </div>
      </div>
    </SectionCard>
  );
}
