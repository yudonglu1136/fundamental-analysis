import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { ktosDataset } from "./data";

export const ktosModule = createDeepResearchStockModule(ktosDataset);
