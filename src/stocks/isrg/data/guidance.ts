import type { IsrgGuidancePoint } from "../model";
import { isrgOfficialGuidance } from "../realData";

export const officialGuidance: IsrgGuidancePoint[] = isrgOfficialGuidance.map((item) => ({
  ...item,
  source: {
    ...item.source,
    sourceStatus: "management_guidance",
    usedInValuation: true,
    researchOnly: false,
  },
}));

