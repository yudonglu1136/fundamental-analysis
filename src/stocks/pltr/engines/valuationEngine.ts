import type { ValidationWarning } from "../../types";
import type {
  PltrActualQuarter,
  PltrExecutionRequirement,
  PltrImpliedExpectationsScenario,
  PltrReverseDcf,
  PltrValuationAssumptions,
  PltrValuationMethod,
} from "../model";
import { metricValue, safeDivide } from "./helpers";

function projectRevenue(baseRevenue: number, cagr: number, years = 5) {
  return Array.from({ length: years }, (_, index) => ({
    year: index + 1,
    revenue: baseRevenue * (1 + cagr) ** (index + 1),
  }));
}

function discount(value: number, rate: number, year: number) {
  return value / (1 + rate) ** year;
}

function dcfFairValue(assumptions: PltrValuationAssumptions) {
  const revenues = projectRevenue(assumptions.baseRevenue, assumptions.revenueCagrYears1To5, 5);
  const explicitValue = revenues.reduce((sum, row) => {
    const fcf = row.revenue * assumptions.fcfMargin;
    return sum + discount(fcf, assumptions.wacc, row.year);
  }, 0);
  const finalRevenue = revenues[revenues.length - 1]?.revenue ?? assumptions.baseRevenue;
  const terminalFcf = finalRevenue * (1 + assumptions.terminalRevenueGrowth) * assumptions.fcfMargin;
  const terminalValue =
    assumptions.wacc > assumptions.terminalRevenueGrowth
      ? terminalFcf / (assumptions.wacc - assumptions.terminalRevenueGrowth)
      : terminalFcf * assumptions.terminalMultiple;
  const enterpriseValue = explicitValue + discount(terminalValue, assumptions.wacc, 5);
  const endingShares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 5;
  return safeDivide(enterpriseValue + assumptions.netCash, endingShares);
}

function longTermFcfPerShareValue(assumptions: PltrValuationAssumptions) {
  const year5Revenue = assumptions.baseRevenue * (1 + assumptions.revenueCagrYears1To5) ** 5;
  const year5Fcf = year5Revenue * assumptions.fcfMargin;
  const endingShares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 5;
  const terminalEquityValue = year5Fcf * assumptions.terminalMultiple + assumptions.netCash;
  return discount(safeDivide(terminalEquityValue, endingShares), assumptions.wacc, 5);
}

function solveFor(target: number, low: number, high: number, calc: (value: number) => number) {
  const lowValue = calc(low);
  const highValue = calc(high);
  if (target <= lowValue) return low;
  if (target >= highValue) return high;
  let lo = low;
  let hi = high;
  for (let index = 0; index < 64; index += 1) {
    const mid = (lo + hi) / 2;
    if (calc(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function expectedCagr(futureValue: number, currentPrice: number, years: number) {
  if (futureValue <= 0 || currentPrice <= 0 || years <= 0) return 0;
  return (futureValue / currentPrice) ** (1 / years) - 1;
}

function classifyExecution(revenueCagr: number, fcfMargin: number, exitMultiple: number): PltrExecutionRequirement {
  if (revenueCagr <= 0.25 && fcfMargin <= 0.42 && exitMultiple <= 22) {
    return "valuation supported by fundamentals";
  }
  if (revenueCagr <= 0.35 && fcfMargin <= 0.5 && exitMultiple <= 30) {
    return "valuation requires premium execution";
  }
  if (revenueCagr <= 0.45 && fcfMargin <= 0.58 && exitMultiple <= 40) {
    return "valuation requires near-perfect execution";
  }
  return "valuation requires speculative hyper-growth";
}

function buildScenarioRow(
  key: string,
  label: string,
  assumptions: PltrValuationAssumptions,
  notes: string,
): PltrImpliedExpectationsScenario {
  const year3Revenue = assumptions.baseRevenue * (1 + assumptions.revenueCagrYears1To5) ** 3;
  const year5Revenue = assumptions.baseRevenue * (1 + assumptions.revenueCagrYears1To5) ** 5;
  const year3Fcf = year3Revenue * assumptions.fcfMargin;
  const year5Fcf = year5Revenue * assumptions.fcfMargin;
  const year3Shares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 3;
  const year5Shares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 5;
  const year3FutureValue = safeDivide(year3Fcf * assumptions.terminalMultiple + assumptions.netCash, year3Shares);
  const year5FutureValue = safeDivide(year5Fcf * assumptions.terminalMultiple + assumptions.netCash, year5Shares);

  return {
    key,
    label,
    revenueCagr: assumptions.revenueCagrYears1To5,
    terminalRevenue: year5Revenue,
    fcfMargin: assumptions.fcfMargin,
    normalizedSbcAsPctRevenue: assumptions.normalizedSbcAsPctRevenue,
    dilutedShareCountCagr: assumptions.dilutionRate,
    terminalDilutedShares: year5Shares,
    terminalFcf: year5Fcf,
    terminalFcfPerShare: safeDivide(year5Fcf, year5Shares),
    exitMultiple: assumptions.terminalMultiple,
    fairValuePerShare: year5FutureValue,
    expectedCagr3Y: expectedCagr(year3FutureValue, assumptions.currentPrice, 3),
    expectedCagr5Y: expectedCagr(year5FutureValue, assumptions.currentPrice, 5),
    executionRequirement: classifyExecution(
      assumptions.revenueCagrYears1To5,
      assumptions.fcfMargin,
      assumptions.terminalMultiple,
    ),
    notes,
  };
}

function buildReverseDcf(assumptions: PltrValuationAssumptions): PltrReverseDcf {
  const target = assumptions.currentPrice;
  const currentEquityValue = assumptions.currentPrice * assumptions.dilutedShares;
  const currentEnterpriseValue = currentEquityValue - assumptions.netCash;
  const currentFcf = assumptions.baseRevenue * assumptions.fcfMargin;
  const currentEvToRevenue = safeDivide(currentEnterpriseValue, assumptions.baseRevenue);
  const currentEvToFcf = safeDivide(currentEnterpriseValue, currentFcf);
  const requiredRevenueCagr = solveFor(target, -0.1, 0.9, (growth) =>
    dcfFairValue({ ...assumptions, revenueCagrYears1To5: growth }),
  );
  const requiredFcfMargin = solveFor(target, 0.05, 0.85, (margin) => dcfFairValue({ ...assumptions, fcfMargin: margin }));
  const requiredTerminalMultiple = solveFor(target, 5, 100, (multiple) =>
    longTermFcfPerShareValue({ ...assumptions, terminalMultiple: multiple }),
  );
  const terminalShares = assumptions.dilutedShares * (1 + assumptions.dilutionRate) ** 5;
  const impliedDilutionDrag = terminalShares > 0 ? 1 - assumptions.dilutedShares / terminalShares : 0;
  const impliedTerminalRevenue = assumptions.baseRevenue * (1 + requiredRevenueCagr) ** 5;
  const impliedTerminalFcf = impliedTerminalRevenue * assumptions.fcfMargin;
  const impliedTerminalFcfPerShare = safeDivide(impliedTerminalFcf, terminalShares);
  const marketImpliedExecutionRequirement = classifyExecution(
    requiredRevenueCagr,
    requiredFcfMargin,
    requiredTerminalMultiple,
  );
  const expectationScenarios: PltrImpliedExpectationsScenario[] = [
    buildScenarioRow(
      "market-implied",
      "Market-implied case",
      {
        ...assumptions,
        revenueCagrYears1To5: requiredRevenueCagr,
      },
      "Uses the revenue CAGR required to justify the selected current price while holding the selected margin, dilution, net cash, and exit multiple constant.",
    ),
    buildScenarioRow(
      "conservative-fundamental",
      "Conservative fundamental case",
      {
        ...assumptions,
        revenueCagrYears1To5: 0.16,
        fcfMargin: 0.28,
        normalizedSbcAsPctRevenue: 0.11,
        dilutionRate: 0.035,
        terminalMultiple: 12,
      },
      "AIP hype cools, government normalizes, SBC remains high, and the stock is valued on a more ordinary premium-software multiple.",
    ),
    buildScenarioRow(
      "bull",
      "Bull case",
      {
        ...assumptions,
        revenueCagrYears1To5: 0.38,
        fcfMargin: 0.5,
        normalizedSbcAsPctRevenue: 0.04,
        dilutionRate: 0.005,
        terminalMultiple: 30,
      },
      "AIP becomes a durable commercial growth engine, government remains strong, margins expand, and dilution largely fades.",
    ),
    buildScenarioRow(
      "hyper-bull",
      "Hyper bull case",
      {
        ...assumptions,
        revenueCagrYears1To5: 0.48,
        fcfMargin: 0.56,
        normalizedSbcAsPctRevenue: 0.03,
        dilutionRate: 0,
        terminalMultiple: 38,
      },
      "Speculative case where PLTR becomes a category-defining enterprise AI infrastructure layer with unusually persistent growth.",
    ),
  ];
  const notes = [
    "Reverse DCF uses the selected current price, diluted share count, net cash, revenue base, FCF margin, WACC, dilution, and exit multiple.",
    "Current EV equals selected current price times diluted shares, less selected net cash. Shares are in millions, so EV is displayed in USD millions.",
    "Current EV / FCF uses selected forward revenue base multiplied by selected FCF margin.",
    "AIP score, ontology moat score, and transcript sentiment are not inputs to this solver.",
    "The yfinance price snapshot is a market cross-check only; edit current price in assumptions before relying on implied expectations.",
  ];
  if (requiredFcfMargin >= 0.849) {
    notes.unshift("The implied FCF margin solver reached its 85% cap, which is a sign that margin alone is not a realistic justification at the selected price.");
  }
  if (requiredRevenueCagr >= 0.899) {
    notes.unshift("The implied revenue CAGR solver reached its 90% cap; raise the solver cap only for explicitly speculative stress tests.");
  }
  if (requiredTerminalMultiple >= 99.9) {
    notes.unshift("The implied exit multiple solver reached its 100x cap; this valuation would require assumptions beyond the dashboard's normal range.");
  }

  return {
    currentPrice: assumptions.currentPrice,
    dilutedShares: assumptions.dilutedShares,
    netCash: assumptions.netCash,
    currentEquityValue,
    currentEnterpriseValue,
    currentEvToRevenue,
    currentEvToFcf,
    requiredRevenueCagr,
    requiredFcfMargin,
    requiredTerminalMultiple,
    impliedDilutionDrag,
    impliedTerminalRevenue,
    impliedTerminalFcf,
    impliedTerminalFcfPerShare,
    marketImpliedExecutionRequirement,
    expectationScenarios,
    notes,
  };
}

export function calculatePltrValuationEngine(
  actuals: PltrActualQuarter[],
  assumptions: PltrValuationAssumptions,
) {
  const latest = actuals[actuals.length - 1];
  const nextRevenue = assumptions.baseRevenue * (1 + assumptions.revenueCagrYears1To5);
  const nextFcf = nextRevenue * assumptions.fcfMargin;
  const nextShares = assumptions.dilutedShares * (1 + assumptions.dilutionRate);
  const latestRuleOf40 = metricValue(latest, "ruleOf40");
  const ruleOf40RevenueMultiple = Math.max(4, 4 + (latestRuleOf40 * 100 - 40) * assumptions.ruleOf40MultipleSlope);

  const revenueMultipleValue = safeDivide(nextRevenue * assumptions.revenueMultiple + assumptions.netCash, nextShares);
  const fcfYieldValue = safeDivide(nextFcf / assumptions.fcfYield + assumptions.netCash, nextShares);
  const dcfValue = dcfFairValue(assumptions);
  const ruleOf40Value = safeDivide(nextRevenue * ruleOf40RevenueMultiple + assumptions.netCash, nextShares);
  const longTermFcfValue = longTermFcfPerShareValue(assumptions);

  const methods: PltrValuationMethod[] = [
    {
      key: "revenue-multiple",
      label: "Revenue Multiple",
      fairValue: revenueMultipleValue,
      description: "Forward revenue capitalized at an explicit EV/revenue multiple, adjusted for net cash and dilution.",
    },
    {
      key: "ev-fcf",
      label: "EV / FCF",
      fairValue: fcfYieldValue,
      description: "Forward FCF capitalized at a target FCF yield. Useful but sensitive to SBC treatment.",
    },
    {
      key: "dcf",
      label: "DCF",
      fairValue: dcfValue,
      description: "Five-year DCF with terminal growth, net cash, and dilution.",
    },
    {
      key: "rule-of-40",
      label: "Rule of 40 Implied Multiple",
      fairValue: ruleOf40Value,
      description: `Rule of 40 cross-check using ${ruleOf40RevenueMultiple.toFixed(1)}x implied EV/revenue.`,
    },
    {
      key: "long-term-fcf-per-share",
      label: "Long-Term FCF / Share",
      fairValue: longTermFcfValue,
      description: "Year-five FCF per share capitalized at an exit FCF multiple and discounted back.",
    },
  ];
  const selectedFairValue = methods.reduce((sum, method) => sum + method.fairValue, 0) / methods.length;
  const reverseDcf = buildReverseDcf(assumptions);
  const warnings: ValidationWarning[] = [];
  if (assumptions.currentPrice <= 0) {
    warnings.push({
      id: "pltr-missing-current-price",
      title: "Missing current price",
      detail: "Upside/downside and reverse DCF require a current market price.",
      severity: "high",
    });
  }
  if (assumptions.normalizedSbcAsPctRevenue > assumptions.sbcAsPctRevenue) {
    warnings.push({
      id: "pltr-sbc-normalization-higher-than-current",
      title: "SBC normalization assumption is higher than current",
      detail: "The normalized SBC assumption exceeds current SBC intensity. Confirm this is intentional.",
      severity: "medium",
    });
  }

  return {
    methods,
    selectedFairValue,
    reverseDcf,
    warnings,
  };
}
