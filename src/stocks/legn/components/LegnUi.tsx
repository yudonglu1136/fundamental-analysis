import type { ReactNode } from "react";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import type { DataQualityBadgeType } from "../../types";

export function LegnMiniCard({
  label,
  value,
  subtext,
  badge = "Derived",
}: {
  label: string;
  value: string;
  subtext?: string;
  badge?: DataQualityBadgeType;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
        <DataQualityBadge badge={badge} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {subtext ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtext}</p> : null}
    </div>
  );
}

export function LegnBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "slate" }) {
  const className =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : tone === "red"
          ? "bg-rose-50 text-rose-700 ring-rose-100"
          : tone === "blue"
            ? "bg-sky-50 text-sky-700 ring-sky-100"
            : "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{children}</span>;
}

export function LegnTextPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function LegnTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-slate-700">
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

export function MiniBars({ rows }: { rows: Array<{ label: string; value: number; max?: number; tone?: "green" | "amber" | "red" | "blue" }> }) {
  const fallbackMax = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = Math.max(3, Math.min(100, (row.value / (row.max ?? fallbackMax)) * 100));
        const color =
          row.tone === "green"
            ? "bg-emerald-500"
            : row.tone === "red"
              ? "bg-rose-500"
              : row.tone === "amber"
                ? "bg-amber-500"
                : "bg-sky-500";
        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{row.label}</span>
              <span>{formatUsdM(row.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function formatUsdM(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

export function formatUsdPerAds(value: number) {
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function riskTone(score: number): "green" | "amber" | "red" {
  if (score >= 45) return "red";
  if (score >= 28) return "amber";
  return "green";
}
