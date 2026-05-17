import type { LsegCockpitDataset, LsegSpecialistEngineOutput } from "../types";

export function calculateLsegPostTradeEngine(data: LsegCockpitDataset): LsegSpecialistEngineOutput {
  const segment = data.segmentActuals.find((row) => row.segment === "Post Trade / LCH");
  const postTradeLines = data.productLines.filter((row) => row.segment === "Post Trade / LCH");
  const rates = postTradeLines.find((row) => row.name === "OTC derivatives");
  const ncc = postTradeLines.find((row) => row.name === "Non-cash collateral");
  const nti = postTradeLines.find((row) => row.name === "Net treasury income");

  return {
    title: "Post Trade / Clearing Infrastructure Lab",
    segment: "Post Trade / LCH",
    summary:
      "Post Trade is treated as systemic clearing infrastructure, not ordinary financial services. LCH/SwapClear durability supports an infrastructure multiple, but rate-cycle, capital, margin-model and regulatory risk cap the premium.",
    metrics: [
      { label: "Analytical revenue", value: segment?.revenue ?? 0, sourceType: segment?.sourceType ?? "forecast_assumption", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Analytical EBITDA", value: segment?.adjustedEbitda ?? 0, sourceType: segment?.sourceType ?? "forecast_assumption", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "OTC derivatives revenue", value: rates?.revenue ?? 0, sourceType: "official_actual", sourceId: rates?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Non-cash collateral revenue", value: ncc?.revenue ?? 0, sourceType: "official_actual", sourceId: ncc?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Net treasury income", value: nti?.revenue ?? 0, sourceType: "official_actual", sourceId: nti?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "SwapClear IRS notional cleared", value: "$1,941tn", sourceType: "official_actual", sourceId: "lseg-ar2025-pdf" },
      { label: "ForexClear notional cleared", value: "$48.1tn", sourceType: "official_actual", sourceId: "lseg-ar2025-pdf" },
    ],
    drivers: [
      "SwapClear, ForexClear, RepoClear and collateral services are network-effect infrastructure tied to multi-counterparty risk management.",
      "Collateral and net treasury income are interest-rate sensitive; valuation normalizes rather than capitalizes peak rate tailwinds indefinitely.",
      "Regulatory capital, default waterfall design and margin model resilience are explicit risk triggers.",
    ],
    debates: [
      "Is LCH a durable infrastructure moat or a regulated utility with limited upside?",
      "How much 2025 clearing growth was volume/volatility versus structural central clearing demand?",
      "Can DigitalAssetClear and post-trade customer investment broaden the moat without adding tail risk?",
    ],
    monitoring: [
      "SwapClear notional and client trades.",
      "ForexClear notional and members.",
      "RepoClear nominal value and securities clearing volumes.",
      "Net treasury income sensitivity as interest rates fall.",
      "UK/EU/US clearing regulation, margin model changes and default waterfall events.",
    ],
    warnings: [
      "Post Trade EBITDA is an analytical split of Markets. Revenue product lines are official; EBITDA allocation is a forecast assumption and is flagged accordingly.",
    ],
  };
}
