import type { GooglSourceType } from "../model";

export type GooglTranscriptFocusId =
  | "ai_search"
  | "cloud_ai"
  | "tpu_capex"
  | "youtube_subscriptions"
  | "regulatory"
  | "waymo_other_bets"
  | "fcf_capital_return"
  | "ads_tac";

export type GooglTranscriptSentiment = "positive" | "neutral" | "mixed" | "negative";

export type GooglTranscriptFocusScore = {
  id: GooglTranscriptFocusId;
  label: string;
  score: number;
};

export type GooglTranscriptQaPair = {
  id: string;
  transcriptId: string;
  eventDate: string;
  speaker: string;
  topic: string;
  question: string;
  answer: string;
  metricMentioned?: string;
  managementGaveQuantGuidance: boolean;
  sentiment: GooglTranscriptSentiment;
  followUpRisk: string;
  sourceType: GooglSourceType;
  sourceUrl: string;
  valuationImpactAllowed: false;
};

export type GooglTranscriptEvent = {
  transcriptId: string;
  label: string;
  shortLabel: string;
  fiscalPeriod: string;
  eventDate: string;
  eventType: "earnings_call";
  sourceName: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
  sourceType: GooglSourceType;
  sourceStatus: "official_webcast_available" | "secondary_text_transcript_available";
  aiSummary: string;
  managementMessages: string[];
  qaPairs: GooglTranscriptQaPair[];
  watchlist: string[];
};

function qa(
  event: Pick<GooglTranscriptEvent, "transcriptId" | "eventDate" | "sourceUrl" | "sourceType">,
  id: string,
  question: string,
  answer: string,
  metricMentioned: string | undefined,
  managementGaveQuantGuidance: boolean,
  sentiment: GooglTranscriptSentiment,
  followUpRisk: string,
): GooglTranscriptQaPair {
  return {
    id: `${event.transcriptId}-${id}`,
    transcriptId: event.transcriptId,
    eventDate: event.eventDate,
    speaker: "Analyst pool",
    topic: id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
    question,
    answer,
    metricMentioned,
    managementGaveQuantGuidance,
    sentiment,
    followUpRisk,
    sourceType: event.sourceType,
    sourceUrl: event.sourceUrl,
    valuationImpactAllowed: false,
  };
}

const q1_2026 = {
  transcriptId: "goog-q1-2026-earnings-call",
  eventDate: "2026-04-29",
  sourceUrl: "https://www.fool.com/earnings/call-transcripts/2026/04/29/alphabet-googl-q1-2026-earnings-call-transcript/",
  sourceType: "third_party_secondary" as const,
};

const q4_2025 = {
  transcriptId: "goog-q4-2025-earnings-call",
  eventDate: "2026-02-04",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/396697-q4-2025/",
  sourceType: "third_party_secondary" as const,
};

const q3_2025 = {
  transcriptId: "goog-q3-2025-earnings-call",
  eventDate: "2025-10-29",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/366282-q3-2025/",
  sourceType: "third_party_secondary" as const,
};

const q2_2025 = {
  transcriptId: "goog-q2-2025-earnings-call",
  eventDate: "2025-07-23",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/338340-q2-2025/",
  sourceType: "third_party_secondary" as const,
};

const q1_2025 = {
  transcriptId: "goog-q1-2025-earnings-call",
  eventDate: "2025-04-24",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/312617-q1-2025/",
  sourceType: "third_party_secondary" as const,
};

const q4_2024 = {
  transcriptId: "goog-q4-2024-earnings-call",
  eventDate: "2025-02-04",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/239197-q4-2024/",
  sourceType: "third_party_secondary" as const,
};

const q3_2024 = {
  transcriptId: "goog-q3-2024-earnings-call",
  eventDate: "2024-10-29",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/215117-q3-2024/",
  sourceType: "third_party_secondary" as const,
};

const q2_2024 = {
  transcriptId: "goog-q2-2024-earnings-call",
  eventDate: "2024-07-23",
  sourceUrl: "https://stockanalysis.com/stocks/googl/transcripts/188470-q2-2024/",
  sourceType: "third_party_secondary" as const,
};

export const googlTranscriptEvents: GooglTranscriptEvent[] = [
  {
    ...q1_2026,
    label: "Q1 2026 Earnings Call",
    shortLabel: "Q1 2026",
    fiscalPeriod: "Quarter ended March 31, 2026",
    eventType: "earnings_call",
    sourceName: "Motley Fool transcript; Alphabet IR webcast is available on YouTube",
    secondarySourceUrl: "https://www.youtube.com/watch?v=LPJoiDiVkTI",
    sourceStatus: "official_webcast_available",
    aiSummary:
      "AI full-stack proof became the dominant theme: Search and Cloud accelerated, Cloud backlog nearly doubled, and management raised 2026 CapEx to $180-190bn while emphasizing near-term compute constraints.",
    managementMessages: [
      "Search usage and revenue accelerated as AI Overviews and AI Mode expanded.",
      "Cloud revenue reached about $20bn with sharply higher backlog and stronger enterprise AI demand.",
      "TPU hardware is becoming an external customer revenue opportunity, but recognition is lumpy and mostly pushed into 2027.",
      "Higher technical infrastructure spend, Wiz integration and depreciation are explicit pressure points for margins and FCF.",
    ],
    qaPairs: [
      qa(q1_2026, "search-monetization", "Can AI Mode and AI Overviews monetize without compressing paid clicks?", "Management framed AI as expanding query volume, commercial intent and new ad surfaces while still testing new sponsored formats.", "Search & Other +19%; AI response cost down 30%", true, "positive", "Track ad load, click-through and commercial query disclosures for AI Mode."),
      qa(q1_2026, "cloud-backlog", "Is the Cloud acceleration sustainable or just backlog catch-up?", "Management tied Cloud growth to enterprise AI, Gemini Enterprise adoption, larger deals and backlog conversion, but also said compute supply is still a gating factor.", "Cloud revenue +63%; backlog about $462bn", true, "positive", "Watch backlog conversion versus new data center capacity and customer concentration."),
      qa(q1_2026, "capex-fcf", "How should investors underwrite the step-up in AI CapEx and FCF pressure?", "Management raised 2026 CapEx guidance and indicated 2027 can be higher, making depreciation and energy costs a central modeling risk.", "2026 CapEx $180-190bn; TTM FCF $64.4bn", true, "mixed", "If CapEx rises without visible Cloud/Search monetization, FCF multiple should compress."),
    ],
    watchlist: [
      "Does Q2 show AI Mode ad formats moving beyond tests into measurable monetization?",
      "Does Cloud backlog convert into revenue without another step-change in CapEx?",
      "Does Wiz dilute Cloud margin by only a low-single-digit amount as guided?",
      "Does buyback suspension continue while CapEx rises?",
    ],
  },
  {
    ...q4_2025,
    label: "Q4 2025 Earnings Call",
    shortLabel: "Q4 2025",
    fiscalPeriod: "Quarter and year ended December 31, 2025",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "The market focus shifted to whether Gemini 3, Cloud backlog and subscriptions could turn AI investment from narrative into compounding revenue while 2026 CapEx moved to $175-185bn.",
    managementMessages: [
      "Alphabet crossed $400bn of annual revenue, with Search and Cloud both accelerating.",
      "Gemini app, Gemini Enterprise, paid subscriptions and partner AI adoption were positioned as scale proof points.",
      "Cloud backlog and large commitments became a central forward indicator.",
      "2026 CapEx guidance made infrastructure intensity a larger part of the investment debate.",
    ],
    qaPairs: [
      qa(q4_2025, "gemini-search", "Is Gemini driving incremental Search usage or only replacing traditional search behavior?", "Management emphasized longer AI queries, more follow-ups and broader multimodal search surfaces as expansionary.", "Search +17%; AI Mode engagement", true, "positive", "Need evidence that AI query growth translates into ad revenue per query."),
      qa(q4_2025, "enterprise-ai", "How much of Cloud growth is durable enterprise AI demand?", "Management highlighted backlog growth, larger commitments and Gemini Enterprise paid seats as indicators of durable demand.", "Cloud +48%; backlog $240bn", true, "positive", "Watch whether backlog growth outpaces reported Cloud revenue over multiple quarters."),
      qa(q4_2025, "capex-returns", "Can FCF and capital return survive the AI infrastructure build?", "Management tied CapEx to demand and full-stack advantage, but higher depreciation and data center costs remain the pressure point.", "2026 CapEx $175-185bn", true, "mixed", "Follow buyback intensity and FCF conversion as CapEx rises."),
    ],
    watchlist: [
      "Confirm whether Gemini Enterprise paid seats convert to revenue disclosure.",
      "Measure Q1 Cloud backlog against the Q4 $240bn base.",
      "Track AI response cost declines versus depreciation growth.",
    ],
  },
  {
    ...q3_2025,
    label: "Q3 2025 Earnings Call",
    shortLabel: "Q3 2025",
    fiscalPeriod: "Quarter ended September 30, 2025",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q3 centered on whether record revenue and broad double-digit growth could absorb Cloud backlog, higher CapEx and a European Commission fine without derailing margin momentum.",
    managementMessages: [
      "Revenue reached a new record with double-digit growth in Search, YouTube, Cloud and subscriptions.",
      "AI adoption remained the explanatory bridge for Search engagement and Cloud demand.",
      "Cloud backlog and CapEx both reached new highs.",
      "The EC fine kept regulatory remedies and margin drag in the market debate.",
    ],
    qaPairs: [
      qa(q3_2025, "regulatory", "Does the EC fine change how investors should discount Search economics?", "Management treated the charge as discrete, but regulatory remedies remained a forward-looking risk for distribution and default economics.", "$3.5bn EC fine", true, "mixed", "Monitor remedy headlines, default-placement restrictions and margin impact."),
      qa(q3_2025, "cloud-capex", "Is CapEx growth creating enough Cloud revenue acceleration?", "Management pointed to backlog and AI demand as the justification for elevated infrastructure spend.", "Cloud backlog and CapEx new highs", true, "mixed", "Compare incremental Cloud revenue to incremental technical infrastructure spend."),
      qa(q3_2025, "youtube-subs", "Are YouTube and subscriptions becoming a second growth engine?", "Management highlighted double-digit YouTube and subscriptions growth as part of a broader Services mix shift.", "YouTube/subscriptions double-digit growth", true, "positive", "Watch YouTube ads versus subscriptions mix and CTV monetization."),
    ],
    watchlist: [
      "Does Q4 show regulatory fines as one-time or recurring?",
      "Does Cloud backlog support another acceleration?",
      "Does Services margin expand despite AI depreciation?",
    ],
  },
  {
    ...q2_2025,
    label: "Q2 2025 Earnings Call",
    shortLabel: "Q2 2025",
    fiscalPeriod: "Quarter ended June 30, 2025",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q2 marked the moment Cloud backlog and AI CapEx became the core underwriting pair: Cloud grew 32%, backlog reached roughly $106bn and 2025 CapEx guidance was raised.",
    managementMessages: [
      "Search, YouTube, subscriptions and Cloud all delivered double-digit growth.",
      "Cloud backlog was elevated as AI workloads drove enterprise demand.",
      "Management raised 2025 CapEx guidance to meet demand.",
      "The debate moved from whether Alphabet can build AI products to whether returns on infrastructure spend are visible enough.",
    ],
    qaPairs: [
      qa(q2_2025, "capex-guide", "Why raise CapEx guidance and how should investors model returns?", "Management linked the higher spend to Cloud and AI demand, making backlog and future Cloud margins the evidence trail.", "2025 CapEx guidance $85bn; Cloud backlog $106bn", true, "mixed", "If backlog does not convert into margin-accretive Cloud revenue, CapEx intensity is a thesis risk."),
      qa(q2_2025, "search-ai", "Are AI features helping Search growth or creating monetization uncertainty?", "Management emphasized AI product innovation and engagement while monetization proof remained developing.", "Search double-digit growth", true, "mixed", "Track AI Overviews ad format disclosure and Search revenue per query."),
      qa(q2_2025, "cloud-margin", "Can Cloud margin keep improving while AI infrastructure scales?", "Management framed infrastructure investment as demand-led, but margin durability depends on utilization and mix.", "Cloud +32%", true, "positive", "Watch depreciation, power costs and GPU/TPU utilization."),
    ],
    watchlist: [
      "Check whether Q3 CapEx rises again after the $85bn guide.",
      "Track Cloud backlog additions versus revenue recognition.",
      "Look for AI Search monetization detail rather than usage anecdotes only.",
    ],
  },
  {
    ...q1_2025,
    label: "Q1 2025 Earnings Call",
    shortLabel: "Q1 2025",
    fiscalPeriod: "Quarter ended March 31, 2025",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q1 2025 still had a balanced tone: revenue, operating income and EPS growth were strong, while investors started to focus more heavily on 2025 CapEx, depreciation and AI returns.",
    managementMessages: [
      "Revenue grew double digits, with Search, YouTube, subscriptions and Cloud all contributing.",
      "Operating income and EPS growth reinforced the efficiency story.",
      "AI innovation was presented as both product catalyst and margin efficiency lever.",
      "Management warned that CapEx and depreciation would rise through 2025.",
    ],
    qaPairs: [
      qa(q1_2025, "margin-expansion", "Is margin expansion sustainable as AI depreciation rises?", "Management highlighted efficiency and operating income growth, but acknowledged higher CapEx and depreciation ahead.", "Operating income +20%; EPS +49%", true, "mixed", "Monitor whether operating margin can hold as technical infrastructure grows."),
      qa(q1_2025, "ai-products", "Which AI products are moving the revenue needle?", "Management pointed to Search, YouTube, subscriptions and Cloud as beneficiaries, but most product KPIs remained commentary rather than official actuals.", "Revenue +12%", true, "positive", "Separate official revenue growth from AI product narrative."),
      qa(q1_2025, "subscriptions", "Can subscriptions become material to Services growth?", "Management discussed subscription momentum as part of the non-ad Services mix.", "Subscriptions/platforms/devices growth", false, "positive", "Track paid subscriptions and YouTube Premium mix when disclosed."),
    ],
    watchlist: [
      "Does Q2 raise CapEx guidance or merely reiterate it?",
      "Does Cloud growth accelerate enough to validate AI infrastructure spend?",
      "Does Search maintain double-digit growth with AI Overviews adoption?",
    ],
  },
  {
    ...q4_2024,
    label: "Q4 2024 Earnings Call",
    shortLabel: "Q4 2024",
    fiscalPeriod: "Quarter and year ended December 31, 2024",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q4 2024 was the first clear full-stack AI framing quarter: AI Overviews scaled internationally, Cloud and YouTube crossed the $100bn combined run-rate target, and 2025 CapEx was signaled higher.",
    managementMessages: [
      "AI Overviews expanded to more than 100 countries and were framed as increasing Search usage.",
      "Cloud and YouTube hit the combined run-rate target management had set earlier.",
      "Management emphasized custom infrastructure, Gemini models and product distribution as one integrated stack.",
      "2025 CapEx was expected to rise, with FX and leap-year effects also flagged.",
    ],
    qaPairs: [
      qa(q4_2024, "ai-overviews", "Do AI Overviews expand query demand or risk lower click monetization?", "Management emphasized satisfaction and usage growth, particularly among younger users, while monetization remained an area to watch.", "AI Overviews in 100+ countries", true, "positive", "Need evidence of AI Overview ad load and Search revenue per session."),
      qa(q4_2024, "capex-2025", "How much will 2025 CapEx rise to support AI and Cloud?", "Management framed the increase as necessary to capture demand and support full-stack AI leadership.", "2025 CapEx direction higher", true, "mixed", "Track whether CapEx guidance becomes a ceiling or keeps moving higher."),
      qa(q4_2024, "waymo", "Is Waymo still an option value or becoming operating proof?", "Management cited ride growth and market expansion, but Other Bets losses keep valuation contribution capped.", "Waymo weekly rides and new markets", false, "positive", "Do not let Waymo narrative become an uncapped SOTP plug."),
    ],
    watchlist: [
      "Q1 2025 should clarify the magnitude of CapEx and depreciation pressure.",
      "Watch whether AI Overview usage is paired with monetization proof.",
      "Track combined Cloud + YouTube run-rate sustainability.",
    ],
  },
  {
    ...q3_2024,
    label: "Q3 2024 Earnings Call",
    shortLabel: "Q3 2024",
    fiscalPeriod: "Quarter ended September 30, 2024",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q3 2024 emphasized AI engagement and broad business momentum: Search, Cloud and YouTube were all framed as beneficiaries while CapEx and shareholder returns remained visible but not yet the central debate.",
    managementMessages: [
      "Revenue grew 15% and net income grew faster, supporting the operating leverage thesis.",
      "AI Overviews and Gemini were described as improving user engagement and product velocity.",
      "Cloud and YouTube maintained strong growth momentum.",
      "CapEx and shareholder returns were visible, but the market debate had not yet become dominated by infrastructure spend.",
    ],
    qaPairs: [
      qa(q3_2024, "engagement", "Is AI improving engagement across Search and YouTube?", "Management described AI Overviews and Gemini as usage-enhancing product upgrades across core surfaces.", "Revenue +15%; net income +34%", true, "positive", "Track whether engagement converts into revenue growth by product line."),
      qa(q3_2024, "cloud-youtube", "Are Cloud and YouTube large enough to matter for the multiple?", "Management highlighted both as durable growth contributors alongside Search.", "Cloud and YouTube growth", false, "positive", "Monitor whether Cloud margin and YouTube monetization can support higher SOTP value."),
      qa(q3_2024, "shareholder-returns", "How do buybacks and dividend fit with AI spending?", "Management maintained shareholder returns while investing in infrastructure.", "CapEx and shareholder returns", false, "neutral", "Watch for later trade-offs between buybacks and infrastructure spend."),
    ],
    watchlist: [
      "Watch Q4 for explicit 2025 CapEx direction.",
      "Track AI Overviews geographic rollout and Search revenue growth.",
      "Look for Cloud profitability improvement, not just revenue growth.",
    ],
  },
  {
    ...q2_2024,
    label: "Q2 2024 Earnings Call",
    shortLabel: "Q2 2024",
    fiscalPeriod: "Quarter ended June 30, 2024",
    eventType: "earnings_call",
    sourceName: "StockAnalysis / Quartr transcript mirror",
    sourceStatus: "secondary_text_transcript_available",
    aiSummary:
      "Q2 2024 was the baseline quarter for the current debate: Search and Cloud were strong, Cloud crossed a $10bn quarterly revenue threshold, and AI was still framed mostly as product innovation plus engagement rather than a huge CapEx/FCF trade-off.",
    managementMessages: [
      "Revenue and profit growth were robust, led by Search and Cloud.",
      "Cloud surpassed $10bn of quarterly revenue.",
      "AI was positioned as driving product innovation and engagement across Search and Cloud.",
      "YouTube maintained streaming leadership and the company expected investments to support margin expansion.",
    ],
    qaPairs: [
      qa(q2_2024, "cloud-threshold", "Does Cloud crossing $10bn of quarterly revenue change the valuation debate?", "Management pointed to scale, AI demand and improving profitability as reasons Cloud deserved more standalone attention.", "Cloud revenue above $10bn", true, "positive", "Track Cloud margin and backlog as scale improves."),
      qa(q2_2024, "ai-innovation", "How much of Search growth is AI-led versus normal ad demand?", "Management emphasized AI-driven product innovation and engagement but offered limited direct monetization KPIs.", "Search growth and AI engagement commentary", false, "mixed", "Separate usage growth from revenue per query."),
      qa(q2_2024, "margin", "Can investments in AI support margin expansion instead of margin dilution?", "Management framed infrastructure and model efficiency as supporting long-term productivity.", "Margin expansion commentary", false, "positive", "Watch future depreciation and capex intensity."),
    ],
    watchlist: [
      "Follow whether Q3 moves the focus from AI usage to AI monetization.",
      "Track Cloud margin after crossing the $10bn quarterly threshold.",
      "Watch early signs of CapEx crowding out buybacks or FCF.",
    ],
  },
];
