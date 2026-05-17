import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckValuationOutput } from "../types";
import { MiniMetric, money, multiple, PanelTable, pct } from "./MckPrimitives";

export function ValuationDashboard({ valuation }: { valuation: MckValuationOutput }) {
  return (
    <SectionCard title="Valuation" description="Four-method valuation: P/E, FCF yield, owner-earnings DCF, and segment SOTP. No single multiple is allowed to dominate the conclusion.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="P/E value" value={money(valuation.peFairValue, 0)} badge="Derived" />
        <MiniMetric label="FCF yield value" value={money(valuation.fcfYieldFairValue, 0)} badge="Derived" />
        <MiniMetric label="DCF value" value={money(valuation.dcfFairValue, 0)} badge="Derived" />
        <MiniMetric label="SOTP value" value={money(valuation.sotpFairValue, 0)} badge="Derived" />
        <MiniMetric label="Blended value" value={money(valuation.blendedFairValue, 0)} badge="Derived" />
        <MiniMetric label="Low / high range" value={`${money(valuation.valuationRangeLow, 0)}-${money(valuation.valuationRangeHigh, 0)}`} badge="Derived" />
        <MiniMetric label="Margin of safety" value={pct(valuation.marginOfSafety)} badge="Derived" />
        <MiniMetric label="DCF terminal share" value={pct(valuation.ownerEarningsDcf.terminalValueShare)} badge="Derived" />
      </div>
      <div className="mt-5">
        <PanelTable
          headers={["SOTP segment", "Metric", "Multiple", "Value", "Source"]}
          rows={valuation.sotp.map((row) => [row.segment, money(row.metric), multiple(row.multiple), money(row.value), row.sourceType])}
        />
      </div>
    </SectionCard>
  );
}
