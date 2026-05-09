import type { LsegRawData } from "./data";
import type { Scenario } from "../types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getRow(data: LsegRawData, periodId: string) {
  return data.workflowGraphMetrics.find((row) => row.periodId === periodId) ?? data.workflowGraphMetrics[data.workflowGraphMetrics.length - 1];
}

export function calculatePlatformGraphEngine(
  data: LsegRawData,
  periodId: string,
  scenario: Scenario,
  assumptions?: { workflowLockInScore?: number; pricingPowerScore?: number; postTradeMoatScore?: number },
) {
  const current = getRow(data, periodId);
  const scenarioAdjustment =
    scenario === "Bear"
      ? { graph: 0.97, workflow: 0.95, pricing: 0.96 }
      : scenario === "Bull"
        ? { graph: 1.03, workflow: 1.05, pricing: 1.04 }
        : { graph: 1, workflow: 1, pricing: 1 };
  const maxEdges = (current.nodes * (current.nodes - 1)) / 2;
  const baseGraphDensity = current.activeConnections / maxEdges;
  const graphDensity = Math.min(baseGraphDensity * scenarioAdjustment.graph, 1);
  const baseWorkflowLockInScore = clampScore(
    (
      (current.productsPerClient / 4) * 0.22 +
      current.customerWorkflowPenetration * 0.2 +
      current.dependencyScore * 0.2 +
      current.switchingFriction * 0.2 +
      current.dataIntegrationDepth * 0.18
    ) * 100,
  );
  const workflowLockInScore = clampScore(
    baseWorkflowLockInScore * 0.72 +
      (assumptions?.workflowLockInScore ?? baseWorkflowLockInScore) * 0.2 +
      (assumptions?.postTradeMoatScore ?? 75) * 0.08,
  );
  const switchingCostScore = clampScore(
    ((current.switchingFriction * 0.55) + (current.dataIntegrationDepth * 0.45)) * 100,
  );
  const basePricingPowerScore = clampScore(
    ((current.pricingPowerScore * 0.6) + (current.bundlePenetration * 0.2) + (current.attachRate * 0.2)) * 100 * scenarioAdjustment.pricing,
  );
  const pricingPowerScore = clampScore(basePricingPowerScore * 0.74 + (assumptions?.pricingPowerScore ?? basePricingPowerScore) * 0.26);

  return {
    current: {
      ...current,
      graphDensity,
      workflowLockInScore,
      switchingCostScore,
      pricingPowerScore,
    },
    series: data.workflowGraphMetrics.map((row) => {
      const possibleEdges = (row.nodes * (row.nodes - 1)) / 2;
      const density = row.activeConnections / possibleEdges;
      const rowBaseWorkflowLockIn = clampScore(
        (
          (row.productsPerClient / 4) * 0.22 +
          row.customerWorkflowPenetration * 0.2 +
          row.dependencyScore * 0.2 +
          row.switchingFriction * 0.2 +
          row.dataIntegrationDepth * 0.18
        ) * 100,
      );
      return {
        periodId: row.periodId,
        graphDensity: density,
        workflowLockInScore: rowBaseWorkflowLockIn,
        pricingPowerScore: clampScore(
          ((row.pricingPowerScore * 0.6) + (row.bundlePenetration * 0.2) + (row.attachRate * 0.2)) * 100,
        ),
      };
    }),
    nodes: ["Workspace", "FTSE Russell", "Risk Intelligence", "Data & Analytics", "Execution", "Clearing", "Collateral", "Compliance"],
    interpretation:
      workflowLockInScore >= 72
        ? "Workflow lock-in is deepening as more customers use multiple connected products inside one operating stack."
        : "Workflow graph depth is improving, but platform dependency still needs to broaden further.",
  };
}
