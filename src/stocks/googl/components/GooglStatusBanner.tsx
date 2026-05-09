import { CircuitBoard, Cpu, Gauge, Search, Sparkles } from "lucide-react";
import type { Signal } from "../../types";
import { GooglSignalBadge } from "./GooglSignalBadge";

const iconMap = {
  Positive: CircuitBoard,
  Neutral: Gauge,
  Negative: Gauge,
  Inflecting: Sparkles,
  "Compute Constrained": Cpu,
  "Needs Review": Search,
} as const;

export function GooglStatusBanner({ title, detail, signal }: { title: string; detail: string; signal: Signal }) {
  const Icon = iconMap[signal];
  return (
    <section className="overflow-hidden rounded-[28px] border border-cyan-100 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_35%),linear-gradient(135deg,#ffffff,#f7fbff)] p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Alphabet AI Status</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{detail}</p>
          </div>
        </div>
        <GooglSignalBadge signal={signal} />
      </div>
    </section>
  );
}
