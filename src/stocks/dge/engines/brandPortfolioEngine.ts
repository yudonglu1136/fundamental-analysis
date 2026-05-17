import type { DgeBrandPortfolioOutput, DgeDataset } from "../types";
import { average, clamp, evidenceList } from "./helpers";

function trendValue(trend: string) {
  if (trend === "improving") return 78;
  if (trend === "stable") return 60;
  if (trend === "mixed") return 48;
  return 30;
}

export function buildDgeBrandPortfolioEngine(data: DgeDataset): DgeBrandPortfolioOutput {
  const brandRows = data.reportedData.brands.map((brand) => {
    const affordabilityGap = clamp((brand.priceTier === "super-premium" ? 30 : brand.priceTier === "premium" ? 18 : 8) + brand.promotionalIntensity * 0.45);
    const moatScore = Math.round(
      clamp(
        brand.brandHealthScore * 0.45 +
          trendValue(brand.currentGrowthTrend) * 0.2 +
          (100 - brand.competitivePressure) * 0.2 +
          (100 - affordabilityGap) * 0.15,
      ),
    );
    const explanation =
      brand.brand === "Guinness"
        ? "Structural beer/Guinness growth is strong, but it cannot offset all US Spirits and tequila weakness."
        : brand.category === "Tequila"
          ? "Tequila is treated as normalization risk after share loss and affordability pressure, not as a perpetual premiumisation engine."
          : "Brand score blends growth trend, price tier, promotion, inventory issue and competitive pressure.";
    return { ...brand, moatScore, affordabilityGap: Math.round(affordabilityGap), explanation };
  });

  const guinness = brandRows.find((row) => row.brand === "Guinness");
  const tequilaRows = brandRows.filter((row) => row.category === "Tequila");
  const scotchRows = brandRows.filter((row) => row.category === "Scotch");
  const usWhiskeyRows = brandRows.filter((row) => row.category === "US Whiskey" || row.category === "Canadian Whisky");
  const valueTierCoverageScore = Math.round(
    clamp(average(brandRows.filter((row) => row.priceTier === "value" || row.priceTier === "mainstream" || row.priceTier === "mixed").map((row) => row.moatScore)) - 4),
  );
  const affordabilityGapScore = Math.round(average(brandRows.map((row) => row.affordabilityGap)));
  const premiumisationDurabilityScore = Math.round(
    clamp(average(brandRows.filter((row) => row.priceTier === "premium" || row.priceTier === "super-premium" || row.priceTier === "luxury").map((row) => row.moatScore)) - affordabilityGapScore * 0.18),
  );

  return {
    brandRows,
    brandHealthScore: Math.round(average(brandRows.map((row) => row.moatScore))),
    premiumisationDurabilityScore,
    affordabilityGapScore,
    guinnessStructuralGrowthScore: guinness?.moatScore ?? 0,
    tequilaNormalizationRisk: Math.round(clamp(100 - average(tequilaRows.map((row) => row.moatScore)) + average(tequilaRows.map((row) => row.competitivePressure)) * 0.35)),
    scotchGrowthScore: Math.round(average(scotchRows.map((row) => row.moatScore))),
    usWhiskeyRisk: Math.round(clamp(100 - average(usWhiskeyRows.map((row) => row.moatScore)) + 18)),
    valueTierCoverageScore,
    portfolioRebalancingNeed: Math.round(clamp(affordabilityGapScore * 0.6 + (100 - valueTierCoverageScore) * 0.4)),
    evidenceIds: evidenceList(...brandRows.map((row) => row.sourceEvidenceIds)),
    warnings: [
      "Guinness strength is separated from US Spirits and tequila weakness.",
      "Premiumisation durability is penalized when high-tier brands require more promotion and lose share.",
      ...(valueTierCoverageScore < 60 ? ["Value-tier and affordability coverage is not strong enough to ignore downtrading risk."] : []),
    ],
  };
}
