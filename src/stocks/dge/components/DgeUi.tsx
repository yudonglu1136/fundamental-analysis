import type { ReactNode } from "react";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import type { DataQualityBadgeType } from "../../types";

export function DgeMiniCard({
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

export function DgeBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "slate" }) {
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

export function DgeTextPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function DgeTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-top text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatUsdM(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

export function formatGbp(value: number) {
  return `£${value.toFixed(2)}`;
}

export function formatGbx(value: number) {
  return `${value.toFixed(0)}p`;
}

export function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function scoreTone(score: number): "green" | "amber" | "red" | "slate" {
  if (score >= 70) return "green";
  if (score >= 50) return "amber";
  if (score > 0) return "red";
  return "slate";
}
