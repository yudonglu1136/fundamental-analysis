import fs from "node:fs";
import path from "node:path";

const repoRoot = "/Users/yudonglu/Documents/fundamental-analysis";
const qaTopicsPath = path.join(repoRoot, "data/local/lseg/transcripts/extracted/qa_topics.json");
const metadataPath = path.join(repoRoot, "data/local/lseg/transcripts/curated/transcript_metadata.json");
const transcriptsPath = path.join(repoRoot, "data/local/lseg/transcripts/curated/transcripts.jsonl");
const outputPath = path.join(repoRoot, "data/local/lseg/transcripts/extracted/qa_pairs.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseSeq(quoteLocation) {
  const match = String(quoteLocation ?? "").match(/seq:(\d+)/i);
  return match ? Number(match[1]) : null;
}

function compactWhitespace(text) {
  return String(text ?? "")
    .replace(/─+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text, maxLength = 260) {
  const normalized = compactWhitespace(text);
  if (!normalized) return "";
  const sentenceMatch = normalized.match(/(.+?[.!?])(?:\s|$)/);
  const first = sentenceMatch?.[1] ?? normalized;
  return first.length <= maxLength ? first : `${first.slice(0, maxLength - 1).trim()}…`;
}

function firstSubstantiveSentence(text, maxLength = 260) {
  const sentences = compactWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const substantive = sentences.find((sentence) => sentence.length > 35 && !isHandoffRow(sentence));
  return substantive ? clip(substantive, maxLength) : firstSentence(text, maxLength);
}

function clip(text, maxLength = 320) {
  const normalized = compactWhitespace(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function minConfidence(left, right) {
  const rank = { high: 3, medium: 2, low: 1, none: 0 };
  const leftRank = rank[left] ?? 1;
  const rightRank = rank[right] ?? 1;
  const minRank = Math.min(leftRank, rightRank);
  return minRank >= 3 ? "high" : minRank === 2 ? "medium" : "low";
}

function parseAnalystFromSpeaker(speaker) {
  const trimmed = compactWhitespace(speaker);
  const parenMatch = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    return {
      analystName: parenMatch[1].trim() || "unknown",
      analystFirm: parenMatch[2].trim() || "unknown",
    };
  }
  return {
    analystName: trimmed || "unknown",
    analystFirm: "unknown",
  };
}

function findRosterMatch(name, metadata) {
  const observed = Array.isArray(metadata?.observedAnalystSpeakers) ? metadata.observedAnalystSpeakers : [];
  const target = normalize(name);
  if (!target) return undefined;
  return observed.find((entry) => normalize(entry).includes(target) || target.includes(normalize(entry)));
}

function parseAnalystFromOperatorText(text, metadata) {
  const clean = compactWhitespace(text);
  const match = [...clean.matchAll(/([A-Z][A-Za-z .,&'/-]{2,}?)\s*-\s*Analyst\s+(.*?)(?:$)/g)].pop();
  const operatorIntro = clean.split(" - Analyst ")[0] ?? "";
  const commaPair = [...operatorIntro.matchAll(/([A-Z][A-Za-z' -]+(?:\s+[A-Z][A-Za-z' -]+)*)\s*,\s*([^.,]+)/g)].pop();

  let analystName = "unknown";
  let analystFirm = "unknown";

  if (commaPair) {
    analystName = compactWhitespace(commaPair[1]) || analystName;
    analystFirm = compactWhitespace(commaPair[2]) || analystFirm;
  } else if (match?.[1]) {
    const rosterMatch = findRosterMatch(match[1], metadata);
    analystName = compactWhitespace(match[1].split(/\s{2,}/)[0]) || analystName;
    if (rosterMatch) {
      const rosterClean = compactWhitespace(rosterMatch);
      if (rosterClean.startsWith(analystName)) {
        const firmGuess = rosterClean.slice(analystName.length).trim();
        if (firmGuess && firmGuess.length > 2) analystFirm = firmGuess;
      }
    }
  }

  const questionText = compactWhitespace(match?.[2] ?? clean);
  return { analystName, analystFirm, questionText };
}

function isQuestionRow(row) {
  if (row.speakerRole === "analyst") return true;
  return row.section === "qa" && row.speakerRole === "operator" && /\-\s*Analyst\b/i.test(String(row.text ?? ""));
}

function isHandoffRow(text) {
  const normalized = normalize(text);
  return (
    normalized.includes("will take your first question") ||
    normalized.includes("happy to touch on the second") ||
    normalized.includes("good morning") && normalized.includes("thanks") && normalized.split(" ").length < 18 ||
    normalized.startsWith("thanks david") ||
    normalized.startsWith("thanks tom") ||
    normalized.startsWith("thanks ") && normalized.includes("i ll take") ||
    normalized.includes("open the line to questions")
  );
}

function inferTopicAndSubtopic(row, qaTopic) {
  if (qaTopic) {
    const topic = compactWhitespace(qaTopic.questionTopic || qaTopic.subtopic || "general");
    const subtopic = compactWhitespace(qaTopic.subtopic || qaTopic.questionTopic || "general");
    return { topic, subtopic };
  }
  const text = normalize(`${row.questionText} ${row.answerText}`);
  if (text.includes("workspace") || text.includes("mcp") || text.includes("open directory")) {
    return { topic: "workspace", subtopic: "workspace" };
  }
  if (text.includes("tradeweb") || text.includes("fixed income") || text.includes("capital markets")) {
    return { topic: "capital_markets", subtopic: "capital_markets" };
  }
  if (text.includes("post trade") || text.includes("lch") || text.includes("swapclear") || text.includes("clearing")) {
    return { topic: "post_trade", subtopic: "post_trade" };
  }
  if (text.includes("ftse")) {
    return { topic: "ftse_russell", subtopic: "ftse_russell" };
  }
  if (text.includes("risk intelligence") || text.includes("world check")) {
    return { topic: "risk_intelligence", subtopic: "risk_intelligence" };
  }
  if (text.includes("margin") || text.includes("ebitda")) {
    return { topic: "margin", subtopic: "margin" };
  }
  if (text.includes("buyback") || text.includes("dividend") || text.includes("leverage")) {
    return { topic: "capital_allocation", subtopic: "capital_allocation" };
  }
  if (text.includes("guidance") || text.includes("growth")) {
    return { topic: "guidance", subtopic: "guidance" };
  }
  return { topic: "general", subtopic: "general" };
}

function inferSegment(topic, subtopic, text) {
  const haystack = normalize(`${topic} ${subtopic} ${text}`);
  if (haystack.includes("workspace") || haystack.includes("data analytics") || haystack.includes("data and analytics") || haystack.includes("mcp")) {
    return "Data & Analytics";
  }
  if (haystack.includes("ftse")) return "FTSE Russell";
  if (haystack.includes("risk intelligence") || haystack.includes("world check")) return "Risk Intelligence";
  if (haystack.includes("tradeweb") || haystack.includes("capital markets") || haystack.includes("interbank")) return "Capital Markets";
  if (haystack.includes("post trade") || haystack.includes("lch") || haystack.includes("swapclear") || haystack.includes("clearing")) {
    return "Post Trade";
  }
  if (haystack.includes("corporate")) return "Other / Corporate";
  return "Group-level";
}

function inferModelDriver(topic, subtopic, text) {
  const haystack = normalize(`${topic} ${subtopic} ${text}`);
  if (haystack.includes("workspace") || haystack.includes("refinitiv") || haystack.includes("mcp") || haystack.includes("data analytics")) {
    return "Workspace / Refinitiv";
  }
  if (haystack.includes("post trade") || haystack.includes("lch") || haystack.includes("swapclear") || haystack.includes("clearing")) {
    return "Post Trade / LCH / SwapClear";
  }
  if (haystack.includes("tradeweb") || haystack.includes("capital markets") || haystack.includes("fixed income") || haystack.includes("fx")) {
    return "Tradeweb / Capital Markets";
  }
  if (haystack.includes("pricing") || haystack.includes("retention") || haystack.includes("renewal") || haystack.includes("displacement")) {
    return "pricing / retention";
  }
  if (haystack.includes("buyback")) return "buyback";
  if (haystack.includes("dividend")) return "dividend";
  if (haystack.includes("capex") || haystack.includes("capital intensity") || haystack.includes("investment")) return "capex";
  if (haystack.includes("free cash flow") || haystack.includes("cash conversion")) return "FCF";
  if (haystack.includes("margin") || haystack.includes("ebitda")) return "margin";
  if (haystack.includes("risk") || haystack.includes("regulation") || haystack.includes("security")) return "risk";
  return "revenue growth";
}

function inferAnswerQuality(qaTopic, answerText) {
  const directness = compactWhitespace(qaTopic?.answerDirectness);
  if (directness === "direct") return "direct";
  if (directness === "partial") return "partial";
  const normalized = normalize(answerText);
  if (!normalized) return "unclear";
  if (normalized.includes("we don t comment")) return "evasive";
  if (normalized.includes("can t give you") || normalized.includes("cannot give you that answer")) return "partial";
  if (normalized.includes("we remain") || normalized.includes("we expect") || normalized.includes("we are seeing") || normalized.includes("we continue")) return "direct";
  return "unclear";
}

function buildQuestionSummary(topic, subtopic, questionText) {
  const mapped = compactWhitespace(topic || subtopic);
  if (mapped && mapped !== "general") {
    return `Question on ${mapped.replace(/_/g, " ")}`;
  }
  return firstSentence(questionText, 140);
}

function isTrivialAnalystFollowup(text) {
  const normalized = normalize(text);
  return (
    normalized.length < 80 &&
    (
      normalized === "thank you" ||
      normalized === "thanks" ||
      normalized === "great thank you" ||
      normalized === "okay thanks" ||
      normalized === "thanks map" ||
      normalized === "very helpful thank you" ||
      normalized.startsWith("that s helpful") ||
      normalized.startsWith("great thank you") ||
      normalized.startsWith("okay thanks") ||
      normalized.startsWith("thanks ")
    )
  );
}

function isWeakSummary(text) {
  const normalized = normalize(text);
  return (
    !normalized ||
    normalized.split(" ").length < 8 ||
    isHandoffRow(text) ||
    normalized.startsWith("thanks") ||
    normalized.startsWith("great") ||
    normalized.startsWith("good morning")
  );
}

function stripEmbeddedAnalystFollowups(text) {
  const clean = compactWhitespace(text);
  const analystTag = clean.match(/[A-Z][A-Za-z' -]+(?:\s+[A-Z][A-Za-z' -]+)+\s+[A-Z][A-Za-z0-9.&' -]{2,}\s*-\s*Analyst\b/);
  if (!analystTag || analystTag.index == null) return clean;
  return compactWhitespace(clean.slice(0, analystTag.index));
}

function buildAnswerSummary(qaTopic, answerText) {
  const extracted = compactWhitespace(qaTopic?.managementAnswerSummary);
  if (extracted && !isWeakSummary(extracted)) return extracted;
  const fallback = firstSubstantiveSentence(answerText, 220);
  if (fallback) return fallback;
  return "Answer parsing requires manual transcript verification.";
}

function buildSupportingQuote(answerText, questionText, qaTopic) {
  const answerSentences = compactWhitespace(answerText)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const strongAnswerSentence = answerSentences.find((sentence) => sentence.length > 40 && !isHandoffRow(sentence));
  return clip(strongAnswerSentence || qaTopic?.supportingQuoteShort || questionText, 240);
}

function buildWarnings({ metadata, analystName, analystFirm, answerText, qaBoundaryConfidence, usedFallbackMatch }) {
  const warnings = [];
  if (metadata?.qaBoundaryConfidence === "low") {
    warnings.push("Q&A boundary confidence is low for this event.");
  }
  if (analystName === "unknown") {
    warnings.push("Analyst name could not be confidently parsed from the transcript.");
  }
  if (analystFirm === "unknown") {
    warnings.push("Analyst firm could not be confidently parsed from the transcript.");
  }
  if (!compactWhitespace(answerText)) {
    warnings.push("No full answer text was parsed; pair relies on extracted answer summary only.");
  }
  if (usedFallbackMatch) {
    warnings.push("Question row was matched using fallback transcript pairing heuristics.");
  }
  if (metadata?.warnings?.some((warning) => /Q&A-like markers/i.test(warning))) {
    warnings.push("Transcript metadata already flagged partial confidence around Q&A parsing.");
  }
  return warnings;
}

function resolveQuestionRow(rows, qaTopic, metadata, usedIndices) {
  const targetSeq = parseSeq(qaTopic?.quoteLocation);
  if (targetSeq != null) {
    const exactIndex = rows.findIndex((row, index) => !usedIndices.has(index) && row.sequenceNumber === targetSeq);
    if (exactIndex >= 0) return { row: rows[exactIndex], index: exactIndex, usedFallbackMatch: false };
  }

  const analystName = qaTopic?.analystName ? parseAnalystFromSpeaker(qaTopic.analystName).analystName : "";
  const normalizedAnalyst = normalize(analystName);
  const quotePrefix = normalize(String(qaTopic?.supportingQuoteShort ?? "").slice(0, 120));

  let bestIndex = -1;
  let bestScore = -1;

  rows.forEach((row, index) => {
    if (usedIndices.has(index) || !isQuestionRow(row)) return;
    let score = 0;
    const rowText = compactWhitespace(row.text);
    if (normalize(row.speaker).includes(normalizedAnalyst)) score += 4;
    if (normalize(rowText).includes(quotePrefix.slice(0, 48))) score += 5;
    if (targetSeq != null) score += Math.max(0, 4 - Math.min(4, Math.abs(row.sequenceNumber - targetSeq)));
    if (row.speakerRole === "analyst") score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex >= 0) {
    return { row: rows[bestIndex], index: bestIndex, usedFallbackMatch: true };
  }

  return { row: undefined, index: -1, usedFallbackMatch: true };
}

const qaTopics = readJson(qaTopicsPath).items;
const metadataRecords = readJson(metadataPath).records;
const transcriptRows = readJsonl(transcriptsPath);

const metadataById = new Map(metadataRecords.map((record) => [record.transcriptId, record]));
const qaTopicsByTranscriptId = new Map();
for (const item of qaTopics) {
  const list = qaTopicsByTranscriptId.get(item.transcriptId) ?? [];
  list.push(item);
  qaTopicsByTranscriptId.set(item.transcriptId, list);
}
for (const [transcriptId, items] of qaTopicsByTranscriptId.entries()) {
  items.sort((left, right) => (parseSeq(left.quoteLocation) ?? 0) - (parseSeq(right.quoteLocation) ?? 0));
}

const qaRowsByTranscriptId = new Map();
for (const row of transcriptRows.filter((entry) => entry.section === "qa")) {
  const list = qaRowsByTranscriptId.get(row.transcriptId) ?? [];
  list.push(row);
  qaRowsByTranscriptId.set(row.transcriptId, list);
}
for (const rows of qaRowsByTranscriptId.values()) {
  rows.sort((left, right) => left.sequenceNumber - right.sequenceNumber);
}

const items = [];
const globalWarnings = [];

for (const metadata of metadataRecords) {
  const rows = qaRowsByTranscriptId.get(metadata.transcriptId) ?? [];
  if (rows.length === 0) continue;

  const topicQueue = [...(qaTopicsByTranscriptId.get(metadata.transcriptId) ?? [])];
  const usedIndices = new Set();
  let pairOrder = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isQuestionRow(row)) continue;
    if (usedIndices.has(index)) continue;

    let matchedTopic = undefined;
    if (topicQueue.length > 0) {
      const nextTopic = topicQueue[0];
      const candidateSeq = parseSeq(nextTopic.quoteLocation);
      if (
        candidateSeq == null ||
        Math.abs((candidateSeq ?? row.sequenceNumber) - row.sequenceNumber) <= 3 ||
        normalize(row.speaker).includes(normalize(nextTopic.analystName ?? "")) ||
        normalize(row.text).includes(normalize(String(nextTopic.supportingQuoteShort ?? "").slice(0, 48)))
      ) {
        matchedTopic = topicQueue.shift();
      }
    }

    if (!matchedTopic && topicQueue.length > 0) {
      const resolved = resolveQuestionRow(rows, topicQueue[0], metadata, usedIndices);
      if (resolved.index === index) {
        matchedTopic = topicQueue.shift();
      }
    }

    const usedFallbackMatch = !matchedTopic;
    usedIndices.add(index);

    let analystName = "unknown";
    let analystFirm = "unknown";
    let questionText = compactWhitespace(row.text);

    if (row.speakerRole === "analyst") {
      const parsed = parseAnalystFromSpeaker(matchedTopic?.analystName || row.speaker);
      analystName = parsed.analystName;
      analystFirm = matchedTopic?.firm ? compactWhitespace(matchedTopic.firm) : parsed.analystFirm;
    } else {
      const parsed = parseAnalystFromOperatorText(row.text, metadata);
      analystName = parsed.analystName;
      analystFirm = parsed.analystFirm;
      questionText = parsed.questionText || questionText;
    }

    const answerRows = [];
    for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex += 1) {
      const nextRow = rows[nextIndex];
      if (isQuestionRow(nextRow)) break;
      if (nextRow.speakerRole === "management" || (answerRows.length > 0 && nextRow.speakerRole === "unknown")) {
        answerRows.push(nextRow);
      }
    }

    if (isTrivialAnalystFollowup(questionText)) {
      continue;
    }

    const primaryAnswerRows =
      answerRows.length > 1
        ? answerRows.filter((answerRow, answerIndex) => !(answerIndex === 0 && isHandoffRow(answerRow.text)))
        : answerRows;

    const effectiveAnswerRows = primaryAnswerRows.length > 0 ? primaryAnswerRows : answerRows;
    const answerText = effectiveAnswerRows
      .map((answerRow) => stripEmbeddedAnalystFollowups(answerRow.text))
      .filter(Boolean)
      .join("\n\n");
    const responderNames = [];
    for (const answerRow of effectiveAnswerRows) {
      if (answerRow.speakerRole === "management" && answerRow.speaker) {
        responderNames.push(answerRow.speaker);
      }
    }
    const managementResponder = [...new Set(responderNames)].join(", ") || "unknown";

    const { topic, subtopic } = inferTopicAndSubtopic(
      { questionText, answerText },
      matchedTopic,
    );
    const answerSummary = buildAnswerSummary(matchedTopic, answerText);
    const supportingQuoteShort = buildSupportingQuote(answerText, questionText, matchedTopic);
    const qaBoundaryConfidence = metadata.hasQA ? metadata.qaBoundaryConfidence ?? "low" : "none";
    const confidence = minConfidence(matchedTopic?.confidence ?? "medium", qaBoundaryConfidence);
    const warnings = buildWarnings({
      metadata,
      analystName,
      analystFirm,
      answerText,
      qaBoundaryConfidence,
      usedFallbackMatch,
    });

    items.push({
      id: `${metadata.transcriptId}-qa-pair-${String(pairOrder + 1).padStart(2, "0")}`,
      transcriptId: metadata.transcriptId,
      eventDate: metadata.eventDate,
      fiscalPeriod: metadata.fiscalPeriod,
      eventType: metadata.eventType,
      analystName,
      analystFirm,
      questionText: questionText || undefined,
      questionSummary: buildQuestionSummary(topic, subtopic, questionText),
      managementResponder,
      answerText: answerText || undefined,
      answerSummary: answerSummary || undefined,
      supportingQuoteShort,
      topic,
      subtopic,
      segment: inferSegment(topic, subtopic, `${questionText} ${answerText}`),
      modelDriver: inferModelDriver(topic, subtopic, `${questionText} ${answerText}`),
      answerQuality: inferAnswerQuality(matchedTopic, answerText),
      followUpNeeded: matchedTopic?.followUpNeeded ?? inferAnswerQuality(matchedTopic, answerText) !== "direct",
      confidence,
      qaBoundaryConfidence,
      sourcePath: matchedTopic?.sourcePath || row.sourcePath,
      sourceQualityTag: "ManualUpload",
      displayOnly: true,
      candidateOnly: true,
      needsHumanReview: true,
      modelReady: false,
      valuationImpactAllowed: false,
      section: "qa",
      speaker: analystName,
      speakerRole: "analyst",
      quoteLocation: row.quoteLocation,
      warnings,
    });
    pairOrder += 1;
  }

  if (metadata.hasQA && items.filter((item) => item.transcriptId === metadata.transcriptId).length === 0) {
    globalWarnings.push(`No Q&A pairs were produced for ${metadata.transcriptId} despite hasQA=true.`);
  }
}

const countsByTranscriptId = items.reduce((acc, item) => {
  acc[item.transcriptId] = (acc[item.transcriptId] ?? 0) + 1;
  return acc;
}, {});

const output = {
  generatedAt: new Date().toISOString(),
  sourceFiles: [
    qaTopicsPath,
    metadataPath,
    transcriptsPath,
  ],
  warnings: globalWarnings,
  countsByTranscriptId,
  items,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      pairCount: items.length,
      countsByTranscriptId,
      warnings: globalWarnings,
    },
    null,
    2,
  ),
);
