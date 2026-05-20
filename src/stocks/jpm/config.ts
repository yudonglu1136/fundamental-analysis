import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { jpmDataset } from "./data";

export const jpmModule = createDeepResearchStockModule(jpmDataset);
