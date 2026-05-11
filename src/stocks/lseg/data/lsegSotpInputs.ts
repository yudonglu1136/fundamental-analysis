import type { LsegSotpInputs } from "../model";

export const lsegSotpInputs: LsegSotpInputs = {
  minorityAdjustments: [
    {
      id: "tradewebNciAdjustment",
      label: "Tradeweb NCI / Look-through Leakage",
      amount: 0,
      source: "Mapped to the ownership bridge. Tradeweb-related economics are treated as equity-method / look-through and do not receive an operating SOTP NCI deduction by default.",
      sourceType: "derived",
      isPlaceholder: false,
      confidenceLevel: "medium",
      notes: "Retained for backward-compatible audit mapping. Ownership bridge is the primary source of truth.",
    },
    {
      id: "postTradeSolutionsNciAdjustment",
      label: "Post Trade Solutions Minority Leakage",
      amount: 76.5,
      source: "Mapped to the ownership bridge using 15% minority share on £30m embedded EBITDA at 17x.",
      sourceType: "derived",
      isPlaceholder: false,
      confidenceLevel: "medium",
      notes: "Retained for backward-compatible audit mapping. Ownership bridge is the primary source of truth.",
    },
    {
      id: "otherMinorityInterests",
      label: "Other Minority Interests",
      amount: 470,
      source: "Residual balance-sheet style fallback from the ownership bridge.",
      sourceType: "derived",
      isPlaceholder: true,
      confidenceLevel: "medium",
      notes: "Residual bucket used to reconcile total minority leakage conservatively. Ownership bridge remains the primary source of truth.",
    },
  ],
  corporateCost: {
    treatment: "included_in_segment_ebitda",
    amount: 0,
    multiple: 8,
    source: "Reported 2025 segment taxonomy includes an Other / Corporate / eliminations line. Operating SOTP therefore treats corporate cost as already reflected inside reported segment EBITDA rather than deducting an extra standalone corporate charge.",
    sourceDate: "2026-03-06",
    sourceType: "actual",
    isPlaceholder: false,
    confidenceLevel: "high",
    includedInSegmentEbitda: true,
    deductedSeparately: false,
    notes: "If a future segment bridge moves to pre-corporate EBITDA, this treatment must switch to deducted_separately with an explicit cost value deduction.",
  },
};
