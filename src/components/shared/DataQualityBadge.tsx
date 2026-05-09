import type { DataQualityBadgeType, ValuationSourceType } from "../../stocks/types";

const styles: Record<DataQualityBadgeType | "actual" | "consensus" | "assumption" | "derived" | "placeholder", string> = {
  Actual: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Assumption: "bg-amber-50 text-amber-700 ring-amber-200",
  Derived: "bg-slate-100 text-slate-700 ring-slate-200",
  Placeholder: "bg-rose-50 text-rose-700 ring-rose-200",
  "Needs Review": "bg-rose-50 text-rose-700 ring-rose-200",
  actual: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  consensus: "bg-sky-50 text-sky-700 ring-sky-200",
  assumption: "bg-amber-50 text-amber-700 ring-amber-200",
  derived: "bg-slate-100 text-slate-700 ring-slate-200",
  placeholder: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function DataQualityBadge({ badge }: { badge: DataQualityBadgeType | ValuationSourceType }) {
  const label =
    badge === "actual" ? "Actual" : badge === "consensus" ? "Consensus" : badge === "assumption" ? "Assumption" : badge === "derived" ? "Derived" : badge === "placeholder" ? "Placeholder" : badge;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[badge]}`}>{label}</span>;
}
