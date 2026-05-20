import type { Signal } from "../types";
import type { EarningsCallDataset, EarningsCallQuarter, EarningsCallTrendOutput, EarningsFocusTopic } from "./types";

const topicLabels: Record<EarningsFocusTopic, string> = {
  core_revenue: "Core revenue",
  growth_portfolio: "Growth portfolio",
  loe_or_erosion: "LOE / erosion",
  pipeline: "Pipeline",
  capital_allocation: "Capital allocation",
  margin: "Margin / profitability",
  cell_therapy: "Cell therapy",
  launch_execution: "Launch execution",
  regulatory: "Regulatory",
  cash_runway: "Cash runway",
};

function intensityFor(quarter: EarningsCallQuarter, topic: EarningsFocusTopic) {
  return quarter.marketFocus.find((item) => item.topic === topic)?.intensity ?? 0;
}

function direction(values: number[]): EarningsCallTrendOutput["topicTrendRows"][number]["direction"] {
  const firstHalf = values.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  const secondHalf = values.slice(4).reduce((sum, value) => sum + value, 0) / 4;
  const range = Math.max(...values) - Math.min(...values);
  if (range >= 6 && Math.abs(secondHalf - firstHalf) < 1.5) return "volatile";
  if (secondHalf - firstHalf >= 1.5) return "rising";
  if (firstHalf - secondHalf >= 1.5) return "falling";
  return "stable";
}

function signalFor(directionValue: EarningsCallTrendOutput["topicTrendRows"][number]["direction"], latestIntensity: number): Signal {
  if (directionValue === "rising" && latestIntensity >= 7) return "Inflecting";
  if (latestIntensity >= 8) return "Needs Review";
  if (directionValue === "falling") return "Neutral";
  return "Neutral";
}

function synthesize(dataset: EarningsCallDataset, topic: EarningsFocusTopic, directionValue: string) {
  const company = dataset.ticker;
  if (topic === "growth_portfolio") return `${company}'s debate increasingly centers on whether newer products can offset mature-product pressure.`;
  if (topic === "loe_or_erosion") return `${company}'s erosion/LOE debate ${directionValue === "falling" ? "has faded somewhat" : "remains central"} as investors test durability of the base business.`;
  if (topic === "pipeline") return `${company}'s pipeline discussion is ${directionValue === "rising" ? "becoming more valuation-relevant" : "still a supporting debate"} across the eight-quarter window.`;
  if (topic === "cell_therapy") return `${company}'s cell therapy focus is tied to launch execution, manufacturing, reimbursement and competitive intensity.`;
  if (topic === "cash_runway") return `${company}'s cash runway matters most when launch revenue is still early and operating leverage is unproven.`;
  if (topic === "margin") return `${company}'s margin debate tracks whether revenue growth converts into operating leverage after launch and R&D spending.`;
  if (topic === "capital_allocation") return `${company}'s capital allocation debate is about buybacks, dividends, BD and whether spend improves the growth profile.`;
  if (topic === "regulatory") return `${company}'s regulatory focus rises around approvals, label expansion and trial readouts.`;
  if (topic === "launch_execution") return `${company}'s launch execution debate measures whether approvals are converting into real revenue.`;
  return `${company}'s core revenue debate asks whether the current base can keep funding pipeline and capital returns.`;
}

export function buildEarningsCallTrend(dataset: EarningsCallDataset, selectedQuarterId?: string): EarningsCallTrendOutput {
  const quarters = dataset.quarters.slice(-8);
  const selectedQuarter = quarters.find((quarter) => quarter.id === selectedQuarterId) ?? quarters[quarters.length - 1];
  const topics = Array.from(new Set(quarters.flatMap((quarter) => quarter.marketFocus.map((item) => item.topic))));
  const topicTrendRows = topics.map((topic) => {
    const values = quarters.map((quarter) => intensityFor(quarter, topic));
    const directionValue = direction(values);
    const latestIntensity = values[values.length - 1] ?? 0;
    return {
      topic,
      label: topicLabels[topic],
      direction: directionValue,
      latestIntensity,
      eightQuarterAverage: values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1),
      signal: signalFor(directionValue, latestIntensity),
      aiSynthesis: synthesize(dataset, topic, directionValue),
    };
  }).sort((a, b) => b.latestIntensity - a.latestIntensity);

  const risingDebates = topicTrendRows.filter((row) => row.direction === "rising").slice(0, 4).map((row) => row.label);
  const fadingDebates = topicTrendRows.filter((row) => row.direction === "falling").slice(0, 4).map((row) => row.label);

  return {
    selectedQuarter,
    quarters,
    topicTrendRows,
    overview: {
      aiTrendSummary: `${dataset.name}'s last eight quarters show a rotation from raw reported results toward the quality and durability of growth. The market is now focused on the topics with the highest latest AI-coded attention scores: ${topicTrendRows.slice(0, 3).map((row) => row.label).join(", ")}.`,
      debateNow: selectedQuarter.aiSummary,
      risingDebates,
      fadingDebates,
    },
    validationWarnings: [
      ...(quarters.length === 8
        ? []
        : [{
            id: `${dataset.ticker.toLowerCase()}-eight-quarter-coverage`,
            title: "Eight-quarter coverage incomplete",
            detail: `${dataset.ticker} has ${quarters.length} quarters in the earnings-call dataset.`,
            severity: "high" as const,
          }]),
    ],
  };
}
