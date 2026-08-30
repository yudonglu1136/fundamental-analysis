import assert from "node:assert/strict";
import test from "node:test";
import {
  guidanceBoundaryAudit,
  guidanceMetricsBeforeNextFinancialRelease,
  nextDistinctFinancialReleaseDate
} from "./pitGuidanceBoundary.js";

test("guidance observed on the next financial release is excluded from the prior node", () => {
  const metrics = [
    { id: 1, observed_at: "2022-08-25" },
    { id: 2, observed_at: "2022-12-01" },
    { id: 3, observed_at: "2022-12-02" },
    { id: 4, observed_at: null }
  ];
  const included = guidanceMetricsBeforeNextFinancialRelease(metrics, "2022-12-01");

  assert.deepEqual(included.map((metric) => metric.id), [1]);
  assert.deepEqual(guidanceBoundaryAudit(metrics, included, "2022-12-01"), {
    policy: "guidance observed before the next distinct financial release only",
    nextFinancialAvailableAt: "2022-12-01",
    candidateMetricCount: 4,
    includedMetricCount: 1,
    excludedMetricCount: 3,
    excludedObservedAt: ["2022-12-01", "2022-12-02"]
  });
});

test("the final financial node keeps all dated guidance for its fiscal period", () => {
  const metrics = [
    { id: 1, observed_at: "2026-05-05" },
    { id: 2, observed_at: "2026-08-10" }
  ];
  assert.deepEqual(
    guidanceMetricsBeforeNextFinancialRelease(metrics, null).map((metric) => metric.id),
    [1, 2]
  );
});

test("next release lookup ignores duplicate financial availability dates", () => {
  const rows = [
    { financialAvailableAt: "2022-08-25" },
    { financialAvailableAt: "2022-08-25" },
    { financialAvailableAt: "2022-12-01" }
  ];
  assert.equal(nextDistinctFinancialReleaseDate(rows, "2022-08-25"), "2022-12-01");
});
