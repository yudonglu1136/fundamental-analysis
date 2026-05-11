import type { LsegQualityDiagnostics } from "./model";
import type { LsegBuybackEngineResult } from "./engines/buybackEngine";
import type { LsegFcfEngineResult } from "./engines/fcfEngine";
import type { LsegMarginEngineResult } from "./engines/marginEngine";
import type { LsegRevenueEngineResult } from "./engines/revenueEngine";
import type { LsegDcfResult, LsegScenarioAssumptions, LsegSotpResult, LsegWaccBuild } from "./model";
import type { LsegValuationEngineResult } from "./engines/valuationEngine";

export type LsegScenarioCalculationLike = {
  assumptions: LsegScenarioAssumptions;
  revenue: LsegRevenueEngineResult;
  margin: LsegMarginEngineResult;
  fcf: LsegFcfEngineResult;
  buyback: LsegBuybackEngineResult;
  wacc: LsegWaccBuild;
  dcf: LsegDcfResult;
  conservativeOperatingSotp: LsegSotpResult;
  baseOperatingSotp: LsegSotpResult;
  premiumOperatingSotp: LsegSotpResult;
  operatingSotp: LsegSotpResult;
  strategicSotp: LsegSotpResult;
  valuation: LsegValuationEngineResult;
  quality: LsegQualityDiagnostics;
  fcfPerShareSeries: number[];
  qualityDirectValuationLink: boolean;
};
