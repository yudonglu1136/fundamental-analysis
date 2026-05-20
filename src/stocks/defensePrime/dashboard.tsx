import { useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataQualityBadge } from "../../components/shared/DataQualityBadge";
import { InteractiveValuationDashboard } from "../../components/shared/InteractiveValuationDashboard";
import { MetricCard } from "../../components/shared/MetricCard";
import { SectionCard } from "../../components/shared/SectionCard";
import type { StockDashboardProps } from "../types";
import { RtxBackendValuationSections } from "../rtx/RtxBackendPanels";
import { buildDefenseDashboardData } from "./calculations";
import type { DefenseDataset, DefenseProgram } from "./model";

const COLORS = ["#0f766e", "#7c3aed", "#b45309", "#2563eb", "#be123c", "#475569", "#15803d"];

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function usdm(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}m`;
}

function usdb(value: number) {
  return `$${(value / 1_000).toFixed(1)}bn`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function multiple(value: number) {
  return `${value.toFixed(2)}x`;
}

function scoreLabel(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

export function DefensePrimeDashboard({ module, scenario }: StockDashboardProps) {
  const [tab, setTab] = useState(module.tabs[0]?.value ?? "executive");
  const data = module.data as DefenseDataset;
  const dashboard = useMemo(() => buildDefenseDashboardData(data, scenario), [data, scenario]);
  const [selectedEventIndex, setSelectedEventIndex] = useState(Math.max(data.reportingEvents.length - 1, 0));
  const [programSegment, setProgramSegment] = useState("All");
  const [programStage, setProgramStage] = useState<DefenseProgram["stage"] | "All">("All");
  const [programRisk, setProgramRisk] = useState("All");

  const selectedEvent = data.reportingEvents[Math.min(selectedEventIndex, data.reportingEvents.length - 1)] ?? data.reportingEvents[0];
  const segmentRows = dashboard.segmentRows.map((segment) => ({
    segment: segment.name,
    sales: segment.sales,
    profit: segment.operatingProfit,
    margin: segment.margin * 100,
    quality: segment.qualityScore,
    backlogCoverage: segment.backlogCoverage ?? 0,
  }));
  const backlogRows = data.periods.map((period) => {
    const revenueRunRate = period.periodType === "Q" ? period.sales * 4 : period.sales;
    return {
      period: period.label,
      sales: period.sales,
      backlog: period.backlog,
      orderIntake: period.orderIntake ?? 0,
      coverage: period.backlog / revenueRunRate,
      bookToBill: period.orderIntake ? period.orderIntake / period.sales : 0,
    };
  });
  const programSegments = ["All", ...Array.from(new Set(data.programs.map((program) => program.segment)))];
  const programStages: Array<DefenseProgram["stage"] | "All"> = ["All", "mature", "ramping", "future option"];
  const programRisks = ["All", "Low", "Medium", "High"];
  const filteredPrograms = data.programs.filter((program) => {
    const segmentMatch = programSegment === "All" || program.segment === programSegment;
    const stageMatch = programStage === "All" || program.stage === programStage;
    const riskMatch = programRisk === "All" || scoreLabel(program.riskScore) === programRisk;
    return segmentMatch && stageMatch && riskMatch;
  });
  const latestBookToBill = dashboard.latest.orderIntake ? dashboard.latest.orderIntake / dashboard.latest.sales : 0;
  const fairValue = dashboard.valuation.recommendedFairValue ?? dashboard.valuation.blendedFairValue ?? 0;

  return (
    <div className="space-y-6">
      <SectionCard
        title={`${data.company} Defense Research Cockpit`}
        description="Official actuals, management guidance, forecast assumptions, research-only program notes, and external market data are kept in separate layers."
        badge={<DataQualityBadge badge="Actual" />}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <ScoreBlock label="Recommended Fair Value" value={usd(fairValue)} note={`${pct(dashboard.valuation.upsideDownside ?? 0)} vs current price`} />
          <ScoreBlock label="Current Price" value={usd(data.marketData.price)} note={`${data.marketData.priceDate} external market snapshot`} />
          <ScoreBlock label="Backlog" value={usdb(dashboard.latest.backlog)} note={`${multiple(dashboard.latest.backlog / dashboard.latest.sales)} annual sales coverage`} />
          <ScoreBlock label="Book-to-Bill" value={latestBookToBill ? multiple(latestBookToBill) : "N/A"} note={dashboard.latest.orderIntakeSourceStatus === "derived" ? "Derived from backlog movement" : "Official or disclosed order-intake proxy"} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <InsightPanel title="Investment Thesis" text={data.investmentThesis} />
          <InsightPanel title="Key Debate" text={data.keyDebate} />
          <InsightPanel title="What Market May Miss" text={data.marketMayMiss} />
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.summary.map((summaryMetric) => (
          <MetricCard key={summaryMetric.key} metric={summaryMetric} currency="USD" />
        ))}
      </div>

      <SectionCard title="Data Boundary" description="Qualitative program, geopolitical, and risk notes explain scenarios. They do not enter valuation unless mapped through explicit numeric assumptions.">
        <div className="grid gap-4 lg:grid-cols-3">
          <BulletPanel title="Official Actuals" items={[
            "Sales, adjusted operating profit, EPS, cash flow, capital expenditures, backlog, and segment metrics from company releases.",
            "Backlog is treated as a visibility indicator, not a guarantee of margin or cash conversion.",
          ]} />
          <BulletPanel title="Management Guidance" items={[
            `${data.guidance.year} sales, EPS, and FCF ranges are sourced from company guidance.`,
            "Guidance is shown separately from analyst forecast assumptions and market data.",
          ]} />
          <BulletPanel title="Current Data Gaps" items={data.dataGaps} />
        </div>
      </SectionCard>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {module.tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 data-[state=active]:bg-ink data-[state=active]:text-white"
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="executive" className="mt-6 space-y-6">
          <SectionCard title="Executive Snapshot" description="A PM-ready snapshot across price, fair value, backlog, guidance, FCF, and capital returns.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Market Cap" value={usdb(data.marketData.marketCap)} note="External market-data source" />
              <ScoreBlock label="Enterprise Value" value={data.marketData.enterpriseValue ? usdb(data.marketData.enterpriseValue) : "N/A"} note="External or derived market-data source" />
              <ScoreBlock label="FCF Yield" value={pct(dashboard.latest.freeCashFlow / data.marketData.marketCap)} note="Latest annual FCF / market cap" />
              <ScoreBlock label="Dividend Yield" value={data.marketData.dividendYield ? pct(data.marketData.dividendYield) : "N/A"} note="External market-data source" />
              <ScoreBlock label="Guided Sales" value={`${usdb(data.guidance.salesLow)}-${usdb(data.guidance.salesHigh)}`} note={`${data.guidance.year} management guidance`} />
              <ScoreBlock label="Guided EPS" value={`${usd(data.guidance.epsLow)}-${usd(data.guidance.epsHigh)}`} note={`${data.guidance.year} management guidance`} />
              <ScoreBlock label="Guided FCF" value={`${usdb(data.guidance.fcfLow)}-${usdb(data.guidance.fcfHigh)}`} note={`${data.guidance.year} management guidance`} />
              <ScoreBlock label="Latest Period" value={data.latestReportingPeriod} note="Latest official reporting period in the model" />
            </div>
          </SectionCard>

          <SectionCard title="Defense-Cycle Scenario Lab" description="Scenarios translate policy and procurement conditions into explicit valuation assumptions rather than using news sentiment directly.">
            <div className="grid gap-4 lg:grid-cols-3">
              {data.scenarios.map((caseItem) => (
                <div key={caseItem.scenario} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{caseItem.scenario}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{pct(caseItem.probability)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{caseItem.narrative}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <MiniStat label="Sales CAGR" value={pct(caseItem.revenueCagr)} />
                    <MiniStat label="Margin" value={pct(caseItem.operatingMargin)} />
                    <MiniStat label="WACC" value={pct(caseItem.wacc)} />
                    <MiniStat label="P/E" value={`${caseItem.targetPe.toFixed(1)}x`} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="segments" className="mt-6 space-y-6">
          <SectionCard title="Segment Intelligence" description="Segments are scored on margin, growth, backlog visibility where disclosed, strategic role, and program risk. USD millions unless noted.">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Sales and Operating Profit by Segment">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={86} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(Number(value))} />
                    <Legend />
                    <Bar dataKey="sales" fill="#0f766e" name="Sales" />
                    <Bar dataKey="profit" fill="#7c3aed" name="Operating profit" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Margin and Quality Score">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={segmentRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="segment" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={86} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="margin" fill="#b45309" name="Margin %" />
                    <Line yAxisId="right" type="monotone" dataKey="quality" stroke="#2563eb" strokeWidth={2} name="Quality score" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Segment</th>
                    <th className="py-3 pr-4">Sales</th>
                    <th className="py-3 pr-4">Operating Profit</th>
                    <th className="py-3 pr-4">Margin</th>
                    <th className="py-3 pr-4">Backlog Coverage</th>
                    <th className="py-3 pr-4">Quality</th>
                    <th className="py-3 pr-4">Strategic Role</th>
                    <th className="py-3 pr-4">Key Programs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.segmentRows.map((segment) => (
                    <tr key={segment.id} className="align-top">
                      <td className="py-3 pr-4 font-medium text-ink">{segment.name}</td>
                      <td className="py-3 pr-4 text-slate-700">{usdm(segment.sales)}</td>
                      <td className="py-3 pr-4 text-slate-700">{usdm(segment.operatingProfit)}</td>
                      <td className="py-3 pr-4 text-slate-700">{pct(segment.margin)}</td>
                      <td className="py-3 pr-4 text-slate-700">{segment.backlogCoverage ? multiple(segment.backlogCoverage) : "Not disclosed"}</td>
                      <td className="py-3 pr-4 text-slate-700">{segment.qualityScore}/100</td>
                      <td className="max-w-xs py-3 pr-4 text-slate-600">{segment.strategicRole}</td>
                      <td className="max-w-xs py-3 pr-4 text-slate-600">{segment.keyPrograms.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="backlog" className="mt-6 space-y-6">
          <SectionCard title="Backlog & Order Visibility" description="The cockpit treats backlog as the core revenue-visibility engine, while calling out conversion, funding, cancellation, and margin risks.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Backlog Coverage" value={multiple(dashboard.latest.backlog / dashboard.latest.sales)} note="Backlog / latest annual sales" />
              <ScoreBlock label="Defense Backlog" value={dashboard.latest.backlogDefense ? usdb(dashboard.latest.backlogDefense) : "N/A"} note="Disclosed defense backlog where available" />
              <ScoreBlock label="Commercial Backlog" value={dashboard.latest.backlogCommercial ? usdb(dashboard.latest.backlogCommercial) : "N/A"} note="Disclosed commercial backlog where available" />
              <ScoreBlock label="Visibility Score" value={`${Math.round(Math.min(dashboard.latest.backlog / dashboard.latest.sales / 3, 1) * 100)}`} note="Research score from backlog coverage" />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Backlog, Sales, and Order Intake">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={backlogRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => usdm(Number(value))} />
                    <Legend />
                    <Bar dataKey="backlog" fill="#0f766e" name="Backlog" />
                    <Bar dataKey="sales" fill="#7c3aed" name="Sales" />
                    <Bar dataKey="orderIntake" fill="#b45309" name="Order intake / derived awards" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
              <ChartPanel title="Coverage and Book-to-Bill">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={backlogRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="coverage" stroke="#0f766e" strokeWidth={2} name="Backlog coverage" />
                    <Line type="monotone" dataKey="bookToBill" stroke="#b45309" strokeWidth={2} name="Book-to-bill" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InsightPanel title="What Backlog Means" text="Backlog provides multi-year revenue visibility and procurement durability, but it does not automatically guarantee timing, margin, or cash conversion." />
              <InsightPanel title="What To Watch" text="Track conversion speed, contract mix, fixed-price exposure, customer funding, supply-chain bottlenecks, and whether order intake stays above revenue." />
              <InsightPanel title="Valuation Treatment" text="The backlog layer is capped and affects valuation through durability/risk discount logic, not through a direct mechanical uplift." />
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="reporting-events" className="mt-6 space-y-6">
          <SectionCard title="Eight-Quarter Reporting Event Trend" description="Use the horizontal selector or slider to review how market focus changed across the last eight reporting events. AI summaries are research-only synthesis.">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-ink">Overall Market-Focus Trend</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{data.reportingTrendSummary}</p>
            </div>
            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-2">
                {data.reportingEvents.map((event, index) => (
                  <button
                    key={event.quarter}
                    type="button"
                    onClick={() => setSelectedEventIndex(index)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${
                      index === selectedEventIndex ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span className="block">{event.quarter}</span>
                    <span className="block font-normal opacity-80">{event.eventDate}</span>
                  </button>
                ))}
              </div>
            </div>
            <input
              aria-label="Reporting event selector"
              className="mt-4 w-full"
              type="range"
              min={0}
              max={Math.max(data.reportingEvents.length - 1, 0)}
              step={1}
              value={selectedEventIndex}
              onChange={(event) => setSelectedEventIndex(Number(event.target.value))}
            />
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ChartPanel title="Market-Focus Score by Event">
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={dashboard.reportingTrendRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Legend />
                    {dashboard.reportingThemes.map((theme, index) => (
                      <Line key={theme} type="monotone" dataKey={theme} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">{selectedEvent.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedEvent.quarter} | {selectedEvent.eventDate}</p>
                  </div>
                  <DataQualityBadge badge={selectedEvent.sourceStatus === "official_actual" ? "Actual" : "Assumption"} />
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{selectedEvent.aiSummary.summary}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {selectedEvent.keyMetrics.map((metric) => (
                    <MiniStat key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <BulletPanel title="Debate Questions" items={selectedEvent.debateQuestions} />
                  <BulletPanel title="Watch Items" items={selectedEvent.watchItems} />
                </div>
              </div>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="programs" className="mt-6 space-y-6">
          <SectionCard title="Program Matrix" description="Programs are qualitative research-only inputs. They help classify maturity, duration, margin quality, geopolitical relevance, and execution risk.">
            <div className="grid gap-3 md:grid-cols-3">
              <SelectBox label="Segment" value={programSegment} values={programSegments} onChange={setProgramSegment} />
              <SelectBox label="Maturity" value={programStage} values={programStages} onChange={(value) => setProgramStage(value as DefenseProgram["stage"] | "All")} />
              <SelectBox label="Risk" value={programRisk} values={programRisks} onChange={setProgramRisk} />
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {filteredPrograms.map((program) => {
                const source = data.sourceMap[program.sourceId];
                return (
                  <div key={program.name} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{program.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{program.stage}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{program.segment} | {program.customer} | {program.geography}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{program.strategicRelevance}</p>
                    <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
                      <MiniStat label="Maturity" value={`${program.maturityScore}/100`} />
                      <MiniStat label="Margin" value={`${program.marginQualityScore}/100`} />
                      <MiniStat label="Growth" value={`${program.growthScore}/100`} />
                      <MiniStat label="Risk" value={`${program.riskScore}/100`} />
                    </div>
                    {source ? (
                      <a className="mt-3 inline-flex text-xs font-medium text-teal-700 hover:text-teal-900" href={source.url} target="_blank" rel="noreferrer">
                        Source: {source.title}
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="valuation" className="mt-6 space-y-6">
          {data.ticker === "RTX" ? <RtxBackendValuationSections /> : null}
          <SectionCard title="Valuation Triangulation" description="DCF, FCF yield, EV/EBIT, P/E, and backlog durability are triangulated. The backlog layer is capped and risk-adjusted.">
            <div className="grid gap-4 lg:grid-cols-5">
              {dashboard.valuation.methodCards.map((card) => (
                <ScoreBlock key={card.key} label={card.label} value={usd(card.value)} note={card.description} />
              ))}
            </div>
          </SectionCard>
          <InteractiveValuationDashboard
            ticker={data.ticker}
            config={module.valuationConfig}
            data={data}
            scenario={scenario}
            currency="USD"
          />
        </Tabs.Content>

        <Tabs.Content value="risks" className="mt-6 space-y-6">
          <SectionCard title="Risk Red Team" description="Risks are ranked by probability, impact, detectability, and the valuation driver most exposed.">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <h3 className="text-sm font-semibold text-rose-900">Red-Team Verdict</h3>
              <p className="mt-2 text-sm leading-6 text-rose-800">{dashboard.riskRows[0]?.name ? `Highest weighted risk: ${dashboard.riskRows[0].name}.` : "No risk rows loaded."}</p>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Risk</th>
                    <th className="py-3 pr-4">Probability</th>
                    <th className="py-3 pr-4">Impact</th>
                    <th className="py-3 pr-4">Weighted Score</th>
                    <th className="py-3 pr-4">Driver Affected</th>
                    <th className="py-3 pr-4">Mitigation / Monitoring</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.riskRows.map((risk) => (
                    <tr key={risk.id} className="align-top">
                      <td className="py-3 pr-4 font-medium text-ink">{risk.name}</td>
                      <td className="py-3 pr-4 text-slate-700">{pct(risk.probability)}</td>
                      <td className="py-3 pr-4 text-slate-700">{pct(risk.impact)}</td>
                      <td className="py-3 pr-4 text-slate-700">{risk.weightedScore}</td>
                      <td className="py-3 pr-4 text-slate-700">{risk.affectedDriver}</td>
                      <td className="max-w-md py-3 pr-4 text-slate-600">{risk.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Tabs.Content>

        <Tabs.Content value="capital-returns" className="mt-6 space-y-6">
          <SectionCard title="Dividend & Buyback Quality" description="Capital returns are assessed against FCF, guidance, backlog durability, and balance-sheet capacity.">
            <div className="grid gap-4 lg:grid-cols-4">
              <ScoreBlock label="Dividend / Share" value={usd(data.capitalReturns.dividendPerShare)} note="Latest annual dividend basis" />
              <ScoreBlock label="FCF Payout" value={data.capitalReturns.fcfPayout ? pct(data.capitalReturns.fcfPayout) : "N/A"} note="Dividends paid / FCF where disclosed or derived" />
              <ScoreBlock label="Buybacks" value={data.capitalReturns.buybacks ? usdb(data.capitalReturns.buybacks) : "N/A"} note="Latest annual repurchases" />
              <ScoreBlock label="Policy" value={data.capitalReturns.policy} note={data.capitalReturns.sourceStatus} />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
              {data.capitalReturns.sustainabilityView}
            </div>
          </SectionCard>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function ScoreBlock({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function InsightPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function BulletPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function SelectBox({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: ReadonlyArray<string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100"
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
