import type { DgeDashboardData } from "../types";
import { DgeBadge, DgeMiniCard, DgeTable, DgeTextPanel, formatGbp, formatGbx, formatPct, formatUsdM, scoreTone } from "./DgeUi";

export function CockpitPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DgeMiniCard label="Fair value" value={formatGbp(dashboard.valuation.blendedFairValueGbp)} subtext={`${formatGbx(dashboard.valuation.blendedFairValueGbx)} per DGE.L ordinary`} />
        <DgeMiniCard label="US demand score" value={`${dashboard.usDemand.usDemandScore}/100`} subtext={dashboard.usDemand.trueConsumptionTrend} />
        <DgeMiniCard label="LAC inventory score" value={`${dashboard.lacInventory.lacInventoryHealthScore}/100`} subtext={`Normalized growth ${formatPct(dashboard.lacInventory.normalizedLacGrowth)}`} />
        <DgeMiniCard label="FCF after dividend" value={formatUsdM(dashboard.cashFlow.fcfAfterDividend)} subtext="Uses rebased dividend floor, not old dividend history" badge="Assumption" />
      </div>
      <DgeTextPanel title="One-page thesis">{dashboard.thesisBoard.onePageThesis}</DgeTextPanel>
      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="What Must Be True" rows={dashboard.thesisBoard.whatMustBeTrue} />
        <ListPanel title="Upside Drivers" rows={dashboard.thesisBoard.upsideDrivers} tone="green" />
        <ListPanel title="Downside Risks" rows={dashboard.thesisBoard.downsideRisks} tone="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DgeTextPanel title="Value Trap Case">{dashboard.thesisBoard.valueTrapCase}</DgeTextPanel>
        <DgeTextPanel title="Mean Reversion Case">{dashboard.thesisBoard.meanReversionCase}</DgeTextPanel>
      </div>
    </div>
  );
}

export function UsDemandLab({ dashboard }: { dashboard: DgeDashboardData }) {
  const bridgeRows = dashboard.usDemand.bridge.map((row) => [row.label, formatPct(row.value), row.explanation]);
  const competitors = dashboard.dataset.competitorData.map((peer) => [
    peer.company,
    peer.usGrowth == null ? "n/a" : formatPct(peer.usGrowth),
    peer.inventoryCommentary,
    peer.tequilaCommentary,
  ]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <DgeMiniCard label="Demand score" value={`${dashboard.usDemand.usDemandScore}/100`} subtext={dashboard.usDemand.diagnosis} />
        <DgeMiniCard label="Shipment quality" value={`${dashboard.usDemand.shipmentQualityScore}/100`} subtext={`Shipment-depletion gap ${formatPct(dashboard.usDemand.depletionsVsShipmentsGap)}`} />
        <DgeMiniCard label="Tequila risk" value={`${dashboard.usDemand.tequilaRiskScore}/100`} subtext="Casamigos / Don Julio normalization and share pressure" />
      </div>
      <DgeTable columns={["Bridge", "Value", "Interpretation"]} rows={bridgeRows} />
      <DgeTable columns={["Peer", "US growth", "Inventory read-through", "Tequila / category read-through"]} rows={competitors} />
      <WarningList rows={dashboard.usDemand.warnings} />
    </div>
  );
}

export function LacInventoryLab({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <DgeMiniCard label="Inventory health" value={`${dashboard.lacInventory.lacInventoryHealthScore}/100`} />
        <DgeMiniCard label="Destocking completion" value={`${dashboard.lacInventory.destockingCompletionProbability}%`} />
        <DgeMiniCard label="Restocking risk" value={`${dashboard.lacInventory.restockingRisk}%`} />
        <DgeMiniCard label="Pull-forward risk" value={`${dashboard.lacInventory.pullForwardRisk}%`} />
      </div>
      <DgeTable
        columns={["Normalized growth bridge", "Impact", "Source boundary"]}
        rows={dashboard.lacInventory.bridge.map((row) => [row.label, formatPct(row.value), row.researchOnly ? <DgeBadge tone="amber">Research-only</DgeBadge> : <DgeBadge tone="green">Reported</DgeBadge>])}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DgeMiniCard label="Brazil recovery" value={`${dashboard.lacInventory.brazilRecoveryScore}/100`} subtext="Positive but still needs sell-out proof" />
        <DgeMiniCard label="Mexico stabilization" value={`${dashboard.lacInventory.mexicoStabilizationScore}/100`} subtext="High-single-digit decline keeps the warning light on" />
      </div>
      <WarningList rows={dashboard.lacInventory.warnings} />
    </div>
  );
}

export function RegionalQualityPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <DgeTable
      columns={["Region", "Organic", "Volume", "Price/mix", "Shipment quality", "Inventory distortion", "Sustainability", "Read"]}
      rows={dashboard.regionalQuality.regionScores.map((row) => [
        row.region,
        formatPct(row.organicGrowth),
        row.volumeContribution == null ? "n/a" : formatPct(row.volumeContribution),
        row.priceMixContribution == null ? "n/a" : formatPct(row.priceMixContribution),
        `${row.shipmentQuality}/100`,
        `${row.inventoryDistortion}/100`,
        <DgeBadge tone={scoreTone(row.sustainabilityScore)}>{row.sustainabilityScore}/100</DgeBadge>,
        row.explanation,
      ])}
    />
  );
}

export function BrandPortfolioPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <DgeMiniCard label="Portfolio health" value={`${dashboard.brandPortfolio.brandHealthScore}/100`} />
        <DgeMiniCard label="Premiumisation durability" value={`${dashboard.brandPortfolio.premiumisationDurabilityScore}/100`} />
        <DgeMiniCard label="Guinness structural score" value={`${dashboard.brandPortfolio.guinnessStructuralGrowthScore}/100`} />
        <DgeMiniCard label="Rebalancing need" value={`${dashboard.brandPortfolio.portfolioRebalancingNeed}/100`} />
      </div>
      <DgeTable
        columns={["Brand", "Category", "Tier", "Trend", "Inventory", "Moat", "Affordability gap", "Read"]}
        rows={dashboard.brandPortfolio.brandRows.map((row) => [
          row.brand,
          row.category,
          row.priceTier,
          row.currentGrowthTrend,
          row.inventoryIssue,
          <DgeBadge tone={scoreTone(row.moatScore)}>{row.moatScore}/100</DgeBadge>,
          `${row.affordabilityGap}/100`,
          row.explanation,
        ])}
      />
      <WarningList rows={dashboard.brandPortfolio.warnings} />
    </div>
  );
}

export function PriceMixVolumePanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <DgeMiniCard label="Price/mix quality" value={`${dashboard.priceMixVolume.priceMixQuality}/100`} />
        <DgeMiniCard label="Volume quality" value={`${dashboard.priceMixVolume.volumeQuality}/100`} />
        <DgeMiniCard label="Promotion intensity" value={`${dashboard.priceMixVolume.promotionalIntensity}/100`} />
        <DgeMiniCard label="Pricing power" value={`${dashboard.priceMixVolume.pricingPowerScore}/100`} />
      </div>
      <DgeTable
        columns={["Bridge item", "Value", "Type"]}
        rows={dashboard.priceMixVolume.organicNetSalesBridge.map((row) => [row.label, formatPct(row.value), row.type])}
      />
      <WarningList rows={dashboard.priceMixVolume.warnings} />
    </div>
  );
}

export function MarginSavingsPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <DgeMiniCard label="Underlying margin score" value={`${dashboard.marginSavings.underlyingMarginScore}/100`} />
        <DgeMiniCard label="Savings quality" value={`${dashboard.marginSavings.savingsQualityScore}/100`} />
        <DgeMiniCard label="A&P efficiency risk" value={`${dashboard.marginSavings.apEfficiencyRisk}/100`} />
      </div>
      <DgeTable
        columns={["Scenario", "Sustainable margin"]}
        rows={Object.entries(dashboard.marginSavings.sustainableMarginScenario).map(([scenario, margin]) => [scenario, formatPct(margin)])}
      />
      <WarningList rows={dashboard.marginSavings.warnings} />
    </div>
  );
}

export function CashFlowPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <DgeMiniCard label="FCF quality" value={`${dashboard.cashFlow.fcfQualityScore}/100`} />
        <DgeMiniCard label="Dividend safety" value={`${dashboard.cashFlow.dividendSafetyScore}/100`} />
        <DgeMiniCard label="Payout ratio" value={formatPct(dashboard.cashFlow.payoutRatio)} />
        <DgeMiniCard label="Debt capacity" value={formatUsdM(dashboard.cashFlow.debtReductionCapacity)} />
      </div>
      <DgeTable
        columns={["Period", "Net debt / EBITDA", "Net debt"]}
        rows={dashboard.cashFlow.deleveragingPath.map((row) => [row.period, `${row.netDebtToEbitda.toFixed(1)}x`, formatUsdM(row.netDebt)])}
      />
      <WarningList rows={dashboard.cashFlow.warnings} />
    </div>
  );
}

export function ValuationPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <DgeMiniCard label="FCF yield" value={formatGbp(dashboard.valuation.normalizedFcfFairValueGbp)} />
        <DgeMiniCard label="EV/EBIT" value={formatGbp(dashboard.valuation.evEbitFairValueGbp)} />
        <DgeMiniCard label="EV/EBITDA" value={formatGbp(dashboard.valuation.evEbitdaFairValueGbp)} />
        <DgeMiniCard label="P/E" value={formatGbp(dashboard.valuation.peFairValueGbp)} />
        <DgeMiniCard label="Dividend floor" value={formatGbp(dashboard.valuation.dividendFloorValueGbp)} />
        <DgeMiniCard label="DEO ADR equivalent" value={`$${dashboard.valuation.adrEquivalentUsd.toFixed(2)}`} />
      </div>
      <DgeTable
        columns={["Implied market variable", "Value"]}
        rows={[
          ["Normalized FCF implied by market", formatUsdM(dashboard.valuation.marketImplied.normalizedFcf)],
          ["Required FCF yield", formatPct(dashboard.valuation.marketImplied.requiredFcfYield)],
          ["US demand recovery assumption", formatPct(dashboard.valuation.marketImplied.usDemandRecovery)],
          ["LAC normalized growth", formatPct(dashboard.valuation.marketImplied.lacNormalizedGrowth)],
          ["Operating margin", formatPct(dashboard.valuation.marketImplied.operatingMargin)],
          ["Net debt / EBITDA", `${dashboard.valuation.marketImplied.netDebtToEbitda.toFixed(1)}x`],
        ]}
      />
    </div>
  );
}

export function RiskRedTeamPanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <DgeTextPanel title="Red-team verdict">{dashboard.riskRedTeam.verdict}</DgeTextPanel>
      <DgeTextPanel title="Strongest bear case">{dashboard.riskRedTeam.strongestBearCase}</DgeTextPanel>
      <DgeTable
        columns={["Risk", "Score", "Probability", "Severity", "Kill criteria", "Monitoring"]}
        rows={dashboard.riskRedTeam.riskRegister.map((risk) => [
          risk.title,
          <DgeBadge tone={scoreTone(100 - risk.riskScore)}>{risk.riskScore}/100</DgeBadge>,
          `${risk.probability.toFixed(0)}%`,
          `${risk.severity.toFixed(0)}%`,
          risk.killCriteria,
          risk.timeToMaterialize,
        ])}
      />
    </div>
  );
}

export function EvidencePanel({ dashboard }: { dashboard: DgeDashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <DgeMiniCard label="Evidence coverage" value={formatPct(dashboard.evidenceAudit.evidenceCoverageRatio)} />
        <DgeMiniCard label="Avg confidence" value={formatPct(dashboard.evidenceAudit.averageConfidence)} />
        <DgeMiniCard label="Official records" value={`${dashboard.evidenceAudit.officialEvidenceCount}`} />
        <DgeMiniCard label="Research assumptions" value={`${dashboard.evidenceAudit.researchOnlyEvidence.length}`} />
      </div>
      <DgeTable
        columns={["ID", "Source", "Type", "Metric", "Value", "Used", "Confidence"]}
        rows={dashboard.evidenceAudit.evidence.map((record) => [
          record.id,
          record.sourceTitle,
          record.sourceType,
          record.extractedMetric,
          record.value ?? "n/a",
          record.usedInModel ? "yes" : "no",
          record.confidence,
        ])}
      />
    </div>
  );
}

function ListPanel({ title, rows, tone = "blue" }: { title: string; rows: string[]; tone?: "green" | "red" | "blue" }) {
  return (
    <DgeTextPanel title={title}>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row} className="flex gap-2">
            <DgeBadge tone={tone}>Key</DgeBadge>
            <span>{row}</span>
          </li>
        ))}
      </ul>
    </DgeTextPanel>
  );
}

function WarningList({ rows }: { rows: string[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {row}
        </div>
      ))}
    </div>
  );
}
