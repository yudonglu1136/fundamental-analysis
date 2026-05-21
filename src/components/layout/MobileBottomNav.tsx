import { Home, Search, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

type MobileNavItemProps = {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
};

function MobileNavItem({ to, label, icon, active }: MobileNavItemProps) {
  return (
    <Link
      to={to}
      className={`flex min-w-0 flex-col items-center justify-center gap-1 border px-2 py-2 text-[0.68rem] font-semibold transition ${
        active
          ? "border-cyan-200/45 bg-cyan-300/18 text-white shadow-[0_0_28px_rgba(34,211,238,0.16)]"
          : "border-white/10 bg-white/[0.045] text-slate-400 hover:border-cyan-200/35 hover:bg-cyan-300/10 hover:text-white"
      }`}
    >
      <span className={active ? "text-cyan-100" : "text-cyan-100/58"}>{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const isPortfolio = location.pathname.startsWith("/portfolio");
  const isStock = location.pathname.startsWith("/stocks");
  const isHome = location.pathname === "/";

  return (
    <nav
      aria-label="Mobile workspace navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#05070b]/92 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
        <MobileNavItem to="/" label="Home" icon={<Home className="h-4 w-4" />} active={isHome} />
        <MobileNavItem
          to="/portfolio"
          label="Net Worth"
          icon={<WalletCards className="h-4 w-4" />}
          active={isPortfolio}
        />
        <MobileNavItem
          to="/"
          label="Stocks"
          icon={<Search className="h-4 w-4" />}
          active={isStock}
        />
      </div>
    </nav>
  );
}
