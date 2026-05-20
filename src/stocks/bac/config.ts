import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { bacDataset } from "./data";

export const bacModule = createDeepResearchStockModule(bacDataset);
