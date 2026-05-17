import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, AznTextPanel, formatPct, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function ChinaExposurePanel({ dashboard }: { dashboard: AznDashboard }) {
  const china = dashboard.china;
  const scenarioRows = Object.entries(china.chinaScenario).map(([scenarioName, revenue]) => ({ scenarioName, revenue }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="China Revenue">{formatUsdM(china.chinaRevenue)} in Q1 2026, {formatPct(china.chinaPercentageOfTotal)} of total revenue.</AznTextPanel>
        <AznTextPanel title="China Growth">{formatPct(china.chinaGrowth)} CER growth. This is a policy-risk market, not a simple volume growth line.</AznTextPanel>
        <AznTextPanel title="Emerging Markets">{formatUsdM(china.emergingMarketsRevenue)} in Q1 2026, growing {formatPct(china.emergingMarketsGrowth)} CER.</AznTextPanel>
        <AznTextPanel title="VBP / NRDL Risk"><AznBadge tone={toneForRisk("High")}>High</AznBadge><span className="ml-2">{china.vbpNrdlRisk}</span></AznTextPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Geography Revenue Split</h3>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={china.geographyRevenueSplit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatUsdM(Number(value))} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {china.geographyRevenueSplit.map((row) => <Cell key={row.region} fill={row.region === "China" ? "#dc2626" : row.region === "Emerging Markets" ? "#0f766e" : "#2563eb"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">China Bear / Base / Bull</h3>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scenarioRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="scenarioName" />
                <YAxis tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <Tooltip formatter={(value) => formatUsdM(Number(value))} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <AznTextPanel title="Hospital Channel">{china.antiCorruptionHospitalChannelRisk}</AznTextPanel>
        <AznTextPanel title="Local Competition">{china.localCompetition}</AznTextPanel>
        <AznTextPanel title="Regulatory Risk">{china.regulatoryRisk}</AznTextPanel>
        <AznTextPanel title="Long-term Opportunity">{china.longTermGrowthOpportunity}</AznTextPanel>
      </div>
    </div>
  );
}
