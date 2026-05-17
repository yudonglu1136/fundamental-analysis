import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AznBadge, formatPct, formatUsdM } from "./AznUi";

type AznBackendEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  eventType: string;
  label: string;
};

type AznBackendValuationRun = {
  id: string;
  asOfDate: string;
  reportingEventId: string;
  scenario: string;
  modelVersion: string;
  currentPrice: number | null;
  fairValue: number | null;
  targetPrice3Y?: number | null;
  expectedShareholderCagr?: number | null;
  upsideDownside: number | null;
  methodOutputsJson: Array<{ key: string; label: string; value: number | null; format: string; description: string }>;
  sensitivityTablesJson: Array<{ title: string; table: Array<Array<string | number>> }>;
  warningsJson: Array<{ id: string; title: string; detail: string; severity: string }>;
  dataSnapshotJson: {
    valuationPeriodId?: string | null;
    marketSnapshotId?: string | null;
    pipelineAssumptionSetId?: string | null;
    financialPeriodCount?: number;
    therapyAreaFinancialCount?: number;
    productFinancialCount?: number;
    pipelineAssetCount?: number;
    pipelineMilestoneCount?: number;
    transcriptExtractionCount?: number;
    interimRunRateSnapshot?: boolean;
    noFutureDataPolicy?: string;
    currentPriceGbp?: number;
    gbpUsd?: number;
    methodWeights?: Record<string, number>;
    dataSnapshotJson?: {
      financialPeriodIds?: string[];
      therapyAreaEventIds?: string[];
      pipelineAsOfDates?: string[];
    };
  };
};

type AznHistoricalValuation = {
  event: AznBackendEvent;
  valuationRun: AznBackendValuationRun | null;
};

type AznBacktestMetricSet = {
  totalReturn?: number | null;
  cagr?: number | null;
  maxDrawdown?: number | null;
  sharpe?: number | null;
  volatility?: number | null;
};

type AznBacktestCurvePoint = {
  date: string;
  stock: number;
  aznBuyHold?: number;
  spy: number;
  benchmark?: number;
};

type AznBacktestResult = {
  status?: string;
  ticker?: string;
  benchmarkTicker?: string;
  startDate?: string;
  endDate?: string;
  priceBars?: Record<string, number | string | Record<string, string | null>>;
  metrics?: {
    stock?: AznBacktestMetricSet;
    aznBuyHold?: AznBacktestMetricSet;
    spy?: AznBacktestMetricSet;
    benchmark?: AznBacktestMetricSet;
  };
  curve?: AznBacktestCurvePoint[];
  warnings?: string[];
};

type AznBackendSnapshot = {
  reportingEvent: AznBackendEvent | null;
  financialPeriods: Array<{ periodId: string; revenue: number; adjustedOperatingProfit: number; adjustedEps: number; sourceType: string }>;
  therapyAreaFinancials: Array<{ eventId: string; therapyArea: string; revenue: number; yoyGrowthCer: number; sourceType: string }>;
  productFinancials: Array<{ eventId: string; productName: string; therapyArea: string; revenue: number; yoyGrowthCer: number; sourceType: string }>;
  pipelineAssets: Array<{ assetName: string; therapyArea: string; phase: string; probabilityOfSuccess: number; peakSales: number; launchYear: number; sourceType: string; valuationImpactAllowed: number }>;
  guidanceItems: Array<{ metric: string; guidanceType: string; midpointValue: number; modelReady: number; valuationImpactAllowed: number }>;
  transcriptExtractions: Array<{ topic: string; extractionType: string; supportingQuoteShort: string; valuationImpactAllowed: number }>;
  validationWarnings: Array<{ title: string; detail: string; severity: string }>;
};

function formatValue(value: number | null, format: string) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (format === "percent") return formatPct(value);
  if (format === "multiple") return `${value.toFixed(1)}x`;
  return `£${value.toFixed(2)}`;
}

function formatGbp(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `£${value.toFixed(digits)}`;
}

function formatSignedPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPct(value)}`;
}

function eventTone(eventType: string): "green" | "amber" | "blue" | "slate" {
  if (eventType === "fy_results") return "green";
  if (eventType === "h1_results") return "blue";
  if (eventType === "q3_9m_results") return "amber";
  return "slate";
}

export function AznApiHistoricalValuationPanel({ apiBaseUrl, scenario }: { apiBaseUrl: string; scenario: string }) {
  const [historical, setHistorical] = useState<AznHistoricalValuation[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<AznBackendSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [error, setError] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(16);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`${apiBaseUrl}/api/stocks/azn/historical-valuations?scenario=${encodeURIComponent(scenario)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`AZN API returned ${response.status}`);
        return response.json() as Promise<{ historicalValuations: AznHistoricalValuation[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const rows = (payload.historicalValuations ?? []).slice().sort((left, right) => {
          const dateOrder = left.event.eventDate.localeCompare(right.event.eventDate);
          return dateOrder !== 0 ? dateOrder : left.event.id.localeCompare(right.event.id);
        });
        setHistorical(rows);
        setSelectedEventId((current) => current || [...rows].reverse().find((row) => row.valuationRun)?.event.id || rows[rows.length - 1]?.event.id || "");
        setVisibleCount((current) => Math.min(Math.max(current, 8), Math.max(rows.length, 8)));
        setStatus("online");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, scenario]);

  useEffect(() => {
    if (!selectedEventId || status !== "online") return;
    let cancelled = false;
    fetch(`${apiBaseUrl}/api/stocks/azn/snapshot?eventId=${encodeURIComponent(selectedEventId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`AZN snapshot API returned ${response.status}`);
        return response.json() as Promise<AznBackendSnapshot>;
      })
      .then((payload) => {
        if (!cancelled) setSnapshot(payload);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setStatus("offline");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, selectedEventId, status]);

  const selected = useMemo(
    () => historical.find((row) => row.event.id === selectedEventId) ?? historical[0] ?? null,
    [historical, selectedEventId],
  );

  const selectedTherapyRows = useMemo(
    () => (snapshot?.therapyAreaFinancials ?? []).filter((row) => row.eventId === selected?.event.id).slice(0, 6),
    [selected, snapshot],
  );
  const selectedProductRows = useMemo(
    () => (snapshot?.productFinancials ?? []).filter((row) => row.eventId === selected?.event.id).sort((left, right) => right.revenue - left.revenue).slice(0, 8),
    [selected, snapshot],
  );
  const selectedPipelineRows = useMemo(
    () => (snapshot?.pipelineAssets ?? []).filter((row) => Number(row.valuationImpactAllowed) === 1).sort((left, right) => right.peakSales - left.peakSales).slice(0, 6),
    [snapshot],
  );
  const displayRows = historical;
  const visibleRows = useMemo(
    () => displayRows.slice(Math.max(0, displayRows.length - Math.min(visibleCount, displayRows.length || visibleCount))),
    [displayRows, visibleCount],
  );
  const chartRows = useMemo(
    () =>
      visibleRows
        .filter((row) => row.valuationRun?.fairValue != null && row.valuationRun.currentPrice != null)
        .map((row) => ({
          eventId: row.event.id,
          label: row.event.fiscalPeriod.replace(" ", " "),
          fiscalPeriod: row.event.fiscalPeriod,
          eventLabel: row.event.label,
          eventDate: row.event.eventDate,
          price: Number((row.valuationRun?.currentPrice ?? 0).toFixed(2)),
          fairValue: Number((row.valuationRun?.fairValue ?? 0).toFixed(2)),
          gapPct: row.valuationRun?.upsideDownside ??
            ((row.valuationRun?.currentPrice && row.valuationRun.fairValue)
              ? row.valuationRun.fairValue / row.valuationRun.currentPrice - 1
              : null),
        })),
    [visibleRows],
  );
  const latestVisibleGap = [...chartRows].reverse().find((row) => row.gapPct != null)?.gapPct ?? null;
  const visibleGapRows = chartRows.filter((row) => row.gapPct != null);
  const averageVisibleGap = visibleGapRows.length
    ? visibleGapRows.reduce((sum, row) => sum + (row.gapPct ?? 0), 0) / visibleGapRows.length
    : null;
  const methodRows = useMemo(() => {
    const methods = selected?.valuationRun?.methodOutputsJson ?? [];
    const fairValue = selected?.valuationRun?.fairValue ?? 0;
    return methods
      .filter((method) => ["azn-dcf", "azn-sotp", "azn-pipeline", "azn-multiple", "azn-backend-fcf-yield", "azn-backend-ev-ebitda", "azn-backend-pe-cross-check"].includes(method.key))
      .map((method) => ({
        ...method,
        width: method.value != null && fairValue > 0 ? Math.max(5, Math.min(100, Math.abs(method.value) / fairValue * 100)) : 5,
      }));
  }, [selected]);
  const sensitivity = useMemo(() => selected?.valuationRun?.sensitivityTablesJson?.find((table) => /WACC/i.test(table.title)) ?? selected?.valuationRun?.sensitivityTablesJson?.[0] ?? null, [selected]);
  const sensitivityRows = useMemo(() => {
    if (!sensitivity?.table?.length) return [];
    const headers = sensitivity.table[0].slice(1);
    const body = sensitivity.table.slice(1);
    const values = body.flatMap((row) => row.slice(1).map((value) => Number(value))).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return body.map((row) => ({
      rowHeader: row[0],
      cells: row.slice(1).map((value, index) => {
        const numeric = Number(value);
        const intensity = max === min ? 0.5 : (numeric - min) / (max - min);
        return { column: headers[index], value: numeric, intensity };
      }),
    }));
  }, [sensitivity]);
  const selectedRun = selected?.valuationRun ?? null;
  const savedRuns = historical.filter((row) => row.valuationRun).length;
  const latestRun = historical.find((row) => row.valuationRun)?.valuationRun ?? null;
  const earliestRun = [...historical].reverse().find((row) => row.valuationRun)?.valuationRun ?? null;
  const fairValueChange =
    latestRun?.fairValue != null && earliestRun?.fairValue != null && earliestRun.fairValue !== 0
      ? latestRun.fairValue / earliestRun.fairValue - 1
      : null;

  if (status === "offline") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">AZN backend valuation data is unavailable.</p>
        <p className="mt-1">The static AZN valuation view below remains active. To show historical backend valuation charts, run <span className="font-semibold">npm run azn:backend:seed</span> and <span className="font-semibold">npm run api:dev</span>.</p>
        <p className="mt-1">API error: {error || "unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">Historical Reporting Event Valuation Runs</h3>
          <p className="mt-1 text-sm text-slate-600">Selecting an event changes valuation, financials, pipeline, guidance, transcript notes and audit trail to that event date.</p>
        </div>
        <AznBadge tone={status === "online" ? "green" : "amber"}>{status === "online" ? "Data online" : "Loading"}</AznBadge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricBox label="Data status" value={status === "online" ? "Data online" : "Loading"} subtext="Historical event data" />
        <MetricBox label="Saved runs" value={`${savedRuns}`} subtext={`${scenario} scenario persisted runs`} />
        <MetricBox label="Reporting events" value={`${displayRows.length || 0}`} subtext="Quarterly event timeline" />
        <MetricBox label="Selected fair value" value={formatGbp(selectedRun?.fairValue, 2)} subtext="Backend persisted value" />
        <MetricBox label="Selected upside/downside" value={formatSignedPct(selectedRun?.upsideDownside)} subtext="Fair value vs event price" />
        <MetricBox label="FV change" value={formatSignedPct(fairValueChange)} subtext="Oldest to latest event" />
      </div>

      {displayRows.length ? (
        <Panel title="Visible History Window">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Reporting-event interval</p>
              <p className="mt-1 text-xs text-slate-500">Chart order is oldest to newest. The event selector remains horizontally scrollable.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[8, 12, 16, 24, displayRows.length].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setVisibleCount(count)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${Math.min(visibleCount, displayRows.length) === count ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  {count === displayRows.length ? "All" : `${count}Q`}
                </button>
              ))}
            </div>
          </div>
          <input
            className="mt-4 h-2 w-full accent-sky-600"
            type="range"
            min={Math.min(4, displayRows.length)}
            max={Math.max(4, displayRows.length)}
            value={Math.min(visibleCount, Math.max(4, displayRows.length))}
            onChange={(event) => setVisibleCount(Number(event.target.value))}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <MetricBox label="Visible window" value={`${visibleRows.length} events`} subtext={`${visibleRows[0]?.event.fiscalPeriod ?? "n/a"} to ${visibleRows[visibleRows.length - 1]?.event.fiscalPeriod ?? "n/a"}`} />
            <MetricBox label="Latest gap" value={formatSignedPct(latestVisibleGap)} subtext="Fair value vs as-of price" />
            <MetricBox label="Average gap" value={formatSignedPct(averageVisibleGap)} subtext="Average visible-window discount / premium" />
          </div>
        </Panel>
      ) : null}

      {chartRows.length ? (
        <Panel title="As-Of Price vs Fair Value">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 12, right: 18, left: 0, bottom: 48 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={58} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `£${Number(value).toFixed(0)}`} />
                <Tooltip
                  formatter={(value, name) => {
                    return [formatGbp(Number(value), 2), name];
                  }}
                  labelFormatter={(label, rows) => {
                    const payload = rows?.[0]?.payload;
                    const gap = typeof payload?.gapPct === "number" ? ` | Gap ${formatSignedPct(payload.gapPct)}` : "";
                    return `${payload?.eventLabel ?? label} (${payload?.fiscalPeriod ?? ""})${gap}`;
                  }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #cbd5e1", boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)" }}
                />
                <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="price" name="As-of price" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="fairValue" name="Fair value" fill="#2563eb" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {displayRows.map((row) => (
            <button
              key={row.event.id}
              type="button"
              onClick={() => setSelectedEventId(row.event.id)}
              className={`w-44 rounded-lg border p-3 text-left text-sm transition ${
                selectedEventId === row.event.id ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              <span className="block text-xs font-semibold uppercase tracking-normal opacity-75">{row.event.fiscalPeriod}</span>
              <span className="mt-1 block font-semibold">{row.event.eventDate}</span>
              <span className="mt-1 block truncate text-xs opacity-80">{row.event.label}</span>
              <span className="mt-2 block text-xs">
                FV {row.valuationRun?.fairValue != null ? `£${row.valuationRun.fairValue.toFixed(1)}` : "pending"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected?.valuationRun ? (
        <div className="grid gap-3 md:grid-cols-4">
          <MetricBox label="As-of price" value={formatGbp(selected.valuationRun.currentPrice, 2)} subtext={`GBP/USD ${selected.valuationRun.dataSnapshotJson.gbpUsd?.toFixed(3) ?? "n/a"}`} />
          <MetricBox label="As-of fair value" value={formatGbp(selected.valuationRun.fairValue, 2)} subtext={selected.valuationRun.modelVersion} />
          <MetricBox label="3Y target" value={formatGbp(selected.valuationRun.targetPrice3Y, 2)} subtext={selected.valuationRun.expectedShareholderCagr != null ? `${formatSignedPct(selected.valuationRun.expectedShareholderCagr)} CAGR` : "Not persisted"} />
          <MetricBox label="Snapshot" value={selected.valuationRun.dataSnapshotJson.interimRunRateSnapshot ? "Run-rate" : "Annual"} subtext={selected.valuationRun.dataSnapshotJson.valuationPeriodId ?? "n/a"} />
        </div>
      ) : null}

      {selectedRun ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Method Bridge">
            <div className="space-y-3">
              {methodRows.map((method) => (
                <div key={method.key}>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-ink">{method.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{method.description}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-ink">{formatValue(method.value, method.format)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-sky-600" style={{ width: `${method.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Method Output Bars">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={methodRows.filter((method) => method.format === "currency").map((method) => ({ label: method.label.replace("Operating ", ""), value: method.value ?? 0 }))}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 72, bottom: 8 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                  <XAxis type="number" tickFormatter={(value) => `£${Number(value).toFixed(0)}`} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(value) => formatGbp(Number(value), 2)} />
                  <Bar dataKey="value" name="Method value" radius={[0, 3, 3, 0]}>
                    {methodRows.filter((method) => method.format === "currency").map((method) => (
                      <Cell key={method.key} fill={method.key.includes("pipeline") ? "#7c3aed" : method.key.includes("sotp") ? "#0284c7" : method.key.includes("dcf") ? "#059669" : "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      ) : null}

      {sensitivityRows.length ? (
        <Panel title={sensitivity?.title ?? "Valuation Sensitivity"}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-center text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left font-semibold text-slate-500">WACC</th>
                  {sensitivityRows[0]?.cells.map((cell) => (
                    <th key={String(cell.column)} className="px-2 py-2 font-semibold text-slate-500">{String(cell.column)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityRows.map((row) => (
                  <tr key={String(row.rowHeader)}>
                    <td className="px-2 py-2 text-left font-semibold text-slate-600">{String(row.rowHeader)}</td>
                    {row.cells.map((cell) => (
                      <td key={`${row.rowHeader}-${cell.column}`} className="px-1 py-1">
                        <span
                          className="block rounded-md px-2 py-2 font-semibold"
                          style={{
                            backgroundColor: `rgba(3, 105, 161, ${0.12 + cell.intensity * 0.55})`,
                            color: cell.intensity > 0.55 ? "white" : "#0f172a",
                          }}
                        >
                          {formatGbp(cell.value, 1)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Selected Event">
          {selected ? (
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <AznBadge tone={eventTone(selected.event.eventType)}>{selected.event.fiscalPeriod}</AznBadge>
                <span>{selected.event.eventDate}</span>
              </div>
              <p className="font-semibold text-ink">{selected.event.label}</p>
              <p>{selected.valuationRun?.dataSnapshotJson.noFutureDataPolicy ?? "Snapshot filters are enforced in the backend service."}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Loading events...</p>
          )}
        </Panel>

        <Panel title="Method Bridge">
          <div className="space-y-2">
            {(selected?.valuationRun?.methodOutputsJson ?? []).slice(0, 7).map((method) => (
              <div key={method.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-600">{method.label}</span>
                <span className="font-semibold text-ink">{formatValue(method.value, method.format)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Source Snapshot Used">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <MetricLine label="Financial rows" value={selected?.valuationRun?.dataSnapshotJson.financialPeriodCount ?? 0} />
            <MetricLine label="Therapy rows" value={selected?.valuationRun?.dataSnapshotJson.therapyAreaFinancialCount ?? 0} />
            <MetricLine label="Product rows" value={selected?.valuationRun?.dataSnapshotJson.productFinancialCount ?? 0} />
            <MetricLine label="Pipeline rows" value={selected?.valuationRun?.dataSnapshotJson.pipelineAssetCount ?? 0} />
            <MetricLine label="Catalysts" value={selected?.valuationRun?.dataSnapshotJson.pipelineMilestoneCount ?? 0} />
            <MetricLine label="Transcript notes" value={selected?.valuationRun?.dataSnapshotJson.transcriptExtractionCount ?? 0} />
          </div>
        </Panel>
      </div>

      {selectedRun ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Snapshot Audit Trail">
            <dl className="space-y-2 text-sm">
              <AuditRow label="Valuation period" value={selectedRun.dataSnapshotJson.valuationPeriodId ?? "n/a"} />
              <AuditRow label="Market snapshot" value={selectedRun.dataSnapshotJson.marketSnapshotId ?? "n/a"} />
              <AuditRow label="Pipeline set" value={selectedRun.dataSnapshotJson.pipelineAssumptionSetId ?? "n/a"} />
              <AuditRow label="Financial IDs" value={selectedRun.dataSnapshotJson.dataSnapshotJson?.financialPeriodIds?.join(", ") ?? "n/a"} />
              <AuditRow label="Pipeline dates" value={selectedRun.dataSnapshotJson.dataSnapshotJson?.pipelineAsOfDates?.join(", ") ?? "n/a"} />
            </dl>
          </Panel>
          <Panel title="Valuation Weights">
            <div className="space-y-2">
              {Object.entries(selectedRun.dataSnapshotJson.methodWeights ?? {}).map(([key, value]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize text-slate-600">{key.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-semibold text-ink">{formatPct(value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.min(100, value * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Persisted Warnings">
            <div className="space-y-2">
              {(selectedRun.warningsJson.length ? selectedRun.warningsJson : [{ id: "none", title: "No persisted warnings", detail: "No backend warnings persisted for this run.", severity: "none" }]).slice(0, 6).map((warning) => (
                <div key={`${warning.id}-${warning.title}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-ink">{warning.title}</p>
                    <AznBadge tone={warning.severity === "high" ? "red" : warning.severity === "medium" ? "amber" : "slate"}>{warning.severity}</AznBadge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{warning.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Therapy Area / Product Mix">
          <div className="space-y-3">
            {selectedTherapyRows.map((row) => (
              <div key={row.therapyArea}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">{row.therapyArea}</span>
                  <span className="text-slate-500">{formatUsdM(row.revenue)} · {formatPct(row.yoyGrowthCer)} CER</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(4, Math.min(100, row.revenue / Math.max(selectedTherapyRows[0]?.revenue ?? 1, 1) * 100))}%` }} />
                </div>
              </div>
            ))}
            <div className="grid gap-2 md:grid-cols-2">
              {selectedProductRows.map((row) => (
                <div key={`${row.productName}-${row.therapyArea}`} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-semibold text-ink">{row.productName}</p>
                  <p className="text-slate-500">{row.therapyArea} · {formatUsdM(row.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Pipeline / Guidance / Transcript Intelligence">
          <div className="space-y-3">
            {selectedPipelineRows.map((row) => (
              <div key={`${row.assetName}-${row.launchYear}`} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{row.assetName}</p>
                    <p className="text-slate-500">{row.therapyArea} · {row.phase} · launch {row.launchYear}</p>
                  </div>
                  <AznBadge tone="blue">{formatPct(row.probabilityOfSuccess)} POS</AznBadge>
                </div>
                <p className="mt-2 text-slate-500">Peak sales scenario: {formatUsdM(row.peakSales)}</p>
              </div>
            ))}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-semibold text-ink">Transcript Market Focus</p>
              <p className="mt-1">
                {(snapshot?.transcriptExtractions ?? []).slice(0, 4).map((row) => row.topic).join(" · ") || "No selected-event transcript extraction loaded yet."}
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AznBacktestPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [startDate, setStartDate] = useState("2018-01-02");
  const [endDate, setEndDate] = useState("2026-05-12");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AznBacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setStatus("running");
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/stocks/azn/backtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          benchmarkTicker: "SPY",
        }),
      });
      if (!response.ok) throw new Error(`AZN backend returned ${response.status}`);
      const payload = (await response.json()) as AznBacktestResult;
      setResult(payload);
      setStatus(payload.status === "insufficient_data" ? "error" : "done");
      setError(payload.status === "insufficient_data" ? (payload.warnings ?? []).join(" ") : "");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [apiBaseUrl, endDate, startDate]);

  const curve = useMemo(() => {
    const rows = result?.curve ?? [];
    const step = Math.max(1, Math.floor(rows.length / 420));
    return rows
      .filter((_, index) => index % step === 0 || index === rows.length - 1)
      .map((row) => ({
        ...row,
        aznReturn: ((row.stock ?? row.aznBuyHold ?? 1) - 1) * 100,
        spyReturn: ((row.spy ?? row.benchmark ?? 1) - 1) * 100,
      }));
  }, [result]);
  const stockMetrics = result?.metrics?.stock ?? result?.metrics?.aznBuyHold;
  const spyMetrics = result?.metrics?.spy ?? result?.metrics?.benchmark;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">AZN.L vs SPY Backtest</h3>
          <p className="mt-1 text-sm text-slate-600">Select a date range and compare AZN buy-and-hold performance against SPY from backend daily price history.</p>
        </div>
        <AznBadge tone={status === "done" ? "green" : status === "running" ? "blue" : status === "error" ? "amber" : "slate"}>
          {status === "done" ? "Backtest ready" : status === "running" ? "Running" : status === "error" ? "Needs data" : "Ready"}
        </AznBadge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-ink">
          Start date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-ink">
          End date
          <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={runBacktest}
          disabled={status === "running"}
          className="self-end rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "running" ? "Running..." : "Run backtest"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {error}
        </div>
      ) : null}

      {curve.length ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="AZN.L vs SPY Total Return">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={28} />
                  <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="aznReturn" dot={false} stroke="#2563eb" strokeWidth={2.5} name="AZN.L" />
                  <Line type="monotone" dataKey="spyReturn" dot={false} stroke="#64748b" strokeWidth={2.2} name="SPY" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricBox label="Stock CAGR" value={stockMetrics?.cagr != null ? formatPct(stockMetrics.cagr) : "n/a"} subtext="AZN.L buy-and-hold" />
              <MetricBox label="SPY CAGR" value={spyMetrics?.cagr != null ? formatPct(spyMetrics.cagr) : "n/a"} subtext="Benchmark" />
              <MetricBox label="Stock MDD" value={stockMetrics?.maxDrawdown != null ? formatPct(stockMetrics.maxDrawdown) : "n/a"} subtext="Maximum drawdown" />
              <MetricBox label="SPY MDD" value={spyMetrics?.maxDrawdown != null ? formatPct(spyMetrics.maxDrawdown) : "n/a"} subtext="Maximum drawdown" />
              <MetricBox label="Stock Sharpe" value={stockMetrics?.sharpe != null ? stockMetrics.sharpe.toFixed(2) : "n/a"} subtext="Zero risk-free rate" />
              <MetricBox label="SPY Sharpe" value={spyMetrics?.sharpe != null ? spyMetrics.sharpe.toFixed(2) : "n/a"} subtext="Zero risk-free rate" />
              <MetricBox label="Stock Vol" value={stockMetrics?.volatility != null ? formatPct(stockMetrics.volatility) : "n/a"} subtext="Annualized daily vol" />
              <MetricBox label="SPY Vol" value={spyMetrics?.volatility != null ? formatPct(spyMetrics.volatility) : "n/a"} subtext="Annualized daily vol" />
            </div>
          </div>
        </div>
      ) : null}

      {result?.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {result.warnings.map((warning) => (
            <div key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricBox({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
      {subtext ? <p className="mt-1 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words font-medium text-slate-700">{value}</dd>
    </div>
  );
}
