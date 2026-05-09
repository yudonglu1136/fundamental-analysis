import type { Signal } from "../../types";
import { MetaSignalBadge } from "./MetaSignalBadge";

export function MetaStatusBanner({ title, detail, signal }: { title: string; detail: string; signal: Signal }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-[#f8fbff] to-white px-6 py-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">AI Status</p>
          <h3 className="mt-2 text-xl font-semibold text-ink">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{detail}</p>
        </div>
        <MetaSignalBadge signal={signal} />
      </div>
    </div>
  );
}
