import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { beDataset } from "./data";

export const beModule = createDeepResearchStockModule(beDataset);
