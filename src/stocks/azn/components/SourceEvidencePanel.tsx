import { useMemo, useState } from "react";
import type { buildAznDashboardData } from "../calculations";
import type { AznSourceQuality } from "../types";
import { AznBadge, formatPct } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function SourceEvidencePanel({ dashboard }: { dashboard: AznDashboard }) {
  const [quality, setQuality] = useState<AznSourceQuality | "all">("all");
  const evidence = useMemo(
    () => dashboard.evidenceAudit.evidence.filter((item) => quality === "all" || item.sourceQuality === quality),
    [dashboard.evidenceAudit.evidence, quality],
  );
  const qualities: Array<AznSourceQuality | "all"> = ["all", "official", "filing", "market_data", "third_party", "research_only"];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <EvidenceStat label="Evidence Items" value={dashboard.evidenceAudit.evidenceCount.toString()} />
        <EvidenceStat label="Official / Filing" value={dashboard.evidenceAudit.officialEvidenceCount.toString()} />
        <EvidenceStat label="Valuation Usable" value={dashboard.evidenceAudit.valuationUsableEvidenceCount.toString()} />
        <EvidenceStat label="Avg Confidence" value={formatPct(dashboard.evidenceAudit.averageConfidence)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {qualities.map((item) => (
          <button key={item} type="button" onClick={() => setQuality(item)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${quality === item ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {item.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {dashboard.evidenceAudit.missingEvidenceIds.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Missing evidence IDs: {dashboard.evidenceAudit.missingEvidenceIds.join(", ")}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Use</th>
              <th className="px-4 py-3">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {evidence.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="px-4 py-3">
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 hover:text-sky-900">{item.sourceName}</a>
                  <p className="mt-1 text-xs text-slate-500">{item.page ?? "page n/a"}</p>
                </td>
                <td className="px-4 py-3"><AznBadge tone={item.sourceQuality === "official" || item.sourceQuality === "filing" ? "green" : item.sourceQuality === "research_only" ? "amber" : "blue"}>{item.sourceQuality}</AznBadge></td>
                <td className="px-4 py-3 text-slate-600">{item.period}</td>
                <td className="px-4 py-3 text-slate-700">{formatPct(item.confidence)}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <AznBadge tone={item.valuationUseAllowed ? "green" : "amber"}>{item.valuationUseAllowed ? "valuation ok" : "audit only"}</AznBadge>
                    {item.researchOnly ? <AznBadge tone="amber">research-only</AznBadge> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.excerpt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvidenceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
