import { CalendarDays } from "lucide-react";
import type { buildAznDashboardData } from "../calculations";
import { AznBadge, formatUsdM, toneForRisk } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function CatalystCalendar({ dashboard }: { dashboard: AznDashboard }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-sky-600" />
        <h3 className="text-base font-semibold text-ink">Catalyst Calendar</h3>
      </div>
      <div className="mt-4 space-y-3">
        {dashboard.pipeline.catalystCalendar.slice(0, 10).map((item) => (
          <div key={`${item.assetName}-${item.nextCatalystDate}`} className="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="font-semibold text-ink">{item.assetName}</p>
              <p className="text-xs text-slate-500">{item.therapyArea} · {item.phase}</p>
            </div>
            <div><AznBadge tone="blue">{item.nextCatalystDate}</AznBadge></div>
            <div className="text-sm text-slate-600">{item.catalystType}</div>
            <div className="text-right text-sm font-semibold text-slate-700">
              {formatUsdM(item.probabilityAdjustedPipelineValue)}
              <div><AznBadge tone={toneForRisk(item.riskLevel)}>{item.riskLevel}</AznBadge></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
