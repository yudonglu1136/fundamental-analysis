import { Activity, AlertTriangle, CircleDollarSign, FlaskConical, ShieldCheck, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { buildAznDashboardData } from "../calculations";
import { AznMiniCard, formatPct, formatUsdM } from "./AznUi";

type AznDashboard = ReturnType<typeof buildAznDashboardData>;

export function AZNInvestmentSnapshot({ dashboard }: { dashboard: AznDashboard }) {
  const { dataset, valuation, risks, patentCliff, pipeline, financialQuality } = dashboard;
  const upside = valuation.blendedFairValueGbp / dataset.marketData.londonPriceGbp - 1;
  const qualityScore = Math.round((financialQuality.coreOperatingMargin * 120) + (financialQuality.dividendCoverageByFcf * 8) + 35);
  const patentScore = Math.max(0, 100 - Math.round(patentCliff.revenueAtRiskPctOfRevenue * 160));
  const pipelineScore = Math.min(100, Math.round(pipeline.totalProbabilityAdjustedPipelineValue / 180));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AznMiniCard label="London Price" value={`£${dataset.marketData.londonPriceGbp.toFixed(2)}`} subtext={`${dataset.marketData.londonPriceGbx.toFixed(0)} GBX on ${dataset.marketData.priceDate}`} badge="Actual" />
        <AznMiniCard label="Market Cap" value={`£${(dataset.marketData.marketCapGbpM / 1_000).toFixed(1)}bn`} subtext={`$${(dataset.marketData.marketCapUsdM / 1_000).toFixed(1)}bn at GBP/USD ${dataset.marketData.gbpUsd.toFixed(3)}`} badge="Actual" />
        <AznMiniCard label="Base Fair Value" value={`£${valuation.blendedFairValueGbp.toFixed(1)}`} subtext={`${formatPct(upside)} upside/downside`} badge="Derived" />
        <AznMiniCard label="Dividend Yield" value={formatPct(dataset.marketData.dividendYield)} subtext={`FY 2025 DPS $${dataset.marketData.dividendPerShareUsd.toFixed(2)}`} badge="Actual" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ScoreTile icon={<ShieldCheck className="h-5 w-5" />} label="Quality" score={qualityScore} detail="Core margin, FCF conversion, dividend coverage" />
        <ScoreTile icon={<AlertTriangle className="h-5 w-5" />} label="Risk" score={Math.max(0, 100 - risks.aggregateRiskScore)} detail="Inverted risk radar score" />
        <ScoreTile icon={<Activity className="h-5 w-5" />} label="Patent Cliff" score={patentScore} detail={`${formatUsdM(patentCliff.highRiskRevenue)} high-risk revenue`} />
        <ScoreTile icon={<FlaskConical className="h-5 w-5" />} label="Pipeline" score={pipelineScore} detail={`${formatUsdM(pipeline.totalProbabilityAdjustedPipelineValue)} rNPV`} />
        <ScoreTile icon={<CircleDollarSign className="h-5 w-5" />} label="Return" score={Math.round((valuation.impliedCagrReturn + 0.03) * 500)} detail={`${formatPct(valuation.impliedCagrReturn)} implied 3Y CAGR`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {dashboard.readThrough.map((item) => (
          <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreTile({ icon, label, score, detail }: { icon: ReactNode; label: string; score: number; detail: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          {icon}
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <span className="text-lg font-semibold text-ink">{clamped}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-sky-500" style={{ width: `${clamped}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
