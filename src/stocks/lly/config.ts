import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { llyDataset } from "./data";

export const llyModule = createDeepResearchStockModule(llyDataset);
