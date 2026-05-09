import { Link, useLocation } from "react-router-dom";
import { stockList } from "../../stocks/registry";

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white/80 px-5 py-6 lg:block">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Platform</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Fundamental Analysis</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Unified multi-stock buy-side platform for quality, peer, and valuation work.</p>
      </div>
      <nav className="space-y-2">
        <Link to="/" className={`block rounded-2xl px-4 py-3 text-sm font-medium ${location.pathname === "/" ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100"}`}>
          Home
        </Link>
        {stockList.map((stock) => (
          <Link key={stock.ticker} to={`/stocks/${stock.ticker}`} className={`block rounded-2xl px-4 py-3 text-sm font-medium ${location.pathname === `/stocks/${stock.ticker}` ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {stock.ticker}
            <span className="ml-2 text-xs opacity-70">{stock.name}</span>
          </Link>
        ))}
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400">Add New Stock</div>
      </nav>
    </aside>
  );
}
