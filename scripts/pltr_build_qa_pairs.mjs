import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data/local/pltr/transcripts/raw");
const EXTRACTED_DIR = path.join(ROOT, "data/local/pltr/transcripts/extracted");
const MANIFEST_PATH = path.join(ROOT, "data/local/pltr/transcripts/transcript_manifest.json");
const GENERATED_TS_PATH = path.join(ROOT, "src/stocks/pltr/data/transcripts/qaPairs.ts");

const topicPatterns = [
  ["AIP", /\bAIP\b|Artificial Intelligence Platform|agentic AI|operational AI/i],
  ["bootcamp", /\bboot\s*camps?\b|\bbootcamps?\b/i],
  ["US Commercial", /U\.?S\.?\s+commercial|United States commercial|US commercial/i],
  ["Government", /government|federal|public sector|civil agencies/i],
  ["Defense", /defense|DoD|Department of War|army|navy|warfighter|military|intelligence|national security|Maven|Titan|Ship OS|munitions/i],
  ["Ontology", /ontology|ontologies|semantic data/i],
  ["margin", /margin|operating leverage|profitability|adjusted operating income|GAAP income|free cash flow/i],
  ["SBC", /stock-based compensation|SBC/i],
  ["dilution", /dilution|share count|shares outstanding|diluted shares/i],
  ["guidance", /guidance|guide|forecast|outlook|raised|full-year|Q[1-4] 20\d{2}/i],
  ["valuation", /valuation|multiple|undervalued|overvalued|stock price|investors?|market/i],
  ["customer growth", /customer count|customers?|net dollar retention|NDR|top 20 customer|commercial customer/i],
  ["sales efficiency", /sales cycle|sales efficiency|go-to-market|sales force|salespeople|inbounds|boot camp|demo|deal/i],
  ["Commercial growth", /commercial growth|commercial revenue|commercial customer|commercial TCV/i],
  ["US Government", /U\.?S\.?\s+government|US government|United States government/i],
  ["International Government", /international government|non-US government|Europe|European|Canada|Middle East/i],
  ["Foundry", /foundry/i],
  ["Gotham", /gotham/i],
  ["Apollo", /apollo/i],
  ["Large deals", /large deal|deal count|deals? (?:over|greater than|above)|\$[0-9]+ million deal/i],
  ["Net dollar retention", /net dollar retention|NDR/i],
  ["Rule of 40", /rule of 40/i],
  ["Pricing", /pricing|price increase|paid|pay you|cost attribution/i],
  ["AI monetization", /moneti[sz]ation|AI revenue|AIP revenue|economic value|real-world value/i],
  ["Competitive moat", /competition|competitive|moat|differentiation|alternatives|model labs|labs/i],
  ["Deployment speed", /deploy|deployment|time to value|go live|production|speed to production/i],
];

const knownRoleHints = [
  [/karp/i, "Chief Executive Officer"],
  [/shyam sankar/i, "Chief Technology Officer / President"],
  [/david.*glazer/i, "Chief Financial Officer"],
  [/ryan taylor/i, "Chief Revenue Officer"],
  [/ana soro/i, "Investor Relations / Finance Team"],
  [/anna saro/i, "Investor Relations / Finance Team"],
];

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeWhitespace(value) {
  return decodeEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function stripTags(value) {
  return normalizeWhitespace(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeScriptEscapes(value) {
  return decodeEntities(value)
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0027/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function transcriptIdFor(record) {
  return `pltr-q${record.fiscalQuarter}-${record.fiscalYear}-earnings-${record.callDate}`;
}

function rawFileName(record) {
  return `pltr_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.html`;
}

function extractArticleSlice(raw) {
  const start = raw.indexOf('<h2 id="full-conference-call-transcript"');
  if (start < 0) return raw;
  const articleEnd = raw.indexOf("</article>", start);
  const scriptStart = raw.indexOf("<script", start);
  const endCandidates = [articleEnd, scriptStart].filter((value) => value > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : raw.length;
  return raw.slice(start, end);
}

function extractParticipants(raw) {
  const start = raw.indexOf('<h2 id="call-participants"');
  if (start < 0) return [];
  const ulStart = raw.indexOf("<ul", start);
  const ulEnd = raw.indexOf("</ul>", ulStart);
  if (ulStart < 0 || ulEnd < 0) return [];
  const listHtml = raw.slice(ulStart, ulEnd);
  return [...listHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((match) => {
    const text = stripTags(match[1]);
    const [roleRaw, speakerRaw] = text.split(/\s+[—-]\s+/);
    const role = (roleRaw ?? "").trim();
    const speaker = (speakerRaw ?? text).trim();
    return { speaker, role: role || inferRole(speaker) };
  });
}

function normalizeSpeakerName(name) {
  return name
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim()
    .toLowerCase();
}

function inferRole(speaker) {
  for (const [pattern, role] of knownRoleHints) {
    if (pattern.test(speaker)) return role;
  }
  if (/operator/i.test(speaker)) return "Operator";
  return "Analyst / Shareholder";
}

function roleMapFromParticipants(participants) {
  const roleMap = new Map();
  for (const participant of participants) {
    roleMap.set(normalizeSpeakerName(participant.speaker), participant.role);
  }
  return roleMap;
}

function getRole(roleMap, speaker) {
  return roleMap.get(normalizeSpeakerName(speaker)) ?? inferRole(speaker);
}

function isOperatorSpeaker(speaker, role) {
  return /ana soro|anna saro|operator|investor relations|finance team/i.test(`${speaker} ${role}`);
}

function isManagementSpeaker(speaker, role) {
  return /chief|officer|president|ceo|cfo|cto|revenue officer|karp|sankar|glazer|taylor/i.test(`${speaker} ${role}`) && !isOperatorSpeaker(speaker, role);
}

function paragraphItems(articleHtml) {
  return [...articleHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => {
    const html = match[1];
    const plainText = stripTags(html);
    if (/^Duration:\s*\d+\s*minutes/i.test(plainText) || /All earnings call transcripts/i.test(plainText)) {
      return { speaker: null, role: null, text: "__TRANSCRIPT_END__" };
    }
    const speakerRoleMatch = html.match(/<strong\b[^>]*>\s*([^<]+?)\s*<\/strong>\s*(?:--|—|-)\s*<em\b[^>]*>\s*([^<]+?)\s*<\/em>/i);
    if (speakerRoleMatch) {
      return {
        speaker: stripTags(speakerRoleMatch[1]),
        role: stripTags(speakerRoleMatch[2]),
        text: stripTags(html.replace(speakerRoleMatch[0], "")),
      };
    }
    const strongMatch = html.match(/<strong\b[^>]*>\s*([^<]+?:)\s*<\/strong>/i);
    const speaker = strongMatch ? stripTags(strongMatch[1]).replace(/:$/, "").trim() : null;
    const textHtml = strongMatch ? html.replace(strongMatch[0], "") : html;
    const text = stripTags(textHtml);
    return { speaker, role: null, text };
  }).filter((item) => item.text.length > 0 || item.speaker);
}

function earningsVideoParagraphItems(raw) {
  const items = [];
  const blockStarts = [...raw.matchAll(/<div\b[^>]*id=["']p-\d+["'][^>]*>/gi)];
  for (let index = 0; index < blockStarts.length; index += 1) {
    const start = blockStarts[index].index ?? 0;
    const end = blockStarts[index + 1]?.index ?? raw.length;
    const blockHtml = raw.slice(start, end);
    const spans = [...blockHtml.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((span) => stripTags(span[1]))
      .filter(Boolean);
    const speaker = spans[0] ?? null;
    const role = spans[1] ?? null;
    const text = [...blockHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((paragraph) => stripTags(paragraph[1]))
      .filter(Boolean)
      .join(" ");
    if (speaker && text) items.push({ speaker, role, text });
  }
  return items;
}

function motleyRscParagraphItems(raw) {
  const decoded = decodeScriptEscapes(raw);
  const marker = '["$","p","';
  const items = [];
  let offset = decoded.indexOf(marker);
  let transcriptStarted = false;
  const seen = new Set();

  while (offset >= 0) {
    const nextOffset = decoded.indexOf(marker, offset + marker.length);
    const chunk = decoded.slice(offset, nextOffset > offset ? nextOffset : Math.min(decoded.length, offset + 12000));
    const speakerRoleMatch = chunk.match(
      /\["\$","strong","[^"]*",\{"children":"([\s\S]*?)"\}\]," -- ",\["\$","em","[^"]*",\{"children":"([\s\S]*?)"\}\]/,
    );

    if (speakerRoleMatch) {
      const speaker = normalizeWhitespace(speakerRoleMatch[1]);
      const role = normalizeWhitespace(speakerRoleMatch[2]);
      if (speaker && role && !/NASDAQ|NYSE|Price as of|Calculated by average return/i.test(`${speaker} ${role}`)) {
        transcriptStarted = true;
        const key = `speaker:${speaker}:${role}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ speaker, role, text: "" });
        }
      }
    } else if (transcriptStarted) {
      const textMatch = chunk.match(/\{"children":"([\s\S]*?)"\}\]/);
      const text = textMatch ? normalizeWhitespace(textMatch[1]) : "";
      if (/All earnings call transcripts|Duration:\s*\d+\s*minutes|This article is a transcript|Motley Fool Transcribing/i.test(text)) break;
      if (
        text &&
        text.length > 15 &&
        !/^\$|^\d+$|Calculated by average return|NASDAQ|NYSE|Related Articles|Investing Articles/i.test(text)
      ) {
        const key = `text:${text.slice(0, 160)}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ speaker: null, role: null, text });
        }
      }
    }
    offset = nextOffset;
  }

  return items;
}

function transcriptParagraphItems(raw) {
  const articleHtml = extractArticleSlice(raw);
  const htmlItems = paragraphItems(articleHtml);
  if (htmlItems.some((item) => item.speaker)) return htmlItems;

  const earningsVideoItems = earningsVideoParagraphItems(raw);
  if (earningsVideoItems.some((item) => item.speaker)) return earningsVideoItems;

  const rscItems = motleyRscParagraphItems(raw);
  if (rscItems.some((item) => item.speaker)) return rscItems;

  return htmlItems;
}

function buildSpeakerBlocks(record, raw, sourcePath) {
  const participants = extractParticipants(raw);
  const roleMap = roleMapFromParticipants(participants);
  const paragraphs = transcriptParagraphItems(raw);
  const blocks = [];
  let current = null;

  for (const item of paragraphs) {
    if (item.text === "__TRANSCRIPT_END__") break;
    if (item.speaker) {
      if (current && current.text.trim()) blocks.push(current);
      const role = item.role ?? getRole(roleMap, item.speaker);
      current = {
        sequence: blocks.length + 1,
        transcriptId: transcriptIdFor(record),
        fiscalYear: record.fiscalYear,
        fiscalQuarter: record.fiscalQuarter,
        speakerName: item.speaker,
        speakerRole: role,
        section: "prepared_remarks",
        text: item.text,
        topicTags: [],
        sourcePath,
      };
    } else if (current) {
      current.text = `${current.text} ${item.text}`.trim();
    }
  }
  if (current && current.text.trim()) blocks.push(current);

  const qaStart = blocks.findIndex((block) =>
    isOperatorSpeaker(block.speakerName, block.speakerRole) &&
    /\b(question|questions|Q&A|shareholder|analyst|next question|received a question|turn to questions)\b/i.test(block.text),
  );
  const resolvedQaStart = qaStart >= 0 ? qaStart : blocks.findIndex((block) => !isManagementSpeaker(block.speakerName, block.speakerRole));

  return blocks.map((block, index) => {
    const section =
      resolvedQaStart >= 0 && index >= resolvedQaStart
        ? isOperatorSpeaker(block.speakerName, block.speakerRole)
          ? "operator"
          : isManagementSpeaker(block.speakerName, block.speakerRole)
            ? "qa_answer"
            : "qa_question"
        : "prepared_remarks";
    return {
      ...block,
      sequence: index + 1,
      section,
      topicTags: tagTopics(block.text),
    };
  });
}

function tagTopics(text) {
  return topicPatterns.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function extractAnalystFromOperator(text) {
  const patterns = [
    /question (?:is )?from ([A-Z][A-Za-z .'-]+?) with ([A-Z][A-Za-z .&'-]+?)(?:\.|,| who| please|$)/i,
    /from ([A-Z][A-Za-z .'-]+?) with ([A-Z][A-Za-z .&'-]+?)(?:\.|,| who| please|$)/i,
    /question from ([A-Z][A-Za-z .'-]+?)(?:,|\s+who|\s+asks|\.|$)/i,
    /received a question from ([A-Z][A-Za-z .'-]+?)(?:,|\s+who|\s+asks|\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        name: normalizeWhitespace(match[1]).replace(/\s+please$/i, ""),
        firm: match[2] ? normalizeWhitespace(match[2]).replace(/\s+please$/i, "") : "shareholder",
      };
    }
  }
  return null;
}

function operatorQuestionText(text) {
  const asksIndex = text.search(/\b(who asks|asks|question is|question from)\b/i);
  if (asksIndex >= 0 && /[?]/.test(text.slice(asksIndex))) {
    return text.slice(asksIndex).replace(/^(who asks|asks|question is|question from)[:,\s-]*/i, "").trim();
  }
  return "";
}

function looksLikeQuestion(text) {
  return /\?|\bcan you\b|\bcould you\b|\bhow\b|\bwhat\b|\bwhy\b|\bwhen\b|\bwhere\b|\bdo you\b|\bhave you\b|\bhas\b/i.test(text);
}

function answerQuality(answerText) {
  if (answerText.length < 120) return "partial";
  if (/\bI don't know\b|\bnot going to\b|\bcan't talk\b|\bcannot talk\b/i.test(answerText)) return "partial";
  return "direct";
}

function sentimentFor(tags, text) {
  if (/\brisk|pressure|difficult|can't|cannot|budget|dilution|SBC|competition|overvalued\b/i.test(text)) return "mixed";
  if (tags.some((tag) => ["AIP", "US Commercial", "customer growth", "sales efficiency", "Defense"].includes(tag))) return "positive";
  return "neutral";
}

function buildQaPairs(record, speakerBlocks) {
  const pairs = [];
  let pendingAnalyst = null;
  let currentQuestion = null;
  let answerBlocks = [];

  function flush() {
    if (!currentQuestion || answerBlocks.length === 0) {
      currentQuestion = null;
      answerBlocks = [];
      return;
    }
    const answer = answerBlocks.map((block) => block.text).join("\n\n");
    const topics = Array.from(new Set(tagTopics(`${currentQuestion.question} ${answer}`)));
    pairs.push({
      id: `${record.ticker.toLowerCase()}-${record.fiscalYear}-q${record.fiscalQuarter}-qa-${pairs.length + 1}`,
      transcriptId: transcriptIdFor(record),
      fiscalYear: record.fiscalYear,
      fiscalQuarter: record.fiscalQuarter,
      analystName: currentQuestion.analystName,
      analystFirm: currentQuestion.analystFirm,
      question: currentQuestion.question,
      managementSpeaker: Array.from(new Set(answerBlocks.map((block) => block.speakerName))).join(" / "),
      managementRole: Array.from(new Set(answerBlocks.map((block) => block.speakerRole))).join(" / "),
      answer,
      topicTags: topics,
      sentiment: sentimentFor(topics, `${currentQuestion.question} ${answer}`),
      evidenceStrength: topics.length >= 3 ? "high" : topics.length > 0 ? "medium" : "low",
      relatedMetricKey: relatedMetricKey(topics),
      sourcePath: currentQuestion.sourcePath,
      modelReady: false,
      valuationImpactAllowed: false,
    });
    currentQuestion = null;
    answerBlocks = [];
  }

  for (const block of speakerBlocks) {
    if (block.section === "prepared_remarks") continue;
    const operator = isOperatorSpeaker(block.speakerName, block.speakerRole);
    const management = isManagementSpeaker(block.speakerName, block.speakerRole);
    if (operator) {
      const nextAnalyst = extractAnalystFromOperator(block.text);
      const operatorQuestion = operatorQuestionText(block.text);
      if (currentQuestion && answerBlocks.length > 0) {
        flush();
      } else if (/next question|received a question|question from|our next question|we received/i.test(block.text)) {
        flush();
      }
      if (nextAnalyst) pendingAnalyst = nextAnalyst;
      if (operatorQuestion && looksLikeQuestion(operatorQuestion)) {
        currentQuestion = {
          analystName: nextAnalyst?.name ?? block.speakerName,
          analystFirm: nextAnalyst?.firm ?? "shareholder",
          question: operatorQuestion,
          sourcePath: block.sourcePath,
        };
        pendingAnalyst = null;
      }
      continue;
    }

    if (!management && looksLikeQuestion(block.text)) {
      flush();
      currentQuestion = {
        analystName: block.speakerName,
        analystFirm: pendingAnalyst?.name && normalizeSpeakerName(pendingAnalyst.name) === normalizeSpeakerName(block.speakerName)
          ? pendingAnalyst.firm
          : pendingAnalyst?.firm ?? "unknown",
        question: block.text,
        sourcePath: block.sourcePath,
      };
      pendingAnalyst = null;
      continue;
    }

    if (management && currentQuestion) {
      answerBlocks.push(block);
    }
  }
  flush();
  return pairs;
}

function relatedMetricKey(tags) {
  if (tags.includes("US Commercial")) return "usCommercialRevenue";
  if (tags.includes("Government") || tags.includes("Defense")) return "governmentRevenue";
  if (tags.includes("margin")) return "adjustedOperatingMargin";
  if (tags.includes("SBC")) return "sbcExpense";
  if (tags.includes("dilution")) return "dilutedShareCount";
  if (tags.includes("guidance")) return "guidanceRevenue";
  if (tags.includes("customer growth")) return "customerCount";
  return undefined;
}

function buildTopicTrends(record, speakerBlocks, qaPairs) {
  const fullText = speakerBlocks.map((block) => block.text).join("\n");
  return topicPatterns.map(([topic, pattern]) => {
    const mentions = (fullText.match(new RegExp(pattern.source, "gi")) ?? []).length;
    return {
      periodId: `q${record.fiscalQuarter}-${record.fiscalYear}`,
      fiscalYear: record.fiscalYear,
      fiscalQuarter: record.fiscalQuarter,
      topic,
      mentions,
      preparedRemarkMentions: speakerBlocks
        .filter((block) => block.section === "prepared_remarks")
        .reduce((sum, block) => sum + ((block.text.match(new RegExp(pattern.source, "gi")) ?? []).length), 0),
      qaMentions: qaPairs.reduce((sum, pair) => sum + (((`${pair.question} ${pair.answer}`).match(new RegExp(pattern.source, "gi")) ?? []).length), 0),
      evidenceStrength: mentions > 8 ? "high" : mentions > 0 ? "medium" : "low",
    };
  });
}

async function parseRecord(record, rawFiles) {
  const expectedFile = rawFileName(record);
  const matchedFile = rawFiles.includes(expectedFile)
    ? expectedFile
    : rawFiles.find((file) => file.includes(`fy${record.fiscalYear}_q${record.fiscalQuarter}`) && file.endsWith(".html"));
  if (!matchedFile) {
    return {
      record,
      status: record.transcriptUrl ? "raw_missing" : "missing_transcript_url",
      error: record.transcriptUrl ? "Raw transcript file is missing. Run npm run pltr:fetch-transcripts." : "No transcript URL supplied.",
    };
  }
  const rawPath = path.join(RAW_DIR, matchedFile);
  const raw = await fs.readFile(rawPath, "utf8");
  const sourcePath = path.relative(ROOT, rawPath);
  const speakerBlocks = buildSpeakerBlocks(record, raw, sourcePath);
  const qaPairs = buildQaPairs(record, speakerBlocks);
  const topicTrends = buildTopicTrends(record, speakerBlocks, qaPairs);
  const parsed = {
    transcriptId: transcriptIdFor(record),
    ticker: record.ticker,
    fiscalYear: record.fiscalYear,
    fiscalQuarter: record.fiscalQuarter,
    callDate: record.callDate,
    sourceName: record.sourceName,
    transcriptUrl: record.transcriptUrl,
    sourcePath,
    parsedAt: new Date().toISOString(),
    parserVersion: "transcript-html-rsc-v3",
    callParticipants: extractParticipants(raw),
    preparedRemarks: speakerBlocks.filter((block) => block.section === "prepared_remarks"),
    operatorSections: speakerBlocks.filter((block) => block.section === "operator"),
    speakerBlocks,
    qaPairs,
    topicTrends,
    warnings: [
      ...(qaPairs.length === 0 ? ["No Q&A pairs extracted."] : []),
      ...(speakerBlocks.length === 0 ? ["No speaker blocks extracted."] : []),
    ],
  };
  const jsonPath = path.join(EXTRACTED_DIR, `${record.ticker.toLowerCase()}_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.json`);
  const textPath = path.join(EXTRACTED_DIR, `${record.ticker.toLowerCase()}_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.txt`);
  await fs.writeFile(jsonPath, JSON.stringify(parsed, null, 2));
  await fs.writeFile(textPath, speakerBlocks.map((block) => `${block.speakerName} (${block.speakerRole})\n${block.text}`).join("\n\n"));
  return {
    record,
    status: qaPairs.length > 0 ? "parsed" : "needs_review",
    outputPath: path.relative(ROOT, jsonPath),
    textPath: path.relative(ROOT, textPath),
    sourcePath,
    speakerBlocks,
    qaPairs,
    topicTrends,
    warnings: parsed.warnings,
  };
}

function tsString(value) {
  return JSON.stringify(value, null, 2);
}

async function writeGeneratedTs(qaPairs, topicTrends) {
  const content = `import type { PltrQaPair, PltrTopicTrendPoint } from "../../model";

export const pltrQaPairs: PltrQaPair[] = ${tsString(qaPairs)};

export const pltrTopicTrends: PltrTopicTrendPoint[] = ${tsString(topicTrends)};
`;
  await fs.writeFile(GENERATED_TS_PATH, content);
}

await fs.mkdir(EXTRACTED_DIR, { recursive: true });
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
const records = manifest.records ?? [];
const rawFiles = await fs.readdir(RAW_DIR).catch(() => []);
const parseResults = [];

for (const record of records) {
  parseResults.push(await parseRecord(record, rawFiles));
}

const qaPairs = parseResults.flatMap((result) => result.qaPairs ?? []);
const topicTrends = parseResults.flatMap((result) => result.topicTrends ?? []);
await fs.writeFile(path.join(EXTRACTED_DIR, "qa_pairs.json"), JSON.stringify(qaPairs, null, 2));
await fs.writeFile(path.join(EXTRACTED_DIR, "topic_trends.json"), JSON.stringify(topicTrends, null, 2));
await fs.writeFile(
  path.join(EXTRACTED_DIR, "parse_summary.json"),
  JSON.stringify(
    {
      ticker: "PLTR",
      parsedAt: new Date().toISOString(),
      parserVersion: "transcript-html-rsc-v3",
      records: parseResults.map((result) => ({
        fiscalYear: result.record.fiscalYear,
        fiscalQuarter: result.record.fiscalQuarter,
        callDate: result.record.callDate,
        sourceName: result.record.sourceName,
        transcriptUrl: result.record.transcriptUrl,
        status: result.status,
        outputPath: result.outputPath ?? null,
        textPath: result.textPath ?? null,
        sourcePath: result.sourcePath ?? null,
        speakerBlocks: result.speakerBlocks?.length ?? 0,
        qaPairs: result.qaPairs?.length ?? 0,
        topicTrendRows: result.topicTrends?.length ?? 0,
        warnings: result.warnings ?? (result.error ? [result.error] : []),
      })),
      totals: {
        qaPairs: qaPairs.length,
        topicTrendRows: topicTrends.length,
      },
    },
    null,
    2,
  ),
);
await writeGeneratedTs(qaPairs, topicTrends);

console.log(`PLTR Q&A build complete: ${qaPairs.length} Q&A pairs and ${topicTrends.length} topic trend rows.`);
for (const result of parseResults) {
  console.log(
    `- FY${result.record.fiscalYear} Q${result.record.fiscalQuarter}: ${result.status}; ${result.qaPairs?.length ?? 0} Q&A pairs; ${result.speakerBlocks?.length ?? 0} speaker blocks`,
  );
}
