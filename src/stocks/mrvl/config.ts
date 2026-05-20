import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { mrvlDataset } from "./data";

export const mrvlModule = createDeepResearchStockModule(mrvlDataset);
