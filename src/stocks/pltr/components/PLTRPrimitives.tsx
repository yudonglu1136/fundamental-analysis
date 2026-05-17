import type { ReactNode } from "react";
import type { PltrDashboardData } from "../model";

export type PltrComponentProps = {
  dashboard: PltrDashboardData;
};

export function formatUsd(value: number | null | undefined, suffix = "M") {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 1 })}${suffix}`;
}

export function formatPct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function KpiTile({
  label,
  value,
  text,
  tone = "neutral",
}: {
  label: string;
  value: string;
  text: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "negative"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-slate-200 bg-white text-ink";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

export function InsightBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function SourceNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      {children}
    </div>
  );
}

export function RiskBadge({ label }: { label: string }) {
  const className =
    label === "High"
      ? "bg-rose-100 text-rose-700"
      : label === "Medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

export function getMetric(dashboard: PltrDashboardData, key: string) {
  return dashboard.latestActual.metrics[key]?.value ?? null;
}

export function chartLabel(period: string) {
  return period.replace("Q", "Q ");
}
