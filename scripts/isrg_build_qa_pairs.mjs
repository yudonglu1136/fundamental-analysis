import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data/local/isrg/transcripts/raw");
const EXTRACTED_DIR = path.join(ROOT, "data/local/isrg/transcripts/extracted");
const MANIFEST_PATH = path.join(ROOT, "data/local/isrg/transcripts/transcript_manifest.json");

const topicPatterns = [
  ["Procedure growth", /procedure growth|procedures|case volume/i],
  ["da Vinci 5", /da Vinci 5|DV5|force feedback|fifth generation/i],
  ["System placements", /placements?|systems? placed|installed base/i],
  ["Lease mix", /lease|usage-based|usage based/i],
  ["OUS growth", /OUS|outside the U\.?S\.?|international|Europe|Japan/i],
  ["China", /China|tender|localization/i],
  ["Ion", /\bIon\b|lung biopsy|endoluminal/i],
  ["SP", /\bSP\b|single port|single-port/i],
  ["Margins", /margin|gross margin|operating margin/i],
  ["Tariffs", /tariff/i],
  ["Competition", /competition|competitive|J&J|Ottava|Medtronic|Hugo|CMR|Versius/i],
  ["GLP-1", /GLP-?1|obesity drug/i],
  ["Bariatric", /bariatric/i],
  ["Capital allocation", /buyback|repurchase|cash|capital allocation/i],
  ["Guidance", /guidance|outlook|guide/i],
];

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagTopics(text) {
  return topicPatterns.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function blocksFromHtml(html, record, sourcePath) {
  const paragraphMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const blocks = [];
  let current = null;
  for (const match of paragraphMatches) {
    const htmlBlock = match[1];
    const strong = htmlBlock.match(/<strong\b[^>]*>\s*([^<]+?)\s*:?\s*<\/strong>/i);
    const speaker = strong ? stripTags(strong[1]).replace(/:$/, "").trim() : null;
    const text = stripTags(strong ? htmlBlock.replace(strong[0], "") : htmlBlock);
    if (speaker) {
      if (current?.text) blocks.push(current);
      current = {
        transcriptId: record.transcriptId,
        fiscalYear: record.fiscalYear,
        fiscalQuarter: record.fiscalQuarter,
        speakerName: speaker,
        speakerRole: /operator/i.test(speaker) ? "Operator" : "Participant",
        text,
        sourcePath,
      };
    } else if (current && text) {
      current.text = `${current.text} ${text}`.trim();
    }
  }
  if (current?.text) blocks.push(current);
  return blocks;
}

function looksLikeQuestion(text) {
  return /\?|how\b|what\b|why\b|can you|could you|talk about|help us/i.test(text);
}

function buildQaPairs(record, blocks) {
  const pairs = [];
  let pendingQuestion = null;
  for (const block of blocks) {
    const topics = tagTopics(block.text);
    if (looksLikeQuestion(block.text) && !/operator/i.test(block.speakerName)) {
      pendingQuestion = block;
      continue;
    }
    if (pendingQuestion && !looksLikeQuestion(block.text) && !/operator/i.test(block.speakerName)) {
      const answer = block;
      const combinedTopics = Array.from(new Set([...tagTopics(pendingQuestion.text), ...topics]));
      pairs.push({
        id: `${record.transcriptId}-qa-${pairs.length + 1}`,
        transcriptId: record.transcriptId,
        fiscalYear: record.fiscalYear,
        fiscalQuarter: record.fiscalQuarter,
        analystName: pendingQuestion.speakerName || "unknown",
        analystFirm: "unknown",
        question: pendingQuestion.text,
        managementSpeaker: answer.speakerName || "management",
        managementRole: answer.speakerRole || "management",
        answer: answer.text,
        topicTags: combinedTopics.length ? combinedTopics : ["Guidance"],
        sentiment: /tariff|competition|pressure|slow|risk/i.test(`${pendingQuestion.text} ${answer.text}`) ? "mixed" : "neutral",
        evidenceStrength: answer.text.length > 160 ? "medium" : "low",
        sourcePath: answer.sourcePath,
        modelReady: false,
        valuationImpactAllowed: false,
        candidateOnly: true,
      });
      pendingQuestion = null;
    }
  }
  return pairs;
}

await fs.mkdir(EXTRACTED_DIR, { recursive: true });
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
const records = manifest.records ?? [];
const allBlocks = [];
const allPairs = [];

for (const record of records) {
  const candidatePath = record.outputPath ? path.join(ROOT, record.outputPath) : path.join(RAW_DIR, `isrg_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.html`);
  try {
    const html = await fs.readFile(candidatePath, "utf8");
    const blocks = blocksFromHtml(html, record, path.relative(ROOT, candidatePath));
    const pairs = buildQaPairs(record, blocks);
    allBlocks.push(...blocks);
    allPairs.push(...pairs);
    await fs.writeFile(path.join(EXTRACTED_DIR, `${record.transcriptId}.json`), JSON.stringify({ record, blocks, pairs }, null, 2));
  } catch {
    // Missing transcript files are expected until transcriptUrl is supplied and fetched.
  }
}

const topicTrends = [];
for (const record of records) {
  for (const [topic] of topicPatterns) {
    const relatedBlocks = allBlocks.filter((block) => block.transcriptId === record.transcriptId && tagTopics(block.text).includes(topic));
    const relatedPairs = allPairs.filter((pair) => pair.transcriptId === record.transcriptId && pair.topicTags.includes(topic));
    if (relatedBlocks.length || relatedPairs.length) {
      topicTrends.push({
        periodId: `q${record.fiscalQuarter}-${record.fiscalYear}`,
        fiscalYear: record.fiscalYear,
        fiscalQuarter: record.fiscalQuarter,
        topic,
        mentions: relatedBlocks.length + relatedPairs.length,
        preparedRemarkMentions: relatedBlocks.length,
        qaMentions: relatedPairs.length,
        evidenceStrength: relatedPairs.length ? "medium" : "low",
      });
    }
  }
}

const parseSummary = {
  ticker: "ISRG",
  createdAt: new Date().toISOString(),
  totals: {
    records: records.length,
    speakerBlocks: allBlocks.length,
    qaPairs: allPairs.length,
    topicTrendRows: topicTrends.length,
  },
  rule:
    "Q&A pairs are candidate-only and modelReady=false. Promote numeric values only after validation against official releases/filings.",
};

await fs.writeFile(path.join(EXTRACTED_DIR, "speaker_blocks.json"), JSON.stringify(allBlocks, null, 2));
await fs.writeFile(path.join(EXTRACTED_DIR, "qa_pairs.json"), JSON.stringify(allPairs, null, 2));
await fs.writeFile(path.join(EXTRACTED_DIR, "topic_trends.json"), JSON.stringify(topicTrends, null, 2));
await fs.writeFile(path.join(EXTRACTED_DIR, "parse_summary.json"), JSON.stringify(parseSummary, null, 2));
console.log(`ISRG Q&A build complete: ${allPairs.length} Q&A pairs and ${topicTrends.length} topic rows.`);
