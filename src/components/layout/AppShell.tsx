import { Outlet } from "react-router-dom";
import { createContext, useContext, useMemo, useState } from "react";
import { ChartThemeDefs } from "../shared/ChartThemeDefs";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
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
  const [currentModule, setCurrentModule] = useState<StockModule | undefined>(undefined);
  const [scenario, setScenario] = useState<Scenario>("Base");
  const [period, setPeriod] = useState<string>("");
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
      <ChartThemeDefs />
      <div className="flex min-h-screen bg-[#05070b] text-white">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopNav />
          <main className="mx-auto w-full max-w-[1740px] px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
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
