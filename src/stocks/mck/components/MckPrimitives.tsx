import type { ReactNode } from "react";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import type { DataQualityBadgeType, Signal } from "../../types";

export function money(value: number, digits = 1) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(value);
}

export function millions(value: number) {
  return `$${(value / 1000).toFixed(1)}B`;
}

export function pct(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function multiple(value: number) {
  return `${value.toFixed(1)}x`;
}

export function bps(value: number) {
  return `${value.toFixed(0)} bps`;
}

export function signalClass(signal: Signal) {
  if (signal === "Positive" || signal === "Inflecting") return "text-emerald-700 bg-emerald-50 border-emerald-100";
  if (signal === "Negative" || signal === "Compute Constrained") return "text-rose-700 bg-rose-50 border-rose-100";
  if (signal === "Needs Review") return "text-amber-700 bg-amber-50 border-amber-100";
  return "text-slate-700 bg-slate-50 border-slate-100";
}

export function MiniMetric({
  label,
  value,
  subtext,
  badge,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  badge?: DataQualityBadgeType;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {badge ? <DataQualityBadge badge={badge} /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {subtext ? <p className="mt-1 text-sm leading-5 text-slate-500">{subtext}</p> : null}
    </div>
  );
}

export function SignalPill({ signal }: { signal: Signal }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signalClass(signal)}`}>{signal}</span>;
}

export function PanelTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {headers.map((header) => (
              <th key={header} className="py-3 pr-4 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="border-b border-slate-100 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="py-3 pr-4 align-top text-slate-700">
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
