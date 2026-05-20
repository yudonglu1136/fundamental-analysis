import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { eqtDataset } from "./data";

export const eqtModule = createDeepResearchStockModule(eqtDataset);
