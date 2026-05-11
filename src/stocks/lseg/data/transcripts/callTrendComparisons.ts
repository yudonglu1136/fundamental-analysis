import { getPreviousTranscriptEventId, lsegTranscriptCallEvents } from "./callEvents";
import { lsegTranscriptEvidenceByEvent } from "./callSummaries";
import type {
  TranscriptConfidence,
  TranscriptEvidenceItem,
  TranscriptTrendComparison,
  TrendDimensionId,
} from "./types";

type TrendDimensionConfig = {
  id: TrendDimensionId;
  label: string;
  keywords: string[];
};

const TREND_DIMENSIONS: TrendDimensionConfig[] = [
  { id: "revenue_growth", label: "Revenue Growth", keywords: ["revenue growth", "organic growth", "asv"] },
  { id: "margin_expansion", label: "Margin Expansion", keywords: ["margin", "ebitda", "operating leverage"] },
  { id: "fcf_cash_conversion", label: "FCF / Cash Conversion", keywords: ["free cash flow", "cash conversion", "capex"] },
  {
    id: "data_analytics_workspace_refinitiv",
    label: "Data & Analytics / Workspace / Refinitiv",
    keywords: ["workspace", "refinitiv", "data analytics", "data platform", "mcp", "microsoft"],
  },
  { id: "ftse_russell", label: "FTSE Russell", keywords: ["ftse russell", "index"] },
  { id: "risk_intelligence", label: "Risk Intelligence", keywords: ["risk intelligence"] },
  {
    id: "capital_markets_tradeweb",
    label: "Capital Markets / Tradeweb",
    keywords: ["capital markets", "tradeweb", "fixed income", "matching"],
  },
  {
    id: "post_trade_lch_swapclear",
    label: "Post Trade / LCH / SwapClear",
    keywords: ["post trade", "lch", "swapclear", "clearing"],
  },
  { id: "capital_allocation", label: "Capital Allocation", keywords: ["capital allocation", "buyback", "dividend", "leverage", "shareholder return"] },
  { id: "competition_pricing", label: "Competition / Pricing", keywords: ["competition", "pricing", "retention"] },
  { id: "regulatory_macro_fx", label: "Regulatory / Macro / FX", keywords: ["regulatory", "regulation", "macro", "fx", "financing", "uncertain"] },
];

function evidenceMatchesDimension(item: TranscriptEvidenceItem, dimension: TrendDimensionConfig) {
  const haystack = item.tags.join(" ");
  return dimension.keywords.some((keyword) => haystack.includes(keyword));
}

function evidenceStrength(item: TranscriptEvidenceItem) {
  const confidenceScore = item.confidence === "high" ? 3 : item.confidence === "medium" ? 2 : 1;
  const sentimentScore = item.sentiment === "positive" ? 1 : item.sentiment === "negative" ? -1 : 0;
  return { confidenceScore, sentimentScore };
}

function confidenceFromEvidence(current: TranscriptEvidenceItem[], prior: TranscriptEvidenceItem[]): TranscriptConfidence {
  const maxConfidence = [...current, ...prior].reduce(
    (best, item) => Math.max(best, item.confidence === "high" ? 3 : item.confidence === "medium" ? 2 : 1),
    0,
  );
  if (current.length === 0 && prior.length === 0) return "low";
  if (current.length > 0 && prior.length > 0 && maxConfidence >= 3) return "high";
  if (maxConfidence >= 2) return "medium";
  return "low";
}

function chooseDirection(current: TranscriptEvidenceItem[], prior: TranscriptEvidenceItem[]) {
  if (current.length === 0 && prior.length === 0) return "unclear" as const;
  if (current.length === 0 || prior.length === 0) return "unclear" as const;

  const currentPositive = current.filter((item) => item.sentiment === "positive").length;
  const currentNegative = current.filter((item) => item.sentiment === "negative").length;
  const priorPositive = prior.filter((item) => item.sentiment === "positive").length;
  const priorNegative = prior.filter((item) => item.sentiment === "negative").length;

  if (currentPositive > priorPositive && currentNegative <= priorNegative) return "improved" as const;
  if (currentNegative > priorNegative && currentPositive <= priorPositive) return "weaker" as const;
  if (Math.abs(currentPositive - priorPositive) <= 1 && Math.abs(currentNegative - priorNegative) <= 1) return "stable" as const;
  return "unclear" as const;
}

function bestQuote(items: TranscriptEvidenceItem[]) {
  return items
    .slice()
    .sort((left, right) => {
      const leftStrength = evidenceStrength(left);
      const rightStrength = evidenceStrength(right);
      return rightStrength.confidenceScore - leftStrength.confidenceScore;
    })[0]?.quote;
}

function buildAnalystNote(
  direction: TranscriptTrendComparison["direction"],
  current: TranscriptEvidenceItem[],
  prior: TranscriptEvidenceItem[],
) {
  if (direction === "improved") {
    return "Current-event commentary included somewhat stronger or more explicit evidence than the comparison event, but the signal still needs human verification.";
  }
  if (direction === "weaker") {
    return "Current-event commentary carried relatively more headwind or cautionary language than the comparison event, but the signal remains transcript-only.";
  }
  if (direction === "stable") {
    return "Both events carried evidence on this driver without a clear directional change, so the lab keeps the read-through as stable.";
  }
  return "Evidence was sparse, one-sided, or too mixed to make a directional call; the lab keeps this driver as unclear.";
}

export function buildTranscriptTrendComparison(currentTranscriptId: string, priorTranscriptId?: string) {
  const priorId = priorTranscriptId ?? getPreviousTranscriptEventId(currentTranscriptId);
  if (!priorId) return [];

  const currentEvidence = lsegTranscriptEvidenceByEvent.get(currentTranscriptId) ?? [];
  const priorEvidence = lsegTranscriptEvidenceByEvent.get(priorId) ?? [];

  return TREND_DIMENSIONS.map((dimension) => {
    const currentRelevant = currentEvidence.filter((item) => evidenceMatchesDimension(item, dimension)).slice(0, 6);
    const priorRelevant = priorEvidence.filter((item) => evidenceMatchesDimension(item, dimension)).slice(0, 6);
    const direction = chooseDirection(currentRelevant, priorRelevant);
    const confidence = confidenceFromEvidence(currentRelevant, priorRelevant);
    return {
      id: `${currentTranscriptId}-${priorId}-${dimension.id}`,
      dimensionId: dimension.id,
      label: dimension.label,
      currentTranscriptId,
      priorTranscriptId: priorId,
      direction,
      confidence,
      currentQuote: bestQuote(currentRelevant),
      priorQuote: bestQuote(priorRelevant),
      analystNote: buildAnalystNote(direction, currentRelevant, priorRelevant),
      needsHumanReview: [...currentRelevant, ...priorRelevant].some((item) => item.needsHumanReview) || direction === "unclear",
      displayOnly: true,
      modelReady: false,
      valuationImpactAllowed: false,
    } satisfies TranscriptTrendComparison;
  });
}

export const lsegTranscriptTrendDimensions = TREND_DIMENSIONS;

export const lsegDefaultTranscriptTrendComparisons = lsegTranscriptCallEvents.flatMap((event) =>
  buildTranscriptTrendComparison(event.transcriptId),
);
