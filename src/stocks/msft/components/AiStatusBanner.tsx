import { BrainCircuit, Gauge, Sparkles, TrendingUp } from "lucide-react";
import type { Signal } from "../../types";
import { SignalBadge } from "./SignalBadge";

const iconMap = {
  Positive: TrendingUp,
  Neutral: Gauge,
  Negative: Gauge,
  Inflecting: Sparkles,
  "Compute Constrained": BrainCircuit,
  "Needs Review": BrainCircuit,
} as const;

export function AiStatusBanner({
  title,
  detail,
  signal,
}: {
  title: string;
  detail: string;
  signal: Signal;
}) {
  const Icon = iconMap[signal];
  return (
    <section className="overflow-hidden rounded-[28px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_35%),linear-gradient(135deg,#ffffff,#f8fbff)] p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Microsoft AI Status</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{detail}</p>
          </div>
        </div>
        <SignalBadge signal={signal} />
      </div>
    </section>
  );
}
