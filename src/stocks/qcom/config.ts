import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { qcomDataset } from "./data";

export const qcomModule = createDeepResearchStockModule(qcomDataset);
