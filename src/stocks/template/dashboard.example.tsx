import type { StockDashboardProps } from "../types";
import { SectionCard } from "../../components/shared/SectionCard";

export function ExampleDashboard({ module }: StockDashboardProps) {
  return (
    <SectionCard title={`${module.ticker} Dashboard`} description="Replace with stock-specific sections and charts.">
      <p className="text-sm text-slate-500">Use shared components where possible and keep stock-specific business logic inside the module.</p>
    </SectionCard>
  );
}
