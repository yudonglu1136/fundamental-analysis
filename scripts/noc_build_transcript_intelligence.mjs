import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TRANSCRIPT_DIR = path.join(ROOT, "data/local/noc/transcripts");
const RAW_DIR = path.join(TRANSCRIPT_DIR, "raw");
const EXTRACTED_DIR = path.join(TRANSCRIPT_DIR, "extracted");
const MANIFEST_PATH = path.join(TRANSCRIPT_DIR, "transcript_manifest.json");

const TOPICS = [
  "B-21",
  "Raider",
  "Sentinel",
  "GBSD",
  "Space Systems",
  "SDA",
  "restricted",
  "Mission Systems",
  "Defense Systems",
  "margin",
  "EAC",
  "free cash flow",
  "working capital",
  "fixed price",
  "backlog",
  "book-to-bill",
  "buyback",
  "dividend",
  "pension",
  "budget",
  "continuing resolution",
];

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function listRawFiles() {
  try {
    const files = await fs.readdir(RAW_DIR);
    return files.filter((file) => /\.(html|txt)$/i.test(file));
  } catch {
    return [];
  }
}

function stripHtml(text) {
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function countTopicMentions(text) {
  const normalized = text.toLowerCase();
  return TOPICS.map((topic) => ({
    topic,
    mentions: (normalized.match(new RegExp(topic.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length,
  })).filter((item) => item.mentions > 0);
}

const manifest = await readJson(MANIFEST_PATH, { ticker: "NOC", records: [] });
const rawFiles = await listRawFiles();
const topicRows = [];
const extractedBlocks = [];

for (const file of rawFiles) {
  const fullPath = path.join(RAW_DIR, file);
  const raw = await fs.readFile(fullPath, "utf8");
  const text = stripHtml(raw).replace(/\s+/g, " ").trim();
  const mentions = countTopicMentions(text);
  topicRows.push({
    sourcePath: path.relative(ROOT, fullPath),
    characterCount: text.length,
    topics: mentions,
    modelReady: false,
    valuationImpactAllowed: false,
    notes: "Auto topic counts are research-only and require analyst review against official actuals/guidance.",
  });
  extractedBlocks.push({
    sourcePath: path.relative(ROOT, fullPath),
    preview: text.slice(0, 1_500),
    candidateOnly: true,
    valuationImpactAllowed: false,
  });
}

const intelligence = {
  ticker: "NOC",
  builtAt: new Date().toISOString(),
  sourceDiscipline:
    "Transcript intelligence is research-only. Numeric claims are candidates until validated against official releases, 10-Q/10-K, 8-K exhibits, or government documents.",
  manifestRecords: manifest.records ?? [],
  rawTranscriptCount: rawFiles.length,
  topicRows,
  extractedBlocks,
  requiredTopics: TOPICS,
};

await fs.mkdir(EXTRACTED_DIR, { recursive: true });
await fs.writeFile(path.join(EXTRACTED_DIR, "transcript_intelligence.json"), JSON.stringify(intelligence, null, 2));
await fs.writeFile(
  path.join(EXTRACTED_DIR, "topic_trends_auto.json"),
  JSON.stringify({ ticker: "NOC", builtAt: intelligence.builtAt, rows: topicRows }, null, 2),
);

console.log(`NOC transcript intelligence built from ${rawFiles.length} raw files.`);
console.log("Transcript outputs remain research-only and valuationImpactAllowed=false.");
