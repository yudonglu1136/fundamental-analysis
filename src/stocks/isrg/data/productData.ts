import { isrgProductEvents, isrgResearchSignals } from "../realData";

export const productData = {
  daVinci5Events: isrgProductEvents.filter((event) => event.platform === "da Vinci 5"),
  ionSignals: isrgResearchSignals.filter((signal) => signal.category === "Ion"),
  spEvents: isrgProductEvents.filter((event) => event.platform === "SP"),
  digitalEvents: isrgProductEvents.filter((event) => event.platform === "Digital"),
  sourceBoundary:
    "Product narrative is research-only unless converted into explicit placement, ASP, utilization, or margin assumptions.",
};

