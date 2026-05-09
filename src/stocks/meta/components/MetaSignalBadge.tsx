import type { Signal } from "../../types";

const styles: Record<Signal, string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  Negative: "bg-rose-50 text-rose-700 ring-rose-200",
  Inflecting: "bg-amber-50 text-amber-700 ring-amber-200",
  "Compute Constrained": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Needs Review": "bg-rose-50 text-rose-700 ring-rose-200",
};

export function MetaSignalBadge({ signal }: { signal: Signal }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${styles[signal]}`}>{signal}</span>;
}
