import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { temDataset } from "./data";

export const temModule = createDeepResearchStockModule(temDataset);
