import type { Signal } from "../../types";

const styles: Record<Signal, string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Neutral: "bg-amber-50 text-amber-700 ring-amber-200",
  Negative: "bg-rose-50 text-rose-700 ring-rose-200",
  Inflecting: "bg-sky-50 text-sky-700 ring-sky-200",
  "Compute Constrained": "bg-violet-50 text-violet-700 ring-violet-200",
  "Needs Review": "bg-slate-100 text-slate-700 ring-slate-200",
};

export function SignalBadge({ signal }: { signal: Signal }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[signal]}`}>{signal}</span>;
}
