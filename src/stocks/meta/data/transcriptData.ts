import type { MetaTranscriptInsight } from "../model";
import { fieldLineage, metaLineage } from "./lineage";

const transcriptLineage = {
  ...metaLineage.q1_2026Transcript,
  valuationTreatment: "forecast_anchor" as const,
};

export const metaTranscriptData: MetaTranscriptInsight[] = [
  {
    id: "ai-recommendation-engagement",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-call-transcript",
    lineage: transcriptLineage,
    fieldLineage: fieldLineage(["topic", "metric", "valuationMapping"], transcriptLineage),
    speaker: "Mark Zuckerberg",
    topic: "AI recommendation systems",
    metric: "Video time on Facebook and Instagram",
    valuationMapping: "forecast_driver",
    notes: "Management linked AI-powered recommendations to higher Facebook and Instagram video time, supporting ad inventory and engagement assumptions.",
  },
  {
    id: "ads-value-optimization",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-call-transcript",
    lineage: transcriptLineage,
    fieldLineage: fieldLineage(["topic", "metric", "value", "valuationMapping"], transcriptLineage),
    speaker: "Mark Zuckerberg",
    topic: "Ads value optimization",
    metric: "Value Optimization suite run-rate",
    value: 20,
    valuationMapping: "forecast_driver",
    notes: "Value Optimization above USD 20bn annual run-rate is mapped to price-per-ad and conversion assumptions, not added again as a separate valuation uplift.",
  },
  {
    id: "capex-ai-infrastructure",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-call-transcript",
    lineage: transcriptLineage,
    fieldLineage: fieldLineage(["topic", "metric", "value", "valuationMapping"], transcriptLineage),
    speaker: "Susan Li",
    topic: "AI infrastructure investment",
    metric: "FY2026 capex guide midpoint",
    value: 135,
    valuationMapping: "risk_trigger",
    notes: "High capex is modeled explicitly in unlevered FCF and AI payback diagnostics.",
  },
  {
    id: "business-ai-whatsapp",
    sourceStatus: "management_guidance",
    sourceId: "meta-q1-2026-call-transcript",
    lineage: {
      ...transcriptLineage,
      valuationTreatment: "risk_monitor",
    },
    fieldLineage: fieldLineage(["topic", "metric", "value", "valuationMapping"], {
      ...transcriptLineage,
      valuationTreatment: "risk_monitor",
    }),
    speaker: "Mark Zuckerberg",
    topic: "Business AI and WhatsApp",
    metric: "Monthly Business AI conversations",
    value: 10,
    valuationMapping: "optionality",
    notes: "Business AI and WhatsApp monetization are shown as product-cycle evidence, but not capitalized as a standalone manual top-up in base fair value.",
  },
  {
    id: "reality-labs-ai-glasses",
    sourceStatus: "research_only",
    sourceId: "meta-q1-2026-call-transcript",
    lineage: {
      ...metaLineage.researchOnly,
      valuationTreatment: "scenario_only",
    },
    fieldLineage: fieldLineage(["topic", "valuationMapping"], {
      ...metaLineage.researchOnly,
      valuationTreatment: "scenario_only",
    }),
    speaker: "Mark Zuckerberg",
    topic: "AI glasses and Reality Labs",
    valuationMapping: "optionality",
    notes: "Reality Labs is treated as a call option inside SOTP only. Consolidated DCF and P/E include the operating loss drag.",
  },
];
