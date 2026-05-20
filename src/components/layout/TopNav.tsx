import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppShell } from "./AppShell";
import { useAuth } from "../../auth/useAuth";
import { ScenarioSelector } from "../shared/ScenarioSelector";
import { PeriodSelector } from "../shared/PeriodSelector";
import { stockMetadataList } from "../../stocks/metadata";
import { Select } from "./StockSelector";

export function TopNav() {
  const { currentModule, scenario, setScenario, period, setPeriod } = useAppShell();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.provider === "local-dev" ? "Private Workspace" : user?.email ?? user?.name ?? "Signed in";
  const stockOptions = useMemo(
    () => stockMetadataList.map((stock) => ({ value: stock.ticker, label: `${stock.ticker} · ${stock.name}` })),
    [],
  );
  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-[#f8f7f1]/88 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-[1680px] gap-3 px-3 py-3 sm:px-5 lg:flex lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-ink/10 bg-ink text-xs font-semibold tracking-[0.16em] text-white shadow-panel lg:hidden">
            FA
          </div>
          <div className="min-w-0">
            <p className="ontology-label truncate">{currentModule ? currentModule.sector : "Platform overview"}</p>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-normal text-ink sm:text-xl">
              {currentModule ? `${currentModule.ticker} · ${currentModule.name}` : "Available Stocks"}
            </h2>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end lg:gap-3">
          {currentModule ? (
            <Select
              value={currentModule.ticker}
              onValueChange={(ticker) => navigate(`/stocks/${ticker}`)}
              options={stockOptions}
              className="col-span-2 sm:min-w-0 lg:min-w-[240px]"
            />
          ) : null}
          {currentModule ? <ScenarioSelector value={scenario} onChange={setScenario} className="sm:min-w-0 lg:min-w-[180px]" /> : null}
          {currentModule ? <PeriodSelector value={period} onChange={setPeriod} options={currentModule.periods} className="sm:min-w-0 lg:min-w-[180px]" /> : null}
          {user ? (
            <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 border border-white/70 bg-white/75 px-3 py-2 text-sm text-ink/60 shadow-panel lg:w-auto lg:max-w-[360px]">
              <div className="flex min-w-0 items-center gap-2">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" referrerPolicy="no-referrer" /> : null}
                <span className="min-w-0 truncate">{displayName}</span>
              </div>
              <button type="button" onClick={() => void logout()} className="shrink-0 border border-transparent px-2 py-1 font-semibold text-ink hover:border-accent/30 hover:bg-accent/10">
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
