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
    return <div className="panel p-8 text-sm text-slate-500">Loading {normalizedTicker ?? "stock"} research module...</div>;
  }

  if (loadState === "error") {
    return <div className="panel p-8 text-sm text-red-600">Failed to load {normalizedTicker} research module.</div>;
  }

  if (!module) {
    return <div className="panel p-8 text-sm text-slate-500">Stock module not found.</div>;
  }

  return (
    <module.Dashboard
      module={module}
      scenario={scenario}
      onScenarioChange={setScenario}
      period={effectivePeriod}
      onPeriodChange={setPeriod}
      dataSourceType={dataSourceType}
      onDataSourceChange={setDataSourceType}
    />
  );
}
