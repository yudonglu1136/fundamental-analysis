import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../../../api/client";
import { SectionCard } from "../../../components/shared/SectionCard";
import { calculatePltrValuationEngine } from "../engines/valuationEngine";
import type { PltrActualQuarter, PltrDashboardData, PltrValuationAssumptions } from "../model";
import { SourceNote, formatPct, formatUsd } from "./PLTRPrimitives";

type PltrHistoricalValuationMethod = {
  key?: string;
  label?: string;
  value?: number;
  format?: string;
  description?: string;
};

type PltrHistoricalValuationWarning = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

type PltrHistoricalValuationEvent = {
  id: string;
  eventDate: string;
  eventType: string;
  fiscalPeriod: string;
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
};

type PltrHistoricalValuationRun = {
  id: string;
  asOfDate: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y: number | null;
  expectedShareholderCagr: number | null;
  upsideDownside: number | null;
  methodOutputsJson: PltrHistoricalValuationMethod[];
  warningsJson: PltrHistoricalValuationWarning[];
  dataSnapshotJson: {
    revenueBase: number;
    revenueBaseTreatment: string;
    fcfMargin: number;
    gaapOperatingMargin: number;
    sbcAsPctRevenue: number;
    dilutedShares: number;
    netCash: number;
    sourceTreatment: string;
    asOfPriceSource?: {
      priceDate?: string;
      source?: string;
      sourceType?: string;
      currentPrice?: number;
    } | null;
    backendTreatment?: string;
  };
};

type PltrHistoricalValuationItem = {
  event: PltrHistoricalValuationEvent;
  valuationRun: PltrHistoricalValuationRun | null;
};

type PltrHistoricalValuationResponse = {
  historicalValuations?: PltrHistoricalValuationItem[];
};

function metricValue(period: PltrActualQuarter | undefined, key: string) {
  return period?.metrics[key]?.value ?? null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined) {
  return finite(numerator) && finite(denominator) && denominator !== 0 ? numerator / denominator : null;
}

function sumMetric(rows: PltrActualQuarter[], key: string) {
  const values = rows.map((row) => metricValue(row, key)).filter(finite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function eventTypeForQuarter(quarter: number) {
  return `q${quarter}_results`;
}

function periodLabel(period: PltrActualQuarter, compact = false) {
  return compact ? `Q${period.fiscalQuarter} ${String(period.fiscalYear).slice(2)}` : `Q${period.fiscalQuarter} ${period.fiscalYear}`;
}

function buildHistoricalRows(
  dashboard: PltrDashboardData,
  values: PltrValuationAssumptions,
): PltrHistoricalValuationItem[] {
  return dashboard.actuals.slice(-8).map((period) => {
    const actualIndex = dashboard.actuals.findIndex((row) => row.periodId === period.periodId);
    const visibleActuals = dashboard.actuals.slice(0, actualIndex + 1);
    const trailingRows = visibleActuals.slice(Math.max(0, visibleActuals.length - 4));
    const event = dashboard.transcript.events.find(
      (item) => item.fiscalYear === period.fiscalYear && item.fiscalQuarter === period.fiscalQuarter,
    );
    const reportedRevenue = metricValue(period, "revenue");
    const trailingRevenue = trailingRows.length === 4 ? sumMetric(trailingRows, "revenue") : null;
    const revenueBase = metricValue(period, "guidanceRevenue") ?? trailingRevenue ?? (finite(reportedRevenue) ? reportedRevenue * 4 : values.baseRevenue);
    const revenueBaseTreatment = metricValue(period, "guidanceRevenue")
      ? "event-visible FY guidance"
      : trailingRevenue
        ? "trailing four-quarter revenue"
        : "annualized quarterly revenue proxy";
    const trailingFcf = trailingRows.length === 4 ? sumMetric(trailingRows, "freeCashFlow") : null;
    const trailingGaapOperatingIncome = trailingRows.length === 4 ? sumMetric(trailingRows, "gaapOperatingIncome") : null;
    const trailingSbc = trailingRows.length === 4 ? sumMetric(trailingRows, "sbcExpense") : null;
    const fcfMargin = safeDivide(trailingFcf, trailingRevenue) ?? metricValue(period, "fcfMargin") ?? values.fcfMargin;
    const gaapOperatingMargin =
      safeDivide(trailingGaapOperatingIncome, trailingRevenue) ?? metricValue(period, "gaapOperatingMargin") ?? values.gaapOperatingMargin;
    const sbcAsPctRevenue = safeDivide(trailingSbc, trailingRevenue) ?? metricValue(period, "sbcAsPctRevenue") ?? values.sbcAsPctRevenue;
    const adjustedOperatingMargin = metricValue(period, "adjustedOperatingMargin") ?? values.adjustedOperatingMargin;
    const dilutedShares = metricValue(period, "dilutedShareCount") ?? values.dilutedShares;
    const netCash = metricValue(period, "netCash") ?? metricValue(period, "cashAndEquivalents") ?? values.netCash;
    const assumptions: PltrValuationAssumptions = {
      ...values,
      baseRevenue: revenueBase,
      fcfMargin,
      gaapOperatingMargin,
      adjustedOperatingMargin,
      sbcAsPctRevenue,
      dilutedShares,
      netCash,
    };
    const valuation = calculatePltrValuationEngine(visibleActuals, assumptions);
    const eventDate = event?.callDate ?? period.periodEnd;
    const warnings: PltrHistoricalValuationWarning[] = [
      {
        title: "Historical event price unavailable",
        detail:
          "Historical market prices are unavailable for this event, so this panel does not calculate historical upside/downside.",
        severity: "medium",
      },
      {
        title: "Module-local valuation run",
        detail:
          "This run is recalculated in the frontend from curated PLTR actuals and selected assumptions. It is not a backend-persisted valuation run yet.",
        severity: "medium",
      },
    ];
    if (revenueBaseTreatment === "annualized quarterly revenue proxy") {
      warnings.push({
        title: "Annualized revenue proxy",
        detail:
          "Less than four trailing quarters were available before this event in the curated PLTR dataset, so the revenue base annualizes the reported quarter.",
        severity: "low",
      });
    }
    if (!metricValue(period, "dilutedShareCount")) {
      warnings.push({
        title: "Share count assumption fallback",
        detail: "Diluted share count was missing for this period, so the selected model assumption was used.",
        severity: "medium",
      });
    }

    return {
      event: {
        id: event?.transcriptId ?? `pltr-${period.periodId}-results`,
        eventDate,
        eventType: eventTypeForQuarter(period.fiscalQuarter),
        fiscalPeriod: periodLabel(period),
        fiscalYear: period.fiscalYear,
        fiscalQuarter: period.fiscalQuarter,
        label: `${periodLabel(period)} reporting event`,
      },
      valuationRun: {
        id: `pltr-${period.periodId}-module-valuation`,
        asOfDate: eventDate,
        currentPrice: null,
        fairValue: valuation.selectedFairValue,
        targetPrice3Y: null,
        expectedShareholderCagr: null,
        upsideDownside: null,
        methodOutputsJson: valuation.methods.map((method) => ({
          key: method.key,
          label: method.label,
          value: method.fairValue,
          format: "currency",
          description: method.description,
        })),
        warningsJson: warnings,
        dataSnapshotJson: {
          revenueBase,
          revenueBaseTreatment,
          fcfMargin,
          gaapOperatingMargin,
          sbcAsPctRevenue,
          dilutedShares,
          netCash,
          sourceTreatment: "official_actuals_plus_derived_metrics_plus_forecast_assumptions",
        },
      },
    };
  });
}

function mergeBackendRows(
  localRows: PltrHistoricalValuationItem[],
  backendRows: PltrHistoricalValuationItem[],
): PltrHistoricalValuationItem[] {
  const byId = new Map(backendRows.map((row) => [row.event.id, row]));
  const byPeriod = new Map(
    backendRows.map((row) => [`${row.event.fiscalYear}-${row.event.fiscalQuarter}`, row]),
  );
  return localRows.map((local) => {
    const backend = byId.get(local.event.id) ?? byPeriod.get(`${local.event.fiscalYear}-${local.event.fiscalQuarter}`);
    const backendRun = backend?.valuationRun ?? null;
    if (!backendRun?.currentPrice || !local.valuationRun) return local;
    const fairValue = backendRun.fairValue ?? local.valuationRun.fairValue;
    const currentPrice = backendRun.currentPrice;
    return {
      event: {
        ...local.event,
        ...(backend?.event ?? {}),
        fiscalPeriod: local.event.fiscalPeriod,
        label: local.event.label,
      },
      valuationRun: {
        ...local.valuationRun,
        ...backendRun,
        fairValue,
        methodOutputsJson: backendRun.methodOutputsJson?.length ? backendRun.methodOutputsJson : local.valuationRun.methodOutputsJson,
        warningsJson: [
          ...(backendRun.warningsJson ?? []),
          ...local.valuationRun.warningsJson.filter((warning) => warning.title !== "Historical event price unavailable"),
        ],
        currentPrice,
        upsideDownside: currentPrice && fairValue ? fairValue / currentPrice - 1 : null,
        dataSnapshotJson: {
          ...local.valuationRun.dataSnapshotJson,
          ...(backendRun.dataSnapshotJson ?? {}),
        },
      },
    };
  });
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

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${row[0]}-${cellIndex}`} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PLTRHistoricalValuationPanel({
  dashboard,
  values,
}: {
  dashboard: PltrDashboardData;
  values: PltrValuationAssumptions;
}) {
  const localRows = useMemo(() => buildHistoricalRows(dashboard, values), [dashboard, values]);
  const [backendRows, setBackendRows] = useState<PltrHistoricalValuationItem[]>([]);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    apiFetch<PltrHistoricalValuationResponse>("/api/stocks/pltr/historical-valuations?scenario=Base&modelVersion=pltr_v1_backend_pilot", {
      signal: controller.signal,
    })
      .then((payload) => {
        const rows = (payload.historicalValuations ?? []).slice().sort((left, right) => left.event.eventDate.localeCompare(right.event.eventDate));
        setBackendRows(rows);
        setStatus("online");
        setError(null);
      })
      .catch((fetchError: Error) => {
        if (fetchError.name === "AbortError") return;
        setBackendRows([]);
        setStatus("offline");
        setError(fetchError.message);
      });
    return () => controller.abort();
  }, []);
  const rows = useMemo(() => mergeBackendRows(localRows, backendRows), [backendRows, localRows]);
  const displayRows = rows;
  const boundedVisibleCount = Math.min(Math.max(4, visibleCount), Math.max(4, displayRows.length || 4));
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - boundedVisibleCount)),
    [boundedVisibleCount, displayRows],
  );
  const selected =
    displayRows.find((row) => row.event.id === selectedEventId) ??
    [...displayRows].reverse().find((row) => row.valuationRun) ??
    displayRows[0] ??
    null;
  const runs = displayRows.filter((row) => row.valuationRun);
  const chartRows = visibleRows.map((row) => ({
    period: row.event.fiscalPeriod.replace("20", "'"),
    eventDate: row.event.eventDate,
    fiscalPeriod: row.event.fiscalPeriod,
    price: row.valuationRun?.currentPrice ?? null,
    fairValue: row.valuationRun?.fairValue ?? null,
    gapPct: row.valuationRun?.upsideDownside ?? null,
  }));
  const fairValueRows = chartRows.filter((row) => row.fairValue != null);
  const latestFairValue = [...fairValueRows].reverse()[0]?.fairValue ?? null;
  const averageFairValue = fairValueRows.length
    ? fairValueRows.reduce((sum, row) => sum + (row.fairValue ?? 0), 0) / fairValueRows.length
    : null;
  const windowOptions = Array.from(new Set([8, 12, 16, 24].filter((count) => count < displayRows.length).concat(displayRows.length)));
  const methodRows = selected?.valuationRun?.methodOutputsJson ?? [];
  const warnings = selected?.valuationRun?.warningsJson ?? [];

  return (
    <SectionCard
      title="PLTR Historical Valuation Model"
      description="Reporting-event valuation template using PLTR curated actuals, event-visible revenue bases, SQLite as-of price anchors, and the same PLTR valuation engine used by the current dashboard."
      badge={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${status === "online" ? "bg-emerald-50 text-emerald-700" : status === "loading" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
          {status === "online" ? "Data online" : status === "loading" ? "Loading" : "Data unavailable"}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <ScoreBlock label="Model Runs" value={`${runs.length}/${displayRows.length || 0}`} note="Frontend recalculations by reporting event" />
        <ScoreBlock label="Quarter Events" value={displayRows.length || "n/a"} note="Latest eight PLTR reporting quarters" />
        <ScoreBlock label="Selected Fair Value" value={selected?.valuationRun?.fairValue != null ? formatUsd(selected.valuationRun.fairValue, "") : "N/A"} note="Same PLTR valuation engine" />
        <ScoreBlock label="Selected Upside" value={selected?.valuationRun?.upsideDownside != null ? formatPct(selected.valuationRun.upsideDownside) : "N/A"} note="Fair value vs SQLite as-of price" />
      </div>

      <div className="mt-5">
        {status === "online" ? (
          <SourceNote>
            As-of price is loaded from the PLTR SQLite backend daily_price_bars table using the nearest prior trading day for each reporting event. Fair value remains calculated by the PLTR valuation engine from event-visible actuals and selected assumptions.
          </SourceNote>
        ) : (
          <SourceNote>
            Historical data service is temporarily unavailable. Static PLTR dashboard sections still render.
          </SourceNote>
        )}
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Visible history window</p>
            <p className="mt-1 text-xs text-slate-500">Use the range bar to focus the chart while the reporting-event selector remains horizontally scrollable.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {windowOptions.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setVisibleCount(count)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${boundedVisibleCount === Math.min(Math.max(4, count), Math.max(4, displayRows.length || 4)) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
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
          max={Math.max(4, displayRows.length || 4)}
          value={boundedVisibleCount}
          onChange={(event) => setVisibleCount(Number(event.target.value))}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ScoreBlock
            label="Visible Window"
            value={`${visibleRows.length} events`}
            note={`${visibleRows[0]?.event.fiscalPeriod ?? "N/A"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "N/A"}`}
          />
          <ScoreBlock label="Latest Fair Value" value={latestFairValue != null ? formatUsd(latestFairValue, "") : "N/A"} note="Latest visible model output" />
          <ScoreBlock label="Average Fair Value" value={averageFairValue != null ? formatUsd(averageFairValue, "") : "N/A"} note="Average in visible window" />
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
              className={`min-w-[178px] rounded-lg border px-3 py-2 text-left text-sm transition ${active ? "border-blue-500 bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
            >
              <span className="block text-xs font-semibold uppercase text-slate-500">{row.event.eventDate}</span>
              <span className="mt-1 block font-semibold">{row.event.fiscalPeriod}</span>
              <span className="mt-1 block text-xs capitalize text-slate-500">{row.event.eventType.replace(/_/g, " ")}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {row.valuationRun?.fairValue != null ? `${formatUsd(row.valuationRun.fairValue, "")} fair value` : "No model run"}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-semibold text-ink">{selected.event.label}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ScoreBlock label="Event Date" value={selected.event.eventDate} note={selected.event.eventType.replace(/_/g, " ")} />
              <ScoreBlock
                label="As-of Price"
                value={selected.valuationRun?.currentPrice != null ? formatUsd(selected.valuationRun.currentPrice, "") : "N/A"}
                note={selected.valuationRun?.dataSnapshotJson.asOfPriceSource?.priceDate ?? "Awaiting PLTR backend daily prices"}
              />
              <ScoreBlock
                label="Revenue Base"
                value={selected.valuationRun ? formatUsd(selected.valuationRun.dataSnapshotJson.revenueBase) : "N/A"}
                note={selected.valuationRun?.dataSnapshotJson.revenueBaseTreatment ?? "N/A"}
              />
              <ScoreBlock
                label="FCF Margin"
                value={selected.valuationRun ? formatPct(selected.valuationRun.dataSnapshotJson.fcfMargin) : "N/A"}
                note="Event-visible metric or selected assumption fallback"
              />
            </div>
            <DataTable
              columns={["Method", "Value", "Description"]}
              rows={methodRows.map((row) => [
                row.label ?? row.key ?? "Method",
                typeof row.value === "number" ? formatUsd(row.value, "") : "N/A",
                row.description ?? "",
              ])}
            />
            {warnings.length ? (
              <div className="mt-4 space-y-2">
                {warnings.map((warning, index) => (
                  <div key={`${warning.title}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">{warning.title}</p>
                    <p className="mt-1 leading-6">{warning.detail}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-ink">As-of Price vs Fair Value</h3>
            <div className="mt-3 h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "As-of price" && value == null) return "N/A";
                      return formatUsd(value, "");
                    }}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload as { eventDate?: string; fiscalPeriod?: string; gapPct?: number | null } | undefined;
                      return `${row?.eventDate ?? label}${row?.fiscalPeriod ? ` (${row.fiscalPeriod})` : ""}${typeof row?.gapPct === "number" ? ` | Gap ${formatPct(row.gapPct)}` : " | Price unavailable"}`;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="price" fill="#94a3b8" name="As-of price" />
                  <Bar dataKey="fairValue" fill="#2563eb" name="Fair value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
