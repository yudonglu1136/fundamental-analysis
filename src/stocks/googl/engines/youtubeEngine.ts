import type { GooglDataset, GooglValuationAssumptions, GooglYoutubeOutput } from "../model";
import { annualizeIfQuarterly, clamp, getGooglPeriod, getGooglRevenueLine } from "./helpers";

export function calculateGooglYoutubeEngine(
  data: GooglDataset,
  periodId: string,
  assumptions: GooglValuationAssumptions,
): GooglYoutubeOutput {
  const period = getGooglPeriod(data, periodId);
  const line = getGooglRevenueLine(data, periodId);
  const adsRevenue = annualizeIfQuarterly(line.youtubeAds, period);
  const subscriptionsSignal = data.aiOperatingSignals.subscriptions;
  const livingRoomDailyHours = data.aiOperatingSignals.youtubeLivingRoomDailyUsHours;
  const shortsPublisherCount = data.aiOperatingSignals.youtubeChannelsPublishingShortsDaily;
  const youtubeScaleScore = clamp(55 + livingRoomDailyHours / 10_000_000 + shortsPublisherCount / 1_000_000 + assumptions.youtubeRevenueCagr * 100, 40, 95);
  const monetizationScore = clamp(50 + assumptions.youtubeRevenueCagr * 160 + assumptions.subscriptionsRevenueCagr * 120 + subscriptionsSignal / 15, 35, 95);

  return {
    adsRevenue,
    subscriptionsSignal,
    livingRoomDailyHours,
    shortsPublisherCount,
    youtubeScaleScore,
    monetizationScore,
    notes: [
      "YouTube is modeled as ads plus a subscription ecosystem signal rather than only a video ad line.",
      "Living-room watch time, Shorts creation, creator tools, and Premium/Music subscriptions are treated as durability indicators.",
      "Alphabet does not disclose standalone YouTube operating income, so valuation uses capped margin assumptions inside Services/SOTP.",
    ],
  };
}
