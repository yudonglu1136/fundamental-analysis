import type { MsftDataset, MsftValuationAssumptions } from "../model";
import { clamp, safeRatio } from "./helpers";

export function calculateMsftCopilotEngine(data: MsftDataset, assumptions: MsftValuationAssumptions) {
  const paidSeats = data.aiDisclosures.find((item) => item.id === "copilot-paid-seats-q3-fy26")?.metric ?? 20;
  const eligibleSeatBase = 160;
  const currentPenetration = safeRatio(paidSeats, eligibleSeatBase);
  const targetSeats = eligibleSeatBase * assumptions.copilotPenetration;
  const incrementalSeats = Math.max(targetSeats - paidSeats, 0);
  const targetRevenue = targetSeats * assumptions.copilotArpuAnnual;
  const currentRevenueRunRate = paidSeats * 300;
  const grossProfitAfterInference = targetRevenue * assumptions.copilotGrossMarginYear5;
  const inferenceCostDrag = targetRevenue * (1 - assumptions.copilotGrossMarginYear5);
  const adoptionSignal = assumptions.copilotPenetration > 0.35 ? "software-upside" : assumptions.copilotPenetration > 0.2 ? "scaling" : "proof-point";

  return {
    sourceBoundary: "Paid seats are management commentary; eligible seat base, ARPU, target penetration, and gross margin are scenario assumptions.",
    paidSeats,
    eligibleSeatBase,
    currentPenetration,
    targetSeats,
    incrementalSeats,
    targetRevenue,
    currentRevenueRunRate,
    grossProfitAfterInference,
    inferenceCostDrag,
    adoptionSignal,
    marginLiftPotential: clamp(assumptions.copilotGrossMarginYear5 - 0.54, -0.12, 0.22),
    bullets: [
      "Copilot must become both a seat uplift and a usage business; management described per-user businesses moving toward seat plus consumption.",
      "Current seat count is disclosed as over 20m, but Microsoft does not disclose M365 Copilot revenue, ARPU, churn, or gross margin.",
      "The model treats Copilot as margin-accretive only when inference efficiency and ARPU offset usage intensity.",
    ],
  };
}
