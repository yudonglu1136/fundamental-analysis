import { createBiopharmaResearchModule } from "../biopharmaResearch/moduleFactory";
import { bmyResearchData } from "./researchData";

export const bmyModule = createBiopharmaResearchModule(bmyResearchData);
