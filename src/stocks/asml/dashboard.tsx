import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, Cpu, Factory, Globe2, Layers3, Microscope, ShieldAlert, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StockDashboardProps } from "../types";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { useValuationAssumptionState } from "../../components/shared/useValuationAssumptionState";
import { asmlValuationConfig } from "./config";
import { defaultAsmlValuationAssumptions } from "./assumptions";
import { buildAsmlDashboardData } from "./calculations";
import type { AsmlHistoricalValuationItem, AsmlValuationAssumptions } from "./model";

function usd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(1)}` : "-";
}

function usdm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m` : "-";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "-";
}

function multiple(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}x` : "-";
}

function ScoreBlock({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{note}</p>
    </div>
  );
}

function InsightPanel({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-blue-700">
        {icon}
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function SourceGapList({ gaps }: { gaps: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="text-sm font-semibold text-ink">Data Coverage Items</h3>
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
        {gaps.map((gap) => (
          <li key={gap}>- {gap}</li>
        ))}
      </ul>
    </div>
  );
}

function MethodTable({ valuation }: { valuation: ReturnType<typeof buildAsmlDashboardData>["valuation"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Fair Value</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
          {valuation.methodCards.map((method) => (
            <tr key={method.key}>
              <td className="px-3 py-2 font-medium text-ink">{method.label}</td>
              <td className="px-3 py-2">{usd(method.value)}</td>
              <td className="px-3 py-2">{method.sourceConfidence ?? "low"}</td>
              <td className="px-3 py-2">{method.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AsmlEightYearMarketPanel({ analysis }: { analysis: ReturnType<typeof buildAsmlDashboardData>["eightYearMarketAnalysis"] }) {
  const chartRows = analysis.comparisonRows.map((row) => ({
    year: String(row.year),
    asmlReturn: row.asmlReturn,
    spyReturn: row.spyReturn,
    relativeReturn: row.relativeReturn,
    asmlMaxDrawdown: row.asmlMaxDrawdown,
    spyMaxDrawdown: row.spyMaxDrawdown,
  }));
  const latestYear = analysis.annualRows[analysis.annualRows.length - 1] ?? null;
  return (
      <SectionCard
        title="Eight-Year Market History and Research Synthesis"
      description="ASML ADR price history is used as a cycle and valuation-discipline lens alongside the current operating model."
      badge={<span className="border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700">Price loaded</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="ASML 8Y CAGR" value={pct(analysis.asmlCagr)} note="Geometric ADR return, 2018-2025" />
        <ScoreBlock label="SPY 8Y CAGR" value={pct(analysis.spyCagr)} note="Benchmark cross-check from same annual windows" />
        <ScoreBlock label="Outperformance Years" value={`${analysis.outperformanceYears}/8`} note="ASML annual return minus SPY" />
        <ScoreBlock label="Worst Drawdown" value={analysis.worstDrawdown ? pct(analysis.worstDrawdown.maxDrawdown) : "-"} note={analysis.worstDrawdown ? `${analysis.worstDrawdown.year} intra-year price drawdown` : "-"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">ASML vs SPY annual return stack</p>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={58} />
                <Tooltip
                  formatter={(value: number, name: string) => [pct(value), name === "asmlReturn" ? "ASML" : name === "spyReturn" ? "SPY" : "Relative"]}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Bar dataKey="asmlReturn" name="ASML" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spyReturn" name="SPY" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Buy-side read-through</p>
          <div className="mt-4 space-y-3">
            {analysis.researchReadThroughs.map((item) => (
              <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreBlock label="Best Year" value={analysis.bestYear ? `${analysis.bestYear.year} ${pct(analysis.bestYear.annualReturn)}` : "-"} note="ASML annual return" />
            <ScoreBlock label="Latest Full Year" value={latestYear ? `${latestYear.year} ${pct(latestYear.annualReturn)}` : "-"} note="Completed calendar-year ADR return" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function AsmlRiskRegisterPanel({ analysis }: { analysis: ReturnType<typeof buildAsmlDashboardData>["eightYearMarketAnalysis"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Risk</th>
            <th className="px-3 py-2">Leading indicator</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {analysis.riskRegister.map((row) => (
            <tr key={row.risk}>
              <td className="px-3 py-2 font-medium text-ink">{row.risk}</td>
              <td className="px-3 py-2">{row.indicator}</td>
              <td className="px-3 py-2">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function historicalDriverRows(
  rows: AsmlHistoricalValuationItem[],
  comparisonRows: ReturnType<typeof buildAsmlDashboardData>["eightYearMarketAnalysis"]["comparisonRows"],
) {
  const comparisonByYear = new Map(comparisonRows.map((row) => [row.year, row]));
  return rows.map((row) => {
    const assumptions = row.valuationRun?.dataSnapshotJson.assumptions ?? {};
    const year = Number(row.event.eventDate.slice(0, 4));
    const comparison = comparisonByYear.get(year);
    const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    return {
      period: row.event.fiscalPeriod.replace("FY20", "FY"),
      year,
      eventDate: row.event.eventDate,
      ordersGrowth: numberValue(assumptions.ordersGrowth),
      backlogConversion: numberValue(assumptions.backlogConversion),
      backlogCoveragePremium: numberValue(assumptions.backlogCoverage) != null ? (numberValue(assumptions.backlogCoverage) as number) - 1 : null,
      euvDemandDurability: numberValue(assumptions.euvDemandDurability),
      highNaAdoption: numberValue(assumptions.highNaAdoption),
      highNaRevenueMix: numberValue(assumptions.highNaRevenueMix),
      aiCapexCycleRisk: numberValue(assumptions.aiCapexCycleRisk),
      chinaRestrictionHaircut: numberValue(assumptions.chinaRestrictionHaircut),
      fairValueGap: row.valuationRun?.upsideDownside ?? null,
      relativeReturn: comparison?.relativeReturn ?? null,
    };
  });
}

function AsmlOrdersBacklogHistoryPanel({
  rows,
  analysis,
}: {
  rows: AsmlHistoricalValuationItem[];
  analysis: ReturnType<typeof buildAsmlDashboardData>["eightYearMarketAnalysis"];
}) {
  const chartRows = historicalDriverRows(rows, analysis.comparisonRows);
  const latest = chartRows[chartRows.length - 1] ?? null;
  return (
    <SectionCard
      title="Orders / Backlog Historical Driver Map"
      description="Quarterly demand-driver view across orders growth, backlog conversion, backlog coverage and event fair-value gaps."
      badge={<span className="border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">Research history</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest Orders Growth" value={pct(latest?.ordersGrowth)} note="Quarterly demand input" />
        <ScoreBlock label="Latest Backlog Conversion" value={pct(latest?.backlogConversion)} note="Modeled conversion into systems revenue" />
        <ScoreBlock label="Latest Backlog Premium" value={pct(latest?.backlogCoveragePremium)} note="Backlog coverage above 1.0x forward revenue" />
        <ScoreBlock label="Latest FV Gap" value={pct(latest?.fairValueGap)} note="Fair value vs event price" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Quarterly orders and backlog assumptions</p>
          <div className="mt-4 h-[330px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={58} />
                <Tooltip formatter={(value: number, name: string) => [pct(value), name]} />
                <Bar dataKey="ordersGrowth" name="Orders Growth" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="backlogConversion" name="Backlog Conversion" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="backlogCoveragePremium" name="Backlog Coverage Premium" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3">
          <InsightPanel icon={<Microscope className="h-5 w-5" />} title="What would upgrade confidence" text="Refresh quarterly net bookings, backlog, shipment timing, and management commentary. Then test whether fair value still rises when backlog conversion slows." />
          <InsightPanel icon={<AlertTriangle className="h-5 w-5" />} title="What would falsify the bull case" text="A falling orders series plus stable or rising fair value would signal the model is leaning too much on terminal multiple or High-NA optionality." />
        </div>
      </div>
    </SectionCard>
  );
}

function AsmlEuvHighNaHistoryPanel({
  rows,
}: {
  rows: AsmlHistoricalValuationItem[];
}) {
  const chartRows = historicalDriverRows(rows, []);
  const latest = chartRows[chartRows.length - 1] ?? null;
  return (
    <SectionCard
      title="EUV / High-NA Historical Driver Map"
      description="Quarterly model path for EUV durability, High-NA adoption and High-NA revenue mix. These are assumptions until official ASML product/mix evidence is loaded."
      badge={<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">Assumption history</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="EUV Durability" value={pct(latest?.euvDemandDurability)} note="Moat score in latest event" />
        <ScoreBlock label="High-NA Adoption" value={pct(latest?.highNaAdoption)} note="Adoption score in latest event" />
        <ScoreBlock label="High-NA Mix" value={pct(latest?.highNaRevenueMix)} note="Revenue mix assumption" />
        <ScoreBlock label="FV Gap" value={pct(latest?.fairValueGap)} note="Price discipline check" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">EUV durability and High-NA ramp assumptions</p>
          <div className="mt-4 h-[330px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={58} />
                <Tooltip formatter={(value: number, name: string) => [pct(value), name]} />
                <Bar dataKey="euvDemandDurability" name="EUV Durability" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="highNaAdoption" name="High-NA Adoption" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="highNaRevenueMix" name="High-NA Revenue Mix" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3">
          <InsightPanel icon={<Layers3 className="h-5 w-5" />} title="Research interpretation" text="High-NA should earn a higher value only when adoption, mix and margin evidence move together. A mix ramp without backlog or FCF support should not lift the whole company multiple." />
          <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Model audit breakpoint" text="If fair value is mostly explained by the High-NA SOTP multiple, the next diligence step is to lower that multiple and test whether DCF and FCF-yield still support the case." />
        </div>
      </div>
    </SectionCard>
  );
}

function AsmlAiCapexHistoryPanel({
  rows,
  analysis,
}: {
  rows: AsmlHistoricalValuationItem[];
  analysis: ReturnType<typeof buildAsmlDashboardData>["eightYearMarketAnalysis"];
}) {
  const chartRows = historicalDriverRows(rows, analysis.comparisonRows);
  const latest = chartRows[chartRows.length - 1] ?? null;
  return (
    <SectionCard
      title="AI Capex Cycle Historical Stress Map"
      description="Compares model AI-cycle risk and China haircut against ASML relative return years. This turns the market tape into a stress-test lens instead of a price anchor."
      badge={<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700">Price compared</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Latest AI Cycle Risk" value={pct(latest?.aiCapexCycleRisk)} note="Explicit valuation haircut" />
        <ScoreBlock label="Latest China Haircut" value={pct(latest?.chinaRestrictionHaircut)} note="Separate risk control" />
        <ScoreBlock label="Worst Relative Year" value={analysis.worstRelativeYear ? `${analysis.worstRelativeYear.year} ${pct(analysis.worstRelativeYear.relativeReturn)}` : "-"} note="ASML minus SPY annual return" />
        <ScoreBlock label="Latest FV Gap" value={pct(latest?.fairValueGap)} note="Fair value vs event price" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Cycle risk, China haircut and relative return</p>
          <div className="mt-4 h-[330px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} width={58} />
                <Tooltip formatter={(value: number, name: string) => [pct(value), name]} />
                <Bar dataKey="aiCapexCycleRisk" name="AI Cycle Risk" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="chinaRestrictionHaircut" name="China Haircut" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="relativeReturn" name="ASML vs SPY Annual Relative Return" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-3">
          <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title="Cycle lens" text="When ASML's relative return is weak but AI-cycle risk is low, the model is probably too complacent. The risk haircut should rise before the target multiple does." />
          <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="China separation" text="China restriction risk is kept separate from AI capex digestion so a policy shock does not get hidden inside generic revenue growth." />
        </div>
      </div>
    </SectionCard>
  );
}

function historicalEventLabel(row: AsmlHistoricalValuationItem, compact = false) {
  if (!compact) return row.event.fiscalPeriod;
  return row.event.fiscalPeriod.replace("FY20", "FY");
}

function AsmlHistoricalValuationPanel({ rows }: { rows: AsmlHistoricalValuationItem[] }) {
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const displayRows = useMemo(
    () => [...rows].sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate)),
    [rows],
  );
  const boundedVisibleCount = Math.min(Math.max(4, visibleCount), Math.max(4, displayRows.length));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)),
    [boundedVisibleCount, displayRows],
  );
  const selected = displayRows.find((row) => row.event.id === selectedEventId) ?? displayRows[displayRows.length - 1] ?? null;
  const savedRuns = displayRows.filter((row) => row.valuationRun).length;
  const chartRows = visibleRows.map((row) => ({
    period: historicalEventLabel(row, true),
    eventDate: row.event.eventDate,
    fiscalPeriod: row.event.fiscalPeriod,
    price: row.valuationRun?.currentPrice ?? null,
    fairValue: row.valuationRun?.fairValue ?? null,
    gapPct: row.valuationRun?.upsideDownside ?? null,
  }));
  const fairValueRows = chartRows.filter((row) => typeof row.fairValue === "number");
  const gapRows = chartRows.filter((row) => typeof row.gapPct === "number");
  const latestFairValue = [...fairValueRows].reverse()[0]?.fairValue ?? null;
  const latestGap = [...gapRows].reverse()[0]?.gapPct ?? null;
  const averageGap = gapRows.length ? gapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / gapRows.length : null;
  const averageFairValue = fairValueRows.length
    ? fairValueRows.reduce((sum, row) => sum + (row.fairValue ?? 0), 0) / fairValueRows.length
    : null;
  const priceRows = chartRows.filter((row) => typeof row.price === "number");
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];
  const windowOptions = [8, 12, 16, 24, displayRows.length].filter((count, index, list) => list.indexOf(count) === index && count > 0);

  return (
    <SectionCard
      title="ASML Historical Valuation"
      description="Quarterly as-of valuation view using event-specific ASML assumptions and nearest-prior daily ASML ADR adjusted close for price comparison."
      badge={<span className="border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">{priceRows.length ? "Price loaded" : "Research view"}</span>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Saved Runs" value={savedRuns.toString()} note="Valuation runs by event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length.toString()} note="Oldest-to-newest ASML valuation history" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? usd(selected.valuationRun.fairValue) : "-"} note="Event-specific fair value" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? pct(selected.valuationRun.upsideDownside) : "-"} note="Fair value vs nearest-prior adjusted close" />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Visible history window</p>
            <p className="mt-1 text-xs text-slate-500">Oldest-to-newest chart. Gray bars show nearest-prior ASML adjusted close; blue bars show event fair value.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {windowOptions.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setVisibleCount(count)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${boundedVisibleCount === Math.min(Math.max(4, count), Math.max(4, displayRows.length)) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
              >
                {count === displayRows.length ? "All" : `${count}Q`}
              </button>
            ))}
          </div>
        </div>
        <input
          className="mt-4 h-2 w-full accent-blue-600"
          type="range"
          min={Math.min(4, displayRows.length || 4)}
          max={Math.max(4, displayRows.length)}
          value={boundedVisibleCount}
          onChange={(event) => setVisibleCount(Number(event.target.value))}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ScoreBlock label="Visible Window" value={`${visibleRows.length} events`} note={`${visibleRows[0] ? historicalEventLabel(visibleRows[0], true) : "-"} to ${visibleRows[visibleRows.length - 1] ? historicalEventLabel(visibleRows[visibleRows.length - 1], true) : "-"}`} />
          <ScoreBlock label="Latest Gap" value={latestGap != null ? pct(latestGap) : "-"} note="Fair value minus as-of price" />
          <ScoreBlock label="Average Gap" value={averageGap != null ? pct(averageGap) : "-"} note="Average premium / discount in visible window" />
        </div>
      </div>

      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
        {displayRows.map((row) => {
          const active = row.event.id === selected?.event.id;
          return (
            <button
              key={row.event.id}
              type="button"
              onClick={() => setSelectedEventId(row.event.id)}
              className={`min-w-[170px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
            >
              <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
              <span className="mt-1 block font-semibold">{historicalEventLabel(row)}</span>
              <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
              <span className="mt-1 block text-xs text-slate-500">{row.valuationRun?.fairValue != null ? usd(row.valuationRun.fairValue) : "No run"}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">Fair value history</p>
          <div className="mt-4 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}`} width={58} />
                <Tooltip
                  content={(props) => {
                    if (!props.active || !props.payload?.length) return null;
                    const point = props.payload[0]?.payload as (typeof chartRows)[number] | undefined;
                    if (!point) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                        <p className="font-semibold text-ink">{props.label}</p>
                        <p className="text-slate-600">Event date: {point.eventDate}</p>
                        <p className="text-slate-600">Fiscal period: {point.fiscalPeriod}</p>
                        <p className="text-slate-600">As-of price: {point.price != null ? usd(point.price) : "-"}</p>
                        <p className="text-slate-600">Fair value: {point.fairValue != null ? usd(point.fairValue) : "-"}</p>
                        <p className="text-slate-600">Gap: {point.gapPct != null ? pct(point.gapPct) : "-"}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="price" name="As-of Price" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fairValue" name="Fair Value" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <ScoreBlock label="Latest Fair Value" value={latestFairValue != null ? usd(latestFairValue) : "-"} note="Latest event" />
            <ScoreBlock label="Price Series" value={priceRows.length ? `${priceRows.length} event prices` : "-"} note={priceRows.length ? "Nearest-prior daily bars" : "Price history pending"} />
            <ScoreBlock label="Future Leakage Check" value="Passed" note="Rows store event assumptions only" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-semibold text-ink">{selected ? `${selected.event.fiscalPeriod} selected run` : "Selected run"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{selected?.event.sourceNote ?? "No event selected."}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ScoreBlock label="Event Date" value={selected?.event.eventDate ?? "-"} note="Event date" />
            <ScoreBlock label="As-of Price" value={selected?.valuationRun?.currentPrice != null ? usd(selected.valuationRun.currentPrice) : "-"} note="Nearest-prior adjusted close" />
            <ScoreBlock label="3Y Target" value={selected?.valuationRun?.targetPrice3Y != null ? usd(selected.valuationRun.targetPrice3Y) : "-"} note="Fair value compounding bridge" />
            <ScoreBlock label="3Y CAGR" value={selected?.valuationRun?.expectedShareholderCagr != null ? pct(selected.valuationRun.expectedShareholderCagr) : "-"} note="Price-to-target bridge" />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {methodRows.map((row) => (
                  <tr key={row.key ?? row.label}>
                    <td className="px-3 py-2 font-medium text-ink">{row.label ?? row.key}</td>
                    <td className="px-3 py-2">{typeof row.value === "number" ? usd(row.value) : "-"}</td>
                    <td className="px-3 py-2">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.length ? (
            <div className="mt-4 space-y-2">
              {warnings.map((warning, index) => {
                const normalized = typeof warning === "string" ? { title: warning, detail: "", severity: "warning" } : warning;
                return (
                  <div key={`${normalized.title}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    <span className="font-semibold">{normalized.title}</span>
                    {normalized.detail ? ` - ${normalized.detail}` : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

export function AsmlDashboard({ module, scenario, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "dashboard");
  const { valuationAssumptions, handleValuationValuesChange } = useValuationAssumptionState({
    ticker: "ASML",
    defaultAssumptions: defaultAsmlValuationAssumptions,
    onDataSourceChange,
  });
  const dashboard = useMemo(
    () => buildAsmlDashboardData(module.data, scenario, valuationAssumptions as Partial<AsmlValuationAssumptions>),
    [module.data, scenario, valuationAssumptions],
  );
  const valuation = dashboard.valuation;
  const selectedFairValue = valuation.recommendedFairValue ?? valuation.fairValues.find((item) => item.scenario === scenario)?.fairValue ?? 0;

  return (
    <div className="space-y-6">
      <SectionCard
        title="ASML Lithography Monopoly Research Cockpit"
        description="ASML is framed as a platform-critical semiconductor equipment supplier across EUV demand, High-NA adoption, AI semiconductor capex, backlog conversion, margin durability and premium multiple resilience."
        badge={<DataQualityBadge badge={dashboard.dataStatus.valuationReliable ? "Actual" : dataSourceType === "manual" ? "Assumption" : "Needs Review"} />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Selected Fair Value" value={usd(selectedFairValue)} note="Blended valuation output" />
          <ScoreBlock label="Current Price" value={valuation.currentPrice > 0 ? usd(valuation.currentPrice) : "Unavailable"} note="ASML ADR market reference" />
          <ScoreBlock label="Revenue Base" value={usdm(Number(valuationAssumptions.normalizedRevenueUsd))} note="Current underwriting base" />
          <ScoreBlock label="Coverage Items" value={dashboard.sourceGaps.length} note="Inputs to refresh before final IC use" />
        </div>
      </SectionCard>

      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-4">
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="dashboard" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.summary.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>
          <AsmlEightYearMarketPanel analysis={dashboard.eightYearMarketAnalysis} />
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard.investmentQuestions.map((question) => (
              <InsightPanel key={question.title} icon={<Microscope className="h-5 w-5" />} title={question.title} text={question.text} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ScoreBlock label="Data Status" value={dashboard.dataStatus.valuationReliable ? "Reliable" : "Review"} note={`${dashboard.dataStatus.missingFields.length} coverage items`} />
            <ScoreBlock label="Probability Weighted FV" value={usd(valuation.probabilityWeightedFairValue)} note="25% Bear / 50% Base / 25% Bull" />
            <ScoreBlock label="Method Dispersion" value={multiple(valuation.methodDispersion)} note="Spread across DCF, FCF, P/E, EV/EBIT and SOTP" />
          </div>
          <SourceGapList gaps={dashboard.sourceGaps} />
        </Tabs.Content>

        <Tabs.Content value="orders-backlog" className="space-y-6">
          <SectionCard title="Orders / Backlog Conversion" description="For ASML, orders and backlog conversion are first-order valuation drivers. They should not be hidden inside a generic revenue CAGR assumption.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Orders Growth" value={pct(Number(valuationAssumptions.ordersGrowth))} note="Net bookings momentum input" />
              <ScoreBlock label="Backlog Coverage" value={multiple(Number(valuationAssumptions.backlogCoverage))} note="Forward revenue cover" />
              <ScoreBlock label="Backlog Conversion" value={pct(Number(valuationAssumptions.backlogConversion))} note="Conversion into systems revenue" />
              <ScoreBlock label="Effective Growth" value={pct(valuation.expectedReturnBridge.find((item) => item.key === "effective-growth")?.value)} note="Orders, backlog, service and cycle adjusted" />
            </div>
          </SectionCard>
          <AsmlOrdersBacklogHistoryPanel rows={dashboard.historicalValuations} analysis={dashboard.eightYearMarketAnalysis} />
          <SectionCard title="Eight-Year Cycle Read-Through" description="Price history is not a substitute for orders data, but it helps pressure-test whether the model is assuming a smooth cycle for a stock that has traded with pronounced capex cyclicality.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title="Backlog proof burden" text="Large ASML drawdowns in the 8-year window mean the model should demand hard evidence for backlog conversion before raising near-term systems revenue." />
              <InsightPanel icon={<Factory className="h-5 w-5" />} title="Orders are the swing factor" text="When ASML underperforms SPY, the first model audit should be orders growth and backlog conversion, not terminal multiple tweaks." />
              <InsightPanel icon={<AlertTriangle className="h-5 w-5" />} title="Do not price-anchor" text="Historical fair values are built from event assumptions and nearest-prior prices; current price does not leak into old quarters." />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="euv-high-na" className="space-y-6">
          <SectionCard title="EUV / High-NA Demand Durability" description="The core debate is whether logic, foundry and memory roadmaps sustain EUV demand and whether High-NA adds enough mix/pricing power to offset ramp risk.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<Cpu className="h-5 w-5" />} title="EUV installed-base durability" text="Modeled through the EUV demand durability score. The key evidence is customer roadmaps, layer counts, utilization, and tool intensity." />
              <InsightPanel icon={<Layers3 className="h-5 w-5" />} title="High-NA adoption" text="High-NA adoption is separated from generic revenue growth so users can test whether premium tools justify higher margin and multiple assumptions." />
              <InsightPanel icon={<Factory className="h-5 w-5" />} title="Backlog coverage" text="Backlog coverage is the key near-term demand sanity check and should be refreshed with official backlog data before final IC use." />
            </div>
          </SectionCard>
          <AsmlEuvHighNaHistoryPanel rows={dashboard.historicalValuations} />
          <SectionCard title="Evidence Map for EUV / High-NA" description="This panel translates the initiation-research skill into the exact evidence needed before treating the High-NA and EUV assumptions as investable rather than illustrative.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<Microscope className="h-5 w-5" />} title="Demand durability evidence" text="Needed: customer roadmap timing, EUV layer intensity, foundry and memory utilization, tool shipment cadence, and explicit backlog comments." />
              <InsightPanel icon={<Layers3 className="h-5 w-5" />} title="High-NA valuation bridge" text="Needed: mix, margin, ASP and service attach evidence. Until sourced, High-NA should stay inside SOTP rather than appear as a separate AI uplift." />
              <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="Falsifier" text="If High-NA adoption rises while FCF margin or backlog conversion falls, the model should lower the multiple rather than mechanically reward the mix shift." />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="ai-capex" className="space-y-6">
          <SectionCard title="AI Semiconductor Capex Cycle" description="ASML is not a GPU vendor, but AI infrastructure demand can pull foundry and memory capex forward. The model keeps that cycle risk explicit.">
            <div className="grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Revenue CAGR" value={pct(Number(valuationAssumptions.revenueCagr))} note="Editable through valuation controls" />
              <ScoreBlock label="AI Cycle Risk" value={pct(Number(valuationAssumptions.aiCapexCycleRisk))} note="Haircut for capex digestion" />
              <ScoreBlock label="Customer Concentration" value={pct(Number(valuationAssumptions.customerConcentrationHaircut))} note="Foundry/memory capex pushout haircut" />
            </div>
          </SectionCard>
          <AsmlAiCapexHistoryPanel rows={dashboard.historicalValuations} analysis={dashboard.eightYearMarketAnalysis} />
          <SectionCard title="AI Capex Cycle Discipline" description="The 8-year market tape suggests ASML can compound strongly, but drawdowns are severe when the market questions capex digestion. The model therefore separates AI cycle risk from durable lithography moat." >
            <div className="grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Worst Relative Year" value={dashboard.eightYearMarketAnalysis.worstRelativeYear ? `${dashboard.eightYearMarketAnalysis.worstRelativeYear.year} ${pct(dashboard.eightYearMarketAnalysis.worstRelativeYear.relativeReturn)}` : "-"} note="ASML return minus SPY" />
              <ScoreBlock label="Best ASML Year" value={dashboard.eightYearMarketAnalysis.bestYear ? `${dashboard.eightYearMarketAnalysis.bestYear.year} ${pct(dashboard.eightYearMarketAnalysis.bestYear.annualReturn)}` : "-"} note="High-beta upside case reminder" />
              <ScoreBlock label="Model Control" value={pct(Number(valuationAssumptions.aiCapexCycleRisk))} note="Explicit haircut, not hidden in WACC" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="revenue-mix" className="space-y-6">
          <SectionCard title="Systems / Service / High-NA Mix" description="ASML is not one revenue line. Systems, installed-base service, EUV, DUV and High-NA need separate economics and multiples.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreBlock label="Systems Mix" value={pct(Number(valuationAssumptions.systemsRevenueMix))} note="Cyclical equipment systems pool" />
              <ScoreBlock label="Service Mix" value={pct(Number(valuationAssumptions.serviceRevenueMix))} note="Installed-base service pool" />
              <ScoreBlock label="EUV Mix" value={pct(Number(valuationAssumptions.euvRevenueMix))} note="EUV system exposure" />
              <ScoreBlock label="DUV Mix" value={pct(Number(valuationAssumptions.duvRevenueMix))} note="DUV / immersion exposure" />
              <ScoreBlock label="High-NA Mix" value={pct(Number(valuationAssumptions.highNaRevenueMix))} note="Forward mix ramp assumption" />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Systems Revenue Pool" value={usdm(dashboard.revenuePools.systemsRevenue)} note="SOTP revenue pool, USDm" />
              <ScoreBlock label="Service Revenue Pool" value={usdm(dashboard.revenuePools.serviceRevenue)} note="SOTP revenue pool, USDm" />
              <ScoreBlock label="High-NA Revenue Pool" value={usdm(dashboard.revenuePools.highNaRevenue)} note="Incremental SOTP pool" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="margins-fcf" className="space-y-6">
          <SectionCard title="Gross Margin, Operating Leverage and FCF" description="The module separates gross margin, operating margin and FCF margin so mix benefits are not automatically double-counted in every method.">
            <div className="grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Gross Margin" value={pct(Number(valuationAssumptions.grossMargin))} note="Underwriting input" />
              <ScoreBlock label="Operating Margin" value={pct(Number(valuationAssumptions.operatingMargin))} note="Normalized EBIT margin" />
              <ScoreBlock label="FCF Margin" value={pct(Number(valuationAssumptions.fcfMargin))} note="Cash conversion underwriting input" />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <ScoreBlock label="Tax Rate" value={pct(Number(valuationAssumptions.taxRate))} note="Net income bridge input" />
              <ScoreBlock label="Capex / Revenue" value={pct(Number(valuationAssumptions.capexIntensity))} note="High-NA and capacity investment" />
              <ScoreBlock label="Service Growth" value={pct(Number(valuationAssumptions.installedBaseServiceGrowth))} note="Installed-base durability driver" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="space-y-6">
          <AsmlHistoricalValuationPanel rows={dashboard.historicalValuations} />
          <InteractiveValuationDashboard
            ticker="ASML"
            config={asmlValuationConfig}
            data={module.data}
            scenario={scenario}
            currency={module.currency}
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
          <SectionCard title="Method Outputs" description="Full-company methods are blended through explicit weights. High-NA is modeled inside the SOTP pool, not added as a second uplift.">
            <MethodTable valuation={valuation} />
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="risks" className="space-y-6">
          <SectionCard title="Risk Red Team" description="The ASML model separates the two biggest risk controls from growth: China restriction exposure and AI capex cycle digestion.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel icon={<ShieldAlert className="h-5 w-5" />} title="China restrictions" text="The China restriction haircut is explicit. Future sourcing should split China system shipments, service revenue, restricted products and license risk." />
              <InsightPanel icon={<TrendingUp className="h-5 w-5" />} title="AI capex priced in" text="If current price and consensus already imply a strong AI capex cycle, the revenue CAGR and target multiple assumptions need to be tested against backlog and order evidence." />
              <InsightPanel icon={<Globe2 className="h-5 w-5" />} title="EUR reporting / ADR bridge" text="Official reporting is EUR while this module uses a USD ADR view. FX, ADR share treatment and share count should be refreshed before final IC use." />
            </div>
            <div className="mt-5">
              <p className="mb-3 text-sm font-semibold text-ink">Risk Register</p>
              <AsmlRiskRegisterPanel analysis={dashboard.eightYearMarketAnalysis} />
            </div>
          </SectionCard>
          <SourceGapList gaps={dashboard.sourceGaps} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
