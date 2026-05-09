import { Outlet } from "react-router-dom";
import { createContext, useContext, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { stockRegistry } from "../../stocks/registry";
import type { DataSourceType, Scenario, StockModule } from "../../stocks/types";

type AppShellContextValue = {
  currentModule?: StockModule;
  setCurrentModule: (module?: StockModule) => void;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  period: string;
  setPeriod: (period: string) => void;
  dataSourceType: DataSourceType;
  setDataSourceType: (type: DataSourceType) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShell() {
  const defaultModule = stockRegistry.MCK;
  const [currentModule, setCurrentModule] = useState<StockModule | undefined>(undefined);
  const [scenario, setScenario] = useState<Scenario>("Base");
  const [period, setPeriod] = useState<string>(defaultModule.getDefaultPeriod());
  const [dataSourceType, setDataSourceType] = useState<DataSourceType>("mock");

  const value = useMemo(
    () => ({
      currentModule,
      setCurrentModule,
      scenario,
      setScenario,
      period,
      setPeriod,
      dataSourceType,
      setDataSourceType,
    }),
    [currentModule, scenario, period, dataSourceType],
  );

  return (
    <AppShellContext.Provider value={value}>
      <div className="flex min-h-screen bg-mist bg-grid text-ink">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopNav />
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) throw new Error("useAppShell must be used within AppShell");
  return context;
}
