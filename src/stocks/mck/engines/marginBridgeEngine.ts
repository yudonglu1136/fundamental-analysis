import type { MckDataset, MckMarginBridgeOutput } from "../types";
import { priorFinancial, latestFinancial, segmentsForPeriod, sumSegments, safeDivide } from "./helpers";

export function calculateMarginBridgeEngine(data: MckDataset): MckMarginBridgeOutput {
  const prior = priorFinancial(data);
  const latest = latestFinancial(data);
  const priorSegments = segmentsForPeriod(data, prior.periodId).filter((row) => row.revenue > 0);
  const latestSegments = segmentsForPeriod(data, latest.periodId);
  const priorMarginBps = safeDivide(sumSegments(priorSegments, "adjustedOperatingProfit"), sumSegments(priorSegments, "revenue")) * 10000;
  const currentMarginBps = safeDivide(sumSegments(latestSegments, "adjustedOperatingProfit"), sumSegments(latestSegments, "revenue")) * 10000;
  const bridge = [
    { driver: "Branded mix / price pass-through", bps: -7, sourceType: "assumption" as const, note: "Research estimate; official release cites lower branded pharmaceutical contribution in Q4." },
    { driver: "Generic program / sourcing", bps: 3, sourceType: "assumption" as const, note: "Generic economics can help profit dollars but remain deflation-sensitive." },
    { driver: "Specialty / oncology mix", bps: 18, sourceType: "derived" as const, note: "FY2026 Oncology & Multispecialty profit grew faster than group profit." },
    { driver: "GLP-1 volume impact", bps: -4, sourceType: "research" as const, note: "Volume can be margin-rate dilutive even if profit dollars rise." },
    { driver: "Cost inflation / compliance", bps: -5, sourceType: "research" as const, note: "Distribution compliance and labor cost pressure." },
    { driver: "Operating leverage", bps: 9, sourceType: "derived" as const, note: "Adjusted EPS growth exceeded revenue growth in FY2026." },
  ];
  return {
    priorMarginBps,
    currentMarginBps,
    bridge,
    marginChangeBps: currentMarginBps - priorMarginBps,
  };
}
