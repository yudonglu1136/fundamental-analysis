import { useState } from "react";
import type { LegnDashboardData } from "../types";
import { LegnBadge, LegnMiniCard, LegnTable, LegnTextPanel, MiniBars, formatPct, formatUsdM, formatUsdPerAds, riskTone } from "./LegnUi";

export function CockpitPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  const valuation = dashboard.valuation;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LegnMiniCard label="Fair Value / ADS" value={formatUsdPerAds(valuation.fairValuePerAds)} subtext={`${formatPct(valuation.marginOfSafety)} vs price`} badge="Derived" />
        <LegnMiniCard label="CARVYKTI Peak NTS" value={formatUsdM(valuation.peakCarvyktiNts)} subtext="Approved label only; frontline separate" badge="Assumption" />
        <LegnMiniCard label="Core NAV / ADS" value={formatUsdPerAds(valuation.coreCarvyktiNavPerAds)} subtext="After collaboration bridge and recoupment" badge="Derived" />
        <LegnMiniCard label="Clinical Score" value={dashboard.clinical.clinicalEvidenceScore.toFixed(0)} subtext={`Safety penalty ${dashboard.clinical.safetyPenalty.toFixed(0)} pts`} badge="Derived" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <LegnTextPanel title="One-page thesis">{dashboard.thesis.onePage}</LegnTextPanel>
        <LegnTextPanel title="Top drivers">
          <ul className="space-y-1">
            {dashboard.thesis.topDrivers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </LegnTextPanel>
        <LegnTextPanel title="Next catalysts">
          <ul className="space-y-1">
            {dashboard.thesis.nextCatalysts.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </LegnTextPanel>
      </div>
      <LegnTable
        headers={["Scenario", "Fair value", "Core", "Label", "Pipeline", "Platform", "Net cash"]}
        rows={[
          [
            dashboard.scenario,
            formatUsdPerAds(valuation.fairValuePerAds),
            formatUsdPerAds(valuation.coreCarvyktiNavPerAds),
            formatUsdPerAds(valuation.labelExpansionNavPerAds),
            formatUsdPerAds(valuation.pipelineRnpvPerAds),
            formatUsdPerAds(valuation.platformOptionValuePerAds),
            formatUsdPerAds(valuation.netCashFundingAdjustmentPerAds),
          ],
        ]}
      />
    </div>
  );
}

export function CarvyktiCommercialPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  const maxNts = Math.max(...dashboard.commercial.annualForecast.map((row) => row.globalNts), 1);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <LegnTable
          headers={["Quarter", "Global NTS", "US", "OUS", "QoQ", "Flag"]}
          rows={dashboard.commercial.quarterlyNts.map((row) => [
            row.label,
            formatUsdM(row.globalNetTradeSales),
            row.usSales === undefined ? "n/a" : formatUsdM(row.usSales),
            row.ousSales === undefined ? "n/a" : formatUsdM(row.ousSales),
            row.qoqGrowth === undefined ? "n/a" : formatPct(row.qoqGrowth),
            row.preliminary ? <LegnBadge tone="amber">preliminary</LegnBadge> : <LegnBadge tone="green">reported</LegnBadge>,
          ])}
        />
        <MiniBars
          rows={dashboard.commercial.annualForecast.slice(0, 8).map((row) => ({
            label: `${row.year} NTS`,
            value: row.globalNts,
            max: maxNts,
            tone: row.globalNts < row.demandConstrainedNts ? "amber" : "green",
          }))}
        />
      </div>
      <LegnTable
        headers={["Year", "Global NTS", "US", "OUS", "2L-4L", "5L+", "Patients", "Capacity util."]}
        rows={dashboard.commercial.annualForecast.map((row) => [
          row.year,
          formatUsdM(row.globalNts),
          formatUsdM(row.usNts),
          formatUsdM(row.ousNts),
          formatUsdM(row.nts2L4L),
          formatUsdM(row.nts5LPlus),
          row.estimatedPatientsTreated.toFixed(0),
          formatPct(row.capacityUtilization),
        ])}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <LegnTable
          headers={["Patient funnel", "Value", "Conversion"]}
          rows={dashboard.commercial.patientFunnel.map((row) => [row.label, row.value.toFixed(0), formatPct(row.conversion)])}
        />
        <LegnTable
          headers={["Site funnel", "Value"]}
          rows={dashboard.commercial.siteFunnel.map((row) => [
            row.label,
            row.value < 5 ? formatPct(row.value) : row.value.toFixed(0),
          ])}
        />
      </div>
    </div>
  );
}

export function CollaborationEconomicsPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <LegnMiniCard label="NTS to LEGN revenue" value={formatPct(dashboard.collaboration.bridge.ntsToCollaborationRevenueRatio)} subtext="FY 2025 reported bridge" badge="Derived" />
        <LegnMiniCard label="Cost of collab revenue" value={formatPct(dashboard.collaboration.bridge.costOfCollaborationRevenueRatio)} subtext="FY 2025 ratio" badge="Actual" />
        <LegnMiniCard label="Advance balance" value={formatUsdM(dashboard.collaboration.bridge.fundingAdvanceBalance)} subtext="recoupment cash drag" badge="Actual" />
      </div>
      <LegnTable
        headers={["Year", "CARVYKTI NTS", "LEGN revenue", "Gross profit", "S&D", "BCMA R&D", "Recoupment", "Op profit", "Margin"]}
        rows={dashboard.collaboration.rows.map((row) => [
          row.year,
          formatUsdM(row.carvyktiNts),
          formatUsdM(row.legendCollaborationRevenue),
          formatUsdM(row.legendGrossProfitContribution),
          formatUsdM(row.sellingDistributionBurden),
          formatUsdM(row.bcmaClinicalRdBurden),
          formatUsdM(row.recoupmentOfJanssenAdvances),
          formatUsdM(row.operatingProfitContribution),
          formatPct(row.margin),
        ])}
      />
    </div>
  );
}

export function ClinicalEvidencePanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <LegnMiniCard label="Evidence score" value={dashboard.clinical.clinicalEvidenceScore.toFixed(0)} badge="Derived" />
        <LegnMiniCard label="Durability" value={dashboard.clinical.durabilityScore.toFixed(0)} badge="Derived" />
        <LegnMiniCard label="Safety penalty" value={dashboard.clinical.safetyPenalty.toFixed(0)} badge="Derived" />
        <LegnMiniCard label="Maturity" value={dashboard.clinical.evidenceMaturityScore.toFixed(0)} badge="Derived" />
      </div>
      <LegnTable
        headers={["Trial", "NCT", "Phase", "Line", "ORR", "CR/sCR", "MRD", "PFS / OS", "Impact"]}
        rows={dashboard.clinical.trials.map((trial) => [
          trial.trialName,
          trial.nct,
          trial.phase,
          trial.lineOfTherapy,
          trial.orr === undefined ? "n/a" : formatPct(trial.orr),
          trial.crScr === undefined ? "n/a" : formatPct(trial.crScr),
          trial.mrdNegativity === undefined ? "n/a" : formatPct(trial.mrdNegativity),
          `${trial.pfs ?? "pending"} / ${trial.os ?? "pending"}`,
          trial.modelImpact,
        ])}
      />
      <LegnTextPanel title="FDA safety frame">
        Boxed warning, IEC-EC, CRS, ICANS, secondary malignancy, neurotoxicity, infections and GI toxicity are modeled as adoption and label-expansion penalties rather than buried in discount rate alone.
      </LegnTextPanel>
    </div>
  );
}

export function EarningsCallPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  const [selectedId, setSelectedId] = useState(dashboard.earningsCallTrend.selectedQuarter.id);
  const selected =
    dashboard.earningsCallTrend.quarters.find((quarter) => quarter.id === selectedId) ??
    dashboard.earningsCallTrend.selectedQuarter;
  const maxIntensity = 10;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <LegnTextPanel title="Eight-quarter AI overview">
          {dashboard.earningsCallTrend.overview.aiTrendSummary}
        </LegnTextPanel>
        <LegnTextPanel title="Phase shift">
          {dashboard.earningsCallTrend.overview.phaseShift}
        </LegnTextPanel>
        <LegnTextPanel title="Debate now">
          {dashboard.earningsCallTrend.overview.investorDebateNow}
        </LegnTextPanel>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Select quarter</p>
          <LegnBadge tone="blue">{selected.label}</LegnBadge>
        </div>
        <input
          aria-label="Select earnings call quarter"
          className="w-full accent-sky-600"
          type="range"
          min={0}
          max={dashboard.earningsCallTrend.quarters.length - 1}
          step={1}
          value={dashboard.earningsCallTrend.quarters.findIndex((quarter) => quarter.id === selected.id)}
          onChange={(event) => setSelectedId(dashboard.earningsCallTrend.quarters[Number(event.target.value)]?.id ?? selected.id)}
        />
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {dashboard.earningsCallTrend.quarters.map((quarter) => (
            <button
              key={quarter.id}
              type="button"
              onClick={() => setSelectedId(quarter.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium ${
                quarter.id === selected.id ? "border-ink bg-ink text-white" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {quarter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <LegnMiniCard label="CARVYKTI NTS" value={formatUsdM(selected.carvyktiNts)} badge="Actual" />
        <LegnMiniCard label="LEGN collab revenue" value={formatUsdM(selected.collaborationRevenue)} badge="Actual" />
        <LegnMiniCard label="Cost of collab revenue" value={formatUsdM(selected.costOfCollaborationRevenue)} badge="Actual" />
        <LegnMiniCard label="Cash / investments" value={formatUsdM(selected.cashAndInvestments)} badge="Actual" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LegnTextPanel title={`${selected.label} call read-through`}>{selected.aiSummary}</LegnTextPanel>
        <LegnTable
          headers={["Analyst question cluster"]}
          rows={selected.analystQuestions.map((question) => [question])}
        />
      </div>

      <LegnTable
        headers={["Topic", "Selected AI score", "Quarter comment"]}
        rows={selected.marketFocus.map((focus) => [
          dashboard.earningsCallTrend.topicTrendRows.find((row) => row.topic === focus.topic)?.label ?? focus.topic,
          `${focus.intensity}/10`,
          focus.summary,
        ])}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBars
          rows={dashboard.earningsCallTrend.topicTrendRows.map((row) => ({
            label: `${row.label} (${row.direction})`,
            value: row.latestIntensity,
            max: maxIntensity,
            tone: row.direction === "rising" ? "amber" : row.direction === "falling" ? "blue" : "green",
          }))}
        />
        <LegnTable
          headers={["Topic", "Trend", "Latest AI score", "8Q avg", "AI synthesis"]}
          rows={dashboard.earningsCallTrend.topicTrendRows.map((row) => [
            row.label,
            <LegnBadge tone={row.direction === "rising" ? "amber" : row.direction === "falling" ? "blue" : "slate"}>{row.direction}</LegnBadge>,
            `${row.latestIntensity}/10`,
            row.eightQuarterAverage.toFixed(1),
            row.aiSynthesis,
          ])}
        />
      </div>
    </div>
  );
}

export function LabelExpansionPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      {dashboard.labelExpansion.doubleCountGuardrail.warning ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{dashboard.labelExpansion.doubleCountGuardrail.warning}</div>
      ) : null}
      <LegnTable
        headers={["Program", "NCT", "Potential label", "POS", "Timing", "Eligible pts", "Peak NTS impact", "NAV"]}
        rows={dashboard.labelExpansion.expansions.map((row) => [
          row.trialName,
          row.nct,
          row.potentialLabel,
          formatPct(row.probability),
          row.timing,
          row.eligiblePatientPool.toLocaleString(),
          formatUsdM(row.peakNtsImpact),
          formatUsdM(row.navUsdM),
        ])}
      />
    </div>
  );
}

export function SolidTumorCartPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <LegnMiniCard label="Solid tumor option value" value={formatUsdM(dashboard.solidTumor.totalProbabilityWeightedOptionValue)} subtext="excluded from core commercial base" badge="Assumption" />
      <LegnTable
        headers={["Asset", "Science risk", "Target validation", "Early signal", "Toxicity mitigation", "Competition", "Option range", "Core base"]}
        rows={dashboard.solidTumor.assets.map((asset) => [
          asset.assetName,
          asset.scientificRiskScore,
          asset.targetValidationScore,
          asset.earlySignalScore,
          asset.toxicityMitigationScore,
          asset.competitiveIntensityScore,
          `${formatUsdM(asset.optionValueRange[0])}-${formatUsdM(asset.optionValueRange[1])}`,
          <LegnBadge tone="red">no</LegnBadge>,
        ])}
      />
    </div>
  );
}

export function PipelineRnpvPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <LegnTable
      headers={["Asset", "Target", "Phase", "Launch", "Peak sales", "POS", "Discount", "rNPV", "Value / ADS", "Flag"]}
      rows={dashboard.pipelineRnpv.assets.map((asset) => [
        asset.assetName,
        asset.target,
        asset.phase,
        asset.estimatedLaunchYear,
        formatUsdM(asset.unadjustedPeakSales),
        formatPct(asset.probabilityOfSuccess),
        formatPct(asset.discountRate),
        formatUsdM(asset.probabilityAdjustedRnpv),
        formatUsdPerAds(asset.valuePerAds),
        <LegnBadge tone="amber">research-only</LegnBadge>,
      ])}
    />
  );
}

export function ManufacturingAccessPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <LegnMiniCard label="Success rate" value={formatPct(dashboard.manufacturing.currentSuccessRate)} badge="Actual" />
        <LegnMiniCard label="OOS rate" value={formatPct(dashboard.manufacturing.currentOutOfSpecRate)} badge="Assumption" />
        <LegnMiniCard label="Bottleneck score" value={formatPct(dashboard.manufacturing.bottleneckScore)} badge="Derived" />
        <LegnMiniCard label="Q4 sites" value={(dashboard.dataset.carvyktiQuarters.find((row) => row.id === "q4-2025")?.treatmentSites ?? 0).toFixed(0)} badge="Actual" />
      </div>
      <LegnTable
        headers={["Year", "Dose capacity", "Sites", "Demand doses", "Feasible doses", "Bottleneck", "Demand revenue", "Capacity revenue"]}
        rows={dashboard.manufacturing.annualRows.map((row) => [
          row.year,
          row.annualDoseCapacity.toFixed(0),
          row.treatmentSiteCount.toFixed(0),
          row.demandDoses.toFixed(0),
          row.feasibleDoses.toFixed(0),
          formatPct(row.bottleneckScore),
          formatUsdM(row.demandConstrainedRevenue),
          formatUsdM(row.capacityConstrainedRevenue),
        ])}
      />
    </div>
  );
}

export function ValuationPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <LegnTable
        headers={["NAV stack", "Value / ADS", "Value", "Quality"]}
        rows={dashboard.valuation.navStack.map((row) => [
          row.label,
          formatUsdPerAds(row.valuePerAds),
          formatUsdM(row.valueUsdM),
          <LegnBadge tone={row.quality === "research_only" ? "amber" : row.quality === "filing" ? "green" : "blue"}>{row.quality}</LegnBadge>,
        ])}
      />
      <LegnTable
        headers={dashboard.valuation.sensitivityHeatmap[0].map(String)}
        rows={dashboard.valuation.sensitivityHeatmap.slice(1).map((row) => row.map((cell) => (typeof cell === "number" ? formatUsdPerAds(cell) : cell)))}
      />
      <LegnTable
        headers={["Cross-check", "Value", "Unit", "Note"]}
        rows={dashboard.valuation.crossChecks.map((row) => [row.label, row.value.toFixed(2), row.unit, row.note])}
      />
    </div>
  );
}

export function RiskRedTeamPanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <div className="space-y-4">
      <MiniBars rows={dashboard.risks.heatmap.map((row) => ({ label: row.risk, value: row.score, max: 65, tone: riskTone(row.score) }))} />
      <LegnTable
        headers={["Risk", "Prob.", "Severity", "Kill criteria", "Mitigation"]}
        rows={dashboard.risks.risks.map((risk) => [
          risk.title,
          formatPct(risk.probability),
          formatPct(risk.severity),
          risk.killCriteria,
          risk.mitigation,
        ])}
      />
    </div>
  );
}

export function EvidencePanel({ dashboard }: { dashboard: LegnDashboardData }) {
  return (
    <LegnTable
      headers={["Source", "Type", "Date", "Metric", "Confidence", "Used", "Notes"]}
      rows={dashboard.dataset.evidence.map((row) => [
        row.url ? <a className="text-sky-700 underline" href={row.url} target="_blank" rel="noreferrer">{row.sourceTitle}</a> : row.sourceTitle,
        row.sourceType,
        row.date,
        row.extractedMetric ?? row.quote,
        row.confidence,
        row.usedInModel ? <LegnBadge tone="green">yes</LegnBadge> : <LegnBadge>no</LegnBadge>,
        row.notes,
      ])}
    />
  );
}
