import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../../components/shared/SectionCard";
import type { Scenario } from "../types";

type ReportingEvent = {
  id: string;
  eventDate: string;
  fiscalPeriod: string;
  fiscalQuarter: string;
  eventType: string;
  label: string;
};

type ValuationRun = {
  id: string;
  reportingEventId: string;
  currentPrice: number;
  fairValue: number;
  upsideDownside: number;
  methodOutputsJson: Array<{ key: string; label: string; value: number; weight?: number; description?: string }>;
  dataSnapshotJson: {
    fiscalPeriod?: string;
    franchiseScores?: {
      hivDurabilityScore?: number;
      patentCliffScore?: number;
      oncologyOptionalityScore?: number;
    };
    launchedFranchiseVsPipeline?: {
      launchedFranchiseSotpPerShare?: number;
      pipelineRnpvPerShare?: number;
      pipelineCarvedOutOfSotp?: boolean;
    };
    sourceRowIds?: Record<string, string[]>;
  };
};

type HistoricalValuation = {
  event: ReportingEvent;
  valuationRun: ValuationRun | null;
};

type SnapshotRow = Record<string, string | number | null | undefined>;

type Snapshot = {
  reportingEvent?: ReportingEvent;
  financialPeriods?: SnapshotRow[];
  productFinancials?: SnapshotRow[];
  franchiseFinancials?: SnapshotRow[];
  marketSnapshot?: SnapshotRow;
  guidanceItems?: SnapshotRow[];
  transcriptEvents?: SnapshotRow[];
  transcriptExtractions?: SnapshotRow[];
  patentExclusivityEvents?: SnapshotRow[];
  pipelineAssets?: SnapshotRow[];
  pipelineMilestones?: SnapshotRow[];
  dividendBuybackSnapshots?: SnapshotRow[];
  cashDebtSnapshots?: SnapshotRow[];
  acquisitionBdEvents?: SnapshotRow[];
  vekluryNormalizationSnapshots?: SnapshotRow[];
  validationWarnings?: SnapshotRow[];
};

function usd(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n.a.";
  if (Math.abs(number) >= 1_000) return `$${(number / 1_000).toFixed(1)}bn`;
  return `$${number.toFixed(0)}m`;
}

function perShare(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : "n.a.";
}

function pct(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "n.a.";
}

function score(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(0) : "n.a.";
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number | undefined | null>> }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[28rem] whitespace-normal px-3 py-2 align-top text-slate-700">{cell ?? "n.a."}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function rowsForEvent(rows: SnapshotRow[] | undefined, eventId?: string) {
  return (rows ?? []).filter((row) => row.eventId === eventId);
}

export function GildBackendApiPanel({ scenario }: { scenario: Scenario }) {
  const apiBaseUrl = import.meta.env.VITE_GILD_API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
  const [historical, setHistorical] = useState<HistoricalValuation[]>([]);
  const [events, setEvents] = useState<ReportingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    Promise.all([
      fetch(`${apiBaseUrl}/api/stocks/gild/events`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${apiBaseUrl}/api/stocks/gild/historical-valuations?scenario=${encodeURIComponent(scenario)}`, { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([eventsPayload, historicalPayload]) => {
        const eventRows = eventsPayload.events ?? [];
        const historicalRows = historicalPayload.historicalValuations ?? [];
        setEvents(eventRows);
        setHistorical(historicalRows);
        setSelectedEventId((current) => current || historicalRows[0]?.event?.id || eventRows[0]?.id || "");
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    return () => controller.abort();
  }, [apiBaseUrl, scenario]);

  useEffect(() => {
    if (!selectedEventId) return;
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/stocks/gild/snapshot?eventId=${encodeURIComponent(selectedEventId)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => setSnapshot(payload))
      .catch(() => setSnapshot(null));
    return () => controller.abort();
  }, [apiBaseUrl, selectedEventId]);

  const selectedHistorical = useMemo(
    () => historical.find((row) => row.event.id === selectedEventId) ?? historical[0],
    [historical, selectedEventId],
  );
  const selectedRun = selectedHistorical?.valuationRun ?? null;
  const selectedEvent = selectedHistorical?.event ?? events.find((event) => event.id === selectedEventId);
  const eventId = selectedEvent?.id;
  const eventProducts = rowsForEvent(snapshot?.productFinancials, eventId);
  const eventFranchises = rowsForEvent(snapshot?.franchiseFinancials, eventId);
  const latestFinancial = rowsForEvent(snapshot?.financialPeriods, eventId)[0];
  const latestDividend = rowsForEvent(snapshot?.dividendBuybackSnapshots, eventId)[0];
  const latestCashDebt = rowsForEvent(snapshot?.cashDebtSnapshots, eventId)[0];
  const veklury = rowsForEvent(snapshot?.vekluryNormalizationSnapshots, eventId)[0];
  const missingTranscripts = (snapshot?.transcriptEvents ?? []).filter((row) => row.eventId === eventId && Number(row.transcriptImported) === 0);

  if (status === "error") {
    return (
      <SectionCard title="GILD API Mode" description="Backend API mode is enabled, but the local unified API is not reachable.">
        <p className="text-sm text-slate-600">Start the unified backend with `npm run api:dev` and keep `VITE_GILD_API_BASE_URL` pointed at the same server.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="GILD API Mode"
      description="Event-visible backend data from the unified stock backend. The static cockpit remains available below."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Current price" value={perShare(selectedRun?.currentPrice ?? snapshot?.marketSnapshot?.currentPrice)} detail="Executive Snapshot" />
          <MiniMetric label="Event fair value" value={perShare(selectedRun?.fairValue)} detail={selectedEvent?.fiscalPeriod} />
          <MiniMetric label="Upside / downside" value={pct(selectedRun?.upsideDownside)} detail={scenario} />
          <MiniMetric label="Selected event" value={selectedEvent?.fiscalPeriod ?? "Loading"} detail={selectedEvent?.eventDate} />
          <MiniMetric label="Dividend yield" value={pct(snapshot?.marketSnapshot?.dividendYield)} detail={perShare(latestDividend?.dividendPerShare)} />
          <MiniMetric label="FCF yield" value={pct(snapshot?.marketSnapshot?.fcfYield)} detail={usd(latestFinancial?.normalizedFreeCashFlow)} />
          <MiniMetric label="HIV durability" value={score(selectedRun?.dataSnapshotJson?.franchiseScores?.hivDurabilityScore)} detail="Score" />
          <MiniMetric label="Patent cliff" value={score(selectedRun?.dataSnapshotJson?.franchiseScores?.patentCliffScore)} detail="Higher is safer" />
          <MiniMetric label="Oncology optionality" value={score(selectedRun?.dataSnapshotJson?.franchiseScores?.oncologyOptionalityScore)} detail="Score" />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Historical Reporting Event Selector</p>
          <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            {historical.map((row) => (
              <button
                key={row.event.id}
                type="button"
                onClick={() => setSelectedEventId(row.event.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium ${row.event.id === selectedEventId ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"}`}
              >
                <span className="block">{row.event.fiscalPeriod}</span>
                <span className="block opacity-80">{row.valuationRun ? perShare(row.valuationRun.fairValue) : "No run"}</span>
              </button>
            ))}
          </div>
        </div>

        <DataTable
          headers={["Method bridge", "Value", "Weight", "Source snapshot"]}
          rows={(selectedRun?.methodOutputsJson ?? []).map((method) => [
            method.label,
            perShare(method.value),
            method.weight === undefined ? "n.a." : pct(method.weight),
            selectedRun?.dataSnapshotJson?.sourceRowIds?.financialPeriodIds?.[0] ?? "n.a.",
          ])}
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">HIV Franchise Dashboard</p>
            <DataTable
              headers={["Product", "Revenue", "Franchise", "LOE / risk"]}
              rows={eventProducts.filter((row) => String(row.franchise ?? "").includes("HIV")).map((row) => [
                row.productName,
                usd(row.revenue),
                row.franchise,
                "Durability, long-acting optionality and competitive risk tracked",
              ])}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Oncology / Cell Therapy Engine</p>
            <DataTable
              headers={["Product / asset", "Revenue / peak", "Phase", "Risk"]}
              rows={[
                ...eventProducts.filter((row) => String(row.franchise ?? "").includes("Oncology")).map((row) => [row.productName, usd(row.revenue), "launched", row.notes]),
                ...(snapshot?.pipelineAssets ?? []).filter((row) => String(row.assetName ?? "").match(/Trodelvy|Yescarta|Tecartus|Anito/i)).slice(0, 5).map((row) => [row.assetName, usd(row.peakSalesOrEconomicsEstimate), row.phase, row.rationale]),
              ]}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">HCV / Veklury Normalization Panel</p>
            <DataTable
              headers={["Line", "Reported", "Normalized", "Treatment"]}
              rows={[
                ["HCV residual decline", usd(eventFranchises.find((row) => row.franchise === "HCV residual cash flow")?.revenue), usd(eventFranchises.find((row) => row.franchise === "HCV residual cash flow")?.normalizedRevenue), "Declining residual cash flow"],
                ["Veklury", usd(veklury?.reportedVekluryRevenue), usd(veklury?.normalizedVekluryRevenue), veklury?.marginTreatment],
                ["Normalized base revenue", usd(latestFinancial?.revenue), usd(veklury?.normalizedBaseRevenue), "COVID spike separated"],
              ]}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Patent Cliff Monitor</p>
            <DataTable
              headers={["Product", "Region", "LOE year", "Revenue at risk", "Mitigation"]}
              rows={rowsForEvent(snapshot?.patentExclusivityEvents, eventId).map((row) => [row.productName, row.region, row.estimatedLoeYear, usd(row.exposedRevenue), row.mitigationStrategy])}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Pipeline rNPV Lab</p>
            <DataTable
              headers={["Asset", "Phase", "POS", "Peak economics", "Launch", "Source"]}
              rows={(snapshot?.pipelineAssets ?? []).slice(0, 8).map((row) => [row.assetName, row.phase, pct(row.probabilityOfSuccess), usd(row.peakSalesOrEconomicsEstimate), row.launchYear, row.sourceDocumentId])}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Financial Quality / Capital Allocation</p>
            <DataTable
              headers={["Metric", "Value", "Comment"]}
              rows={[
                ["FCF conversion", pct(latestFinancial?.fcfConversion), "Event-visible normalized FCF / net income"],
                ["Dividend coverage", pct(latestDividend?.payoutRatioFcf), "Dividends / FCF"],
                ["Buybacks", usd(latestDividend?.shareRepurchases), "Cash returned"],
                ["Cash and investments", usd(latestCashDebt?.cashAndInvestments), "Balance-sheet support"],
                ["Debt", usd(latestCashDebt?.debt), "Leverage monitor"],
              ]}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Transcript Intelligence</p>
            <DataTable
              headers={["Event", "Imported", "Missing reason", "Source checked"]}
              rows={missingTranscripts.map((row) => [selectedEvent?.fiscalPeriod, Number(row.transcriptImported) === 1 ? "yes" : "no", row.missingReason, row.sourceUrlChecked])}
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Risk Red Team</p>
            <DataTable
              headers={["Risk", "Why it matters"]}
              rows={[
                ["HIV concentration", "Biktarvy and HIV durability remain the primary cash-flow debate."],
                ["Patent cliff", "LOE assumptions drive exposed revenue and erosion curves."],
                ["Oncology execution", "Trodelvy, Yescarta, Tecartus and Anito-cel are separated from the HIV base case."],
                ["Pipeline failure", "Pipeline rNPV is probability-adjusted and date-gated."],
                ["Pricing / reimbursement", "HIV, oncology and prevention access can change durability."],
                ["BD / acquisition risk", "Kite, Immunomedics, CymaBay and Arcellx context is tracked separately."],
                ["Capital allocation", "Dividend, buyback and BD uses compete for FCF."],
                ["Regulatory risk", "Pipeline milestones remain display-only unless model-ready assumptions exist."],
              ]}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
