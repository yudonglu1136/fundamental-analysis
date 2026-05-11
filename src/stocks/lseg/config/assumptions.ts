import { lsegMarketData } from "../data/lsegMarketData";

export type LsegValuationAssumptions = {
  currentPrice: number;
  taxRate: number;
  capexIntensity: number;
  cashInterestExpense: number;
  workingCapitalAsPctRevenue: number;
  integrationCashCost: number;
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  preTaxCostOfDebt: number;
  targetPe: number;
  targetFcfYield: number;
  terminalGrowth: number;
  exitPe: number;
  dividendYield: number;
  weightDcf: number;
  weightFcfYield: number;
  weightSotp: number;
  weightPe: number;
  buyback2026: number;
  buyback2027: number;
  averageBuybackPrice2026: number;
  averageBuybackPrice2027: number;
};

export const defaultLsegValuationAssumptions: LsegValuationAssumptions = {
  currentPrice: lsegMarketData.manualOverride ?? lsegMarketData.currentPrice,
  taxRate: 0.245,
  capexIntensity: 0.095,
  cashInterestExpense: 340,
  workingCapitalAsPctRevenue: 0.007,
  integrationCashCost: 120,
  riskFreeRate: 0.0425,
  beta: 0.9,
  equityRiskPremium: 0.0525,
  preTaxCostOfDebt: 0.05,
  targetPe: 22.5,
  targetFcfYield: 0.0475,
  terminalGrowth: 0.0225,
  exitPe: 22,
  dividendYield: 0.013,
  weightDcf: 0.3,
  weightFcfYield: 0.35,
  weightSotp: 0.2,
  weightPe: 0.15,
  buyback2026: 1500,
  buyback2027: 1500,
  averageBuybackPrice2026: 112,
  averageBuybackPrice2027: 118,
};
