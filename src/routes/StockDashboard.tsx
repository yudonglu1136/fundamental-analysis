import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppShell } from "../components/layout/AppShell";
import { getStockModuleLoader, normalizeStockTicker } from "../stocks/moduleLoaders";
import type { StockModule } from "../stocks/types";

export function StockDashboard() {
  const { ticker } = useParams();
  const normalizedTicker = normalizeStockTicker(ticker);
  const [module, setModule] = useState<StockModule | undefined>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const { setCurrentModule, scenario, setScenario, period, setPeriod, dataSourceType, setDataSourceType } = useAppShell();
  const effectivePeriod = module && module.periods.some((option) => option.value === period)
    ? period
    : module?.getDefaultPeriod() ?? period;

  useEffect(() => {
    let cancelled = false;
    const loader = getStockModuleLoader(normalizedTicker);
    setModule(undefined);
    setLoadState(loader ? "loading" : "not-found");
    setCurrentModule(undefined);

    if (!loader) return () => {
      cancelled = true;
    };

    loader()
      .then((loadedModule) => {
        if (cancelled) return;
        setModule(loadedModule);
        setLoadState("ready");
      })
      .catch((error) => {
        console.error(`[stock:${normalizedTicker}] Failed to load stock module`, error);
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedTicker, setCurrentModule]);

  useEffect(() => {
    setCurrentModule(module);
    if (module) {
      if (period !== effectivePeriod) {
        setPeriod(effectivePeriod);
      }
    }
    return () => setCurrentModule(undefined);
  }, [module, effectivePeriod, period, setCurrentModule, setPeriod]);

  if (loadState === "loading") {
    return <div className="tf-object-panel p-8 text-sm text-slate-400">Loading {normalizedTicker ?? "stock"} research module...</div>;
  }

  if (loadState === "error") {
    return <div className="tf-object-panel p-8 text-sm text-red-300">Failed to load {normalizedTicker} research module.</div>;
  }

  if (!module) {
    return <div className="tf-object-panel p-8 text-sm text-slate-400">Stock module not found.</div>;
  }

  return (
    <section className="space-y-4">
      <div className="tf-command-surface relative overflow-hidden p-4 sm:p-5">
        <div className="tf-scan-line" />
        <div className="min-w-0">
          <div className="min-w-0">
            <p className="tf-kicker line-clamp-2 break-words">{module.sector}</p>
            <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white [overflow-wrap:anywhere] sm:text-4xl">
              {module.ticker} · {module.name}
            </h1>
            <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-400">{module.description}</p>
          </div>
        </div>
      </div>

      <div className="tf-stock-module-canvas border border-white/10 bg-[#05070b]/70 p-3 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-4 lg:p-6">
        <module.Dashboard
          module={module}
          scenario={scenario}
          onScenarioChange={setScenario}
          period={effectivePeriod}
          onPeriodChange={setPeriod}
          dataSourceType={dataSourceType}
          onDataSourceChange={setDataSourceType}
        />
      </div>
    </section>
  );
}
