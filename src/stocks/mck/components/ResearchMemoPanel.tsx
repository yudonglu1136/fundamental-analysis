import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";

export function ResearchMemoPanel({ dashboard }: { dashboard: MckDashboardDataset }) {
  const memo = dashboard.memo;
  const rows = [
    ["What happened?", memo.whatHappened],
    ["What matters?", memo.whatMatters],
    ["What market may be missing?", memo.whatMarketMayBeMissing],
    ["What can go wrong?", memo.whatCanGoWrong],
    ["What price is attractive?", memo.attractivePrice],
  ];
  return (
    <SectionCard title="Research Memo" description="Buy-side style summary generated from the model outputs and data quality flags.">
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="font-semibold text-ink">What to monitor next quarter</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
            {memo.monitorNextQuarter.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
