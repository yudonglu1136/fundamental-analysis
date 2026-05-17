import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { MckDashboardDataset } from "../types";
import { MiniMetric, money, multiple, PanelTable } from "./MckPrimitives";

type MckCapitalReturnRow = {
  fiscalYear: number;
  periodId: string;
  asOfDate: string;
  sourceType: string;
  sourceQuality: string;
  revenue: number | null;
  equityFreeCashFlow: number | null;
  dilutedShares: number | null;
  dividendPerShare: number | null;
  dividendCashCost: number | null;
  buybackAmount: number | null;
  totalCapitalReturn: number | null;
  fcfCoverage: number | null;
  payoutRatioOfFcf: number | null;
  isForecast: boolean;
  rawJson: unknown;
};

type MckCapitalReturnChartPoint = {
  fiscalYear: number;
  label: string;
  sourceType: string;
  sourceQuality: string;
  isForecast: boolean;
  dividends: number | null;
  buybacks: number | null;
  fcf: number | null;
  forecastDividends: number | null;
  forecastBuybacks: number | null;
  forecastFcf: number | null;
  totalCapitalReturn: number | null;
  fcfCoverage: number | null;
};

type MckCapitalReturnHistory = {
  ticker: "MCK";
  currency: "USD";
  unit: "USDm";
  years: number;
  rows: MckCapitalReturnRow[];
  forwardExpectation: MckCapitalReturnRow | null;
  chartSeries?: MckCapitalReturnChartPoint[];
  summary: {
    latestFiscalYear: number | null;
    latestDividendPerShare: number | null;
    latestDividendCashCost: number | null;
    latestBuybackAmount: number | null;
    latestEquityFreeCashFlow: number | null;
    latestTotalCapitalReturn: number | null;
    latestFcfCoverage: number | null;
    cumulativeCapitalReturn: number;
    cumulativeFcf: number;
    forwardFiscalYear: number | null;
    forwardTotalCapitalReturn: number | null;
    forwardFcfCoverage: number | null;
    excludesForwardFromCumulativeTotals: boolean;
  };
  warnings: Array<{ id: string; severity: string; title: string; detail: string }>;
};

function usdM(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "n/a" : money(value, 0);
}

function dps(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "n/a" : money(value, 2);
}

function sourceLabel(row: Pick<MckCapitalReturnRow, "sourceType" | "sourceQuality" | "isForecast">) {
  if (row.isForecast) return "forecast assumption";
  if (row.sourceType === "official_actual") return "official actual";
  if (row.sourceType === "market_data_proxy") return "market-data proxy";
  return row.sourceQuality.replace(/_/g, " ");
}

function sourceBadgeClass(sourceType: string) {
  if (sourceType === "official_actual") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (sourceType === "forecast_assumption") return "border-blue-100 bg-blue-50 text-blue-700";
  return "border-amber-100 bg-amber-50 text-amber-700";
}

function MckCapitalReturnTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MckCapitalReturnChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const dividendCashCost = row.dividends ?? row.forecastDividends;
  const buybackAmount = row.buybacks ?? row.forecastBuybacks;
  const fcf = row.fcf ?? row.forecastFcf;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-panel">
      <p className="font-semibold text-ink">{row.label}</p>
      <p className="mt-2 text-slate-600">Dividends: {usdM(dividendCashCost)}</p>
      <p className="text-slate-600">Buybacks: {usdM(buybackAmount)}</p>
      <p className="text-slate-600">Total capital return: {usdM(row.totalCapitalReturn)}</p>
      <p className="text-slate-600">FCF: {usdM(fcf)}</p>
      <p className="text-slate-600">FCF coverage: {row.fcfCoverage != null ? multiple(row.fcfCoverage) : "n/a"}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{sourceLabel(row)}</p>
    </div>
  );
}

function CapitalReturnLegend() {
  const items = [
    ["Dividends", "bg-emerald-600"],
    ["Buybacks", "bg-blue-600"],
    ["FCF", "bg-slate-500"],
    ["2026E forecast", "bg-[repeating-linear-gradient(45deg,#dbeafe_0,#dbeafe_4px,#2563eb_4px,#2563eb_6px)]"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
      {items.map(([label, colorClass]) => (
        <span key={label} className="inline-flex items-center gap-2">
          <span className={`h-3 w-5 rounded-sm ${colorClass}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function MckCapitalReturnsBackendPanel({ fallback }: { fallback: MckDashboardDataset["capitalAllocation"] }) {
  const [history, setHistory] = useState<MckCapitalReturnHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_MCK_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
    const endpoints = [`${apiBase}/api/stocks/mck/capital-returns?years=8`, `${apiBase}/api/mck/capital-returns?years=8`];
    let cancelled = false;

    async function loadCapitalReturns() {
      setStatus("loading");
      setMessage(null);
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { signal: controller.signal });
          if (!response.ok) throw new Error(`API returned ${response.status} for ${endpoint}`);
          const payload = (await response.json()) as MckCapitalReturnHistory;
          if (!payload.rows?.length) throw new Error("MCK capital-return API returned no annual rows.");
          if (!cancelled) {
            setHistory(payload);
            setStatus("online");
            setMessage(null);
          }
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
      if (!cancelled) setStatus("offline");
    }

    loadCapitalReturns();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const rows = history?.rows ?? [];
  const forward = history?.forwardExpectation ?? null;
  const chartRows = useMemo<MckCapitalReturnChartPoint[]>(() => {
    if (history?.chartSeries?.length) return history.chartSeries;
    return [
      ...rows.map((row) => ({
        fiscalYear: row.fiscalYear,
        label: `FY${row.fiscalYear}`,
        sourceType: row.sourceType,
        sourceQuality: row.sourceQuality,
        isForecast: false,
        dividends: row.dividendCashCost,
        buybacks: row.buybackAmount,
        fcf: row.equityFreeCashFlow,
        forecastDividends: null,
        forecastBuybacks: null,
        forecastFcf: null,
        totalCapitalReturn: row.totalCapitalReturn,
        fcfCoverage: row.fcfCoverage,
      })),
      ...(forward
        ? [{
            fiscalYear: forward.fiscalYear,
            label: `FY${forward.fiscalYear}E`,
            sourceType: forward.sourceType,
            sourceQuality: forward.sourceQuality,
            isForecast: true,
            dividends: null,
            buybacks: null,
            fcf: null,
            forecastDividends: forward.dividendCashCost,
            forecastBuybacks: forward.buybackAmount,
            forecastFcf: forward.equityFreeCashFlow,
            totalCapitalReturn: forward.totalCapitalReturn,
            fcfCoverage: forward.fcfCoverage,
          }]
        : []),
    ];
  }, [forward, history?.chartSeries, rows]);
  const latest = rows[rows.length - 1] ?? null;
  const warningText = history?.warnings?.map((warning) => `${warning.title}: ${warning.detail}`).join(" ") ?? null;

  return (
    <SectionCard
      title="Backend Capital Returns"
      description="Eight-year annual dividends and buybacks from the MCK backend, compared against annual FCF. FY2026E is shown as a hatched forecast and excluded from historical cumulative totals."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <MiniMetric label="Latest DPS" value={dps(latest?.dividendPerShare)} subtext={latest ? `FY${latest.fiscalYear}` : "Backend row"} />
        <MiniMetric label="Latest dividends" value={usdM(latest?.dividendCashCost ?? fallback.dividend)} subtext="Cash dividend cost" />
        <MiniMetric label="Latest buyback" value={usdM(latest?.buybackAmount ?? fallback.buyback)} subtext="Share repurchases" />
        <MiniMetric label="Latest FCF" value={usdM(latest?.equityFreeCashFlow ?? fallback.freeCashFlow)} subtext="Equity FCF" />
        <MiniMetric label="Latest FCF coverage" value={latest?.fcfCoverage != null ? multiple(latest.fcfCoverage) : "n/a"} subtext="FCF / capital return" />
        <MiniMetric label="8Y capital return" value={usdM(history?.summary.cumulativeCapitalReturn)} subtext="Excludes FY2026E" />
        <MiniMetric label="8Y FCF" value={usdM(history?.summary.cumulativeFcf)} subtext="Historical rows only" />
        <MiniMetric label="2026E return" value={usdM(forward?.totalCapitalReturn)} subtext="Forecast assumption" />
      </div>

      {status === "offline" ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Capital-return data service is temporarily unavailable.
        </div>
      ) : null}

      {status === "online" && warningText ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {warningText}
        </div>
      ) : null}

      {chartRows.length ? (
        <div className="mt-5 space-y-5">
          <CapitalReturnLegend />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={chartRows} barGap={8} barCategoryGap={22}>
                <defs>
                  <pattern id="mckDividendForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#ecfdf5" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#059669" strokeWidth="2" />
                  </pattern>
                  <pattern id="mckBuybackForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#eff6ff" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#2563eb" strokeWidth="2" />
                  </pattern>
                  <pattern id="mckFcfForecastHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#f8fafc" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" strokeWidth="2" />
                  </pattern>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}m`} />
                <Tooltip content={<MckCapitalReturnTooltip />} />
                <Bar dataKey="dividends" stackId="capitalReturn" fill="#059669" name="Dividends" />
                <Bar dataKey="buybacks" stackId="capitalReturn" fill="#2563eb" name="Buybacks" />
                <Bar dataKey="forecastDividends" stackId="capitalReturn" fill="url(#mckDividendForecastHatch)" stroke="#059669" strokeDasharray="4 3" name="2026E forecast" />
                <Bar dataKey="forecastBuybacks" stackId="capitalReturn" fill="url(#mckBuybackForecastHatch)" stroke="#2563eb" strokeDasharray="4 3" name="2026E forecast" />
                <Bar dataKey="fcf" fill="#64748b" name="FCF" />
                <Bar dataKey="forecastFcf" fill="url(#mckFcfForecastHatch)" stroke="#64748b" strokeDasharray="4 3" name="2026E forecast" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <PanelTable
            headers={["Fiscal Year", "DPS", "Dividends", "Buybacks", "Total Capital Return", "FCF", "FCF Coverage", "Source"]}
            rows={[...rows, ...(forward ? [forward] : [])].map((row) => [
              `FY${row.fiscalYear}${row.isForecast ? "E" : ""}`,
              dps(row.dividendPerShare),
              usdM(row.dividendCashCost),
              usdM(row.buybackAmount),
              usdM(row.totalCapitalReturn),
              usdM(row.equityFreeCashFlow),
              row.fcfCoverage != null ? multiple(row.fcfCoverage) : "n/a",
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>
                {sourceLabel(row)}
              </span>,
            ])}
          />
        </div>
      ) : status === "loading" ? (
        <p className="mt-5 text-sm text-slate-600">Loading MCK capital-return history from the backend.</p>
      ) : null}
    </SectionCard>
  );
}
