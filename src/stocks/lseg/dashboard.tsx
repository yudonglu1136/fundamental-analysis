import { useCallback, useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockDashboardProps } from "../types";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { EPSBridgeChart } from "../../components/shared/EPSBridgeChart";
import { FCFBridgeChart } from "../../components/shared/FCFBridgeChart";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { PeerReadThrough } from "../../components/shared/PeerReadThrough";
import { TranscriptIntelligenceLab } from "./components/TranscriptIntelligenceLab";
import {
  attachLsegRuntimeContext,
  buildLsegDashboardData,
  defaultLsegValuationAssumptions,
  resolveLsegDataset,
  resolveLsegEffectiveDataSourceType,
} from "./calculations";
import type { LsegValuationAssumptions } from "./config/assumptions";

function loadSavedLsegValuationAssumptions() {
  if (typeof window === "undefined") return defaultLsegValuationAssumptions;
  const saved = window.localStorage.getItem("valuation-assumptions-LSEG");
  if (!saved) return defaultLsegValuationAssumptions;
  try {
    return {
      ...defaultLsegValuationAssumptions,
      ...(JSON.parse(saved) as Partial<LsegValuationAssumptions>),
    };
  } catch {
    return defaultLsegValuationAssumptions;
  }
}

export function LsegDashboard({ module, scenario, period, dataSourceType, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [segmentView, setSegmentView] = useState<"revenue" | "margin">("revenue");
  const [valuationAssumptions, setValuationAssumptions] = useState<LsegValuationAssumptions>(
    loadSavedLsegValuationAssumptions,
  );
  const resolvedPeriod = module.periods.some((option) => option.value === period) ? period : module.getDefaultPeriod();
  const moduleData = useMemo(() => resolveLsegDataset(module.data), [module.data]);
  const runtimeData = useMemo(
    () =>
      attachLsegRuntimeContext(moduleData, {
        periodId: resolvedPeriod,
        dataSourceType,
      }),
    [dataSourceType, moduleData, resolvedPeriod],
  );
  const effectiveDataSourceType = resolveLsegEffectiveDataSourceType(runtimeData);
  const dashboard = useMemo(() => buildLsegDashboardData(runtimeData, resolvedPeriod, scenario), [resolvedPeriod, runtimeData, scenario]);
  const segmentKeys = useMemo(
    () => [...new Set(dashboard.segmentForecast.flatMap((item) => item.segments.map((row) => row.segment)))],
    [dashboard.segmentForecast],
  );
  const dataSourceSupportText = useMemo(() => {
    if (dataSourceType === "manual") {
      return "LSEG currently runs on the module mock baseline plus manual valuation-assumption overrides. Manual mode does not replace the underlying operating dataset with csv/excel/api feeds.";
    }
    if (dataSourceType !== "mock") {
      return `Requested source "${dataSourceType}" is not yet wired for LSEG. The module falls back to its built-in mock baseline data and keeps the unsupported source request visible as a warning.`;
    }
    return "LSEG currently uses the module mock baseline dataset. csv / excel / api source switching is not yet implemented for this module, so platform data-source changes do not replace the underlying operating dataset.";
  }, [dataSourceType]);

  const handleValuationValuesChange = useCallback(
    (next: Record<string, number>) => {
      setValuationAssumptions(next as LsegValuationAssumptions);
      onDataSourceChange("manual");
    },
    [onDataSourceChange],
  );

  const segmentChartData = dashboard.segmentForecast.map((item) => {
    const revenueRow = item.segments.reduce<Record<string, number | string>>(
      (acc, row) => ({ ...acc, [row.segment]: row.endingRevenue }),
      { period: `${item.fiscalYear}` },
    );
    const marginRow = item.margins.reduce<Record<string, number | string>>(
      (acc, row) => ({ ...acc, [row.segment]: row.endingMargin * 100 }),
      { period: `${item.fiscalYear}` },
    );
    return segmentView === "revenue" ? revenueRow : marginRow;
  });

  const scenarioTableRows = (["Bear", "Base", "Bull"] as const).map((caseName) => {
    const scenarioCase = dashboard.scenarioCases[caseName];
    const fairValuePoint =
      dashboard.valuation.fairValues.find((item) => item.scenario === caseName) ?? dashboard.valuation.fairValues[0];
    return {
      scenario: caseName,
      probability: dashboard.scenarioProbabilities[caseName],
      revenueCagr:
        ((scenarioCase.revenue.groupRevenueByYear[2]?.revenue ?? scenarioCase.revenue.groupRevenueByYear[0]?.revenue ?? 1) /
          Math.max(scenarioCase.period.totalIncomeExcludingRecoveries, 1)) ** (1 / 3) -
        1,
      ebitdaMargin: scenarioCase.margin.groupRows[0]?.adjustedEbitdaMargin ?? 0,
      fcfPerShare: scenarioCase.valuation.forwardFcfPerShare,
      wacc: scenarioCase.wacc.wacc,
      terminalGrowth: scenarioCase.assumptions.terminalGrowth,
      targetPe: scenarioCase.assumptions.targetPe,
      dcf: scenarioCase.valuation.dcfValue,
      operatingSotp: scenarioCase.valuation.operatingSotpFairValue,
      peValue: scenarioCase.valuation.peFairValue,
      fcfYieldValue: scenarioCase.valuation.fcfFairValue,
      blended: fairValuePoint.fairValue,
      expectedReturn3Y: fairValuePoint.expectedReturn3Y,
    };
  });

  const marketsBridge = dashboard.revenueEngine.groupRevenueByYear[0]?.marketsBridge;

  return (
    <div className="space-y-6">
      <SectionCard
        title="LSEG Investment Summary"
        description={`Current price is £${dashboard.marketData.currentPrice.toFixed(2)} as of ${dashboard.marketData.priceDate}. The dashboard separates core valuation, confidence-adjusted SOTP, and strategic optionality so the primary underwriting value is not overstated when SOTP confidence is low.`}
        badge={<DataQualityBadge badge={effectiveDataSourceType === "manual" ? "Assumption" : "Placeholder"} />}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {dashboard.readThrough.map((item) => (
            <InsightCard key={item.title} title={item.title} body={item.detail} badge={item.badge} />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <InsightPanel title="Platform Data Path" text={`Dashboard data is consumed through module.data from the stock registry. LSEG keeps lsegMockData as its default module dataset, but the page no longer bypasses the module contract when building dashboard outputs or interactive valuation results.`} />
          <InsightPanel title="Data Source Support" text={dataSourceSupportText} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="GBP" />
        ))}
      </div>

      <SectionCard title="Valuation Recommendation" description="Recommended fair value is confidence-based. Full operating SOTP remains visible, but it is not the primary underwriting anchor while ownership, peer, or corporate-cost inputs remain uncertain.">
        <div className="grid gap-4 lg:grid-cols-5">
          <ScoreCard label="Recommended Fair Value" value={`£${(dashboard.valuation.recommendedFairValue ?? 0).toFixed(2)}`} subtext={dashboard.valuation.recommendedFairValueMethod?.replace(/_/g, " ") ?? "—"} />
          <ScoreCard label="Current Price" value={`£${dashboard.marketData.currentPrice.toFixed(2)}`} subtext={`As of ${dashboard.marketData.priceDate}`} />
          <ScoreCard label="Upside / Downside" value={`${((((dashboard.valuation.recommendedFairValue ?? 0) / Math.max(dashboard.marketData.currentPrice, 0.01)) - 1) * 100).toFixed(1)}%`} subtext="Vs current price" />
          <ScoreCard label="3Y Target Price" value={`£${(dashboard.valuation.targetPrice3Y ?? 0).toFixed(2)}`} subtext={`Expected CAGR ${((dashboard.valuation.expectedReturn3Y ?? 0) * 100).toFixed(1)}%`} />
          <ScoreCard label="Valuation Confidence" value={`${dashboard.integrity.recommendedValuationConfidence}`} subtext="Confidence in recommended valuation anchor" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <InsightPanel title="Recommendation Basis" text={dashboard.valuation.recommendedFairValueReason ?? "—"} />
          <InsightPanel title="Selected SOTP Policy" text={`${dashboard.valuation.selectedSotpPolicy?.replace(/_/g, " ") ?? "—"}: ${dashboard.valuation.reasonForSelectedSotpPolicy ?? ""}`} />
        </div>
      </SectionCard>

      <SectionCard title="Model Integrity Checks" description="Severe warnings are shown first. Backward compatibility is preserved through output mapping, not through old flawed valuation mechanics.">
        <div className="grid gap-4 lg:grid-cols-4">
          <ScoreCard label="Overall Model Integrity" value={`${dashboard.integrity.overallIntegrityScore}`} subtext="Full-model mechanics and audit score" />
          <ScoreCard label="SOTP Mechanics Integrity" value={`${dashboard.integrity.sotpIntegrityScore}`} subtext="Taxonomy, bridge, and double-count guard" />
          <ScoreCard label="SOTP Data Confidence" value={`${dashboard.integrity.sotpConfidenceScore}`} subtext="Peer, NCI, and corporate-cost confidence" />
          <ScoreCard label="Data Quality Score" value={`${dashboard.integrity.dataQualityScore}`} subtext="Manual / stale / placeholder data score" />
          <ScoreCard label="Recommended Valuation Confidence" value={`${dashboard.integrity.recommendedValuationConfidence}`} subtext="Confidence in primary underwriting value" />
          <ScoreCard label="DCF Taxonomy" value="WACC / Unlevered FCF" subtext="Net debt subtracted after EV" />
          <ScoreCard label="FCF Yield Taxonomy" value="Equity FCF / Share" subtext="Used only for FCF yield cross-check" />
          <ScoreCard label="Segment Taxonomy" value="Reported 2025" subtext="Markets includes post-trade in operating SOTP" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {dashboard.integrity.severeWarnings.length > 0 ? dashboard.integrity.severeWarnings.map((warning) => (
            <WarningCard key={warning.id} warning={warning} />
          )) : (
            <InsightPanel title="No Severe Warnings" text="The current scenario does not trip any high-severity integrity checks." />
          )}
          {dashboard.integrity.auditNotes.length > 0 && (
            <InsightPanel title="Audit Notes" text={dashboard.integrity.auditNotes.join(" ")} />
          )}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <BulletPanel title="Score Definitions" items={[
            "Overall model integrity: full-model mechanics and audit score.",
            "SOTP mechanics integrity: taxonomy, bridge, multiple policy, and double-count control.",
            "SOTP data confidence: peer, ownership, and corporate-cost source confidence.",
            "Data quality score: stale, manual, and placeholder input quality.",
            "Recommended valuation confidence: confidence in the primary underwriting anchor.",
          ]} />
          <BulletPanel
            title="Source-Risk Flags"
            items={(() => {
              const sourceRiskItems = dashboard.warnings
                .filter((warning) => /placeholder|manual|mock|estimate|stale/i.test(`${warning.title} ${warning.detail}`))
                .map((warning) => `${warning.title}: ${warning.detail}`);
              return sourceRiskItems.length > 0 ? sourceRiskItems : ["No explicit source-risk flags."];
            })()}
          />
          <BulletPanel title="Cap Reasons" items={dashboard.integrity.capReasons.length > 0 ? dashboard.integrity.capReasons : ["No active score caps."]} />
          <BulletPanel title="Open Audit Items" items={dashboard.integrity.openAuditItems.length > 0 ? dashboard.integrity.openAuditItems : ["No open audit items."]} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <InsightPanel
            title="Peer Snapshot Provenance"
            text={`Peer multiples from yfinance are used as a dated external cross-check. Fetched at ${dashboard.peerDataQuality.fetchedAt ?? "unknown"}; manual guardrails remain the primary operating-SOTP reference and are not mechanically replaced by yfinance.`}
          />
          <BulletPanel title="Peer Data Quality Notes" items={dashboard.peerDataQuality.notes} />
        </div>
      </SectionCard>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <SectionCard title="Market-Implied Valuation" description="This section asks what the current share price implies, rather than only comparing price to our internal fair value.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Implied P/E" value={`${dashboard.marketImplied.impliedPe.toFixed(1)}x`} subtext="Current price / forward EPS" />
              <ScoreCard label="Implied FCF Yield" value={`${(dashboard.marketImplied.impliedFcfYield * 100).toFixed(2)}%`} subtext="Equity FCF / share over current price" />
              <ScoreCard label="Implied EV / EBITDA" value={`${dashboard.marketImplied.impliedEvebitda.toFixed(1)}x`} subtext="Current EV / forward EBITDA" />
              <ScoreCard label="Implied Terminal Growth" value={`${((dashboard.marketImplied.impliedTerminalGrowth ?? 0) * 100).toFixed(2)}%`} subtext="Solved from DCF at current price" />
              <ScoreCard label="Implied WACC" value={`${((dashboard.marketImplied.impliedWacc ?? 0) * 100).toFixed(2)}%`} subtext="Solved from DCF at current price" />
              <ScoreCard label="Implied FCF / Share CAGR" value={`${((dashboard.marketImplied.impliedFcfShareCagr ?? 0) * 100).toFixed(1)}%`} subtext="Growth needed to justify current price" />
              <ScoreCard label="Implied 3Y Exit P/E" value={`${(dashboard.marketImplied.impliedExitPeFor3YTarget ?? 0).toFixed(1)}x`} subtext="For a 10% return hurdle" />
              <ScoreCard label="Probability-Weighted FV (Overlay)" value={`£${(dashboard.valuation.probabilityWeightedFairValue ?? 0).toFixed(2)}`} subtext="Diagnostics-informed overlay, not base blend" />
            </div>
            <InsightPanel title="What the market appears to price" text={dashboard.marketImplied.commentary} />
          </SectionCard>

          <SectionCard title="LSEG Investment Thesis" description="The thesis is written from a buy-side operating and cash-flow lens, not from a generic scorecard lens.">
            <div className="grid gap-4 lg:grid-cols-3">
              <InsightPanel title="Bull Case" text={dashboard.thesis.bullCaseSummary} />
              <InsightPanel title="Base Case" text={dashboard.thesis.baseCaseSummary} />
              <InsightPanel title="Bear Case" text={dashboard.thesis.bearCaseSummary} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <BulletPanel title="Key Upside Drivers" items={dashboard.thesis.keyUpsideDrivers} />
              <BulletPanel title="Key Downside Risks" items={dashboard.thesis.keyDownsideRisks} />
              <BulletPanel title="Debate Points" items={dashboard.thesis.debatePoints} />
              <InsightPanel
                title="What We Need To Believe"
                text={`${dashboard.thesis.whatMarketIsPricing} ${dashboard.thesis.whatWeNeedToBelieve} ${dashboard.thesis.whatCouldBreakTheThesis}`}
              />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Revenue Forecast" description="Operating SOTP uses reported 2025 taxonomy. Markets already includes the relevant post-trade economics unless an explicit analytical split is invoked for strategic work.">
            <div className="mb-4 flex gap-2">
              {(["revenue", "margin"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setSegmentView(view)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${segmentView === view ? "bg-ink text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {view === "revenue" ? "Revenue" : "Margin"}
                </button>
              ))}
            </div>
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {segmentKeys.map((segment, index) => (
                    <Bar
                      key={segment}
                      dataKey={segment}
                      stackId={segmentView === "revenue" ? "stack" : undefined}
                      fill={["#21486f", "#0f8f6f", "#d97706", "#7c3aed", "#0ea5e9", "#94a3b8"][index % 6]}
                      radius={[8, 8, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Markets Structural vs Cyclical Growth" description="Markets growth is explicitly split so temporary ADV / volatility spikes are not fully capitalized into terminal assumptions.">
            <div className="grid gap-4 lg:grid-cols-5">
              <ScoreCard label="Structural Growth" value={`${((marketsBridge?.structuralGrowth ?? 0) * 100).toFixed(1)}%`} subtext="Penetration, product, fixed-fee mix" />
              <ScoreCard label="Normalized Volume" value={`${((marketsBridge?.normalizedVolumeGrowth ?? 0) * 100).toFixed(1)}%`} subtext="Normalized underlying volume" />
              <ScoreCard label="Pricing" value={`${((marketsBridge?.pricingContribution ?? 0) * 100).toFixed(1)}%`} subtext="Fee / monetization effect" />
              <ScoreCard label="Cyclical Uplift" value={`${((marketsBridge?.cyclicalUplift ?? 0) * 100).toFixed(1)}%`} subtext="Volatility-driven uplift" />
              <ScoreCard label="Cyclical Fade" value={`${((marketsBridge?.cyclicalFade ?? 0) * 100).toFixed(1)}%`} subtext="Fade built into outer years" />
            </div>
          </SectionCard>

          <SectionCard title="Segment EBITDA / Margin Bridge" description="2026 base-case margin expansion is calibrated to management guidance, then fades based on explicit leverage and reinvestment assumptions.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Year</th>
                    <th className="py-3 pr-4">Operating Leverage</th>
                    <th className="py-3 pr-4">Synergy</th>
                    <th className="py-3 pr-4">Productivity</th>
                    <th className="py-3 pr-4">Reinvestment</th>
                    <th className="py-3 pr-4">Inflation</th>
                    <th className="py-3 pr-4">Net bps</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.marginEngine.marginBridge.map((row) => (
                    <tr key={row.fiscalYear} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-ink">{row.fiscalYear}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.operatingLeverageBps.toFixed(0)}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.synergyBenefitBps.toFixed(0)}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.productivityBenefitBps.toFixed(0)}</td>
                      <td className="py-3 pr-4 text-slate-600">({row.reinvestmentBps.toFixed(0)})</td>
                      <td className="py-3 pr-4 text-slate-600">({row.costInflationBps.toFixed(0)})</td>
                      <td className="py-3 pr-4 font-medium text-ink">{row.netMarginExpansionBps.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="fcf" className="mt-6 space-y-6">
          <SectionCard title="FCF Bridge" description="The model now separates unlevered FCF for DCF from equity FCF for yield valuation, buyback capacity, and guidance reconciliation.">
            <FCFBridgeChart
              data={dashboard.fcfEngine.rows.map((row) => ({
                period: `${row.fiscalYear}`,
                fcf: row.equityFreeCashFlow,
                cashConversion: row.cashConversionFromEbitda,
                epsGrowth:
                  row.fiscalYear === dashboard.period.fiscalYear + 1
                    ? safeNumber(
                        dashboard.buybackEngine.rows[0]?.adjustedEps - dashboard.period.adjustedEps,
                        dashboard.period.adjustedEps,
                      )
                    : 0,
              }))}
            />
          </SectionCard>

          <SectionCard title="FCF Taxonomy" description="This is the critical DCF mechanics fix from the audit.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="DCF Method" value="WACC / Unlevered FCF" subtext="Primary DCF route" />
              <ScoreCard label="DCF Cash Flow" value="Unlevered FCF" subtext="Interest excluded, net debt subtracted after EV" />
              <ScoreCard label="FCF Yield Method" value="Equity FCF / Share" subtext="Used for yield cross-check only" />
              <ScoreCard label="Interest Treatment" value="Excluded in DCF" subtext="Avoids interest + net debt double count" />
            </div>
          </SectionCard>

          <SectionCard title="FCF Detail" description="Why this matters: shareholder return depends on equity FCF, but enterprise valuation depends on unlevered FCF.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Year</th>
                    <th className="py-3 pr-4">Unlevered FCF</th>
                    <th className="py-3 pr-4">Equity FCF</th>
                    <th className="py-3 pr-4">FCF / Share</th>
                    <th className="py-3 pr-4">FCF Margin</th>
                    <th className="py-3 pr-4">Cash Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.fcfEngine.rows.map((row, index) => (
                    <tr key={row.fiscalYear} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-ink">{row.fiscalYear}</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.unleveredFreeCashFlow.toFixed(0)}m</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.equityFreeCashFlow.toFixed(0)}m</td>
                      <td className="py-3 pr-4 text-slate-600">£{safeNumber(row.equityFreeCashFlow, dashboard.buybackEngine.rows[index]?.averageDilutedShares ?? 1).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.fcfMargin * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.cashConversionFromEbitda * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="buyback-eps" className="mt-6 space-y-6">
          <SectionCard title="Buyback & EPS Accretion" description="EPS growth is now a transparent bridge from operating profit, margin, buyback, and below-the-line effects.">
            <EPSBridgeChart
              rows={dashboard.epsBridge.map((row) => ({
                label: row.label,
                value: row.value,
                type: row.type === "start" ? "base" : row.type === "end" ? "total" : row.value >= 0 ? "positive" : "negative",
              }))}
            />
          </SectionCard>

          <SectionCard title="Share Count and EPS" description="Buybacks are modeled via actual shares repurchased and ending diluted shares, not through a ROIC-spread shortcut.">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.buybackEngine.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fiscalYear" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="averageDilutedShares" stroke="#21486f" strokeWidth={3} name="Avg Diluted Shares" />
                  <Line type="monotone" dataKey="adjustedEps" stroke="#0f8f6f" strokeWidth={3} name="Adjusted EPS" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="3Y Target Price & CAGR" description="Three-year return is fully derived from the revenue-to-EPS model, buybacks, dividends, and a visible exit P/E.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Year 1 EPS" value={`£${dashboard.scenarioCases[scenario].valuation.year1Eps.toFixed(2)}`} subtext="Forward EPS" />
              <ScoreCard label="Year 2 EPS" value={`£${dashboard.scenarioCases[scenario].valuation.year2Eps.toFixed(2)}`} subtext="Midpoint EPS" />
              <ScoreCard label="Year 3 EPS" value={`£${dashboard.scenarioCases[scenario].valuation.year3Eps.toFixed(2)}`} subtext="Target-year EPS" />
              <ScoreCard label="Exit P/E" value={`${dashboard.scenarioCases[scenario].valuation.exitPe.toFixed(1)}x`} subtext="Target-year exit multiple" />
              <ScoreCard label="Target Price 3Y" value={`£${dashboard.valuation.fairValues.find((item) => item.scenario === scenario)?.targetPrice3Y?.toFixed(2) ?? "0.00"}`} subtext="Price only" />
              <ScoreCard label="Cumulative Dividends" value={`£${dashboard.valuation.fairValues.find((item) => item.scenario === scenario)?.cumulativeDividends?.toFixed(2) ?? "0.00"}`} subtext="Three-year cash return" />
              <ScoreCard label="Expected CAGR" value={`${((dashboard.valuation.expectedReturn3Y ?? 0) * 100).toFixed(1)}%`} subtext="Total shareholder CAGR" />
              <ScoreCard label="Buyback CAGR Contribution" value={`${(dashboard.scenarioCases[scenario].valuation.buybackContributionToEpsCagr * 100).toFixed(1)}%`} subtext="Annualized EPS support" />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="WACC Build" description="DCF is discounted off a visible WACC build.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Risk-Free Rate" value={`${(dashboard.waccBuild.riskFreeRate * 100).toFixed(2)}%`} subtext="UK risk-free input" />
              <ScoreCard label="Cost of Equity" value={`${(dashboard.waccBuild.costOfEquity * 100).toFixed(2)}%`} subtext="Risk-free + beta × ERP" />
              <ScoreCard label="After-Tax Debt Cost" value={`${(dashboard.waccBuild.afterTaxCostOfDebt * 100).toFixed(2)}%`} subtext="Pre-tax debt cost × (1 - tax)" />
              <ScoreCard label="WACC" value={`${(dashboard.waccBuild.wacc * 100).toFixed(2)}%`} subtext="Discount rate for unlevered DCF" />
            </div>
          </SectionCard>

          <SectionCard title="DCF Valuation" description="DCF now uses unlevered FCF only. Interest is excluded from DCF cash flow and net debt is subtracted after enterprise value.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="PV Forecast FCF" value={`£${dashboard.dcf.pvForecastCashFlow.toFixed(0)}m`} subtext="Present value of explicit unlevered FCF" />
              <ScoreCard label="PV Terminal Value" value={`£${dashboard.dcf.pvTerminalValue.toFixed(0)}m`} subtext="Present value of terminal value" />
              <ScoreCard label="Terminal Value %" value={`${(dashboard.dcf.terminalValuePctOfEv * 100).toFixed(1)}%`} subtext="As % of DCF EV" />
              <ScoreCard label="DCF / Share" value={`£${dashboard.dcf.valuePerShare.toFixed(2)}`} subtext="Equity value per share" />
            </div>
          </SectionCard>

          <SectionCard title="Operating SOTP Summary" description="Operating SOTP is audited in three operating policies. The model selects a policy for underwriting based on SOTP confidence and warning severity; strategic optionality remains outside the base recommendation.">
            <div className="grid gap-4 lg:grid-cols-6">
              <ScoreCard label="Selected Operating SOTP" value={`£${dashboard.operatingSotp.valuePerShare.toFixed(2)}`} subtext={`${dashboard.operatingSotp.multiplePolicy?.replace(/_/g, " ") ?? "selected"} policy`} />
              <ScoreCard label="Conservative Operating" value={`£${dashboard.conservativeOperatingSotp.valuePerShare.toFixed(2)}`} subtext="Confidence-haircut operating case" />
              <ScoreCard label="Base Operating" value={`£${dashboard.baseOperatingSotp.valuePerShare.toFixed(2)}`} subtext="Reference base operating case" />
              <ScoreCard label="Premium Operating" value={`£${dashboard.premiumOperatingSotp.valuePerShare.toFixed(2)}`} subtext="Bull-only operating case" />
              <ScoreCard label="Taxonomy" value="Reported 2025" subtext={dashboard.operatingSotp.postTradeTreatment === "commentary_only" ? "Post Trade is commentary-only" : "Post Trade included separately"} />
              <ScoreCard label="SOTP Data Confidence" value={`${dashboard.integrity.sotpConfidenceScore}`} subtext={`Policy selected: ${dashboard.valuation.selectedSotpPolicy?.replace(/_/g, " ") ?? "—"}`} />
              <ScoreCard label="Forward EBITDA Year" value={`${dashboard.operatingSotp.forwardMetricYear}E`} subtext="Valuation anchor year" />
              <ScoreCard label="Strategic Optionality Included?" value="No" subtext="Strategic value sits outside base recommendation" />
              <ScoreCard label="SOTP Mechanics Integrity" value={`${dashboard.integrity.sotpIntegrityScore}`} subtext="Bridge and multiple policy integrity" />
            </div>
          </SectionCard>

          <SectionCard title="SOTP Input Audit Table" description="This table shows the exact operating SOTP inputs by segment, including EBITDA year, peer group, provenance, placeholder status, and guardrail warnings.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Segment</th>
                    <th className="py-3 pr-4">2025A EBITDA</th>
                    <th className="py-3 pr-4">2026E EBITDA</th>
                    <th className="py-3 pr-4">Margin</th>
                    <th className="py-3 pr-4">Multiple</th>
                    <th className="py-3 pr-4">Peer Group</th>
                    <th className="py-3 pr-4">Source</th>
                    <th className="py-3 pr-4">Placeholder</th>
                    <th className="py-3 pr-4">EV Contribution</th>
                    <th className="py-3 pr-4">% EV</th>
                    <th className="py-3 pr-4">Warning</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.baseOperatingSotp.components.map((component) => (
                    <tr key={component.segment} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-ink">{component.segment}</td>
                      <td className="py-3 pr-4 text-slate-600">£{component.baseYearAdjustedEbitda.toFixed(0)}m</td>
                      <td className="py-3 pr-4 text-slate-600">£{component.forwardEbitda.toFixed(0)}m</td>
                      <td className="py-3 pr-4 text-slate-600">{(component.ebitdaMargin * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{component.targetMultiple.toFixed(1)}x</td>
                      <td className="py-3 pr-4 text-slate-600">{component.peerGroup.replace(/_/g, " ")}</td>
                      <td className="py-3 pr-4 text-slate-600">{component.source}{component.peerDataSource ? ` / ${component.peerDataSource}` : ""}</td>
                      <td className="py-3 pr-4 text-slate-600">{component.peerDataIsPlaceholder || component.source === "placeholder" ? "Yes" : component.peerDataIsStale ? "Stale" : "No"}</td>
                      <td className="py-3 pr-4 text-slate-600">£{component.enterpriseValueContribution.toFixed(0)}m</td>
                      <td className="py-3 pr-4 text-slate-600">{(safeNumber(component.enterpriseValueContribution, dashboard.baseOperatingSotp.segmentEnterpriseValueSubtotal) * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{component.guardrailWarning ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="SOTP Bridge" description="This bridge makes the enterprise-to-equity conversion explicit so the selected operating SOTP can be audited line by line.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Segment EV Subtotal" value={`£${dashboard.operatingSotp.bridge.segmentEnterpriseValueSubtotal.toFixed(0)}m`} subtext="Sum of segment EBITDA × multiple" />
              <ScoreCard label="Corporate Cost Deduction" value={`£${dashboard.operatingSotp.bridge.corporateCostValueDeduction.toFixed(0)}m`} subtext={dashboard.operatingSotp.corporateCostTreatment ?? "unknown"} />
              <ScoreCard label="Net Debt" value={`£${dashboard.operatingSotp.bridge.netDebt.toFixed(0)}m`} subtext="Current net debt deducted from EV" />
              <ScoreCard label="NCI / Minorities" value={`£${(dashboard.operatingSotp.bridge.nciDeduction + dashboard.operatingSotp.bridge.minorityInterestDeduction).toFixed(0)}m`} subtext="Ownership-based deduction" />
              <ScoreCard label="Associates / Investments" value={`£${(dashboard.operatingSotp.bridge.associatesOrInvestmentsAddBack + dashboard.operatingSotp.bridge.listedStakeLookThroughValue).toFixed(0)}m`} subtext="Add-backs" />
              <ScoreCard label="Other Claims" value={`£${dashboard.operatingSotp.bridge.pensionOrOtherClaims.toFixed(0)}m`} subtext="Pension / other claims" />
              <ScoreCard label="Equity Value" value={`£${dashboard.operatingSotp.bridge.equityValue.toFixed(0)}m`} subtext="After bridge deductions" />
              <ScoreCard label="Value / Share" value={`£${dashboard.operatingSotp.bridge.valuePerShare.toFixed(2)}`} subtext={`${dashboard.operatingSotp.bridge.dilutedShares.toFixed(1)}m diluted shares`} />
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Corporate treatment: <span className="font-semibold text-ink">{dashboard.operatingSotp.corporateCostTreatment}</span>. {dashboard.operatingSotp.treatmentNote}
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <InsightPanel
                title="Corporate / Other Audit"
                text={`Treatment: ${dashboard.operatingSotp.audit.corporateReconciliation.treatment}. Group EBITDA £${dashboard.operatingSotp.audit.corporateReconciliation.reportedGroupAdjustedEbitda.toFixed(0)}m vs segment subtotal £${dashboard.operatingSotp.audit.corporateReconciliation.sumOfReportedSegmentAdjustedEbitda.toFixed(0)}m; difference £${dashboard.operatingSotp.audit.corporateReconciliation.difference.toFixed(0)}m. Verified: ${dashboard.operatingSotp.audit.corporateReconciliation.verified ? "Yes" : "No"}.`}
              />
              <InsightPanel
                title="NCI / Minority Audit"
                text={dashboard.operatingSotp.audit.ownershipBridge.map((item) => `${item.name}: £${item.economicNciDeduction.toFixed(1)}m via ${item.methodUsed} (${item.confidenceLevel}${item.isPlaceholder ? ", placeholder" : ""})`).join(" · ")}
              />
            </div>
          </SectionCard>

          <SectionCard title="Operating vs Strategic SOTP" description="Strategic SOTP is a separate optionality case. It is not included in the base blended fair value.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Selected Operating SOTP / Share" value={`£${dashboard.operatingSotp.valuePerShare.toFixed(2)}`} subtext="Going-concern underwriting value" />
              <ScoreCard label="Strategic SOTP / Share" value={`£${dashboard.strategicSotp.valuePerShare.toFixed(2)}`} subtext="Optionality case" />
              <ScoreCard label="Strategic Optionality / Share" value={`£${(dashboard.strategicSotp.strategicOptionalityPerShare ?? 0).toFixed(2)}`} subtext="Not included in base blend" />
              <ScoreCard label="Strategic Optionality %" value={`${((dashboard.strategicSotp.strategicOptionalityPctOfOperating ?? 0) * 100).toFixed(1)}%`} subtext="Vs operating SOTP" />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <InsightPanel title="Strategic Uplift Components" text={`Tradeweb look-through, Post Trade standalone uplift, portfolio simplification, excess capital return, and activist value are added explicitly; tax leakage, dis-synergy, and execution discount are deducted explicitly.`} />
              <InsightPanel title="Strategic Treatment" text={dashboard.strategicSotp.treatmentNote ?? "Strategic value is a separate optionality case."} />
            </div>
          </SectionCard>

          <SectionCard title="SOTP Sensitivity" description="These sensitivities help isolate whether the SOTP is being driven by multiples, EBITDA, or bridge deductions.">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-4">Segment</th>
                      <th className="py-3 px-4">Bear</th>
                      <th className="py-3 px-4">Base</th>
                      <th className="py-3 px-4">Bull</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.operatingSotp.sensitivity.multipleSensitivity.map((row) => (
                      <tr key={row.segment} className="border-b border-slate-100">
                        <td className="py-3 px-4 font-medium text-ink">{row.segment}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.bearValuePerShare.toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.baseValuePerShare.toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.bullValuePerShare.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-4">Segment</th>
                      <th className="py-3 px-4">-10%</th>
                      <th className="py-3 px-4">Base</th>
                      <th className="py-3 px-4">+10%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.operatingSotp.sensitivity.ebitdaSensitivity.map((row) => (
                      <tr key={row.segment} className="border-b border-slate-100">
                        <td className="py-3 px-4 font-medium text-ink">{row.segment}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.down10ValuePerShare.toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.baseValuePerShare.toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-600">£{row.up10ValuePerShare.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3">
                {dashboard.operatingSotp.sensitivity.corporateNciSensitivity.map((row) => (
                  <InsightPanel key={row.label} title={row.label} text={`Implied value per share: £${row.valuePerShare.toFixed(2)}`} />
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Valuation Bridge" description="This shows how much of fair value comes from core methods versus confidence-adjusted SOTP. Strategic optionality remains outside the base recommendation.">
            <div className="grid gap-4 lg:grid-cols-7">
              <ScoreCard label="Core Value Ex-SOTP" value={`£${(dashboard.valuation.coreValueExSotp ?? 0).toFixed(2)}`} subtext="DCF, FCF yield, and P/E only" />
              <ScoreCard label="25% SOTP Uplift" value={`£${(dashboard.valuation.blendedFairValue25Sotp ?? 0).toFixed(2)}`} subtext="Very cautious underwriting" />
              <ScoreCard label="50% SOTP Uplift" value={`£${(dashboard.valuation.blendedFairValueHalfSotp ?? 0).toFixed(2)}`} subtext="Haircut SOTP credibility" />
              <ScoreCard label="75% SOTP Uplift" value={`£${(dashboard.valuation.blendedFairValue75Sotp ?? 0).toFixed(2)}`} subtext="Higher confidence case" />
              <ScoreCard label="Full Selected SOTP Blend" value={`£${(dashboard.valuation.blendedFairValue ?? 0).toFixed(2)}`} subtext="Reference if selected policy fully underwritten" />
              <ScoreCard label="Blended Ex-SOTP" value={`£${(dashboard.valuation.blendedFairValueExSotp ?? 0).toFixed(2)}`} subtext="No SOTP contribution" />
              <ScoreCard label="Recommended Fair Value" value={`£${(dashboard.valuation.recommendedFairValue ?? 0).toFixed(2)}`} subtext={dashboard.valuation.recommendedFairValueMethod?.replace(/_/g, " ") ?? "—"} />
              <ScoreCard label="Strategic Optionality / Share" value={`£${(dashboard.valuation.strategicOptionalityPerShare ?? 0).toFixed(2)}`} subtext="Not in base blend" />
              <ScoreCard label="Strategic Upside Case" value={`£${(dashboard.valuation.strategicUpsideFairValue ?? 0).toFixed(2)}`} subtext="Base blended FV + strategic optionality" />
            </div>
          </SectionCard>

          <SectionCard title="SOTP Audit Warnings" description="Severe warnings are shown first so the operating SOTP can be challenged like a real PM review page.">
            <div className="grid gap-4 lg:grid-cols-2">
              {dashboard.operatingSotp.audit.severeWarnings.length > 0 ? dashboard.operatingSotp.audit.severeWarnings.map((warning) => (
                <WarningCard key={warning.id} warning={warning} />
              )) : (
                <InsightPanel title="No severe operating SOTP warnings" text="The operating SOTP currently passes the high-severity checks inside the SOTP audit." />
              )}
              <div className="space-y-3">
                {dashboard.integrity.dataQualityWarnings.map((warning) => (
                  <InsightPanel key={warning.id} title={warning.title} text={warning.detail} />
                ))}
                {dashboard.integrity.recommendationWarnings.map((warning) => (
                  <InsightPanel key={warning.id} title={warning.title} text={warning.detail} />
                ))}
                {dashboard.operatingSotp.audit.warnings.map((warning) => (
                  <InsightPanel key={warning.id} title={warning.title} text={warning.detail} />
                ))}
                {dashboard.operatingSotp.audit.auditNotes.map((note, index) => (
                  <InsightPanel key={index} title="Audit Note" text={note} />
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="P/E and FCF Yield Cross-Check" description="Cross-check methods remain visible, but they do not override cash-flow and segment work.">
            <div className="grid gap-4 lg:grid-cols-4">
              {dashboard.valuation.methodCards.filter((card) => ["lseg-dcf", "lseg-fcf", "lseg-pe", "lseg-operating-sotp"].includes(card.key)).map((card) => (
                <InsightCard key={card.key} title={card.label} body={`${card.description} Output: £${card.value.toFixed(2)} per share.`} badge="Derived" />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Optionality and Overlay Read-Through" description="These values are shown separately so users do not confuse strategic optionality or scenario overlays with the base-blend underwriting anchor.">
            <div className="grid gap-4 lg:grid-cols-4">
              {dashboard.valuation.methodCards.filter((card) => ["lseg-recommended", "lseg-core-ex-sotp", "lseg-strategic-sotp", "lseg-probability"].includes(card.key)).map((card) => (
                <InsightCard
                  key={card.key}
                  title={card.label}
                  body={`${card.description} Output: £${card.value.toFixed(2)} per share.`}
                  badge={card.key === "lseg-strategic-sotp" ? "Assumption" : "Derived"}
                />
              ))}
            </div>
          </SectionCard>

          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={runtimeData}
            scenario={scenario}
            currency="GBP"
            values={valuationAssumptions}
            onValuesChange={handleValuationValuesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="consensus" className="mt-6 space-y-6">
          <SectionCard title="Consensus Comparison" description="This compares our model against manually updateable consensus placeholders so we can see where our differentiated thesis really sits.">
            <InsightPanel title="Summary" text={dashboard.consensusComparison.summary} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Metric</th>
                    <th className="py-3 pr-4">Year</th>
                    <th className="py-3 pr-4">Model</th>
                    <th className="py-3 pr-4">Consensus</th>
                    <th className="py-3 pr-4">Diff</th>
                    <th className="py-3 pr-4">Stance</th>
                    <th className="py-3 pr-4">Materiality</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.consensusComparison.rows.map((row) => (
                    <tr key={`${row.metric}-${row.fiscalYear}`} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-ink">{row.metric}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.fiscalYear}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatConsensusValue(row.metric, row.modelValue)}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatConsensusValue(row.metric, row.consensusValue)}</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.percentageDifference * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{row.stance}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.materiality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="scenarios" className="mt-6 space-y-6">
          <SectionCard title="Bear / Base / Bull Scenario Table" description="Operating SOTP, DCF, P/E, and FCF yield are all independently recalculated by scenario.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 pr-4">Scenario</th>
                    <th className="py-3 pr-4">Prob.</th>
                    <th className="py-3 pr-4">Rev CAGR</th>
                    <th className="py-3 pr-4">EBITDA Margin</th>
                    <th className="py-3 pr-4">FCF / Share</th>
                    <th className="py-3 pr-4">WACC</th>
                    <th className="py-3 pr-4">g</th>
                    <th className="py-3 pr-4">P/E</th>
                    <th className="py-3 pr-4">DCF</th>
                    <th className="py-3 pr-4">Op SOTP</th>
                    <th className="py-3 pr-4">FCF Yield</th>
                    <th className="py-3 pr-4">Blended</th>
                    <th className="py-3 pr-4">Expected CAGR</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioTableRows.map((row) => (
                    <tr key={row.scenario} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-ink">{row.scenario}</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.probability * 100).toFixed(0)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.revenueCagr * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.ebitdaMargin * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.fcfPerShare.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.wacc * 100).toFixed(2)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.terminalGrowth * 100).toFixed(2)}%</td>
                      <td className="py-3 pr-4 text-slate-600">{row.targetPe.toFixed(1)}x</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.dcf.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.operatingSotp.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.fcfYieldValue.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">£{row.blended.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-600">{(row.expectedReturn3Y * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="transcript-intelligence" className="mt-6 space-y-6">
          <TranscriptIntelligenceLab />
        </Tabs.Content>

        <Tabs.Content value="quality-diagnostics" className="mt-6 space-y-6">
          <SectionCard title="Quality Diagnostics" description="Diagnostics support scenario confidence and commentary only. They do not directly raise fair value.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreCard label="Overall Quality" value={`${dashboard.qualityDiagnostics.overallQualityScore}`} subtext="Mapped to moatScore for compatibility" />
              <ScoreCard label="Revenue Durability" value={`${dashboard.qualityDiagnostics.revenueDurabilityScore}`} subtext="ASV, retention, recurring mix" />
              <ScoreCard label="Pricing Power" value={dashboard.qualityDiagnostics.pricingPowerSignal} subtext="Signal only" />
              <ScoreCard label="Workflow Lock-In" value={dashboard.qualityDiagnostics.workflowLockInSignal} subtext="Signal only" />
              <ScoreCard label="Post-Trade Moat" value={dashboard.qualityDiagnostics.postTradeMoatSignal} subtext="Signal only" />
              <ScoreCard label="Capital Efficiency" value={dashboard.qualityDiagnostics.capitalEfficiencySignal} subtext="Signal only" />
              <ScoreCard label="ASV Growth" value={`${(dashboard.qualityDiagnostics.sourceMetrics.asvGrowth * 100).toFixed(1)}%`} subtext="KPI anchor" />
              <ScoreCard label="Gross Retention" value={`${(dashboard.qualityDiagnostics.sourceMetrics.grossRetention * 100).toFixed(1)}%`} subtext="Recurring durability" />
            </div>
            <InsightPanel title="Why this matters" text={dashboard.qualityDiagnostics.interpretation} />
            {dashboard.qualityDiagnostics.riskFlags.length > 0 && (
              <BulletPanel title="Risk Flags" items={dashboard.qualityDiagnostics.riskFlags} />
            )}
          </SectionCard>

          <SectionCard title="Peer Read-Through" description="Peer ranges inform guardrails and commentary, but do not mechanically override LSEG cash flow math.">
            <div className="mb-6 grid gap-4 lg:grid-cols-4">
              <ScoreCard
                label="yfinance-Populated Peers"
                value={`${dashboard.peerDataQuality.yfinancePopulatedPeers.length}`}
                subtext={dashboard.peerDataQuality.yfinancePopulatedPeers.join(", ")}
              />
              <ScoreCard
                label="Manual Fallback Peers"
                value={`${dashboard.peerDataQuality.manualFallbackPeers.length}`}
                subtext={dashboard.peerDataQuality.manualFallbackPeers.join(", ")}
              />
              <ScoreCard
                label="Peer Warnings"
                value={`${dashboard.peerDataQuality.warnings.length}`}
                subtext={`Snapshot date ${dashboard.peerDataQuality.fetchedDate ?? "unknown"}`}
              />
              <InsightPanel
                title="Peer Layer Policy"
                text="Mixed-currency absolute fields like marketCap and enterpriseValue are metadata-only. Ratios are used for comparison; guardrails remain manually curated unless explicitly changed."
              />
            </div>
            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              {dashboard.peerDataQuality.warnings.length > 0 ? (
                dashboard.peerDataQuality.warnings.map((warning) => (
                  <WarningCard key={warning.id} warning={warning} />
                ))
              ) : (
                <InsightPanel title="No Peer Data Quality Warnings" text="The current peer-layer snapshot does not raise additional ingestion-quality warnings." />
              )}
            </div>
            <PeerReadThrough
              rows={dashboard.peers.map((row) => ({
                peer: row.peer,
                category: row.category,
                revenueGrowth: row.revenueGrowth,
                ebitdaMargin: row.ebitdaMargin,
                fcfYield: row.fcfYield,
                forwardPe: row.forwardPe,
                subscriptionGrowth: 0,
                indexGrowth: 0,
                clearingTradingGrowth: 0,
                signal: row.signal,
              }))}
              title="LSEG Peer Read-Through"
              description="Peer multiples and operating profiles support valuation commentary and multiple guardrails."
            />
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function safeNumber(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return 0;
  return numerator / denominator;
}

function formatConsensusValue(metric: string, value: number) {
  if (metric.includes("Margin") || metric.includes("Growth")) return `${(value * 100).toFixed(1)}%`;
  if (metric.includes("EPS") || metric.includes("Target Price")) return `£${value.toFixed(2)}`;
  return `£${value.toFixed(0)}m`;
}

function ScoreCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtext}</p>
    </div>
  );
}

function InsightCard({
  title,
  body,
  badge,
}: {
  title: string;
  body: string;
  badge: "Actual" | "Assumption" | "Derived" | "Placeholder" | "Needs Review";
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{title}</p>
        <DataQualityBadge badge={badge} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function WarningCard({ warning }: { warning: { title: string; detail: string; severity: string } }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{warning.title}</p>
        <span className="text-xs font-medium uppercase tracking-wide text-amber-700">{warning.severity}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{warning.detail}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <p className="font-semibold text-ink">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="mb-4 font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
