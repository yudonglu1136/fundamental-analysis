import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { cbDataset } from "./data";

export const cbModule = createDeepResearchStockModule(cbDataset);
