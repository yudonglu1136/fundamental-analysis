import { Link, useLocation } from "react-router-dom";

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="hidden w-[88px] shrink-0 border-r border-white/10 bg-[#101418] px-3 py-4 text-white lg:flex lg:flex-col">
      <Link to="/" className="group flex h-14 w-14 items-center justify-center border border-white/15 bg-white/10 text-sm font-semibold tracking-[0.16em] transition hover:border-accent/80 hover:bg-accent/10">
        FA
      </Link>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3">
        <Link
          to="/"
          aria-label="Home"
          title="Home"
          className={`flex h-12 w-12 items-center justify-center border text-xs font-semibold transition ${
            location.pathname === "/"
              ? "border-accent bg-accent text-ink"
              : "border-white/10 bg-white/5 text-white/58 hover:border-white/25 hover:bg-white/10 hover:text-white"
          }`}
        >
          H
        </Link>
        <div className="mt-2 h-px w-8 bg-white/15" />
        <div className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/45" title="Stocks are selected from the top bar">
          EQ
        </div>
      </nav>

      <div className="mb-1 flex h-14 w-14 items-center justify-center border border-white/10 bg-white/[0.03] text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-white/35 [writing-mode:vertical-rl]">
        Research
      </div>
    </aside>
  );
}
