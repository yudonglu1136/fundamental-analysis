import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import type { buildAznDashboardData } from "../calculations";
import type { AznTherapyArea } from "../types";
import { AznBadge, formatPct, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;
type SortKey = "revenue" | "growth" | "patent" | "durability";

export function DrugDurabilityMatrix({ dashboard }: { dashboard: AznDashboard }) {
  const [therapyFilter, setTherapyFilter] = useState<AznTherapyArea | "All">("All");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [expanded, setExpanded] = useState<string | null>(null);
  const therapyAreas = useMemo(
    () => ["All", ...Array.from(new Set(dashboard.drugDurability.matrix.map((row) => row.therapyArea)))] as Array<AznTherapyArea | "All">,
    [dashboard.drugDurability.matrix],
  );
  const rows = useMemo(() => {
    const filtered = dashboard.drugDurability.matrix.filter((row) => therapyFilter === "All" || row.therapyArea === therapyFilter);
    return [...filtered].sort((a, b) => {
      if (sortKey === "growth") return b.revenueGrowthCer - a.revenueGrowthCer;
      if (sortKey === "patent") return (a.durability?.patentProtectionScore ?? 0) - (b.durability?.patentProtectionScore ?? 0);
      if (sortKey === "durability") return (b.durability?.durabilityScore ?? 0) - (a.durability?.durabilityScore ?? 0);
      return b.currentRevenue - a.currentRevenue;
    });
  }, [dashboard.drugDurability.matrix, sortKey, therapyFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={therapyFilter} onChange={(event) => setTherapyFilter(event.target.value as AznTherapyArea | "All")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {therapyAreas.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="revenue">Sort by revenue</option>
          <option value="growth">Sort by growth</option>
          <option value="patent">Sort by patent risk</option>
          <option value="durability">Sort by durability</option>
        </select>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Drug</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Growth</th>
              <th className="px-4 py-3">Patent</th>
              <th className="px-4 py-3">Durability</th>
              <th className="px-4 py-3">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <Fragment key={row.drugName}>
                <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(expanded === row.drugName ? null : row.drugName)}>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <span className="inline-flex items-center gap-2">{row.drugName}<ChevronDown className="h-4 w-4 text-slate-400" /></span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.therapyArea}</td>
                  <td className="px-4 py-3 text-slate-700">{formatUsdM(row.currentRevenue)}</td>
                  <td className="px-4 py-3"><AznBadge tone={row.revenueGrowthCer >= 0.1 ? "green" : row.revenueGrowthCer < 0 ? "red" : "amber"}>{formatPct(row.revenueGrowthCer)}</AznBadge></td>
                  <td className="px-4 py-3">{row.durability?.patentProtectionScore ?? "-"}/5</td>
                  <td className="px-4 py-3 font-semibold">{row.durability?.durabilityScore ?? "-"} / 100</td>
                  <td className="px-4 py-3"><AznBadge tone={toneForRisk(row.competitiveRisk)}>{row.competitiveRisk}</AznBadge></td>
                </tr>
                {expanded === row.drugName ? (
                  <tr key={`${row.drugName}-detail`} className="bg-slate-50">
                    <td className="px-4 py-4 text-sm text-slate-600" colSpan={7}>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div><b>Mechanism:</b> {row.mechanism}<br /><b>Indication:</b> {row.indication}</div>
                        <div><b>Market position:</b> {row.marketPosition}<br /><b>Lifecycle:</b> {row.lifecycleExpansion}</div>
                        <div><b>Score model:</b> {row.durability?.explanation ?? "No score"}</div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
