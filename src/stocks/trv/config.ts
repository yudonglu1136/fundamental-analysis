import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { trvDataset } from "./data";

export const trvModule = createDeepResearchStockModule(trvDataset);
