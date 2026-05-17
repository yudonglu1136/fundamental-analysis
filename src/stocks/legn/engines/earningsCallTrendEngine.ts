import type { LegnDataset, LegnEarningsCallQuarter, LegnEarningsCallTrendOutput } from "../types";
import { explain } from "./helpers";

const topicLabels: Record<LegnEarningsCallQuarter["marketFocus"][number]["topic"], string> = {
  launch_ramp: "CARVYKTI launch ramp",
  capacity: "Manufacturing capacity",
  earlier_line: "Earlier-line utilization",
  profitability: "Operating profit / margin",
  ous_expansion: "OUS expansion",
  safety: "CAR-T safety",
  competition: "BCMA competition",
  pipeline_option: "Pipeline / platform option",
  collaboration_economics: "J&J collaboration economics",
};

function intensityFor(quarter: LegnEarningsCallQuarter, topic: LegnEarningsCallQuarter["marketFocus"][number]["topic"]) {
  return quarter.marketFocus.find((item) => item.topic === topic)?.intensity ?? 0;
}

function trendDirection(values: number[]): "rising" | "falling" | "stable" | "volatile" {
  const firstHalf = values.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  const secondHalf = values.slice(4).reduce((sum, value) => sum + value, 0) / 4;
  const range = Math.max(...values) - Math.min(...values);
  if (range >= 6 && Math.abs(secondHalf - firstHalf) < 1.5) return "volatile";
  if (secondHalf - firstHalf >= 1.5) return "rising";
  if (firstHalf - secondHalf >= 1.5) return "falling";
  return "stable";
}

function synthesizeTopic(topic: LegnEarningsCallQuarter["marketFocus"][number]["topic"], direction: string) {
  if (topic === "capacity") {
    return direction === "falling"
      ? "Capacity is less of a pure gating fear than in 2024, but it remains central because $5bn+ peak sales requires sustained throughput."
      : "Capacity remains a live underwriting constraint as demand, OOS rate and site productivity scale together.";
  }
  if (topic === "profitability") return "Profitability rose from a back-burner issue to a front-line debate after Q2-Q4 2025 operating leverage and 2026 profit commentary.";
  if (topic === "earlier_line") return "Earlier-line utilization became the cleanest proof point for whether the label expansion is changing actual patient flow.";
  if (topic === "pipeline_option") return "Pipeline optionality has risen, but the market still treats solid tumor and platform programs as option value rather than core NAV.";
  if (topic === "collaboration_economics") return "The collaboration bridge matters more as gross sales scale; investors now care how much NTS becomes Legend economic profit.";
  if (topic === "ous_expansion") return "OUS moved from optional launch geography to material growth lever as markets expanded to 14.";
  if (topic === "safety") return "Safety stayed consistently relevant, with more weight as the debate moved into earlier-line and frontline settings.";
  if (topic === "competition") return "Competition is a persistent share-risk overlay, but CARVYKTI durability has kept it from becoming the dominant debate.";
  return "Launch ramp was the first debate and remains important, but the question evolved from whether demand exists to how high the peak can go.";
}

export function buildEarningsCallTrendEngine(data: LegnDataset, selectedQuarterId?: string): LegnEarningsCallTrendOutput {
  const quarters = data.earningsCalls.slice(-8);
  const selectedQuarter = quarters.find((quarter) => quarter.id === selectedQuarterId) ?? quarters[quarters.length - 1];
  const topics = Array.from(new Set(quarters.flatMap((quarter) => quarter.marketFocus.map((item) => item.topic))));
  const topicTrendRows = topics.map((topic) => {
    const values = quarters.map((quarter) => intensityFor(quarter, topic));
    const latestIntensity = values[values.length - 1] ?? 0;
    const eightQuarterAverage = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const direction = trendDirection(values);
    return {
      topic,
      label: topicLabels[topic],
      direction,
      latestIntensity,
      eightQuarterAverage,
      aiSynthesis: synthesizeTopic(topic, direction),
    };
  }).sort((a, b) => b.latestIntensity - a.latestIntensity);

  return {
    quarters,
    selectedQuarter,
    topicTrendRows,
    overview: {
      aiTrendSummary:
        "Across the last eight full earnings calls, the market moved through three phases: 2024 was about label expansion plus manufacturing capacity; early 2025 tested whether the ramp had operating leverage; late 2025 centered on 2L-4L utilization, 2026 profitability credibility and whether $5bn+ CARVYKTI peak sales can be supplied and monetized. Pipeline discussion rose, but remains option value rather than the underwriting base.",
      phaseShift:
        "The debate shifted from demand validation to execution quality: gross NTS is no longer enough, so investors now track site productivity, earlier-line mix, collaboration margin and recoupment.",
      investorDebateNow:
        "The current market debate is whether CARVYKTI can scale from a $1.9bn 2025 NTS base to $5bn+ peak sales while generating credible Legend operating profit under the J&J collaboration.",
      fadingDebates: ["Initial approval / demand existence", "Whether CARVYKTI is a real launch", "Pipeline as the main near-term debate"],
      risingDebates: ["2026 operating profit", "2L-4L penetration and frontline read-through", "Capacity versus demand constraint", "How much gross NTS converts to LEGN profit"],
    },
    explainability: explain(
      "Earnings-call trend analysis scores each quarter's market focus topics from 0-10, then compares the first four quarters with the last four quarters.",
      "topic direction = avg(last four quarter intensity) versus avg(first four quarter intensity); selected quarter drives detailed call panel",
      Array.from(new Set(quarters.flatMap((quarter) => quarter.sourceEvidenceIds))),
      ["past eight full quarters end at Q4 2025", "Q1 2026 preliminary sales are not treated as a full earnings-call quarter"],
    ),
  };
}
