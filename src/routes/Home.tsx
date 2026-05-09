import { Link } from "react-router-dom";
import { stockList } from "../stocks/registry";
import { SectionCard } from "../components/shared/SectionCard";

export function Home() {
  return (
    <div className="space-y-6">
      <SectionCard title="Available Dashboards" description="Select a stock module to open its tailored buy-side analysis dashboard.">
        <div className="grid gap-4 md:grid-cols-2">
          {stockList.map((stock) => (
            <Link key={stock.ticker} to={`/stocks/${stock.ticker}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{stock.ticker}</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">{stock.name}</h3>
              <p className="mt-2 text-sm text-slate-500">{stock.description}</p>
              <p className="mt-4 text-sm font-medium text-ink">{stock.sector}</p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
