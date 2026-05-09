import { useAppShell } from "./AppShell";
import { DataQualityBadge } from "../shared/DataQualityBadge";
import { ScenarioSelector } from "../shared/ScenarioSelector";
import { PeriodSelector } from "../shared/PeriodSelector";

export function TopNav() {
  const { currentModule, scenario, setScenario, period, setPeriod, dataSourceType } = useAppShell();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm text-slate-500">{currentModule ? currentModule.sector : "Platform overview"}</p>
          <h2 className="text-xl font-semibold text-ink">{currentModule ? `${currentModule.ticker} · ${currentModule.name}` : "Available Stocks"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentModule ? <ScenarioSelector value={scenario} onChange={setScenario} /> : null}
          {currentModule ? <PeriodSelector value={period} onChange={setPeriod} options={currentModule.periods} /> : null}
          <DataQualityBadge badge={dataSourceType === "mock" ? "Placeholder" : dataSourceType === "manual" ? "Assumption" : "Actual"} />
        </div>
      </div>
    </header>
  );
}
