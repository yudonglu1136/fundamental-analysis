import type { SummaryMetric } from "../../stocks/types";
import { formatValue } from "../../utils/formatting";
import { DataQualityBadge } from "./DataQualityBadge";
import { TooltipInfo } from "./TooltipInfo";

export function MetricCard({ metric, currency = "USD" }: { metric: SummaryMetric; currency?: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{formatValue(metric.value, metric.format, currency)}</p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipInfo text={metric.description} />
          <DataQualityBadge badge={metric.badge} />
        </div>
      </div>
      {metric.delta !== undefined ? (
        <p className={`mt-3 text-sm font-medium ${metric.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {metric.delta >= 0 ? "+" : ""}
          {formatValue(metric.delta, metric.format, currency)} versus prior
        </p>
      ) : null}
    </div>
  );
}
