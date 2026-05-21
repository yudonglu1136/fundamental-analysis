import { Link, useLocation } from "react-router-dom";
import { Activity, Home, Search, WalletCards, Waypoints } from "lucide-react";
import { ThesisForgeLogo } from "./ThesisForgeLogo";

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="hidden w-[92px] shrink-0 border-r border-white/10 bg-[#030509] px-3 py-4 text-white lg:flex lg:flex-col">
      <Link to="/" className="group flex h-14 w-14 items-center justify-center transition hover:brightness-125" aria-label="Thesis Forge">
        <ThesisForgeLogo />
      </Link>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3">
        <Link
          to="/"
          aria-label="Home"
          title="Home"
          className={`flex h-12 w-12 items-center justify-center border transition ${
            location.pathname === "/"
              ? "border-cyan-300 bg-cyan-300 text-[#05070b]"
              : "border-white/10 bg-white/5 text-white/55 hover:border-cyan-300/60 hover:bg-cyan-300/10 hover:text-white"
          }`}
        >
          <Home className="h-4 w-4" />
        </Link>
        <div className="mt-2 h-px w-8 bg-white/15" />
        <Link
          to="/portfolio"
          aria-label="Portfolio"
          title="Portfolio"
          className={`flex h-12 w-12 items-center justify-center border transition ${
            location.pathname.startsWith("/portfolio")
              ? "border-cyan-300 bg-cyan-300 text-[#05070b]"
              : "border-white/10 bg-white/5 text-white/55 hover:border-cyan-300/60 hover:bg-cyan-300/10 hover:text-white"
          }`}
        >
          <WalletCards className="h-4 w-4" />
        </Link>
        <div className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-white/45" title="Coverage graph">
          <Waypoints className="h-4 w-4" />
        </div>
        <div className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-white/45" title="Search first workspace">
          <Search className="h-4 w-4" />
        </div>
      </nav>

      <div className="mb-1 flex h-14 w-14 items-center justify-center border border-white/10 bg-white/[0.03] text-cyan-100/45">
        <Activity className="h-4 w-4" />
      </div>
    </aside>
  );
}
