import type { DeepResearchDataset, DeepResearchQuarterlyQuestion } from "./model";

type TopicDefinition = {
  id: string;
  label: string;
  keywords: string[];
};

type TopicScore = {
  topicId: string;
  label: string;
  score: number;
  frequency: number;
  weightedHits: number;
  matchedTerms: Array<{ term: string; count: number }>;
};

export type DeepResearchAttentionQuarter = {
  quarter: string;
  eventDate: string;
  sourceStatus: string;
  topTopic: string;
  topTopicScore: number;
  totalMatchedTerms: number;
  scores: TopicScore[];
  chartValues: Record<string, string | number>;
};

export type DeepResearchTopicTrend = {
  topicId: string;
  label: string;
  latestScore: number;
  priorScore: number;
  firstScore: number;
  eightQuarterAverage: number;
  qoqChange: number;
  eightQuarterChange: number;
  latestFrequency: number;
  latestMatchedTerms: Array<{ term: string; count: number }>;
  interpretation: string;
};

export type DeepResearchAttentionOutput = {
  topics: TopicDefinition[];
  quarters: DeepResearchAttentionQuarter[];
  chartRows: Array<Record<string, string | number>>;
  topicTrends: DeepResearchTopicTrend[];
  topChartTopics: TopicDefinition[];
  overview: string;
  sourceBoundary: string;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "and",
  "are",
  "before",
  "between",
  "case",
  "does",
  "from",
  "have",
  "into",
  "main",
  "more",
  "should",
  "that",
  "the",
  "their",
  "this",
  "through",
  "under",
  "versus",
  "what",
  "when",
  "where",
  "whether",
  "with",
  "without",
]);

const COLORS = ["#2563eb", "#b91c1c", "#0f766e", "#7c3aed", "#a16207", "#475569"];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicId(value: string, index: number) {
  const id = normalizeText(value).replace(/\s+/g, "_").slice(0, 28);
  return id || `topic_${index + 1}`;
}

function tokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function termCount(text: string, term: string) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;
  const pattern = new RegExp(`(?:^|\\s)${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g");
  return text.match(pattern)?.length ?? 0;
}

function uniquePush(list: string[], value: string) {
  const normalized = normalizeText(value);
  if (normalized && !list.includes(normalized)) list.push(normalized);
}

function extractKeywords(label: string, sourceText: string) {
  const keywords: string[] = [];
  uniquePush(keywords, label);
  const labelTokens = tokens(label);
  for (const token of labelTokens) uniquePush(keywords, token);

  const sourceTokens = tokens(sourceText);
  const counts = new Map<string, number>();
  for (const token of sourceTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .forEach(([token]) => uniquePush(keywords, token));

  const phraseCandidates = sourceText
    .split(/[.;:|,]/)
    .map((part) => normalizeText(part))
    .filter((part) => part.split(" ").length >= 2 && part.split(" ").length <= 5)
    .slice(0, 10);
  for (const phrase of phraseCandidates) uniquePush(keywords, phrase);

  return keywords.slice(0, 18);
}

function buildTopicDefinitions(dataset: DeepResearchDataset): TopicDefinition[] {
  const excludedTabs = new Set(["dashboard", "earnings-questions", "valuation", "risk-red-team"]);
  const tabTopics = dataset.tabs.filter((tab) => !excludedTabs.has(tab.value));
  const topics = tabTopics.map((tab, index) => {
    const sections = dataset.deepDiveSections.filter((section) => section.tab === tab.value);
    const questionText = dataset.researchQuestions
      .filter((question) => normalizeText(`${question.key} ${question.question} ${question.metric}`).includes(normalizeText(tab.value).split(" ")[0] ?? ""))
      .map((question) => `${question.question} ${question.metric} ${question.evidenceNeeded} ${question.bearCase}`)
      .join(" ");
    const sourceText = [
      tab.label,
      ...sections.flatMap((section) => [section.title, section.thesis, ...section.evidence, ...section.watchItems]),
      questionText,
    ].join(" ");
    return {
      id: topicId(tab.label, index),
      label: tab.label,
      keywords: extractKeywords(tab.label, sourceText),
    };
  });

  if (topics.length >= 3) return topics.slice(0, 6);

  return dataset.researchQuestions.slice(0, 6).map((question, index) => ({
    id: topicId(question.key || question.question, index),
    label: question.metric || question.key,
    keywords: extractKeywords(question.metric || question.key, `${question.question} ${question.currentView} ${question.evidenceNeeded} ${question.bearCase}`),
  }));
}

function quarterText(row: DeepResearchQuarterlyQuestion) {
  return normalizeText([row.headline, ...row.keyQuestions, row.managementTone, row.modelReadThrough].join(" "));
}

function scoreQuarter(row: DeepResearchQuarterlyQuestion, topics: TopicDefinition[], maxWeightedHits: number): DeepResearchAttentionQuarter {
  const text = quarterText(row);
  const scores = topics.map((topic) => {
    const matchedTerms = topic.keywords
      .map((term) => ({ term, count: termCount(text, term) }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term));
    const frequency = matchedTerms.reduce((sum, item) => sum + item.count, 0);
    const weightedHits = matchedTerms.reduce((sum, item) => {
      const phraseWeight = item.term.includes(" ") ? 2.5 : 1;
      const labelBoost = normalizeText(topic.label).includes(item.term) ? 1.25 : 1;
      return sum + item.count * phraseWeight * labelBoost;
    }, 0);
    return {
      topicId: topic.id,
      label: topic.label,
      frequency,
      weightedHits,
      score: maxWeightedHits > 0 ? Math.round((weightedHits / maxWeightedHits) * 100) : 0,
      matchedTerms: matchedTerms.slice(0, 6),
    };
  }).sort((left, right) => right.score - left.score);
  const top = scores[0];
  return {
    quarter: row.quarter,
    eventDate: row.eventDate,
    sourceStatus: row.sourceStatus,
    topTopic: top?.label ?? "n/a",
    topTopicScore: top?.score ?? 0,
    totalMatchedTerms: scores.reduce((sum, item) => sum + item.frequency, 0),
    scores,
    chartValues: {
      quarter: row.quarter,
      eventDate: row.eventDate,
      ...(Object.fromEntries(scores.map((score) => [score.topicId, score.score])) as Record<string, number>),
    },
  };
}

function rawWeightedHits(row: DeepResearchQuarterlyQuestion, topic: TopicDefinition) {
  const text = quarterText(row);
  return topic.keywords.reduce((sum, term) => {
    const count = termCount(text, term);
    const phraseWeight = term.includes(" ") ? 2.5 : 1;
    const labelBoost = normalizeText(topic.label).includes(term) ? 1.25 : 1;
    return sum + count * phraseWeight * labelBoost;
  }, 0);
}

function trendInterpretation(topic: string, qoqChange: number, eightQuarterChange: number) {
  const direction = eightQuarterChange >= 18 ? "rising" : eightQuarterChange <= -18 ? "fading" : qoqChange >= 12 ? "reaccelerating" : qoqChange <= -12 ? "cooling" : "stable";
  if (direction === "rising") return `${topic} has become a larger market-focus topic across the eight-quarter window.`;
  if (direction === "fading") return `${topic} has faded as a market-focus topic versus the start of the window.`;
  if (direction === "reaccelerating") return `${topic} reaccelerated quarter-over-quarter and needs follow-up in the next call.`;
  if (direction === "cooling") return `${topic} cooled quarter-over-quarter, but should stay on the watchlist if valuation-sensitive.`;
  return `${topic} is stable in the transcript-summary attention map.`;
}

export function buildDeepResearchAttentionOutput(dataset: DeepResearchDataset): DeepResearchAttentionOutput {
  const topics = buildTopicDefinitions(dataset);
  const chronologicalRows = [...dataset.quarterlyQuestions].sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  const rawMax = Math.max(1, ...chronologicalRows.flatMap((row) => topics.map((topic) => rawWeightedHits(row, topic))));
  const quarters = chronologicalRows.map((row) => scoreQuarter(row, topics, rawMax));
  const chartRows = quarters.map((quarter) => quarter.chartValues);
  const latest = quarters[quarters.length - 1];
  const prior = quarters[Math.max(0, quarters.length - 2)];
  const first = quarters[0];
  const topicTrends = topics
    .map((topic) => {
      const latestScore = Number(latest?.chartValues[topic.id] ?? 0);
      const priorScore = Number(prior?.chartValues[topic.id] ?? 0);
      const firstScore = Number(first?.chartValues[topic.id] ?? 0);
      const quarterScores = quarters.map((quarter) => Number(quarter.chartValues[topic.id] ?? 0));
      const latestTopicScore = latest?.scores.find((score) => score.topicId === topic.id);
      const qoqChange = latestScore - priorScore;
      const eightQuarterChange = latestScore - firstScore;
      return {
        topicId: topic.id,
        label: topic.label,
        latestScore,
        priorScore,
        firstScore,
        eightQuarterAverage: quarterScores.reduce((sum, score) => sum + score, 0) / Math.max(1, quarterScores.length),
        qoqChange,
        eightQuarterChange,
        latestFrequency: latestTopicScore?.frequency ?? 0,
        latestMatchedTerms: latestTopicScore?.matchedTerms ?? [],
        interpretation: trendInterpretation(topic.label, qoqChange, eightQuarterChange),
      };
    })
    .sort((left, right) => right.latestScore - left.latestScore || Math.abs(right.eightQuarterChange) - Math.abs(left.eightQuarterChange));

  const topChartTopics = topicTrends.slice(0, 5).map((trend) => topics.find((topic) => topic.id === trend.topicId)).filter(Boolean) as TopicDefinition[];
  const rising = [...topicTrends].sort((left, right) => right.eightQuarterChange - left.eightQuarterChange)[0];
  const latestLeader = topicTrends[0];
  const overview = latestLeader
    ? `${dataset.ticker} latest call-summary attention is led by ${latestLeader.label} (${latestLeader.latestScore}/100). ${rising ? `${rising.label} shows the largest eight-quarter change (${rising.eightQuarterChange >= 0 ? "+" : ""}${rising.eightQuarterChange}).` : ""}`
    : `${dataset.ticker} has no usable earnings-call attention scores.`;

  return {
    topics,
    quarters,
    chartRows,
    topicTrends,
    topChartTopics,
    overview,
    sourceBoundary:
      "AI-coded attention scores are normalized keyword-frequency scores from the available earnings-call question clusters, management-tone notes and model read-throughs. They are research signals, not official company metrics, and should affect valuation only through explicit assumption changes.",
  };
}

export function topicColor(index: number) {
  return COLORS[index % COLORS.length];
}
