import type { Scenario } from "../../types";
import type { LegnCollaborationEconomicsOutput, LegnCommercialEngineOutput, LegnDataset } from "../types";
import { clamp, explain } from "./helpers";

export function buildCollaborationEconomicsEngine(
  data: LegnDataset,
  commercial: LegnCommercialEngineOutput,
  scenario: Scenario,
): LegnCollaborationEconomicsOutput {
  const bridge = data.collaborationEconomicsBridge;
  const scaleBenefit = scenario === "Bear" ? 0.02 : scenario === "Bull" ? 0.12 : 0.08;
  let remainingAdvance = bridge.fundingAdvanceBalance;
  const rows = commercial.annualForecast.map((row, index) => {
    const scaleProgress = clamp(index / 6, 0, 1);
    const legendCollaborationRevenue = row.globalNts * bridge.ntsToCollaborationRevenueRatio;
    const costRatio = Math.max(0.27, bridge.costOfCollaborationRevenueRatio - scaleBenefit * scaleProgress);
    const costOfCollaborationRevenue = legendCollaborationRevenue * costRatio;
    const sellingDistributionBurden = legendCollaborationRevenue * Math.max(0.11, bridge.sellingDistributionRatio - 0.07 * scaleProgress);
    const bcmaClinicalRdBurden = legendCollaborationRevenue * Math.max(0.055, bridge.bcmaClinicalRdBurdenRatio - 0.04 * scaleProgress);
    const recoupmentOfJanssenAdvances = Math.min(remainingAdvance, Math.max(0, legendCollaborationRevenue * 0.085));
    remainingAdvance -= recoupmentOfJanssenAdvances;
    const legendGrossProfitContribution = legendCollaborationRevenue - costOfCollaborationRevenue;
    const operatingProfitContribution =
      legendGrossProfitContribution - sellingDistributionBurden - bcmaClinicalRdBurden - recoupmentOfJanssenAdvances;
    const cashContribution = operatingProfitContribution - Math.max(0, remainingAdvance * bridge.fundingAdvanceInterestRate * 0.25);
    return {
      year: row.year,
      carvyktiNts: row.globalNts,
      legendCollaborationRevenue,
      legendGrossProfitContribution,
      costOfCollaborationRevenue,
      sellingDistributionBurden,
      bcmaClinicalRdBurden,
      recoupmentOfJanssenAdvances,
      operatingProfitContribution,
      cashContribution,
      margin: legendCollaborationRevenue === 0 ? 0 : operatingProfitContribution / legendCollaborationRevenue,
    };
  });

  const baseMargin = rows[4]?.margin ?? rows[0]?.margin ?? 0;

  return {
    scenario,
    rows,
    sensitivity: [
      {
        label: "Gross margin + / - 500bp",
        bear: baseMargin - 0.05,
        base: baseMargin,
        bull: baseMargin + 0.05,
      },
      {
        label: "Manufacturing cost + / - 500bp",
        bear: baseMargin - 0.05,
        base: baseMargin,
        bull: baseMargin + 0.05,
      },
      {
        label: "Advance recoupment speed",
        bear: rows.slice(0, 3).reduce((sum, row) => sum + row.recoupmentOfJanssenAdvances, 0) * 1.25,
        base: rows.slice(0, 3).reduce((sum, row) => sum + row.recoupmentOfJanssenAdvances, 0),
        bull: rows.slice(0, 3).reduce((sum, row) => sum + row.recoupmentOfJanssenAdvances, 0) * 0.75,
      },
    ],
    bridge,
    explainability: explain(
      "The bridge converts CARVYKTI net trade sales into Legend collaboration revenue and operating contribution, with recoupment treated as a cash drag.",
      "Legend revenue = CARVYKTI NTS x reported collaboration revenue / CARVYKTI NTS; operating contribution = revenue - cost of collaboration revenue - S&D burden - BCMA R&D burden - advance recoupment",
      bridge.sourceEvidenceIds,
      [
        `${(bridge.ntsToCollaborationRevenueRatio * 100).toFixed(1)}% NTS-to-Legend-revenue anchor`,
        `${(bridge.costOfCollaborationRevenueRatio * 100).toFixed(1)}% FY 2025 cost-of-collaboration-revenue ratio`,
        `$${bridge.fundingAdvanceBalance.toFixed(1)}m collaboration advance recoupment balance`,
      ],
    ),
  };
}
