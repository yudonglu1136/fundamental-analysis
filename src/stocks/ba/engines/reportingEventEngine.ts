import type { ValidationWarning } from "../../types";
import type { BaDataset, BaMarketFocusTheme, BaReportingEventsOutput } from "../model";

const themeOrder: BaMarketFocusTheme[] = [
  "Backlog & order intake",
  "Guidance",
  "Cash conversion",
  "Margins",
  "Programme execution",
  "Defence budgets",
  "Space / electronics",
  "Capital returns",
  "FX / financing",
];

export function calculateBaReportingEventsEngine(data: BaDataset): BaReportingEventsOutput {
  const events = [...data.reportingEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const latest = events[events.length - 1];
  const themeTrendRows = events.map((event) => {
    const row: Record<string, string | number> = { quarter: event.quarter };
    themeOrder.forEach((theme) => {
      row[theme] = event.marketFocus.find((focus) => focus.theme === theme)?.intensity ?? 0;
    });
    return row;
  });
  const missingTranscriptCount = events.filter((event) => event.transcriptStatus !== "official_video_available").length;
  const warnings: ValidationWarning[] = [];
  if (events.length !== 8) {
    warnings.push({
      id: "ba-reporting-event-count",
      title: "Reporting-event window is not eight quarters",
      detail: `Expected 8 reporting-event windows, found ${events.length}.`,
      severity: "medium",
    });
  }
  if (missingTranscriptCount > 0) {
    warnings.push({
      id: "ba-transcript-availability",
      title: "Official call transcripts are not available for every quarter",
      detail: `${missingTranscriptCount} of ${events.length} reporting windows rely on official releases / market updates rather than official call transcripts. BAE follows a UK reporting cadence, not a US quarterly earnings-call cadence.`,
      severity: "low",
    });
  }

  return {
    events,
    latest,
    themeTrendRows,
    warnings,
    overview: {
      sourceStatus: "research_only",
      title: "Eight-quarter market-focus synthesis",
      summary:
        "Across the last eight reporting windows, investor focus moved from backlog visibility and SMS/Ball integration, to cash conversion and working-capital timing, then back toward funded order conversion, export wins, and the durability of a broader NATO / AUKUS / missile-defence rearmament cycle.",
      focusShift: [
        "2024 Q3-Q4: guidance upgrades, SMS integration, and whether record backlog could convert despite higher capex and customer-advance timing.",
        "2025 Q1-Q2: FY2024 results made backlog and cash generation visible, while the AGM update tested whether defence-spending headlines were becoming funded orders.",
        "2025 Q3: H1 2025 shifted attention to cash conversion because growth and guidance improved but free cash flow was negative in the half.",
        "2025 Q4-2026 Q2: focus moved to funded order conversion, Typhoon / Type 26 / missile defence, higher defence budgets, and capital-return discipline after the rerating.",
      ],
      marketAttentionNow: [
        "Is 2026 guidance conservative or appropriately risk-adjusted?",
        "Which demand pools convert first into funded backlog: missile defence, drones, electronic warfare, naval, submarines, combat vehicles, or combat air?",
        "Can BAE sustain high cash conversion while increasing capacity and delivering complex Maritime and Air programmes?",
        "Are buybacks still value-accretive after the share-price rerating?",
      ],
    },
  };
}
