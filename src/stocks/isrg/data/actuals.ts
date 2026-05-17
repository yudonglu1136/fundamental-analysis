import type { IsrgActualPeriod } from "../model";
import { isrgActualData } from "../realData";

export const actualData: IsrgActualPeriod[] = isrgActualData;

export const latestOfficialQuarter =
  [...actualData].reverse().find((period) => period.periodType === "Q") ?? actualData[actualData.length - 1];

export const latestOfficialFullYear =
  [...actualData].reverse().find((period) => period.periodType === "FY") ?? actualData[actualData.length - 1];

