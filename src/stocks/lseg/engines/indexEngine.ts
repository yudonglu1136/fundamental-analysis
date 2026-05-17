import type { LsegCockpitDataset, LsegSpecialistEngineOutput } from "../types";

export function calculateLsegIndexEngine(data: LsegCockpitDataset): LsegSpecialistEngineOutput {
  const segment = data.segmentActuals.find((row) => row.segment === "FTSE Russell / Index");
  const subscriptions = data.productLines.find((row) => row.segment === "FTSE Russell / Index" && row.name === "Subscriptions");
  const assetBased = data.productLines.find((row) => row.segment === "FTSE Russell / Index" && row.name === "Asset-based");

  return {
    title: "FTSE Russell / Index IP Lab",
    segment: "FTSE Russell / Index",
    summary:
      "FTSE Russell is the highest-quality IP sleeve: high margin, subscription plus asset-based fees, and benchmark network effects. The haircut is passive fee pressure and MSCI/S&P/Nasdaq competition.",
    metrics: [
      { label: "Revenue", value: segment?.revenue ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Adjusted EBITDA", value: segment?.adjustedEbitda ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "EBITDA margin", value: segment?.margin ?? 0, sourceType: "official_actual", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Subscription revenue", value: subscriptions?.revenue ?? 0, sourceType: "official_actual", sourceId: subscriptions?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Asset-based revenue", value: assetBased?.revenue ?? 0, sourceType: "official_actual", sourceId: assetBased?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Official disclosed FTSE Russell AUM", value: "$18.1tn", sourceType: "official_actual", sourceId: "lseg-ar2025-pdf" },
    ],
    drivers: [
      "Benchmark licensing demand across passive ETFs, institutional mandates, fixed income, factor and custom indices.",
      "Asset-based revenue sensitivity to passive AUM and market levels.",
      "Subscription revenue supports durability and premium SOTP multiple.",
    ],
    debates: [
      "Does FTSE Russell deserve a MSCI-like premium, or is it structurally discounted by fee compression?",
      "Can fixed income, custom and private market indices offset passive equity fee pressure?",
      "How much China / emerging market index exposure is a growth option versus regulatory risk?",
    ],
    monitoring: [
      "Asset-based revenue growth versus market beta.",
      "ETF/passive AUM and benchmark win/loss commentary.",
      "Custom index and private-market index disclosures.",
      "Organic growth below 4% or asset-based revenue contraction in rising markets is a warning.",
    ],
    warnings: [
      "SOTP applies a segment-specific multiple; FTSE Russell is not blended into a generic group EV/EBITDA multiple.",
    ],
  };
}
