import type { Signal } from "../../stocks/types";
import { SectionCard } from "./SectionCard";

export function PeerReadThrough({
  rows,
  title = "Peer Read-Through",
  description = "Cross-check what relevant peers are saying and doing before the company reports.",
}: {
  rows: Array<Record<string, string | number>>;
  title?: string;
  description?: string;
}) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return (
    <SectionCard title={title} description={description}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="pb-3 pr-4">{toLabel(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} className="py-3 pr-4">
                    {column.toLowerCase().includes("signal") ? <SignalCell signal={String(row[column]) as Signal} /> : renderValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function SignalCell({ signal }: { signal: Signal }) {
  const klass =
    signal === "Positive"
      ? "bg-emerald-50 text-emerald-700"
      : signal === "Negative"
        ? "bg-rose-50 text-rose-700"
        : signal === "Inflecting"
          ? "bg-sky-50 text-sky-700"
          : signal === "Compute Constrained"
            ? "bg-violet-50 text-violet-700"
          : signal === "Needs Review"
            ? "bg-slate-100 text-slate-700"
            : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${klass}`}>{signal}</span>;
}

function renderValue(value: string | number) {
  if (typeof value === "number") {
    if (Math.abs(value) <= 1) return `${(value * 100).toFixed(1)}%`;
    return value.toFixed(1);
  }
  return value;
}

function toLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}
