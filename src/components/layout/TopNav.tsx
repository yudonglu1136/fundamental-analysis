import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAppShell } from "./AppShell";
import { useAuth } from "../../auth/useAuth";
import { stockMetadataList } from "../../stocks/metadata";
import { SearchableSelect } from "./StockSelector";
import { ThesisForgeLogo } from "./ThesisForgeLogo";

export function TopNav() {
  const { currentModule } = useAppShell();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.provider === "local-dev" ? "Private Workspace" : user?.email ?? user?.name ?? "Signed in";
  const stockOptions = useMemo(
    () => stockMetadataList.map((stock) => ({ value: stock.ticker, label: `${stock.ticker} · ${stock.name}` })),
    [],
  );
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070b]/88 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-[1740px] gap-3 px-3 py-3 sm:px-5 lg:flex lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <ThesisForgeLogo className="lg:hidden" />
          <div className="min-w-0">
            <p className="tf-kicker line-clamp-1 break-words">{currentModule ? currentModule.sector : "Investment research workspace"}</p>
            <h2 className="mt-1 line-clamp-2 break-words text-base font-semibold leading-snug tracking-normal text-white [overflow-wrap:anywhere] sm:line-clamp-1 sm:text-xl">
              {currentModule ? `${currentModule.ticker} · ${currentModule.name}` : "Thesis Forge"}
            </h2>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto lg:grid-cols-none lg:flex lg:flex-wrap lg:items-center lg:justify-end lg:gap-3">
          {currentModule ? (
            <SearchableSelect
              value={currentModule.ticker}
              onValueChange={(ticker) => navigate(`/stocks/${ticker}`)}
              options={stockOptions}
              placeholder="Search stocks"
              className="min-w-0 lg:min-w-[240px]"
            />
          ) : null}
          {user ? (
            <div className={`${currentModule ? "hidden sm:flex" : "flex"} min-w-0 items-center justify-between gap-2 border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/62 shadow-[0_10px_30px_rgba(0,0,0,0.22)] sm:w-auto lg:max-w-[320px]`}>
              <div className="flex min-w-0 items-center gap-2">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" referrerPolicy="no-referrer" /> : null}
                <span className="hidden min-w-0 truncate sm:inline">{displayName}</span>
                <span className="min-w-0 truncate sm:hidden">Workspace</span>
              </div>
              <button type="button" onClick={() => void logout()} className="inline-flex shrink-0 items-center gap-1 border border-transparent px-2 py-1 font-semibold text-white hover:border-cyan-300/30 hover:bg-cyan-300/10">
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
