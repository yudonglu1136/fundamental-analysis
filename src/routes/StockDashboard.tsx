import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { stockRegistry } from "../stocks/registry";
import { useAppShell } from "../components/layout/AppShell";

export function StockDashboard() {
  const { ticker } = useParams();
  const normalizedTicker = ticker?.toUpperCase() as keyof typeof stockRegistry | undefined;
  const module = normalizedTicker ? stockRegistry[normalizedTicker] : undefined;
  const { setCurrentModule, scenario, setScenario, period, setPeriod, dataSourceType, setDataSourceType } = useAppShell();
  const effectivePeriod = module && module.periods.some((option) => option.value === period)
    ? period
    : module?.getDefaultPeriod() ?? period;

  useEffect(() => {
    setCurrentModule(module);
    if (module) {
      if (period !== effectivePeriod) {
        setPeriod(effectivePeriod);
      }
    }
    return () => setCurrentModule(undefined);
  }, [module, effectivePeriod, period, setCurrentModule, setPeriod]);

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
