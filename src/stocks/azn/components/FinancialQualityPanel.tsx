import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { buildAznDashboardData } from "../calculations";
import { AznTextPanel, formatPct, formatUsdM } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function FinancialQualityPanel({ dashboard }: { dashboard: AznDashboard }) {
  const quality = dashboard.financialQuality;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <AznTextPanel title="Core Operating Margin">{formatPct(quality.coreOperatingMargin)}</AznTextPanel>
        <AznTextPanel title="R&D / Sales">{formatPct(quality.rdAsPctSales)}</AznTextPanel>
        <AznTextPanel title="SG&A / Sales">{formatPct(quality.sgaAsPctSales)}</AznTextPanel>
        <AznTextPanel title="FCF Conversion">{formatPct(quality.fcfConversion)}</AznTextPanel>
        <AznTextPanel title="Dividend Coverage">{quality.dividendCoverageByFcf.toFixed(1)}x FCF coverage.</AznTextPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Financial Trend</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={quality.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" />
                <YAxis yAxisId="left" tickFormatter={(value) => `$${Number(value) / 1000}bn`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatPct(Number(value))} />
                <Tooltip formatter={(value, name) => name === "coreOperatingMargin" ? formatPct(Number(value)) : formatUsdM(Number(value))} />
                <Bar yAxisId="left" dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="left" dataKey="fcf" fill="#0f766e" radius={[6, 6, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="coreOperatingMargin" stroke="#dc2626" strokeWidth={3} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">Core vs Reported EPS Bridge</h3>
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quality.coreVsReportedBridge}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AznTextPanel title="ROIC-WACC Spread">{formatPct(quality.roicWaccSpread)} spread on a research-estimate ROIC anchor. ROIC is an estimate, not a reported metric.</AznTextPanel>
        <AznTextPanel title="R&D Productivity">{quality.rdProductivity.signal} Q1 readouts: {quality.rdProductivity.q1Readouts}; Q1 approvals: {quality.rdProductivity.q1Approvals}.</AznTextPanel>
        <AznTextPanel title="Adjustment Quality">{quality.adjustmentQuality}</AznTextPanel>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        {quality.warnings.join(" ")}
      </div>
    </div>
  );
}
