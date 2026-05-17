import type {
  LsegCockpitDataset,
  LsegPostTradeAnnualUplift,
  LsegPostTradeEconomicsOutput,
  LsegScenarioAssumption,
  LsegValuationAssumptions,
} from "../types";

export type IncrementalPostTradeUpliftInput = {
  year: number;
  baseYear: number;
  oldShare: number;
  currentShare: number;
  forwardShare: number;
  eligibleProfitPool: number;
  passthroughRate: number;
  taxRate: number;
  fcfConversion: number;
  profitPoolGrowth: number;
  dilutedShares: number;
  alreadyIncludedInActuals: boolean;
  durationCapturePct: number;
};

function getLatestFiscalYear(data: LsegCockpitDataset) {
  return Math.max(...data.officialActuals.map((period) => period.fiscalYear));
}

function isKnownAsOf(data: LsegCockpitDataset, assumptions: LsegValuationAssumptions) {
  const knownAsOfDate = data.buildDate || assumptions.priceDate;
  const knownFromDate = assumptions.postTradeSwapClearEconomics.knownFromDate;
  return knownAsOfDate >= knownFromDate;
}

export function calculateIncrementalPostTradeUplift(input: IncrementalPostTradeUpliftInput): LsegPostTradeAnnualUplift {
  const yearOffset = Math.max(input.year - input.baseYear, 0);
  const grownProfitPool = input.eligibleProfitPool * (1 + input.profitPoolGrowth) ** yearOffset;
  const baselineShare = input.alreadyIncludedInActuals ? input.currentShare : input.oldShare;
  const shareSavings = input.year >= input.baseYear ? Math.max(baselineShare - input.forwardShare, 0) : 0;
  const incrementalEbitda = grownProfitPool * shareSavings * input.passthroughRate * input.durationCapturePct;
  const incrementalNopat = incrementalEbitda * (1 - input.taxRate);
  const incrementalFcff = incrementalNopat * input.fcfConversion;
  const incrementalAepsPence = incrementalNopat / Math.max(input.dilutedShares, 1) * 100;

  return {
    year: input.year,
    bankRevenueShareBaseline: baselineShare,
    bankRevenueShareForward: input.forwardShare,
    eligibleProfitPool: grownProfitPool,
    incrementalEbitda,
    incrementalNopat,
    incrementalFcff,
    incrementalAepsPence,
  };
}

export function calculateLsegPostTradeSwapClearEconomicsEngine(
  data: LsegCockpitDataset,
  scenario: LsegScenarioAssumption,
  assumptions: LsegValuationAssumptions,
  options: { forecastEndYear?: number; wacc?: number; terminalGrowth?: number } = {},
): LsegPostTradeEconomicsOutput {
  const setup = assumptions.postTradeSwapClearEconomics;
  const latestFiscalYear = getLatestFiscalYear(data);
  const knownAsOfDate = data.buildDate || assumptions.priceDate;
  const active = setup.enabled && isKnownAsOf(data, assumptions);
  const alreadyIncludedInActuals = latestFiscalYear >= setup.benefitAlreadyIncludedInActualsThroughYear;
  const warnings: string[] = [];

  if (!active) {
    warnings.push(`SwapClear forward economics are not included because the transaction was not known as of ${knownAsOfDate}.`);
  }
  if (active && setup.netDebtImpactAlreadyCaptured) {
    warnings.push("Transaction debt drag is treated as already captured in the current net debt snapshot, so the bridge does not subtract it again.");
  }
  if (active) {
    warnings.push(setup.uncertaintyNote);
  }

  const annualUplifts = active
    ? Array.from({ length: setup.economicsEndYear - setup.forwardEconomicsStart + 1 }, (_, index) => {
        const year = setup.forwardEconomicsStart + index;
        return calculateIncrementalPostTradeUplift({
          year,
          baseYear: setup.forwardEconomicsStart,
          oldShare: setup.oldBankRevenueShare,
          currentShare: setup.currentBankRevenueShare2025,
          forwardShare: setup.forwardBankRevenueShare2026Onward,
          eligibleProfitPool: setup.eligibleProfitPool,
          passthroughRate: scenario.postTradeEconomics.passthroughRate,
          taxRate: assumptions.taxRate,
          fcfConversion: scenario.postTradeEconomics.fcfConversionRate,
          profitPoolGrowth: scenario.postTradeEconomics.profitPoolGrowth,
          dilutedShares: assumptions.dilutedShares,
          alreadyIncludedInActuals,
          durationCapturePct: scenario.postTradeEconomics.durationCapturePct,
        });
      })
    : [];

  const forecastEndYear = options.forecastEndYear ?? setup.forwardEconomicsStart + 4;
  const wacc = options.wacc ?? scenario.wacc;
  const terminalGrowth = options.terminalGrowth ?? scenario.terminalGrowth;
  const discountBaseYear = Math.max(setup.forwardEconomicsStart - 1, latestFiscalYear);
  const explicitAfterForecast = annualUplifts.filter((row) => row.year > forecastEndYear && row.year <= setup.economicsEndYear);
  const pvExplicitFcffAfterForecast = explicitAfterForecast.reduce((sum, row) => {
    const yearNumber = row.year - discountBaseYear;
    return sum + row.incrementalFcff / (1 + wacc) ** Math.max(yearNumber, 1);
  }, 0);
  const finalYearUplift = annualUplifts.find((row) => row.year === setup.economicsEndYear)?.incrementalFcff ?? 0;
  const residualTerminalValue = finalYearUplift * scenario.postTradeEconomics.terminalResidualCapturePct * (1 + terminalGrowth) /
    Math.max(wacc - terminalGrowth, 0.01);
  const pvResidualTerminalValue = residualTerminalValue / (1 + wacc) ** Math.max(setup.economicsEndYear - discountBaseYear, 1);
  const durationValue = pvExplicitFcffAfterForecast + pvResidualTerminalValue;

  return {
    active,
    knownAsOfDate,
    knownFromDate: setup.knownFromDate,
    sourceId: setup.sourceId,
    scenario: scenario.scenario,
    explanation:
      "The forward layer capitalizes the 2026-2045 reduction in bank revenue share for SwapClear/Post Trade separately from the 2025 reported snapshot.",
    originalModelLimitation:
      "The original model reflected Q3/FY2025 margin, FCF and net debt, but did not fully capitalize the recurring 2026-2045 clearing economics in DCF, SOTP, FCF yield or terminal value.",
    alreadyIncludedInActuals,
    assumptionDriven: true,
    uncertaintyNote: setup.uncertaintyNote,
    oldBankRevenueShare: setup.oldBankRevenueShare,
    currentBankRevenueShare2025: setup.currentBankRevenueShare2025,
    forwardBankRevenueShare2026Onward: setup.forwardBankRevenueShare2026Onward,
    transactionDebtImpact: setup.transactionDebtImpact,
    netDebtImpactAlreadyCaptured: setup.netDebtImpactAlreadyCaptured,
    segmentMultiplePremium: active ? scenario.postTradeEconomics.segmentMultiplePremium : 0,
    terminalResidualCapturePct: active ? scenario.postTradeEconomics.terminalResidualCapturePct : 0,
    annualUplifts,
    yearOneIncrementalEbitda: annualUplifts[0]?.incrementalEbitda ?? 0,
    yearOneIncrementalFcff: annualUplifts[0]?.incrementalFcff ?? 0,
    pvExplicitFcffAfterForecast,
    residualTerminalValue,
    pvResidualTerminalValue,
    durationValue,
    netDebtDragPerShare: setup.netDebtImpactAlreadyCaptured ? 0 : setup.transactionDebtImpact / Math.max(assumptions.dilutedShares, 1),
    warnings,
  };
}
