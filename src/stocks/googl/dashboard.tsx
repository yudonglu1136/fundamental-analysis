import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cpu, Search, Sparkles } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { WaterfallChart } from "../../components/shared/WaterfallChart";
import { TooltipInfo } from "../../components/shared/TooltipInfo";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { defaultGooglAssumptions, getGooglScenarioDefaults, matchGooglScenario, pickGooglValuationAssumptions, type GooglAssumptions } from "./assumptions";
import { googlData } from "./data";
import { buildGooglModel } from "./calculations";
import { GooglAssumptionsPanel } from "./components/GooglAssumptionsPanel";
import { GooglSignalBadge } from "./components/GooglSignalBadge";
import { GooglStatusBanner } from "./components/GooglStatusBanner";
import type { Signal } from "../types";

function normalizeSavedGooglAssumptions(raw: Partial<GooglAssumptions>) {
  const legacyPlaceholderPrices = new Set([180, 188, 190]);
  const next = { ...raw };
  if (typeof next.currentPrice === "number" && legacyPlaceholderPrices.has(next.currentPrice)) {
    next.currentPrice = defaultGooglAssumptions.currentPrice;
  }
  return next;
}

function loadSavedGooglAssumptions() {
  if (typeof window === "undefined") return defaultGooglAssumptions;
  const saved = window.localStorage.getItem("fundamental-analysis:GOOGL:assumptions");
  if (!saved) return defaultGooglAssumptions;
  try {
    return { ...defaultGooglAssumptions, ...normalizeSavedGooglAssumptions(JSON.parse(saved) as Partial<GooglAssumptions>) };
  } catch {
    return defaultGooglAssumptions;
  }
}

export function GooglDashboard({ module, scenario, onScenarioChange, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [assumptions, setAssumptions] = useState<GooglAssumptions>(loadSavedGooglAssumptions);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setAssumptions(getGooglScenarioDefaults(scenario));
  }, [scenario]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fundamental-analysis:GOOGL:assumptions", JSON.stringify(assumptions));
    }
  }, [assumptions]);

  const model = useMemo(() => buildGooglModel(googlData, assumptions, period), [assumptions, period]);
  const activeScenario = matchGooglScenario(assumptions);
  const scenarioValuations = useMemo(
    () =>
      (["Bear", "Base", "Bull"] as const).map((preset) => ({
        scenario: preset,
        result:
          buildGooglModel(googlData, getGooglScenarioDefaults(preset), googlData.currentPeriodId).valuation.fairValues.find((item) => item.scenario === preset) ??
          buildGooglModel(googlData, getGooglScenarioDefaults(preset), googlData.currentPeriodId).valuation.fairValues[0],
      })),
    [],
  );

  function handleAssumptionChange(key: keyof GooglAssumptions, value: number) {
    setAssumptions((current) => ({ ...current, [key]: value }));
    onDataSourceChange("manual");
  }

  function handleReset(target: "Bear" | "Base" | "Bull" | "Consensus") {
    if (target === "Consensus") {
      setAssumptions(defaultGooglAssumptions);
      onScenarioChange("Base");
      onDataSourceChange("manual");
      return;
    }
    setAssumptions(getGooglScenarioDefaults(target));
    onScenarioChange(target);
    onDataSourceChange("manual");
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Alphabet / Google AI Economics Dashboard" description={module.description} badge={<GooglSignalBadge signal={model.statusBanner.signal} />}>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>Period: {period}</span>
          <span>Scenario: {scenario}</span>
          <span>Assumption state: {activeScenario}</span>
          <span>2026 CapEx guide: ${googlData.annualCapexGuidanceLow}B to ${googlData.annualCapexGuidanceHigh}B</span>
        </div>
      </SectionCard>

      <GooglStatusBanner title={model.statusBanner.title} detail={model.statusBanner.detail} signal={model.statusBanner.signal} />

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-panel">
          {module.tabs.map((item) => (
            <Tabs.Trigger key={item.value} value={item.value} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-ink data-[state=active]:text-white">
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {model.summary.map((metric) => (
              <MetricCard key={metric.key} metric={metric} currency="USD" />
            ))}
          </div>

          <SectionCard title="Thesis Framework" description="Google’s AI debate is not just demand, but whether TPU-first infrastructure converts that demand into superior cloud margin and ROIC.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {([
                { title: "Search / Advertising", detail: "Can AI expand query volume and commercial engagement without destroying monetizable clicks?", icon: Search, signal: assumptions.aiCannibalizationEffect < 0.015 ? "Positive" : "Neutral" as const },
                { title: "Google Cloud", detail: "The critical proof point is AI revenue growth plus cloud margin expansion at the same time.", icon: Cpu, signal: model.selectedRow.cloudOperatingMarginEstimate >= model.selectedRow.cloudOperatingMargin ? "Inflecting" : "Negative" as const },
                { title: "TPU Infrastructure", detail: "The core moat question is whether TPU lowers cost per token enough to lift gross margin and ROIC.", icon: Sparkles, signal: model.selectedRow.tpuMoatScore >= 70 ? "Positive" : model.selectedRow.computeCapacityConstraintScore > 0.72 ? "Compute Constrained" : "Neutral" as const },
                { title: "AI Capital Efficiency", detail: "Alphabet must show AI revenue and operating profit growing faster than CapEx and depreciation.", icon: Sparkles, signal: model.selectedRow.aiRoicEstimate > model.selectedRow.wacc ? "Positive" : "Inflecting" as const },
              ] as Array<{ title: string; detail: string; icon: typeof Search; signal: Signal }>).map((card) => (
                <div key={card.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <GooglSignalBadge signal={card.signal} />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["Search", "Cloud", "TPU"]} title="Core AI Economics Drivers" description="Edit the key Search, Cloud, and TPU assumptions that determine whether Alphabet’s AI stack creates a real moat." />
        </Tabs.Content>

        <Tabs.Content value="search-ads" className="mt-6 space-y-6">
          <SectionCard title="Search and Ads Quality" description="Track whether AI increases Search usage and monetization, or simply shifts users into lower-click answer experiences.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="searchGrowth" stroke="#21486f" strokeWidth={3} name="Search revenue growth" />
                    <Line type="monotone" dataKey="searchQueryGrowth" stroke="#0f8f6f" strokeWidth={3} name="Search query growth" />
                    <Line type="monotone" dataKey="aiOverviewsUsage" stroke="#7c3aed" strokeWidth={2.5} name="AI Overviews usage" />
                    <Line type="monotone" dataKey="aiModeAdoption" stroke="#d97706" strokeWidth={2.5} name="AI Mode adoption" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="searchRevenuePerQueryEstimate" stroke="#21486f" strokeWidth={3} name="Revenue per query" />
                    <Line type="monotone" dataKey="cpcTrend" stroke="#b91c1c" strokeWidth={2.5} name="CPC trend" />
                    <Line type="monotone" dataKey="searchMarginEstimate" stroke="#0f8f6f" strokeWidth={3} name="Search margin est." />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="AI Search Monetization Bridge" description="AI should be accretive only if higher engagement and commercial intent outweigh click cannibalization." badge={<TooltipInfo text="Positive if query growth rises while revenue per query and margin remain stable." />}>
            <WaterfallChart rows={model.searchBridge} formatter={(value) => `${value.toFixed(1)}B`} />
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["Search"]} title="Search AI Assumptions" description="Stress AI Overviews, AI Mode, cannibalization, and Search monetization." />
        </Tabs.Content>

        <Tabs.Content value="google-cloud" className="mt-6 space-y-6">
          <SectionCard title="Cloud Margin Expansion Tracker" description="The key institutional question is whether AI revenue growth and Cloud margin expansion can coexist.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cloudRevenueEstimate" stroke="#21486f" strokeWidth={3} name="Cloud revenue" />
                    <Line type="monotone" dataKey="cloudGrowth" stroke="#0f8f6f" strokeWidth={3} name="Cloud growth" />
                    <Line type="monotone" dataKey="aiContributionToCloudGrowth" stroke="#7c3aed" strokeWidth={2.5} name="AI share of cloud growth" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cloudOperatingMarginEstimate" stroke="#21486f" strokeWidth={3} name="Cloud op margin" />
                    <Line type="monotone" dataKey="cloudBacklog" stroke="#0f8f6f" strokeWidth={3} name="Cloud backlog" />
                    <Line type="monotone" dataKey="computeCapacityConstraint" stroke="#b91c1c" strokeWidth={2.5} name="Compute constraint" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Current official public baseline is Google Cloud revenue of $17.7B with 30.1% margin and backlog of $240B in Q4 2025, while the dashboard’s default current frame layers your requested Q1 2026-style assumption set on top for scenario work.</p>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["Cloud"]} title="Cloud Conversion Assumptions" description="Focus on growth, margin, backlog conversion, and compute availability." />
        </Tabs.Content>

        <Tabs.Content value="tpu-economics" className="mt-6 space-y-6">
          <SectionCard title="TPU Economics" description="This is the core differentiator versus AWS and Azure: does custom silicon create structurally better AI economics?">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "util", label: "TPU Utilization", value: model.selectedRow.tpuUtilization, format: "percent", description: "Higher utilization is required to translate TPU design advantage into realized economics.", badge: "Derived" }} />
              <MetricCard metric={{ key: "token", label: "TPU Cost / Token Index", value: model.selectedRow.tpuCostPerTokenEstimate, format: "number", description: "Lower is better and implies more efficient inference economics.", badge: "Derived" }} />
              <MetricCard metric={{ key: "adv", label: "TPU Margin Advantage", value: model.selectedRow.tpuGrossMarginAdvantageEstimate, format: "percent", description: "Estimated margin uplift from TPU-driven cost advantages.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-capex", label: "AI Revenue / TPU CapEx", value: model.selectedRow.aiAnnualRevenueEstimate / Math.max(model.selectedRow.tpuCapex, 1), format: "number", description: "Simple check on monetization throughput relative to TPU investment.", badge: "Derived" }} />
              <MetricCard metric={{ key: "moat", label: "TPU Moat Score", value: model.selectedRow.tpuMoatScore, format: "number", description: "Composite of cost advantage, efficiency, utilization, customer adoption, margin impact, and ROIC impact.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="TPU Margin Bridge" description="The margin bridge tests whether TPU efficiency offsets depreciation, networking, and power costs." badge={<GooglSignalBadge signal={model.selectedRow.tpuMoatScore >= 70 ? "Positive" : model.selectedRow.computeCapacityConstraintScore > 0.72 ? "Compute Constrained" : "Inflecting"} />}>
            <WaterfallChart rows={model.tpuMarginBridge} formatter={(value) => `${(value * 100).toFixed(1)}%`} />
          </SectionCard>

          <SectionCard title="TPU Efficiency Trends" description="Track whether TPU economics are actually improving faster than the AI depreciation burden.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="tpuUtilization" stroke="#21486f" strokeWidth={3} name="TPU utilization" />
                    <Line type="monotone" dataKey="tpuCostPerTokenEstimate" stroke="#0f8f6f" strokeWidth={3} name="Cost per token" />
                    <Line type="monotone" dataKey="tpuCostAdvantageVsNvidia" stroke="#7c3aed" strokeWidth={2.5} name="Cost advantage vs Nvidia" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="tpuCapex" fill="#21486f" name="TPU CapEx" />
                    <Bar dataKey="tpuDepreciation" fill="#d97706" name="TPU depreciation" />
                    <Bar dataKey="tpuEnergyEfficiency" fill="#0f8f6f" name="Energy efficiency" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["TPU"]} title="TPU Economics Assumptions" description="Tune utilization, cost reduction, depreciation, and margin advantage." />
        </Tabs.Content>

        <Tabs.Content value="ai-monetization" className="mt-6 space-y-6">
          <SectionCard title="AI Monetization Quality" description="Track whether Alphabet is monetizing AI through recurring software and platform revenue rather than just selling compute.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="geminiPaidUsers" stroke="#21486f" strokeWidth={3} name="Gemini paid users" />
                    <Line type="monotone" dataKey="aiTokenThroughput" stroke="#0f8f6f" strokeWidth={3} name="AI token throughput" />
                    <Line type="monotone" dataKey="geminiEnterpriseGrowth" stroke="#7c3aed" strokeWidth={2.5} name="Gemini Enterprise QoQ growth" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="aiSubscriptionRevenue" stroke="#21486f" fill="#bfdbfe" name="AI subscriptions" />
                    <Area type="monotone" dataKey="aiAgentRevenue" stroke="#7c3aed" fill="#ddd6fe" name="AI agents" />
                    <Area type="monotone" dataKey="aiAnnualRevenueEstimate" stroke="#0f8f6f" fill="#bbf7d0" name="AI annualized revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">AI Monetization Quality Score</p>
                <GooglSignalBadge signal={model.selectedRow.aiMonetizationQualityScore >= 70 ? "Positive" : model.selectedRow.aiMonetizationQualityScore >= 55 ? "Inflecting" : "Neutral"} />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{model.selectedRow.aiMonetizationQualityScore.toFixed(0)}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Positive if recurring AI revenue increases, Gemini monetization scales, and AI solutions growth outpaces pure infrastructure growth.</p>
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["AI Monetization"]} title="AI Monetization Assumptions" description="Stress Gemini monetization, paid users, tokens, and AI agent adoption." />
        </Tabs.Content>

        <Tabs.Content value="ai-roic" className="mt-6 space-y-6">
          <SectionCard title="AI ROIC Dashboard" description="The institutional core question is whether TPU-led infrastructure creates higher long-term ROIC than peer hyperscalers.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard metric={{ key: "op", label: "AI Operating Profit ($B)", value: model.selectedRow.aiOperatingProfitEstimate, format: "number", description: "AI operating profit after infrastructure burden.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ic", label: "AI Invested Capital ($B)", value: model.selectedRow.aiInvestedCapitalEstimate, format: "number", description: "Capital invested into TPU and AI infrastructure stack.", badge: "Derived" }} />
              <MetricCard metric={{ key: "roic", label: "AI ROIC", value: model.selectedRow.aiRoicEstimate, format: "percent", description: "Incremental return on AI invested capital.", badge: "Derived" }} />
              <MetricCard metric={{ key: "spread", label: "ROIC vs WACC", value: model.selectedRow.aiRoicEstimate - model.selectedRow.wacc, format: "percent", description: "Positive spread signals real value creation from AI investment.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="AI ROIC Trajectory" description="Positive if AI revenue growth exceeds AI CapEx growth, Cloud margins keep improving, and TPU-driven cost advantages widen.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="aiRoicEstimate" stroke="#21486f" strokeWidth={3} name="AI ROIC" />
                    <Line type="monotone" dataKey="wacc" stroke="#b91c1c" strokeWidth={2.5} name="WACC" />
                    <Line type="monotone" dataKey="cloudOperatingMarginEstimate" stroke="#0f8f6f" strokeWidth={3} name="Cloud margin" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aiOperatingProfitEstimate" fill="#21486f" name="AI op profit" />
                    <Bar dataKey="aiInvestedCapitalEstimate" fill="#0f8f6f" name="AI invested capital" />
                    <Bar dataKey="tpuDepreciation" fill="#d97706" name="TPU depreciation" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["Cloud", "TPU", "Capital Intensity"]} title="ROIC and Capital Efficiency Assumptions" description="Model the crossover between AI monetization, Cloud margin, and TPU-led capital efficiency." />
        </Tabs.Content>

        <Tabs.Content value="capex-fcf" className="mt-6 space-y-6">
          <SectionCard title="AI CapEx Payback Model" description="This tests whether AI CapEx is becoming productive through AI revenue, TPU savings, and improving cash conversion.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "capex", label: "Total CapEx ($B)", value: model.selectedRow.totalCapex, format: "number", description: "Quarterly total CapEx including technical infrastructure.", badge: "Actual" }} />
              <MetricCard metric={{ key: "ai-capex", label: "AI CapEx ($B)", value: model.selectedRow.tpuCapex, format: "number", description: "Quarterly TPU and AI infrastructure investment.", badge: "Actual" }} />
              <MetricCard metric={{ key: "depr", label: "Depreciation ($B)", value: model.selectedRow.depreciation, format: "number", description: "P&L burden from prior AI and data center CapEx.", badge: "Actual" }} />
              <MetricCard metric={{ key: "fcf", label: "AI-Adjusted FCF ($B)", value: model.selectedRow.aiAdjustedFcf, format: "number", description: "Core FCF minus incremental AI CapEx plus TPU savings and AI op profit.", badge: "Derived" }} />
              <MetricCard metric={{ key: "fcf-margin", label: "AI-Adjusted FCF Margin", value: model.selectedRow.aiAdjustedFcfMargin, format: "percent", description: "Tracks whether AI is FCF dilutive, neutral, or accretive.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="FCF Offset Bridge" description="The bridge shows whether AI infrastructure is still dragging on cash flow or starting to self-fund.">
            <WaterfallChart rows={model.fcfOffsetBridge} formatter={(value) => `${value.toFixed(1)}B`} />
          </SectionCard>

          <SectionCard title="Capital Intensity Trend" description="Watch whether revenue growth and TPU efficiency catch up to the CapEx wave.">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="periodId" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="totalCapex" stroke="#b91c1c" strokeWidth={2.5} name="Total CapEx" />
                  <Line type="monotone" dataKey="tpuCapex" stroke="#7c3aed" strokeWidth={2.5} name="TPU CapEx" />
                  <Line type="monotone" dataKey="aiAdjustedFcf" stroke="#0f8f6f" strokeWidth={3} name="AI-adjusted FCF" />
                  <Line type="monotone" dataKey="aiAnnualRevenueEstimate" stroke="#21486f" strokeWidth={3} name="AI annualized revenue" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} categories={["Capital Intensity"]} title="CapEx and FCF Assumptions" description="Edit AI CapEx growth, depreciation growth, and FCF conversion." />
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="Alphabet AI Valuation Engine" description="Blended valuation across Search, Cloud, AI-adjusted DCF, TPU uplift, and Other Bets." badge={<Cpu className="h-5 w-5 text-cyan-600" />}>
            <p className="text-sm leading-6 text-slate-600">The model values Alphabet through five lenses: core Search/YouTube earnings, Cloud EV/EBIT, AI-adjusted DCF, TPU ROIC uplift, and Other Bets SOTP. The key institutional variable is whether TPU converts AI demand into a sustainable margin and ROIC advantage.</p>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={googlData}
            scenario={scenario}
            currency="USD"
            values={pickGooglValuationAssumptions(assumptions)}
            onValuesChange={(next) => {
              setAssumptions((current) => ({ ...current, ...(next as Partial<GooglAssumptions>) }));
              onDataSourceChange("manual");
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="scenario-lab" className="mt-6 space-y-6">
          <SectionCard title="Scenario Lab" description="Stress the whole TPU / Search / Cloud flywheel and compare how bear, base, and bull assumptions reshape the equity story.">
            <div className="grid gap-4 md:grid-cols-3">
              {scenarioValuations.map(({ scenario: preset, result }) => (
                <div key={preset} className={`rounded-3xl border p-5 ${scenario === preset ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{preset}</p>
                    <GooglSignalBadge signal={preset === "Bear" ? "Negative" : preset === "Bull" ? "Positive" : "Neutral"} />
                  </div>
                  <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Current Fair Value</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">${result.fairValue.toFixed(1)}</p>
                  <p className={`mt-2 text-sm font-medium ${result.upsideDownside >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{(result.upsideDownside * 100).toFixed(1)}% vs current price</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">3Y Target Price</p>
                  <p className="mt-1 text-2xl font-semibold text-ink">${(result.targetPrice3Y ?? result.fairValue).toFixed(1)}</p>
                  <p className="mt-2 text-sm text-slate-500">Expected 3Y shareholder CAGR: {(result.expectedReturn3Y * 100).toFixed(1)}%</p>
                  {result.summary ? <p className="mt-3 text-sm leading-6 text-slate-600">{result.summary}</p> : null}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Scenario Watchlist" description="The most important checkpoints for the Alphabet AI thesis.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                "Does Search engagement stay expansionary as AI answers become more common?",
                "Is Cloud margin still rising while AI revenue accelerates?",
                "Do TPU savings show up in cost per token and ROIC?",
                "Is AI annualized revenue scaling faster than TPU depreciation and CapEx?",
              ].map((question) => (
                <div key={question} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="font-medium text-ink">{question}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <GooglAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeScenario} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
