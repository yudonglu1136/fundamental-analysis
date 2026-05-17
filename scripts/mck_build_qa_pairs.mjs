import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const processedDir = path.join(root, "data/local/mck/transcripts/processed");
const extractedDir = path.join(root, "data/local/mck/transcripts/extracted");
const topics = ["specialty", "oncology", "biopharma services", "GLP-1", "biosimilars", "margin", "working capital", "capital allocation", "buyback", "reimbursement", "customer contracts", "regulatory"];

function detectTopic(text) {
  const lower = text.toLowerCase();
  return topics.find((topic) => lower.includes(topic.toLowerCase())) ?? "margin";
}

function simpleExtractQa(text, file) {
  const segments = text.split(/(?:Question-and-Answer Session|Q&A|Question:|Operator)/i).filter((part) => part.trim().length > 80);
  return segments.slice(0, 12).map((segment, index) => ({
    id: `${file.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index + 1}`,
    eventId: file.replace(/\.[^.]+$/, ""),
    analyst: "Unknown / parser candidate",
    topic: detectTopic(segment),
    question: segment.slice(0, 500),
    answer: segment.slice(500, 1200),
    pressurePoint: "Parser candidate; analyst review required before model use.",
    sourceType: "transcript_candidate",
  }));
}

async function main() {
  await mkdir(extractedDir, { recursive: true });
  const files = await readdir(processedDir).catch(() => []);
  const textFiles = files.filter((file) => /\.txt$/i.test(file));
  const qaPairs = [];
  const themeCounts = Object.fromEntries(topics.map((topic) => [topic, 0]));
  for (const file of textFiles) {
    const text = await readFile(path.join(processedDir, file), "utf8");
    for (const topic of topics) {
      const matches = text.match(new RegExp(topic.replace("+", "\\+"), "gi"));
      themeCounts[topic] += matches?.length ?? 0;
    }
    qaPairs.push(...simpleExtractQa(text, file));
  }
  await writeFile(path.join(extractedDir, "qa_pairs.json"), JSON.stringify(qaPairs, null, 2));
  await writeFile(path.join(extractedDir, "topic_trends.json"), JSON.stringify({ generatedAt: new Date().toISOString(), themeCounts }, null, 2));
  console.log(`Built ${qaPairs.length} transcript Q&A candidate(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
