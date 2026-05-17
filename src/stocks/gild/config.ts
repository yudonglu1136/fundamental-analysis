import { createBiopharmaResearchModule } from "../biopharmaResearch/moduleFactory";
import { gildResearchData } from "./researchData";
import { GildDashboard } from "./dashboard";

const baseGildModule = createBiopharmaResearchModule(gildResearchData);

export const gildModule = {
  ...baseGildModule,
  Dashboard: GildDashboard,
};
