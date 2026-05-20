import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { unhDataset } from "./data";

export const unhModule = createDeepResearchStockModule(unhDataset);
