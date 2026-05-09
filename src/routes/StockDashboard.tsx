import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { stockRegistry } from "../stocks/registry";
import { useAppShell } from "../components/layout/AppShell";

export function StockDashboard() {
  const { ticker } = useParams();
  const module = ticker ? stockRegistry[ticker as keyof typeof stockRegistry] : undefined;
  const { setCurrentModule, scenario, setScenario, period, setPeriod, dataSourceType, setDataSourceType } = useAppShell();

  useEffect(() => {
    setCurrentModule(module);
    if (module) {
      setPeriod(module.getDefaultPeriod());
    }
    return () => setCurrentModule(undefined);
  }, [module, setCurrentModule, setPeriod]);

  if (!module) {
    return <div className="panel p-8 text-sm text-slate-500">Stock module not found.</div>;
  }

  return (
    <module.Dashboard
      module={module}
      scenario={scenario}
      onScenarioChange={setScenario}
      period={period}
      onPeriodChange={setPeriod}
      dataSourceType={dataSourceType}
      onDataSourceChange={setDataSourceType}
    />
  );
}
