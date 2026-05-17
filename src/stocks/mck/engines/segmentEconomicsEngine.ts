import type { MckDataset, MckSegmentEconomicsOutput } from "../types";
import { dataBadge, latestFinancial, safeDivide, segmentsForPeriod, sumSegments } from "./helpers";

export function calculateSegmentEconomicsEngine(data: MckDataset): MckSegmentEconomicsOutput {
  const period = latestFinancial(data);
  const segments = segmentsForPeriod(data, period.periodId).filter((segment) => segment.segment !== "Corporate / Other");
  const groupRevenue = sumSegments(segments, "revenue");
  const groupAdjustedOperatingProfit = sumSegments(segments, "adjustedOperatingProfit");
  const groupMargin = safeDivide(groupAdjustedOperatingProfit, groupRevenue);

  return {
    segments: segments.map((segment) => {
      const marginPremiumBps = (segment.margin - groupMargin) * 10000;
      const isDistribution = segment.segment === "North American Pharmaceutical";
      const isOncology = segment.segment === "Oncology & Multispecialty";
      const isRxTech = segment.segment === "Prescription Technology Solutions";
      return {
        ...segment,
        revenueMix: safeDivide(segment.revenue, groupRevenue),
        profitMix: safeDivide(segment.adjustedOperatingProfit, groupAdjustedOperatingProfit),
        marginPremiumVsGroupBps: marginPremiumBps,
        dataBadge: dataBadge(segment.tag.sourceType),
        investmentRead: isDistribution
          ? "Scale moat: enormous revenue base, thin margin, strong purchasing/logistics density."
          : isOncology
            ? "Core growth thesis: provider solutions and specialty distribution with higher stickiness."
            : isRxTech
              ? "Platform-like layer: access, affordability, third-party logistics and manufacturer connectivity."
              : "Portfolio asset: attractive margin but planned separation/minority transaction changes the SOTP treatment.",
      };
    }),
    groupRevenue,
    groupAdjustedOperatingProfit,
    groupMargin,
    groupMarginBps: groupMargin * 10000,
  };
}
