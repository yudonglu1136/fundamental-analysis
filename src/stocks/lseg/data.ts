import { lsegCockpitDataset, lsegCockpitMarketData } from "./data/cockpitDataset";

export const lsegMockData = lsegCockpitDataset;
export const lsegMarketData = lsegCockpitMarketData;
export type LsegRawData = typeof lsegCockpitDataset;
