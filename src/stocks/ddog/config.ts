import { createDeepResearchStockModule } from "../deepResearch/createDeepResearchModule";
import { ddogDataset } from "./data";

export const ddogModule = createDeepResearchStockModule(ddogDataset);
