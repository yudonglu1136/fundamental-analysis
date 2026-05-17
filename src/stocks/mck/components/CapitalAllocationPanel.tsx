import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric, money, pct } from "./MckPrimitives";

export function CapitalAllocationPanel({ dashboard }: { dashboard: MckDashboardDataset }) {
  const allocation = dashboard.capitalAllocation;
  return (
    <SectionCard title="Capital Allocation" description="FCF deployment is the bridge between enterprise economics and per-share compounding.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="FCF" value={money(allocation.freeCashFlow)} badge="Actual" />
        <MiniMetric label="Dividend" value={money(allocation.dividend)} badge="Actual" />
        <MiniMetric label="Buyback" value={money(allocation.buyback)} badge="Actual" />
        <MiniMetric label="Payout of FCF" value={pct(allocation.payoutOfFcf)} badge="Derived" />
        <MiniMetric label="Net debt" value={money(allocation.netDebt)} badge="Placeholder" />
        <MiniMetric label="Authorization" value={money(allocation.remainingAuthorization)} badge="Actual" />
        <MiniMetric label="Buyback yield" value={pct(allocation.buybackYield)} badge="Derived" />
        <MiniMetric label="M&A capacity" value={money(allocation.maCapacity)} subtext="After dividend and modeled buyback" badge="Derived" />
      </div>
    </SectionCard>
  );
}
