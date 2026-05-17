import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import { BulletList, InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type IsrgComponentProps } from "./ISRGPrimitives";

export function ValuationLab({ dashboard }: IsrgComponentProps) {
  const methodRows = dashboard.valuation.methods.map((method) => ({
    method: method.label,
    fairValue: method.fairValue,
  }));
  const scenarioRows = dashboard.scenarios.map((scenario) => ({
    scenario: scenario.scenario,
    fairValue: scenario.fairValue,
    revenueCagr: scenario.revenueCagr * 100,
  }));
  return (
    <SectionCard title="Valuation Lab" description="Triangulation is built around procedure DCF, segment revenue quality, and sanity-check multiples. It is designed to show what must be true, not just a target price.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Selected Fair Value" value={formatUsd(dashboard.valuation.selectedFairValue, "")} text="Weighted procedure DCF, segment value, P/E, and FCF yield." />
        <KpiTile label="Procedure DCF" value={formatUsd(dashboard.valuation.procedureDcf.fairValue, "")} text="Installed base x utilization x revenue/procedure." tone="positive" />
        <KpiTile label="Segment Value" value={formatUsd(dashboard.valuation.segmentValuation.fairValue, "")} text="I&A, systems, services, Ion/SP optionality." />
        <KpiTile label="Required Procedure CAGR" value={formatPct(dashboard.valuation.reverseDcf.requiredProcedureCagr)} text="Reverse DCF at current price." tone="warning" />
        <KpiTile label="Required Utilization Growth" value={formatPct(dashboard.valuation.reverseDcf.requiredUtilizationGrowth)} text="If installed-base growth alone is not enough." tone="warning" />
        <KpiTile label="Implied Forward P/E" value={`${dashboard.valuation.multipleSanityCheck.impliedForwardPe.toFixed(1)}x`} text="Sanity check only." />
        <KpiTile label="Implied FCF Yield" value={formatPct(dashboard.valuation.multipleSanityCheck.impliedFcfYield)} text="Forward FCF/share over price." />
        <KpiTile label="ROIC-WACC Spread" value={formatPct(dashboard.valuation.multipleSanityCheck.roicWaccSpread)} text="Simplified after-tax operating return spread." />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={methodRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="method" />
              <YAxis />
              <Tooltip formatter={(value) => formatUsd(Number(value), "")} />
              <Legend />
              <Bar dataKey="fairValue" name="Fair value / share" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scenarioRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="scenario" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="fairValue" name="Fair value / share" fill="#0f766e" />
              <Bar yAxisId="right" dataKey="revenueCagr" name="Revenue CAGR" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {dashboard.scenarios.map((scenario) => (
          <InsightBox key={scenario.scenario} title={`${scenario.scenario} Case`}>
            <p>Revenue CAGR: {formatPct(scenario.revenueCagr)}</p>
            <p>Operating margin: {formatPct(scenario.operatingMargin)}</p>
            <p>FCF margin: {formatPct(scenario.fcfMargin)}</p>
            <p>EPS CAGR: {formatPct(scenario.epsCagr)}</p>
            <p>Fair value: {formatUsd(scenario.fairValue, "")}</p>
            <p>Implied return: {formatPct(scenario.impliedReturn)}</p>
            <p className="mt-2">{scenario.summary}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InsightBox title="Procedure DCF Formula">
          <p>{dashboard.valuation.procedureDcf.formula}</p>
        </InsightBox>
        <InsightBox title="Reverse DCF Notes">
          <BulletList items={dashboard.valuation.reverseDcf.notes} />
        </InsightBox>
      </div>
      <div className="mt-4">
        <SourceNote>Multiple sanity checks are intentionally secondary. A premium P/E is not allowed to substitute for procedure, installed-base, utilization, margin, and optionality assumptions.</SourceNote>
      </div>
    </SectionCard>
  );
}
