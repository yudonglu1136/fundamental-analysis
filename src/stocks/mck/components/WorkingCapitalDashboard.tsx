import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckWorkingCapitalOutput } from "../types";
import { MiniMetric, money, pct } from "./MckPrimitives";

export function WorkingCapitalDashboard({ data }: { data: MckWorkingCapitalOutput }) {
  return (
    <SectionCard title="Working Capital & FCF Quality" description="Reported FCF and normalized FCF are shown separately because distribution working capital can swing hard.">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="Reported FCF" value={money(data.reportedFcf)} badge="Actual" />
        <MiniMetric label="Normalized FCF" value={money(data.normalizedFcf)} subtext="Analyst normalization" badge="Assumption" />
        <MiniMetric label="FCF conversion" value={pct(data.fcfConversion)} badge="Derived" />
        <MiniMetric label="Normalized conversion" value={pct(data.normalizedFcfConversion)} badge="Derived" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <MiniMetric label="OCF" value={money(data.operatingCashFlow)} badge="Actual" />
        <MiniMetric label="Capex" value={money(data.capex)} badge="Actual" />
        <MiniMetric label="WC swing" value={money(data.workingCapitalSwing)} badge="Derived" />
        <MiniMetric label="Cash cycle" value={`${data.inventoryDays + data.receivableDays - data.payableDays} days`} subtext="Inventory + receivable - payable days" badge="Placeholder" />
      </div>
      <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">{data.warning}</p>
    </SectionCard>
  );
}
