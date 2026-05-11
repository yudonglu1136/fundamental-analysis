import type { ValidationWarning } from "../../types";
import { daysBetweenIso } from "../../../utils/valuation";
import type { LsegDashboardDataset, LsegValuationIntegrity } from "../model";
import type { LsegScenarioCalculationLike } from "../types-internal";

function uniqueStrings(items: string[]) {
  return [...new Set(items)];
}

function uniqueWarnings(items: ValidationWarning[]) {
  const seen = new Set<string>();
  return items.filter((warning) => {
    if (seen.has(warning.id)) return false;
    seen.add(warning.id);
    return true;
  });
}

export function calculateValuationIntegrityEngine(
  data: LsegDashboardDataset,
  scenarioCase: LsegScenarioCalculationLike,
): LsegValuationIntegrity {
  const warnings: ValidationWarning[] = [];
  const severeWarnings: ValidationWarning[] = [];
  const dataQualityWarnings: ValidationWarning[] = [];
  const recommendationWarnings: ValidationWarning[] = [];
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const auditNotes: string[] = [];
  const openAuditItems: string[] = [];

  let coreMechanicsScore = 100;
  let sotpIntegrityScore = 100;
  let dataQualityScore = 90;
  const capReasons = [...(scenarioCase.baseOperatingSotp.audit.confidenceCapReasons ?? [])];

  const fail = (
    bucket: ValidationWarning[],
    id: string,
    title: string,
    detail: string,
    severity: "high" | "medium" | "low",
    penalty: number,
    score: "core" | "sotp" | "data",
  ) => {
    const warning = { id, title, detail, severity } satisfies ValidationWarning;
    bucket.push(warning);
    warnings.push(warning);
    failedChecks.push(title);
    if (severity === "high") severeWarnings.push(warning);
    if (score === "core") coreMechanicsScore -= penalty;
    if (score === "sotp") sotpIntegrityScore -= penalty;
    if (score === "data") dataQualityScore -= penalty;
  };

  const pass = (title: string) => {
    passedChecks.push(title);
  };

  if (
    scenarioCase.dcf.cashFlowTaxonomy.dcfMethod === "wacc_unlevered" &&
    scenarioCase.dcf.cashFlowTaxonomy.dcfCashFlowType === "unlevered"
  ) pass("DCF uses unlevered FCF with WACC");
  else fail(
    warnings,
    "lseg-dcf-taxonomy-invalid",
    "DCF uses invalid cash-flow taxonomy",
    "DCF should use unlevered FCF discounted at WACC as the primary method.",
    "high",
    12,
    "core",
  );

  if (scenarioCase.dcf.cashFlowTaxonomy.netDebtTreatment === "subtract_after_ev") pass("Net debt treated after EV in DCF");
  else fail(
    warnings,
    "lseg-dcf-net-debt-treatment",
    "Net debt treatment is invalid in DCF",
    "DCF should subtract net debt only after valuing enterprise cash flows.",
    "high",
    10,
    "core",
  );

  if (scenarioCase.assumptions.terminalGrowth < scenarioCase.wacc.wacc) pass("Terminal growth below WACC");
  else fail(
    warnings,
    "lseg-terminal-growth-invalid",
    "Terminal growth is not below WACC",
    "Terminal growth must remain below WACC.",
    "high",
    10,
    "core",
  );

  if (scenarioCase.dcf.terminalValuePctOfEv <= 0.8) pass("Terminal value concentration acceptable");
  else fail(
    warnings,
    "lseg-terminal-value-heavy",
    "Terminal value concentration is too high",
    "Terminal value contributes more than 80% of DCF enterprise value.",
    "medium",
    5,
    "core",
  );

  const staleDays = daysBetweenIso(data.marketData.priceDate, new Date().toISOString().slice(0, 10));
  if (staleDays <= 7) pass("Current price not stale");
  else fail(
    dataQualityWarnings,
    "lseg-current-price-stale",
    "Current price may be stale",
    `Current price anchor is dated ${data.marketData.priceDate}.`,
    "medium",
    8,
    "data",
  );

  const weights =
    scenarioCase.assumptions.valuationWeights.dcf +
    scenarioCase.assumptions.valuationWeights.fcfYield +
    scenarioCase.assumptions.valuationWeights.sotp +
    scenarioCase.assumptions.valuationWeights.pe;
  if (Math.abs(weights - 1) < 0.0001) pass("Valuation weights sum to 100%");
  else fail(
    warnings,
    "lseg-valuation-weights",
    "Blended valuation weights do not sum to 100%",
    "DCF, FCF yield, SOTP, and P/E weights must sum to 100%.",
    "high",
    10,
    "core",
  );

  if (
    scenarioCase.fcf.rows.every((row, index) => {
      const shares = scenarioCase.buyback.rows[index]?.averageDilutedShares ?? 1;
      return Math.abs((row.equityFreeCashFlow / shares) - scenarioCase.fcfPerShareSeries[index]) < 1e-6;
    })
  ) pass("FCF/share reconciles");
  else fail(
    warnings,
    "lseg-fcf-share-reconcile",
    "FCF/share does not reconcile",
    "Equity FCF per share should equal equity FCF divided by diluted shares.",
    "medium",
    5,
    "core",
  );

  if (scenarioCase.buyback.rows.every((row) => Math.abs((row.adjustedNetIncome / row.averageDilutedShares) - row.adjustedEps) < 1e-6)) pass("EPS reconciles");
  else fail(
    warnings,
    "lseg-eps-reconcile",
    "EPS does not reconcile",
    "Adjusted EPS should equal adjusted net income divided by average diluted shares.",
    "medium",
    5,
    "core",
  );

  if (scenarioCase.buyback.rows.every((row) => row.endingDilutedShares <= row.beginningDilutedShares + row.stockCompensationDilution)) pass("Buyback reduces shares");
  else fail(
    warnings,
    "lseg-buyback-share-count",
    "Buyback does not reduce share count as expected",
    "Share count should fall after buybacks unless dilution fully offsets repurchases.",
    "medium",
    4,
    "core",
  );

  if (scenarioCase.assumptions.scenario === "Base") {
    if (scenarioCase.revenue.groupRevenueByYear[0]?.growth >= 0.065 && scenarioCase.revenue.groupRevenueByYear[0]?.growth <= 0.075) pass("2026 base revenue growth within guidance");
    else fail(
      warnings,
      "lseg-guidance-revenue",
      "2026 base revenue growth is outside guidance",
      "Base revenue growth should remain within 6.5% to 7.5% unless explicitly explained.",
      "medium",
      4,
      "core",
    );

    if ((scenarioCase.margin.groupRows[0]?.marginExpansionBps ?? 0) >= 80 && (scenarioCase.margin.groupRows[0]?.marginExpansionBps ?? 0) <= 100) pass("2026 base margin expansion within guidance");
    else fail(
      warnings,
      "lseg-guidance-margin",
      "2026 base EBITDA margin expansion is outside guidance",
      "Base EBITDA margin expansion should remain within 80 to 100 bps unless explicitly explained.",
      "medium",
      4,
      "core",
    );

    if ((scenarioCase.fcf.rows[0]?.equityFreeCashFlow ?? 0) >= 2700) pass("2026 base equity FCF meets guidance");
    else fail(
      warnings,
      "lseg-guidance-fcf",
      "2026 base equity FCF is below guidance",
      "Base equity FCF should be at least £2.7bn.",
      "medium",
      4,
      "core",
    );
  } else {
    auditNotes.push("Management guidance checks are enforced only on the Base scenario.");
  }

  if (scenarioCase.assumptions.targetFcfYield >= 0.04 || scenarioCase.assumptions.scenario !== "Base") pass("Base-case FCF yield guardrail");
  else fail(
    warnings,
    "lseg-target-fcf-yield-low",
    "Target FCF yield is too low in the base case",
    "Base-case target FCF yield below 4.0% should trigger a warning.",
    "medium",
    3,
    "core",
  );

  if (scenarioCase.assumptions.targetPe <= 25 || scenarioCase.assumptions.scenario !== "Base") pass("Base-case P/E guardrail");
  else fail(
    warnings,
    "lseg-target-pe-high",
    "Target P/E is too high in the base case",
    "Base-case target P/E above 25x should trigger a warning.",
    "medium",
    3,
    "core",
  );

  if (scenarioCase.qualityDirectValuationLink === false) pass("Quality score not directly capitalized");
  else fail(
    warnings,
    "lseg-quality-direct-link",
    "Quality score is still directly capitalized",
    "Quality score must not directly change DCF, SOTP, P/E, or FCF yield mechanics.",
    "high",
    10,
    "core",
  );

  const baseOperating = scenarioCase.baseOperatingSotp;
  const averageMarketMethods = (scenarioCase.valuation.peFairValue + scenarioCase.valuation.fcfFairValue) / 2;
  if (baseOperating.valuePerShare > scenarioCase.valuation.dcfValue * 1.5) {
    fail(
      warnings,
      "lseg-sotp-vs-dcf",
      "Operating SOTP exceeds DCF by >50%",
      "Base operating SOTP is more than 50% above DCF.",
      "high",
      10,
      "sotp",
    );
    openAuditItems.push("Operating SOTP remains materially above DCF.");
  } else {
    pass("Operating SOTP vs DCF");
  }

  if (baseOperating.valuePerShare > averageMarketMethods * 1.4) {
    fail(
      warnings,
      "lseg-sotp-vs-market-methods",
      "Operating SOTP exceeds P/E / FCF yield average by >40%",
      "Base operating SOTP is more than 40% above the average of P/E and FCF yield methods.",
      "high",
      10,
      "sotp",
    );
    openAuditItems.push("Operating SOTP remains materially above P/E / FCF yield cross-checks.");
  } else {
    pass("Operating SOTP vs market methods");
  }

  if ((scenarioCase.strategicSotp.strategicOptionalityPctOfOperating ?? 0) < 0.1) {
    fail(
      warnings,
      "lseg-strategic-too-close",
      "Strategic SOTP is too close to operating SOTP",
      "Strategic optionality is below 10% of selected operating SOTP, which suggests operating multiples may already embed break-up optionality.",
      "medium",
      8,
      "sotp",
    );
    openAuditItems.push("Strategic SOTP is still too close to operating SOTP.");
  } else {
    pass("Strategic optionality separation");
  }

  const placeholderOwnership = baseOperating.audit.ownershipBridge.some((row) => row.isPlaceholder || row.methodUsed === "placeholder_fallback");
  if (placeholderOwnership) {
    fail(
      dataQualityWarnings,
      "lseg-ownership-placeholder",
      "NCI deduction uses fallback / placeholder inputs",
      "Ownership-based NCI bridge still relies on fallback or placeholder assumptions.",
      "medium",
      8,
      "data",
    );
    dataQualityScore = Math.min(dataQualityScore, 70);
    capReasons.push("NCI bridge remains fallback-based.");
    openAuditItems.push("NCI still contains residual placeholder assumptions.");
  } else {
    pass("Ownership bridge source quality");
  }

  if (!baseOperating.audit.corporateReconciliation.verified) {
    fail(
      dataQualityWarnings,
      "lseg-corporate-unverified",
      "Corporate cost treatment is not verified by EBITDA reconciliation",
      "Corporate cost / Other treatment still needs reconciliation proof.",
      "medium",
      8,
      "data",
    );
    openAuditItems.push("Corporate cost bridge is not yet fully verified.");
  } else {
    pass("Corporate reconciliation proof");
  }

  const peerPlaceholder = baseOperating.components.some((component) => component.peerDataIsPlaceholder);
  const peerStale = baseOperating.components.some((component) => component.peerDataIsStale);
  const peerMissingAuditFields = baseOperating.components.some((component) => !component.peerDataDate || !component.peerDataSource);
  const peerIncomplete = baseOperating.components.some((component) => (component.peerValidCount ?? 0) < 3);

  if (peerPlaceholder || peerMissingAuditFields) {
    fail(
      dataQualityWarnings,
      "lseg-peer-placeholder",
      "Peer guardrails are placeholder or missing audit metadata",
      "Peer guardrails need dated and sourced manual inputs to support an institutional SOTP multiple framework.",
      "medium",
      8,
      "data",
    );
    dataQualityScore = Math.min(dataQualityScore, 75);
    capReasons.push("Peer guardrails remain placeholder-like or incompletely sourced.");
  } else {
    pass("Peer guardrail provenance");
  }

  if (peerStale) {
    fail(
      dataQualityWarnings,
      "lseg-peer-stale",
      "Peer guardrails are stale or older than 90 days",
      "Peer guardrails should be refreshed when market snapshots are older than 90 days.",
      "medium",
      6,
      "data",
    );
    openAuditItems.push("Peer guardrails are stale.");
  } else {
    pass("Peer guardrail freshness");
  }

  if (peerIncomplete) {
    fail(
      dataQualityWarnings,
      "lseg-peer-incomplete",
      "Some peer guardrail sets use fewer than three valid peers",
      "Narrow peer panels reduce SOTP confidence even if the data is recent.",
      "medium",
      5,
      "data",
    );
    openAuditItems.push("Some peer guardrails still rely on fewer than three valid peers.");
  } else {
    pass("Peer guardrail completeness");
  }

  const marketsWrongPeerGroup = baseOperating.components.some((component) => component.segment === "Markets" && component.peerGroup === "indices");
  if (marketsWrongPeerGroup) {
    fail(
      warnings,
      "lseg-markets-peer-group-invalid",
      "Markets multiple uses data/index peer group",
      "Markets should use mixed market-infrastructure peers, not pure data/index peers.",
      "high",
      15,
      "sotp",
    );
  } else {
    pass("Markets peer group");
  }

  const postTradeDoubleCount = (baseOperating.doubleCountWarnings ?? []).some((warning) => warning.toLowerCase().includes("post trade"));
  if (postTradeDoubleCount) {
    fail(
      warnings,
      "lseg-posttrade-doublecount",
      "Potential double count: reported Markets already includes Post Trade economics.",
      "Separate Post Trade valuation requires explicit EBITDA split and remains outside base operating SOTP.",
      "high",
      20,
      "sotp",
    );
  } else {
    pass("Post Trade double count guard");
  }

  if (Math.abs(baseOperating.audit.reconciliation.reconciliationDifference) > baseOperating.audit.reconciliation.reconciliationTolerance) {
    fail(
      warnings,
      "lseg-sotp-reconciliation-fail",
      "Operating SOTP fails EBITDA reconciliation",
      "Forward segment EBITDA does not reconcile to the group EBITDA anchor within tolerance.",
      "high",
      10,
      "sotp",
    );
  } else {
    pass("Operating SOTP reconciliation");
  }

  for (const component of baseOperating.components) {
    if (component.guardrailWarning) {
      fail(
        warnings,
        `lseg-sotp-guardrail-${component.segmentId}`,
        `${component.segment} multiple exceeds peer guardrail`,
        component.guardrailWarning,
        "medium",
        5,
        "sotp",
      );
    }
  }

  if ((scenarioCase.revenue.groupRevenueByYear[0]?.marketsBridge?.cyclicalUplift ?? 0) > 0.015) {
    recommendationWarnings.push({
      id: "lseg-markets-cyclical-cap",
      title: "Markets multiple capped due to cyclical volume exposure",
      detail: "Markets growth contains a cyclical uplift, so operating multiples should remain conservative until the structural component is better proven.",
      severity: "medium",
    });
    openAuditItems.push("Markets multiple is still influenced by cyclical volume risk.");
  }

  if (scenarioCase.assumptions.marketsSplitAssumption?.splitSource && scenarioCase.assumptions.marketsSplitAssumption.splitSource !== "company_disclosed") {
    dataQualityWarnings.push({
      id: "lseg-strategic-split-analyst-estimate",
      title: "Strategic split is based on analyst estimate",
      detail: "Capital Markets / Post Trade split remains analyst-estimated rather than company-disclosed.",
      severity: "medium",
    });
    dataQualityScore -= 4;
    openAuditItems.push("Strategic split still relies on analyst-estimated Markets / Post Trade allocation.");
  }

  sotpIntegrityScore = Math.max(0, Math.min(sotpIntegrityScore, 100));
  dataQualityScore = Math.max(35, Math.min(dataQualityScore, 95));
  const sotpConfidenceScore = Math.max(35, Math.min(baseOperating.audit.confidenceScore, 100));
  const overallIntegrityScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (coreMechanicsScore * 0.45) + (sotpIntegrityScore * 0.35) + (dataQualityScore * 0.2),
      ),
    ),
  );

  let recommendedValuationConfidence = overallIntegrityScore;
  switch (scenarioCase.valuation.recommendedFairValueMethod) {
    case "core_ex_sotp":
      recommendedValuationConfidence = Math.min(90, Math.round((coreMechanicsScore * 0.6) + (dataQualityScore * 0.4) + 5));
      break;
    case "sotp_25_uplift":
      recommendedValuationConfidence = Math.min(85, Math.round((coreMechanicsScore * 0.55) + (sotpConfidenceScore * 0.45)));
      break;
    case "sotp_50_uplift":
      recommendedValuationConfidence = Math.min(80, Math.round((coreMechanicsScore * 0.5) + (sotpConfidenceScore * 0.5)));
      break;
    case "sotp_75_uplift":
      recommendedValuationConfidence = Math.min(78, Math.round((coreMechanicsScore * 0.45) + (sotpConfidenceScore * 0.55)));
      break;
    case "full_operating_sotp_blend":
      recommendedValuationConfidence = Math.min(overallIntegrityScore, sotpIntegrityScore, sotpConfidenceScore);
      break;
  }

  if (sotpConfidenceScore < 70) {
    recommendationWarnings.push({
      id: "lseg-recommended-sotp-haircut",
      title: "Recommended valuation uses SOTP haircut due to low SOTP confidence",
      detail: "Full operating SOTP is shown for reference, but the underwriting recommendation should default to core or haircut valuation while SOTP confidence remains low.",
      severity: "medium",
    });
  }

  if (scenarioCase.valuation.recommendedFairValueMethod !== "full_operating_sotp_blend") {
    recommendationWarnings.push({
      id: "lseg-full-sotp-reference-only",
      title: "Full operating SOTP shown for reference, not primary underwriting value",
      detail: "The model still shows the full operating SOTP blend, but it is not the primary recommendation under current confidence conditions.",
      severity: "low",
    });
  }

  return {
    overallIntegrityScore,
    integrityScore: overallIntegrityScore,
    sotpIntegrityScore,
    sotpConfidenceScore,
    dataQualityScore,
    recommendedValuationConfidence,
    capReasons: uniqueStrings(capReasons),
    warnings: uniqueWarnings(warnings),
    severeWarnings: uniqueWarnings(severeWarnings),
    dataQualityWarnings: uniqueWarnings(dataQualityWarnings),
    recommendationWarnings: uniqueWarnings(recommendationWarnings),
    openAuditItems: uniqueStrings(openAuditItems),
    auditNotes,
    passedChecks,
    failedChecks,
  };
}
