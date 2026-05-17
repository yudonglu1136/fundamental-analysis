import type { MsftDataset, MsftEarningsFocusScores } from "../model";

export const msftFocusLabels: Record<keyof MsftEarningsFocusScores, string> = {
  azureDemand: "Azure / AI Demand",
  aiCapexFcf: "AI Capex / FCF",
  cloudGrossMargin: "Cloud GM",
  copilotMonetization: "Copilot Monetization",
  openAiExposure: "OpenAI Exposure",
  bookingsRpo: "Bookings / RPO",
  consumerGamingPc: "Consumer / Gaming / PC",
};

export function calculateMsftEarningsCallEngine(data: MsftDataset, selectedQuarterId?: string) {
  const quarters = data.earningsCalls;
  const selected = quarters.find((quarter) => quarter.id === selectedQuarterId) ?? quarters[quarters.length - 1];
  const latest = quarters[quarters.length - 1];
  const first = quarters[0];
  const focusTrendRows = quarters.map((quarter) => ({
    id: quarter.id,
    quarter: quarter.fiscalQuarter,
    cloudRevenue: quarter.microsoftCloudRevenue,
    azureGrowth: quarter.azureGrowth * 100,
    cloudGrossMargin: quarter.microsoftCloudGrossMargin * 100,
    aiCapexFcf: quarter.focusScores.aiCapexFcf,
    copilotMonetization: quarter.focusScores.copilotMonetization,
    openAiExposure: quarter.focusScores.openAiExposure,
    bookingsRpo: quarter.focusScores.bookingsRpo,
    consumerGamingPc: quarter.focusScores.consumerGamingPc,
  }));
  const selectedFocusRows = (Object.keys(selected.focusScores) as Array<keyof MsftEarningsFocusScores>).map((key) => ({
    theme: msftFocusLabels[key],
    score: selected.focusScores[key],
    latestScore: latest.focusScores[key],
    changeSinceFirst: latest.focusScores[key] - first.focusScores[key],
  }));
  const quarterIndex = Math.max(0, quarters.findIndex((quarter) => quarter.id === selected.id));

  return {
    quarters,
    selected,
    quarterIndex,
    latest,
    overview: data.earningsTrendSynthesis,
    focusTrendRows,
    selectedFocusRows,
    sourceBoundary:
      "Quarterly metrics are official Microsoft investor metrics where disclosed. Market-focus scores and the cross-quarter synthesis are research-only AI synthesis from official transcripts, releases, and Q&A themes.",
  };
}
