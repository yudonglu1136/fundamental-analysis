import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionCard } from "../../../components/shared/SectionCard";
import type { PltrExecutionRequirement, PltrValuationAssumptions } from "../model";
import { InsightBox, KpiTile, SourceNote, formatPct, formatUsd, type PltrComponentProps } from "./PLTRPrimitives";

type ValuationDashboardProps = PltrComponentProps & {
  values: PltrValuationAssumptions;
  onValuesChange: (next: Record<string, number>) => void;
};

function formatMultiple(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(1)}x`;
}

function formatShares(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}M`;
}

const warningTone: Record<PltrExecutionRequirement, string> = {
  "valuation supported by fundamentals": "border-emerald-200 bg-emerald-50 text-emerald-900",
  "valuation requires premium execution": "border-amber-200 bg-amber-50 text-amber-900",
  "valuation requires near-perfect execution": "border-orange-200 bg-orange-50 text-orange-900",
  "valuation requires speculative hyper-growth": "border-rose-200 bg-rose-50 text-rose-900",
};

function ExecutionBadge({ label }: { label: PltrExecutionRequirement }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${warningTone[label]}`}>{label}</span>;
}

function MarketInput({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600">
      {label}
      <input
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink"
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function ValuationDashboard({ dashboard, values, onValuesChange }: ValuationDashboardProps) {
  const methodRows = dashboard.valuation.methods.map((method) => ({
    method: method.label,
    fairValue: method.fairValue,
  }));
  const reverse = dashboard.valuation.reverseDcf;
  const scenarioRows = reverse.expectationScenarios.map((scenario) => ({
    scenario: scenario.label,
    expectedCagr5Y: scenario.expectedCagr5Y,
    fairValuePerShare: scenario.fairValuePerShare,
  }));
  const updateAssumption = (key: keyof PltrValuationAssumptions, value: number) => {
    onValuesChange({
      ...values,
      [key]: value,
    });
  };

  return (
    <SectionCard
      title="Valuation Dashboard"
      description="Investor question: what growth, margin, and dilution assumptions are already priced into PLTR?"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <MarketInput
          label="Current Market Price"
          value={values.currentPrice}
          min={0}
          step={0.5}
          onChange={(value) => updateAssumption("currentPrice", value)}
        />
        <MarketInput
          label="Diluted Share Count (M)"
          value={values.dilutedShares}
          min={1}
          step={5}
          onChange={(value) => updateAssumption("dilutedShares", value)}
        />
        <MarketInput
          label="Net Cash ($M)"
          value={values.netCash}
          min={-20000}
          step={50}
          onChange={(value) => updateAssumption("netCash", value)}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Selected Fair Value" value={formatUsd(dashboard.valuation.selectedFairValue, "")} text="Equal-weight triangulation of five methods." />
        <KpiTile label="Current Price" value={formatUsd(reverse.currentPrice, "")} text="Editable assumption. Yfinance snapshot is only a market cross-check." tone="warning" />
        <KpiTile label="Current EV" value={formatUsd(reverse.currentEnterpriseValue)} text="Current price times diluted shares, less net cash." />
        <KpiTile label="Execution Read" value={formatMultiple(reverse.currentEvToRevenue)} text={reverse.marketImpliedExecutionRequirement} tone="warning" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Current EV / Revenue" value={formatMultiple(reverse.currentEvToRevenue)} text="Uses selected FY revenue base." tone="warning" />
        <KpiTile label="Current EV / FCF" value={formatMultiple(reverse.currentEvToFcf)} text="Uses selected revenue base and FCF margin." tone="warning" />
        <KpiTile label="Dilution Drag" value={formatPct(reverse.impliedDilutionDrag)} text="Five-year per-share value drag from selected dilution CAGR." tone="warning" />
        <KpiTile label="Diluted Shares" value={formatShares(reverse.dilutedShares)} text="Editable share-count input used in market cap and per-share math." />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
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
        <InsightBox title="Reverse DCF and Implied Expectations">
          <div className="mb-3">
            <ExecutionBadge label={reverse.marketImpliedExecutionRequirement} />
          </div>
          <p>Implied 5-year revenue CAGR required: {formatPct(reverse.requiredRevenueCagr)}</p>
          <p>Implied terminal FCF margin required: {formatPct(reverse.requiredFcfMargin)}</p>
          <p>Implied exit multiple required: {formatMultiple(reverse.requiredTerminalMultiple)}</p>
          <p>Implied terminal revenue: {formatUsd(reverse.impliedTerminalRevenue)}</p>
          <p>Implied terminal FCF / share: {formatUsd(reverse.impliedTerminalFcfPerShare, "")}</p>
          <div className="mt-3 space-y-2">
            {reverse.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </InsightBox>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scenarioRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="scenario" />
              <YAxis yAxisId="left" tickFormatter={(value) => formatPct(Number(value))} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip
                formatter={(value, name) =>
                  name === "5Y expected CAGR" ? formatPct(Number(value)) : formatUsd(Number(value), "")
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="expectedCagr5Y" name="5Y expected CAGR" fill="#0f766e" />
              <Bar yAxisId="right" dataKey="fairValuePerShare" name="5Y fair value / share" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-3">
          {([
            "valuation supported by fundamentals",
            "valuation requires premium execution",
            "valuation requires near-perfect execution",
            "valuation requires speculative hyper-growth",
          ] as PltrExecutionRequirement[]).map((label) => (
            <div key={label} className={`rounded-lg border p-4 text-sm leading-6 ${warningTone[label]}`}>
              <p className="font-semibold">{label}</p>
              <p>
                {label === reverse.marketImpliedExecutionRequirement
                  ? "Current implied expectations land here under the selected price, share count, net cash, and model assumptions."
                  : "Included as a visual threshold for judging how demanding the current valuation is."}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.3fr_repeat(9,minmax(110px,1fr))] gap-0 overflow-x-auto text-sm">
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Scenario</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Revenue CAGR</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Terminal Revenue</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">FCF Margin</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">SBC Normalized</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Share CAGR</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Terminal FCF / Share</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Exit Multiple</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">Fair Value / Share</div>
          <div className="bg-slate-50 p-3 font-semibold text-slate-600">3Y / 5Y CAGR</div>
          {reverse.expectationScenarios.map((scenario) => (
            <div key={scenario.key} className="contents">
              <div className="border-t border-slate-100 p-3">
                <p className="font-semibold text-ink">{scenario.label}</p>
                <div className="mt-2">
                  <ExecutionBadge label={scenario.executionRequirement} />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{scenario.notes}</p>
              </div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatPct(scenario.revenueCagr)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatUsd(scenario.terminalRevenue)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatPct(scenario.fcfMargin)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatPct(scenario.normalizedSbcAsPctRevenue)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatPct(scenario.dilutedShareCountCagr)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatUsd(scenario.terminalFcfPerShare, "")}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatMultiple(scenario.exitMultiple)}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">{formatUsd(scenario.fairValuePerShare, "")}</div>
              <div className="border-t border-slate-100 p-3 text-slate-600">
                {formatPct(scenario.expectedCagr3Y)} / {formatPct(scenario.expectedCagr5Y)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {dashboard.valuation.methods.map((method) => (
          <InsightBox key={method.key} title={method.label}>
            <p className="text-xl font-semibold text-ink">{formatUsd(method.fairValue, "")}</p>
            <p className="mt-2">{method.description}</p>
          </InsightBox>
        ))}
      </div>
      <div className="mt-4">
        <SourceNote>
          Valuation is reproducible from editable assumptions. The yfinance snapshot is retained only as a market cross-check; current price, diluted share count, and net cash can be changed here or in the assumptions panel below. Research-only AIP, ontology, and transcript scores are excluded unless an analyst explicitly changes model assumptions.
        </SourceNote>
      </div>
    </SectionCard>
  );
}
