import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BrainCircuit, CloudCog, Cpu, DollarSign, Sparkles } from "lucide-react";
import type { StockDashboardProps } from "../types";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import { WaterfallChart } from "../../components/shared/WaterfallChart";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { TooltipInfo } from "../../components/shared/TooltipInfo";
import { AiStatusBanner } from "./components/AiStatusBanner";
import { MsftAssumptionsPanel } from "./components/MsftAssumptionsPanel";
import { SignalBadge } from "./components/SignalBadge";
import { buildMsftDashboardData, calculateMsftValuation } from "./calculations";
import { defaultMsftAssumptions, getMsftScenarioDefaults, matchMsftScenario, pickMsftValuationAssumptions, type MsftAssumptions } from "./assumptions";
import { msftData } from "./data";

function loadSavedMsftAssumptions() {
  if (typeof window === "undefined") return defaultMsftAssumptions;
  const saved = window.localStorage.getItem("fundamental-analysis:MSFT:assumptions");
  if (!saved) return defaultMsftAssumptions;
  try {
    return { ...defaultMsftAssumptions, ...(JSON.parse(saved) as Partial<MsftAssumptions>) };
  } catch {
    return defaultMsftAssumptions;
  }
}

export function MsftDashboard({ module, scenario, onScenarioChange, period, onDataSourceChange }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "overview");
  const [assumptions, setAssumptions] = useState<MsftAssumptions>(loadSavedMsftAssumptions);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setAssumptions(getMsftScenarioDefaults(scenario));
  }, [scenario]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fundamental-analysis:MSFT:assumptions", JSON.stringify(assumptions));
    }
  }, [assumptions]);

  const dashboard = useMemo(() => buildMsftDashboardData(msftData, assumptions, period, scenario), [assumptions, period, scenario]);
  const activeAssumptionState = matchMsftScenario(assumptions);
  const scenarioValuations = useMemo(
    () =>
      (["Bear", "Base", "Bull"] as const).map((preset) => ({
        scenario: preset,
        model: buildMsftDashboardData(msftData, getMsftScenarioDefaults(preset), period, preset),
        result: calculateMsftValuation(msftData, getMsftScenarioDefaults(preset)).fairValues.find((item) => item.scenario === preset) ?? calculateMsftValuation(msftData, getMsftScenarioDefaults(preset)).fairValues[0],
      })),
    [period],
  );

  function handleAssumptionChange(key: keyof MsftAssumptions, value: number) {
    setAssumptions((current) => ({ ...current, [key]: value }));
    onDataSourceChange("manual");
  }

  function handleReset(target: "Bear" | "Base" | "Bull" | "Consensus") {
    if (target === "Consensus") {
      setAssumptions(defaultMsftAssumptions);
      onScenarioChange("Base");
      onDataSourceChange("manual");
      return;
    }
    setAssumptions(getMsftScenarioDefaults(target));
    onScenarioChange(target);
    onDataSourceChange("manual");
  }

  const revenuePanel = (
    <MsftAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeAssumptionState} categories={["Revenue"]} title="AI Revenue Drivers" description="Tune AI growth quality, mix shift, utilization, and monetization efficiency." />
  );
  const marginPanel = (
    <MsftAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeAssumptionState} categories={["Margins"]} title="Cloud Margin Offsets" description="Stress AI dilution against Azure and M365 efficiency gains." />
  );
  const capexPanel = (
    <MsftAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeAssumptionState} categories={["CapEx"]} title="AI Infrastructure Cost Curve" description="Model AI CapEx, depreciation, energy, and networking intensity." />
  );
  const copilotPanel = (
    <MsftAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeAssumptionState} categories={["Copilot & Agents"]} title="Copilot and Agent Platform" description="Track whether Microsoft is becoming an enterprise AI operating system." />
  );

  return (
    <div className="space-y-6">
      <SectionCard title="Microsoft AI Economics Dashboard" description={module.description} badge={<SignalBadge signal={dashboard.statusBanner.signal} />}>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>Current frame: {period}</span>
          <span>Scenario: {scenario}</span>
          <span>Assumption state: {activeAssumptionState}</span>
          <span>Cloud GM guide: {(msftData.cloudMarginGuideNextQuarter * 100).toFixed(0)}%</span>
        </div>
      </SectionCard>

      <AiStatusBanner title={dashboard.statusBanner.title} detail={dashboard.statusBanner.detail} signal={dashboard.statusBanner.signal} />

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
            {dashboard.summary.map((metric) => (
              <MetricCard key={metric.key} metric={metric} currency="USD" />
            ))}
          </div>

          <SectionCard title="Investment Read-Through" description="The key buy-side AI economics questions for Microsoft.">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {dashboard.interpretations.map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{item.title}</p>
                    <SignalBadge signal={item.signal} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Operating System Transition" description="The core strategic transition is from AI infrastructure supply to enterprise AI software and agent orchestration.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { title: "Core Microsoft", detail: "Commercial backlog, M365, and platform distribution still anchor the funding base for AI." , icon: CloudCog },
                { title: "Azure / AI Infrastructure", detail: "The near-term question is whether Azure AI demand scales faster than GPU depreciation and cost of revenue.", icon: Cpu },
                { title: "Copilot / AI SaaS", detail: "High-margin monetization must move from seats to workflow intensity and attach rates.", icon: DollarSign },
                { title: "AI Agent Platform", detail: "Copilot Studio and agents are the bridge from copilots to an enterprise AI operating system.", icon: BrainCircuit },
              ].map((card) => (
                <div key={card.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 w-fit">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {revenuePanel}
        </Tabs.Content>

        <Tabs.Content value="ai-revenue" className="mt-6 space-y-6">
          <SectionCard title="AI Revenue Scaling" description="Separate Azure AI monetization from traditional cloud revenue and track the software mix shift.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="azureGrowth" stroke="#0f8f6f" strokeWidth={3} name="Azure growth" />
                    <Line type="monotone" dataKey="aiContributionToAzureGrowth" stroke="#21486f" strokeWidth={3} name="AI contribution" />
                    <Line type="monotone" dataKey="cloudRevenueGrowth" stroke="#d97706" strokeWidth={2.5} name="Cloud revenue growth" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="aiAnnualRunRate" stroke="#2563eb" fill="#bfdbfe" name="AI annual revenue run-rate" />
                    <Area type="monotone" dataKey="traditionalAzureRevenue" stroke="#475569" fill="#e2e8f0" name="Traditional Azure revenue" />
                    <Area type="monotone" dataKey="aiAzureRevenue" stroke="#0f8f6f" fill="#bbf7d0" name="AI Azure revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="AI Revenue Mix" description="Track whether Microsoft is moving up the stack from compute supply toward software and agent monetization." badge={<TooltipInfo text="A healthier mix shifts from low-margin AI compute into Copilot, GitHub Copilot, Copilot Studio, and agent usage." />}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.aiRevenueMix}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" interval={0} angle={-14} textAnchor="end" height={90} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#21486f" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {revenuePanel}
        </Tabs.Content>

        <Tabs.Content value="cloud-margins" className="mt-6 space-y-6">
          <SectionCard title="Cloud Margin Trend" description="The most important short-cycle question is whether AI continues to dilute Microsoft Cloud margins or begins to stabilize.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cloudGrossMargin" stroke="#21486f" strokeWidth={3} name="Microsoft Cloud GM" />
                    <Line type="monotone" dataKey="azureGrossMargin" stroke="#0f8f6f" strokeWidth={3} name="Azure GM" />
                    <Line type="monotone" dataKey="aiGrossMarginEstimate" stroke="#d97706" strokeWidth={2.5} name="AI GM estimate" />
                    <Line type="monotone" dataKey="copilotGrossMarginEstimate" stroke="#7c3aed" strokeWidth={2.5} name="Copilot GM estimate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="operatingMargin" stroke="#21486f" strokeWidth={3} name="Operating margin" />
                    <Line type="monotone" dataKey="depreciationRevenue" stroke="#d97706" strokeWidth={2.5} name="Depreciation / revenue" />
                    <Line type="monotone" dataKey="costRevenueGrowth" stroke="#b91c1c" strokeWidth={2.5} name="Cost of revenue growth" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="AI Margin Dilution Bridge" description="AI is currently dilutive, but the key question is whether Azure and M365 efficiency gains can offset the drag." badge={<SignalBadge signal={dashboard.selectedRow.cloudGrossMargin >= 0.66 ? "Neutral" : "Inflecting"} />}>
            <WaterfallChart rows={dashboard.marginBridge} formatter={(value) => `${(value * 100).toFixed(1)}%`} />
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Prior cloud margin is being pressured by AI infrastructure and usage costs, partially offset by Azure efficiency and software mix gains. With management guiding roughly {Math.round(msftData.cloudMarginGuideNextQuarter * 100)}% near-term, the inflection question is whether the decline narrows from here.
            </p>
          </SectionCard>

          {marginPanel}
        </Tabs.Content>

        <Tabs.Content value="ai-capex" className="mt-6 space-y-6">
          <SectionCard title="AI Infrastructure Economics" description="Track the relationship between AI revenue, CapEx, depreciation, and implied payback.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "ai-capex", label: "AI CapEx ($B)", value: dashboard.selectedRow.aiCapex, format: "number", description: "AI-specific capital investment including GPU clusters, networking, and supporting infrastructure.", badge: "Actual" }} />
              <MetricCard metric={{ key: "rev-capex", label: "AI Revenue / AI CapEx", value: dashboard.selectedRow.aiRevenueToCapex, format: "number", description: "A simple throughput measure for whether AI monetization is catching up to infrastructure spend.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-op", label: "AI Operating Profit ($B)", value: dashboard.selectedRow.aiOperatingProfit, format: "number", description: "AI gross profit less depreciation and AI operating cost load.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-roic", label: "AI ROIC", value: dashboard.selectedRow.aiRoicEstimate, format: "percent", description: "Incremental return on AI invested capital.", badge: "Derived" }} />
              <MetricCard metric={{ key: "payback", label: "Payback Period", value: dashboard.selectedRow.paybackPeriod, format: "number", description: "Estimated years for AI infrastructure to pay back from AI operating profit.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="AI CapEx Cohort Table" description="The AI cohort view helps determine whether Microsoft is approaching an AI payback inflection.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    {["Fiscal year", "AI CapEx", "Depreciation", "AI revenue", "AI gross profit", "AI operating profit", "AI ROIC", "Payback"].map((header) => (
                      <th key={header} className="pb-3 pr-4">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.capexCohorts.map((row) => (
                    <tr key={row.fiscalYear}>
                      <td className="py-3 pr-4">{row.fiscalYear}</td>
                      <td className="py-3 pr-4">{row.aiCapex.toFixed(1)}B</td>
                      <td className="py-3 pr-4">{row.depreciation.toFixed(1)}B</td>
                      <td className="py-3 pr-4">{row.aiRevenue.toFixed(1)}B</td>
                      <td className="py-3 pr-4">{row.aiGrossProfit.toFixed(1)}B</td>
                      <td className="py-3 pr-4">{row.aiOperatingProfit.toFixed(1)}B</td>
                      <td className="py-3 pr-4">{(row.aiRoic * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4">{row.paybackPeriod.toFixed(1)} yrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="AI Payback Tracker" description={dashboard.paybackDetail} badge={<SignalBadge signal={dashboard.paybackSignal} />}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="periodId" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="aiAnnualRevenueGrowth" stroke="#21486f" strokeWidth={3} name="AI revenue growth" />
                  <Line type="monotone" dataKey="aiCapex" stroke="#b91c1c" strokeWidth={2.5} name="AI CapEx" />
                  <Line type="monotone" dataKey="aiDepreciation" stroke="#d97706" strokeWidth={2.5} name="AI depreciation" />
                  <Line type="monotone" dataKey="cloudGrossMargin" stroke="#0f8f6f" strokeWidth={3} name="Cloud margin" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {capexPanel}
        </Tabs.Content>

        <Tabs.Content value="copilot" className="mt-6 space-y-6">
          <SectionCard title="Copilot and Agent Platform" description="Track the transition from AI infrastructure provider to enterprise AI operating system.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="copilotSeats" stroke="#21486f" strokeWidth={3} name="Copilot paid seats (M)" />
                    <Line type="monotone" dataKey="copilotStudioUsage" stroke="#0f8f6f" strokeWidth={3} name="Copilot Studio usage" />
                    <Line type="monotone" dataKey="agentCreations" stroke="#7c3aed" strokeWidth={2.5} name="Agent creations (M)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="copilotRevenue" stackId="mix" fill="#21486f" name="M365 Copilot" />
                    <Bar dataKey="githubCopilotRevenue" stackId="mix" fill="#0f8f6f" name="GitHub Copilot" />
                    <Bar dataKey="copilotStudioRevenue" stackId="mix" fill="#7c3aed" name="Copilot Studio" />
                    <Bar dataKey="aiAgentRevenue" stackId="mix" fill="#d97706" name="AI agents" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Platform Transition Tracker" description="This is the strategic leap from AI infrastructure provider to enterprise AI operating system." badge={<Sparkles className="h-5 w-5 text-sky-600" />}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Copilot revenue contribution", value: dashboard.selectedRow.copilotRevenue, unit: "B", detail: "Higher Copilot contribution means AI is moving into software economics." },
                { label: "Copilot ARPU", value: assumptions.copilotArpu, unit: "", detail: "Higher ARPU supports durable SaaS margins and enterprise workflow density." },
                { label: "Agent platform growth", value: assumptions.agentPlatformGrowth * 100, unit: "%", detail: "Agent creation and usage show whether Microsoft is building a new platform layer." },
                { label: "Workflow adoption", value: dashboard.selectedRow.enterpriseWorkflowAdoption * 100, unit: "%", detail: "Enterprise workflow adoption is the clearest signal that Copilot is moving from novelty to operating system." },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">
                    {item.value.toFixed(1)}
                    {item.unit}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {copilotPanel}
        </Tabs.Content>

        <Tabs.Content value="ai-roic" className="mt-6 space-y-6">
          <SectionCard title="AI ROIC Dashboard" description="The core value-creation question is whether AI incremental returns are inflecting above Microsoft’s cost of capital.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard metric={{ key: "ai-op", label: "AI Incremental Op Profit ($B)", value: dashboard.selectedRow.aiOperatingProfit, format: "number", description: "Incremental AI operating profit after depreciation and infrastructure cost.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-ic", label: "AI Invested Capital ($B)", value: dashboard.selectedRow.aiInvestedCapital, format: "number", description: "Capital committed to AI infrastructure and related platform assets.", badge: "Actual" }} />
              <MetricCard metric={{ key: "ai-roic", label: "AI ROIC", value: dashboard.selectedRow.aiRoicEstimate, format: "percent", description: "Incremental AI return on invested capital.", badge: "Derived" }} />
              <MetricCard metric={{ key: "blended-roic", label: "Blended Company ROIC", value: dashboard.selectedRow.blendedRoic, format: "percent", description: "The total company ROIC after absorbing AI investment intensity.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="ROIC Trajectory" description="Monitor AI ROIC vs WACC and whether AI revenue is outrunning the depreciation wave.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="aiRoicEstimate" stroke="#21486f" strokeWidth={3} name="AI ROIC" />
                    <Line type="monotone" dataKey="coreRoic" stroke="#0f8f6f" strokeWidth={3} name="Core Microsoft ROIC" />
                    <Line type="monotone" dataKey="blendedRoic" stroke="#7c3aed" strokeWidth={2.5} name="Blended ROIC" />
                    <Line type="monotone" dataKey="wacc" stroke="#b91c1c" strokeWidth={2.5} name="WACC" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aiOperatingProfit" fill="#21486f" name="AI op profit" />
                    <Bar dataKey="aiDepreciation" fill="#d97706" name="AI depreciation" />
                    <Bar dataKey="aiInvestedCapital" fill="#0f8f6f" name="AI invested capital" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          {capexPanel}
        </Tabs.Content>

        <Tabs.Content value="fcf" className="mt-6 space-y-6">
          <SectionCard title="FCF Offset Model" description="The key cash question is whether AI is still diluting FCF or has become neutral to accretive.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "ocf", label: "Operating Cash Flow ($B)", value: dashboard.selectedRow.operatingCashFlow, format: "number", description: "Operating cash flow before AI CapEx and capital deployment.", badge: "Actual" }} />
              <MetricCard metric={{ key: "fcf", label: "FCF ($B)", value: dashboard.selectedRow.fcf, format: "number", description: "Reported free cash flow after the AI investment cycle.", badge: "Actual" }} />
              <MetricCard metric={{ key: "adj-fcf", label: "AI-Adjusted FCF ($B)", value: dashboard.selectedRow.aiAdjustedFcf, format: "number", description: "Core FCF minus AI CapEx plus incremental AI operating profit.", badge: "Derived" }} />
              <MetricCard metric={{ key: "sbc", label: "SBC ($B)", value: dashboard.selectedRow.sbc, format: "number", description: "Useful context for equity-based compensation and cash conversion quality.", badge: "Actual" }} />
              <MetricCard metric={{ key: "yield", label: "AI-Adjusted FCF Yield", value: dashboard.selectedRow.aiAdjustedFcf / (assumptions.currentPrice * dashboard.selectedRow.sharesOutstanding), format: "percent", description: "Cash yield after adjusting for incremental AI investment and profit.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="Cash Conversion Through the AI Build" description="The free cash flow test is whether Microsoft can stabilize margin and conversion before the market loses patience with CapEx intensity.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="periodId" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="operatingCashFlow" stroke="#21486f" strokeWidth={3} name="Operating cash flow" />
                    <Line type="monotone" dataKey="fcf" stroke="#0f8f6f" strokeWidth={3} name="FCF" />
                    <Line type="monotone" dataKey="aiAdjustedFcf" stroke="#7c3aed" strokeWidth={2.5} name="AI-adjusted FCF" />
                    <Line type="monotone" dataKey="aiCapex" stroke="#b91c1c" strokeWidth={2.5} name="AI CapEx" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <WaterfallChart rows={dashboard.fcfOffsetRows} formatter={(value) => `${value.toFixed(1)}B`} />
            </div>
          </SectionCard>

          {capexPanel}
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          <SectionCard title="AI-Aware Valuation" description="Value Microsoft on earnings power, FCF resilience, and incremental AI value creation." badge={<Cpu className="h-5 w-5 text-sky-600" />}>
            <p className="text-sm leading-6 text-slate-600">
              This valuation engine weights forward P/E, FCF yield, AI-adjusted DCF, and an AI value creation model. The important variables are Azure AI monetization, Copilot adoption, cloud margin stabilization, AI CapEx discipline, and whether AI ROIC clears WACC.
            </p>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={module.ticker}
            config={module.valuationConfig}
            data={msftData}
            scenario={scenario}
            currency="USD"
            values={pickMsftValuationAssumptions(assumptions)}
            onValuesChange={(next) => {
              setAssumptions((current) => ({ ...current, ...(next as Partial<MsftAssumptions>) }));
              onDataSourceChange("manual");
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="scenario-lab" className="mt-6 space-y-6">
          <SectionCard title="Scenario Lab" description="Institutional stress-testing engine linking AI revenue, cost, ROIC, cloud margin, FCF, and valuation.">
            <div className="grid gap-4 md:grid-cols-3">
              {scenarioValuations.map(({ scenario: preset, result, model }) => (
                <div key={preset} className={`rounded-3xl border p-5 ${scenario === preset ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{preset}</p>
                    <SignalBadge signal={model.scenarioLab.phase.signal} />
                  </div>
                  <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">${model.scenarioLab.valuation.targetPrice3Y.toFixed(1)}</p>
                  <p className={`mt-2 text-sm font-medium ${result.upsideDownside >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{(result.upsideDownside * 100).toFixed(1)}% upside/downside</p>
                  <p className="mt-2 text-sm text-slate-500">Expected shareholder CAGR: {(model.scenarioLab.valuation.expectedShareholderCagr * 100).toFixed(1)}%</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{model.scenarioLab.phase.phase}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Scenario Chain" description="This is the transparent AI economics chain from actual data and consensus into derived value creation.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard metric={{ key: "ai-rev", label: "AI Revenue", value: dashboard.scenarioLab.aiRevenue.currentAnnualizedRevenue, format: "number", description: "Derived from Azure AI, Azure OpenAI, Copilot, GitHub Copilot, and agents.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-gp", label: "AI Gross Profit", value: dashboard.scenarioLab.aiCost.current.aiGrossProfit, format: "number", description: "AI revenue less inference, model, power, and networking cost.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-op", label: "AI Operating Profit", value: dashboard.scenarioLab.aiCost.current.aiOperatingProfit, format: "number", description: "AI gross profit less depreciation and AI opex.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-roic", label: "Blended AI ROIC", value: dashboard.scenarioLab.aiRoic.current.blendedAiRoic, format: "percent", description: "After-tax AI operating profit divided by AI invested capital.", badge: "Derived" }} />
              <MetricCard metric={{ key: "ai-fcf", label: "AI-Adjusted FCF Margin", value: dashboard.scenarioLab.fcfOffset.current.aiAdjustedFcfMargin, format: "percent", description: "Core FCF minus incremental AI CapEx plus incremental AI operating profit.", badge: "Derived" }} />
            </div>
          </SectionCard>

          <SectionCard title="3-Year Operating Model" description="3-year forward operating view under the selected scenario.">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.scenarioLab.aiRevenue.years.map((row, index) => ({
                    year: row.year,
                    aiRevenue: row.totalAiRevenue,
                    aiOperatingProfit: dashboard.scenarioLab.aiCost.years[index]?.aiOperatingProfit ?? 0,
                    blendedAiRoic: dashboard.scenarioLab.aiRoic.years[index]?.blendedAiRoic ?? 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="aiRevenue" stroke="#21486f" strokeWidth={3} name="AI revenue" />
                    <Line type="monotone" dataKey="aiOperatingProfit" stroke="#0f8f6f" strokeWidth={3} name="AI operating profit" />
                    <Line type="monotone" dataKey="blendedAiRoic" stroke="#7c3aed" strokeWidth={2.5} name="Blended AI ROIC" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.scenarioLab.cloudMargin.years.map((row, index) => ({
                    year: row.year,
                    cloudMargin: row.currentCloudMargin,
                    aiAdjustedFcfMargin: dashboard.scenarioLab.fcfOffset.years[index]?.aiAdjustedFcfMargin ?? 0,
                    aiCapex: dashboard.scenarioLab.fcfOffset.years[index]?.incrementalAiCapex ?? 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cloudMargin" stroke="#21486f" strokeWidth={3} name="Cloud margin" />
                    <Line type="monotone" dataKey="aiAdjustedFcfMargin" stroke="#0f8f6f" strokeWidth={3} name="AI-adjusted FCF margin" />
                    <Line type="monotone" dataKey="aiCapex" stroke="#b91c1c" strokeWidth={2.5} name="AI CapEx" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Why This Scenario Value Changed" description="Attribution of the selected scenario’s valuation change.">
            <div className="grid gap-4 md:grid-cols-3">
              {dashboard.scenarioLab.valuation.whyChanged.map((item) => (
                <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className={`mt-2 text-3xl font-semibold tracking-tight ${item.impact >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{item.impact >= 0 ? "+" : ""}${item.impact.toFixed(1)}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <details className="rounded-3xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer list-none font-semibold text-ink">Model Logic</summary>
            <p className="mt-3 text-sm leading-6 text-slate-600">Actual data anchors and consensus estimates feed the AI revenue engine, which drives the cost model, AI ROIC model, cloud margin path, FCF offset, and final valuation.</p>
            <div className="mt-5 grid gap-4 xl:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Actual Data</p>
                <div className="mt-4 space-y-3">
                  {dashboard.scenarioLab.anchors.filter((item) => item.source === "actual").map((item) => (
                    <div key={item.label}>
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Consensus</p>
                <div className="mt-4 space-y-3">
                  {dashboard.scenarioLab.anchors.filter((item) => item.source === "consensus").map((item) => (
                    <div key={item.label}>
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Derived AI Economics</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p>AI Revenue: ${dashboard.scenarioLab.aiRevenue.currentAnnualizedRevenue.toFixed(1)}B</p>
                  <p>AI Operating Profit: ${dashboard.scenarioLab.aiCost.current.aiOperatingProfit.toFixed(1)}B</p>
                  <p>Infrastructure AI ROIC: {(dashboard.scenarioLab.aiRoic.current.infrastructureAiRoic * 100).toFixed(1)}%</p>
                  <p>Blended AI ROIC: {(dashboard.scenarioLab.aiRoic.current.blendedAiRoic * 100).toFixed(1)}%</p>
                  <p>Software AI ROIC: {(dashboard.scenarioLab.aiRoic.current.softwareAiRoic * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">Valuation</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p>AI-Adjusted Fair Value: ${dashboard.scenarioLab.valuation.aiAdjustedFairValue.toFixed(1)}</p>
                  <p>AI Value Contribution: ${dashboard.scenarioLab.valuation.aiValueContribution.toFixed(1)}</p>
                  <p>3Y Target Price: ${dashboard.scenarioLab.valuation.targetPrice3Y.toFixed(1)}</p>
                  <p>Expected Shareholder CAGR: {(dashboard.scenarioLab.valuation.expectedShareholderCagr * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </details>

          <MsftAssumptionsPanel values={assumptions} onChange={handleAssumptionChange} onReset={handleReset} activeScenario={activeAssumptionState} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
