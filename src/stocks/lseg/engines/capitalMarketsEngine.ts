import type { LsegCockpitDataset, LsegSpecialistEngineOutput } from "../types";

export function calculateLsegCapitalMarketsEngine(data: LsegCockpitDataset): LsegSpecialistEngineOutput {
  const segment = data.segmentActuals.find((row) => row.segment === "Capital Markets");
  const equities = data.productLines.find((row) => row.segment === "Capital Markets" && row.name === "Equities");
  const fixedIncome = data.productLines.find((row) => row.segment === "Capital Markets" && row.name === "Fixed income, derivatives and other");
  const fx = data.productLines.find((row) => row.segment === "Capital Markets" && row.name === "FX");

  return {
    title: "Capital Markets / Tradeweb Lab",
    segment: "Capital Markets",
    summary:
      "Capital Markets is no longer the main LSEG growth identity. It provides ecosystem and platform optionality, especially through Tradeweb/electronification, but should not receive the same multiple as FTSE Russell or data subscriptions.",
    metrics: [
      { label: "Analytical revenue", value: segment?.revenue ?? 0, sourceType: segment?.sourceType ?? "forecast_assumption", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Analytical EBITDA", value: segment?.adjustedEbitda ?? 0, sourceType: segment?.sourceType ?? "forecast_assumption", sourceId: segment?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Equities revenue", value: equities?.revenue ?? 0, sourceType: "official_actual", sourceId: equities?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Fixed income / derivatives / other", value: fixedIncome?.revenue ?? 0, sourceType: "official_actual", sourceId: fixedIncome?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "FX revenue", value: fx?.revenue ?? 0, sourceType: "official_actual", sourceId: fx?.sourceId ?? "lseg-ar2025-pdf" },
      { label: "Tradeweb 2025 total volume", value: "$688tn", sourceType: "official_actual", sourceId: "lseg-ar2025-pdf" },
    ],
    drivers: [
      "Fixed income electronification and Tradeweb activity.",
      "FX workflow and venue functionality.",
      "UK listing / primary market activity remains strategically relevant but not the valuation engine.",
      "Market volatility can lift activity and should be normalized in bear/base scenarios.",
    ],
    debates: [
      "Is Tradeweb structural growth enough to offset cyclical capital-markets volumes?",
      "Does the exchange brand and regulatory position feed the data/infrastructure ecosystem?",
      "Is UK listing weakness a small optical issue or a larger platform signal?",
    ],
    monitoring: [
      "Tradeweb ADV, rates/credit/repo mix and fee capture.",
      "UK value traded and IPO/listing activity.",
      "FX ADV and market-volatility normalization.",
      "Capital Markets organic growth below low-single digits with weak Tradeweb commentary is a downgrade trigger.",
    ],
    warnings: [
      "Capital Markets is given a lower growth multiple than Data & Analytics, FTSE Russell and Post Trade.",
    ],
  };
}
