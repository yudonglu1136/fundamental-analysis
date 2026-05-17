import type { ReactNode } from "react";
import { DataQualityBadge } from "../../../components/shared/DataQualityBadge";
import type { DataQualityBadgeType } from "../../types";

export function AznMiniCard({
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
      {subtext ? <p className="mt-1 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

export function AznBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "slate" }) {
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

export function AznTextPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function formatUsdM(value: number) {
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}m`;
}

export function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function toneForRisk(level: string): "green" | "amber" | "red" | "slate" {
  if (/high|needs review/i.test(level)) return "red";
  if (/medium|neutral/i.test(level)) return "amber";
  if (/low|positive/i.test(level)) return "green";
  return "slate";
}
