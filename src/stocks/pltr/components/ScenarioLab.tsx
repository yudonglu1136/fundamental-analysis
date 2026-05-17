import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

export function ScenarioLab({ dashboard }: PltrComponentProps) {
  const rows = dashboard.scenarios.map((scenario) => ({
    scenario: scenario.scenario,
    fairValue: scenario.fairValuePerShare,
    fcfPerShare: scenario.fcfPerShare,
    expectedCagr: scenario.expectedCagr,
    revenue: scenario.revenuePath[scenario.revenuePath.length - 1]?.revenue ?? 0,
  }));
  return (
    <SectionCard
      title="Scenario Lab"
      description="Investor question: what does bear, base, bull, and speculative hyper-bull actually imply per share?"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.scenarios.map((scenario) => (
          <KpiTile
            key={scenario.scenario}
            label={scenario.scenario}
            value={formatUsd(scenario.fairValuePerShare, "")}
            text={`Expected CAGR: ${formatPct(scenario.expectedCagr)}. Exit multiple: ${scenario.exitMultiple.toFixed(1)}x.`}
            tone={scenario.scenario === "Bear" ? "negative" : scenario.scenario === "Hyper Bull" ? "warning" : "neutral"}
          />
        ))}
      </div>
      <div className="mt-5 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="scenario" />
            <YAxis />
            <Tooltip formatter={(value, name) => (String(name).includes("CAGR") ? formatPct(Number(value)) : formatUsd(Number(value), ""))} />
            <Legend />
            <Bar dataKey="fairValue" name="Fair value / share" fill="#2563eb" />
            <Bar dataKey="fcfPerShare" name="Year-five FCF / share" fill="#14b8a6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {dashboard.scenarios.map((scenario) => (
          <InsightBox key={scenario.scenario} title={scenario.scenario}>
            <p>{scenario.summary}</p>
            <p className="mt-2">Year-five revenue: {formatUsd(scenario.revenuePath[scenario.revenuePath.length - 1]?.revenue)}</p>
            <p>Operating margin: {formatPct(scenario.operatingMargin)}</p>
            <p>Diluted shares: {scenario.dilutedShares.toFixed(0)}M</p>
            <p>FCF per share: {formatUsd(scenario.fcfPerShare, "")}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>Hyper Bull is intentionally marked speculative. It is useful for framing narrative upside, not as a default underwriting case.</SourceNote>
      </div>
    </SectionCard>
  );
}
