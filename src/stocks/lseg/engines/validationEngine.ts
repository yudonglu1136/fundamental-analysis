import type { LsegCockpitDataset, LsegValuationAssumptions, LsegValuationOutput } from "../types";

export type LsegValidationStatus = "PASS" | "WARNING" | "FAIL";

export type LsegValidationRow = {
  status: LsegValidationStatus;
  id: string;
  file: string;
  field: string;
  reason: string;
  suggestion: string;
};

function row(status: LsegValidationStatus, id: string, file: string, field: string, reason: string, suggestion = "No action required."): LsegValidationRow {
  return { status, id, file, field, reason, suggestion };
}

function closeTo(left: number, right: number, tolerance: number) {
  return Math.abs(left - right) <= tolerance;
}

export function validateLsegCockpitModel(
  data: LsegCockpitDataset,
  valuation: LsegValuationOutput,
  assumptions: LsegValuationAssumptions,
): LsegValidationRow[] {
  const latest = data.officialActuals.find((period) => period.periodId === "fy2025") ?? data.officialActuals[data.officialActuals.length - 1];
  const rows: LsegValidationRow[] = [];
  const weightTotal = assumptions.weightFcffDcf + assumptions.weightFcfYield + assumptions.weightSotp + assumptions.weightEvEbitda + assumptions.weightPe + assumptions.weightPlatformMoat;
  const segmentRevenue = data.segmentActuals.reduce((sum, segment) => sum + segment.revenue, 0);
  const segmentEbitda = data.segmentActuals.reduce((sum, segment) => sum + segment.adjustedEbitda, 0);

  rows.push(row(data.officialActuals.length > 0 ? "PASS" : "FAIL", "official-dataset", "src/stocks/lseg/data/officialData.ts", "officialActuals", "Official actual rows are present.", "Populate officialActuals from annual report / results."));
  rows.push(row(data.sources.every((source) => source.id && source.url && source.sourceType && source.status) ? "PASS" : "FAIL", "source-metadata", "src/stocks/lseg/data/sourceMap.ts", "sources", "Source metadata includes id, url, source type and status.", "Add missing source metadata."));
  rows.push(row(data.forecastAssumptions.every((item) => item.sourceType === "forecast_assumption") ? "PASS" : "FAIL", "forecast-layer", "src/stocks/lseg/data/assumptions.ts", "forecastAssumptions", "Forecast assumptions are explicitly labelled.", "Move forecast data out of official actuals."));
  rows.push(row(data.researchOnly.every((item) => item.sourceType === "research_only" && item.valuationMapping !== "none") ? "PASS" : "WARNING", "research-only-layer", "src/stocks/lseg/data/officialData.ts", "researchOnly", "Research-only items are not official actuals.", "Map research-only items to scenario/risk/monitoring only."));
  rows.push(row(closeTo(segmentRevenue, latest.totalIncomeExRecoveries, 2) ? "PASS" : "FAIL", "segment-revenue-reconciliation", "src/stocks/lseg/data/segmentData.ts", "segmentActuals.revenue", `Segment revenue ${segmentRevenue} vs group ${latest.totalIncomeExRecoveries}.`, "Reconcile segment revenue to total income excluding recoveries."));
  rows.push(row(closeTo(segmentEbitda, latest.adjustedEbitda, 2) ? "PASS" : "FAIL", "segment-profit-reconciliation", "src/stocks/lseg/data/segmentData.ts", "segmentActuals.adjustedEbitda", `Segment EBITDA ${segmentEbitda} vs group ${latest.adjustedEbitda}.`, "Reconcile analytical Markets EBITDA split to group adjusted EBITDA."));
  rows.push(row(closeTo(weightTotal, 1, 0.0001) ? "PASS" : "FAIL", "valuation-weight-sum", "src/stocks/lseg/data/assumptions.ts", "valuation weights", `Weights sum to ${(weightTotal * 100).toFixed(1)}%.`, "Set FCFF/FCF/SOTP/multiple/PE/moat weights to 100%."));
  rows.push(row(valuation.sotp.components.length >= 6 ? "PASS" : "FAIL", "sotp-components", "src/stocks/lseg/engines/sotpEngine.ts", "components", "SOTP has differentiated segment components.", "Add D&A, FTSE, Risk, Capital Markets, Post Trade and Corporate components."));
  rows.push(row(valuation.fcffDcf.forecast.every((year) => year.totalRevenue > 0 && year.fcff > 0) ? "PASS" : "FAIL", "dcf-forecast", "src/stocks/lseg/engines/fcffEngine.ts", "forecast", "FCFF forecast is calculable.", "Fix revenue, margin, capex and working-capital assumptions."));
  rows.push(row(valuation.fcffDcf.terminalValuePctOfEnterpriseValue <= 0.75 ? "PASS" : "WARNING", "terminal-value-share", "src/stocks/lseg/engines/fcffEngine.ts", "terminalValuePctOfEnterpriseValue", `Terminal value is ${(valuation.fcffDcf.terminalValuePctOfEnterpriseValue * 100).toFixed(1)}% of EV.`, "Lower terminal growth, raise WACC or extend explicit forecast if too high."));
  rows.push(row(data.scenarios.Base.wacc >= 0.06 && data.scenarios.Base.wacc <= 0.1 ? "PASS" : "FAIL", "wacc-range", "src/stocks/lseg/data/assumptions.ts", "Base.wacc", `Base WACC is ${(data.scenarios.Base.wacc * 100).toFixed(1)}%.`, "Use a reasonable LSEG WACC range."));
  rows.push(row(data.scenarios.Base.terminalGrowth <= 0.03 ? "PASS" : "FAIL", "terminal-growth-range", "src/stocks/lseg/data/assumptions.ts", "Base.terminalGrowth", `Terminal growth is ${(data.scenarios.Base.terminalGrowth * 100).toFixed(1)}%.`, "Keep terminal growth within reasonable long-term nominal range."));
  rows.push(row(valuation.fcffDcf.averageFcffConversion >= 0.45 && valuation.fcffDcf.averageFcffConversion <= 0.75 ? "PASS" : "WARNING", "fcff-conversion", "src/stocks/lseg/engines/fcffEngine.ts", "averageFcffConversion", `Average FCFF conversion is ${(valuation.fcffDcf.averageFcffConversion * 100).toFixed(1)}%.`, "Review capex, integration cost and working-capital assumptions."));
  rows.push(row(valuation.dividendBuyback.payoutRatioVsAdjustedProfit < 0.6 ? "PASS" : "WARNING", "dividend-payout", "src/stocks/lseg/engines/dividendBuybackEngine.ts", "payoutRatioVsAdjustedProfit", `Dividend payout is ${(valuation.dividendBuyback.payoutRatioVsAdjustedProfit * 100).toFixed(1)}% of adjusted profit.`, "Review dividend sustainability."));
  rows.push(row(valuation.dividendBuyback.buybackAdjustedShareCount < assumptions.dilutedShares ? "PASS" : "FAIL", "buyback-share-count", "src/stocks/lseg/engines/dividendBuybackEngine.ts", "buybackAdjustedShareCount", "Buyback reduces modeled share count.", "Check average buyback price and authorization assumptions."));
  rows.push(row(valuation.fcffDcf.netDebt > 0 && valuation.fcffDcf.leaseLiabilities > 0 ? "PASS" : "FAIL", "equity-bridge", "src/stocks/lseg/engines/fcffEngine.ts", "netDebt/leaseLiabilities", "Net debt and leases are included in equity bridge.", "Subtract net debt and leases after enterprise value."));
  rows.push(row(valuation.moat.cappedValuationAdjustment <= assumptions.platformMoatCap ? "PASS" : "FAIL", "platform-moat-cap", "src/stocks/lseg/engines/moatEngine.ts", "cappedValuationAdjustment", "Platform moat adjustment is capped.", "Apply hard cap."));
  rows.push(row(Math.abs(valuation.risk.cappedRiskAdjustment) <= assumptions.riskAdjustmentCap ? "PASS" : "FAIL", "risk-cap", "src/stocks/lseg/engines/riskRedTeamEngine.ts", "cappedRiskAdjustment", "Risk adjustment is capped.", "Apply hard cap."));
  rows.push(row(Boolean(data.marketData.priceDate) ? "PASS" : "FAIL", "market-price-date", "src/stocks/lseg/data/cockpitDataset.ts", "marketData.priceDate", "Market price has a date.", "Add market data source date."));
  rows.push(row(data.segmentActuals.some((segment) => segment.segment === "Capital Markets" && segment.sourceType === "forecast_assumption") ? "PASS" : "FAIL", "markets-analytical-split", "src/stocks/lseg/data/segmentData.ts", "Capital/Post Trade split", "Markets EBITDA split is labelled forecast_assumption.", "Do not label analytical split as official actual."));
  rows.push(row(valuation.methodBridge.every((method) => Number.isFinite(method.fairValue) && Number.isFinite(method.contribution)) ? "PASS" : "FAIL", "dashboard-fields", "src/stocks/lseg/engines/valuationEngine.ts", "methodBridge", "Dashboard valuation fields are calculable.", "Fix valuation engine output."));

  return rows;
}
