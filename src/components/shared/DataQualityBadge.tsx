import type { DataQualityBadgeType, ValuationSourceType } from "../../stocks/types";

const styles: Record<DataQualityBadgeType | "actual" | "consensus" | "assumption" | "derived" | "placeholder", string> = {
  Actual: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 ring-emerald-300/20 shadow-[0_0_18px_rgba(52,211,153,0.12)]",
  Assumption: "border-violet-300/40 bg-violet-300/10 text-violet-100 ring-violet-300/20 shadow-[0_0_18px_rgba(167,139,250,0.12)]",
  Derived: "border-cyan-200/40 bg-cyan-300/10 text-cyan-50 ring-cyan-200/20 shadow-[0_0_18px_rgba(34,211,238,0.12)]",
  Placeholder: "border-amber-300/40 bg-amber-300/10 text-amber-100 ring-amber-300/20 shadow-[0_0_18px_rgba(251,191,36,0.1)]",
  "Needs Review": "border-rose-300/40 bg-rose-300/10 text-rose-100 ring-rose-300/20 shadow-[0_0_18px_rgba(251,113,133,0.12)]",
  actual: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100 ring-emerald-300/20 shadow-[0_0_18px_rgba(52,211,153,0.12)]",
  consensus: "border-sky-300/40 bg-sky-300/10 text-sky-100 ring-sky-300/20 shadow-[0_0_18px_rgba(56,189,248,0.12)]",
  assumption: "border-violet-300/40 bg-violet-300/10 text-violet-100 ring-violet-300/20 shadow-[0_0_18px_rgba(167,139,250,0.12)]",
  derived: "border-cyan-200/40 bg-cyan-300/10 text-cyan-50 ring-cyan-200/20 shadow-[0_0_18px_rgba(34,211,238,0.12)]",
  placeholder: "border-amber-300/40 bg-amber-300/10 text-amber-100 ring-amber-300/20 shadow-[0_0_18px_rgba(251,191,36,0.1)]",
};

export function DataQualityBadge({ badge }: { badge: DataQualityBadgeType | ValuationSourceType }) {
  const label =
    badge === "actual"
      ? "Actual"
      : badge === "consensus"
        ? "Consensus"
        : badge === "assumption"
          ? "Assumption"
          : badge === "derived"
            ? "Derived"
            : badge === "placeholder" || badge === "Placeholder"
              ? "Research"
              : badge === "Needs Review"
                ? "Review"
                : badge;
  return <span className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ring-inset backdrop-blur ${styles[badge]}`}>{label}</span>;
}
