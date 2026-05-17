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
    <header className="sticky top-0 z-20 border-b border-white/70 bg-[#f8f7f1]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="ontology-label">{currentModule ? currentModule.sector : "Platform overview"}</p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-normal text-ink">{currentModule ? `${currentModule.ticker} · ${currentModule.name}` : "Available Stocks"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentModule ? (
            <Select
              value={currentModule.ticker}
              onValueChange={(ticker) => navigate(`/stocks/${ticker}`)}
              options={stockOptions}
            />
          ) : null}
          {currentModule ? <ScenarioSelector value={scenario} onChange={setScenario} /> : null}
          {currentModule ? <PeriodSelector value={period} onChange={setPeriod} options={currentModule.periods} /> : null}
          {user ? (
            <div className="flex items-center gap-2 border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink/60 shadow-panel">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" /> : null}
              <span className="max-w-48 truncate">{displayName}</span>
              <button type="button" onClick={() => void logout()} className="border border-transparent px-2 py-1 font-semibold text-ink hover:border-accent/30 hover:bg-accent/10">
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
