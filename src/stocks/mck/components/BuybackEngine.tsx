import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckBuybackOutput } from "../types";
import { MiniMetric, money, pct, SignalPill } from "./MckPrimitives";

export function BuybackEngine({ data }: { data: MckBuybackOutput }) {
  return (
    <SectionCard title="Buyback Engine" description="Buybacks are modeled as a capital allocation decision; accretion falls when the average repurchase price rises.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="Beginning shares" value={`${data.beginningShares.toFixed(1)}M`} badge="Placeholder" />
        <MiniMetric label="1Y ending shares" value={`${data.endingShares1Y.toFixed(1)}M`} badge="Derived" />
        <MiniMetric label="3Y ending shares" value={`${data.endingShares3Y.toFixed(1)}M`} badge="Derived" />
        <MiniMetric label="5Y ending shares" value={`${data.endingShares5Y.toFixed(1)}M`} badge="Derived" />
        <MiniMetric label="Annual reduction" value={pct(data.annualShareReduction)} badge="Derived" />
        <MiniMetric label="EPS accretion" value={pct(data.epsAccretion1Y)} badge="Derived" />
        <MiniMetric label="Buyback yield" value={pct(data.buybackYield)} badge="Derived" />
        <MiniMetric label="Repurchase price" value={money(data.averageRepurchasePrice, 0)} subtext={<SignalPill signal={data.valueCreationSignal} />} badge="Assumption" />
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{data.commentary}</p>
    </SectionCard>
  );
}
