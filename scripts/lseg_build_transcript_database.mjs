import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TRANSCRIPT_DIR = path.join(ROOT, "data/local/lseg/transcripts");
const METADATA_PATH = path.join(TRANSCRIPT_DIR, "curated/transcript_metadata.json");
const TRANSCRIPTS_PATH = path.join(TRANSCRIPT_DIR, "curated/transcripts.jsonl");
const OUTPUT_PATH = path.join(TRANSCRIPT_DIR, "extracted/transcript_database.json");

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

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const metadata = readJson(METADATA_PATH);
const rows = readJsonl(TRANSCRIPTS_PATH);
const grouped = rows.reduce((acc, row) => {
  const transcriptId = row.transcriptId ?? "unknown";
  acc[transcriptId] ??= [];
  acc[transcriptId].push(row);
  return acc;
}, {});

const records = (metadata.records ?? []).map((record) => {
  const transcriptRows = grouped[record.transcriptId] ?? [];
  const speakers = [...new Set(transcriptRows.map((row) => normalizeText(row.speaker)).filter(Boolean))];
  const qaRows = transcriptRows.filter((row) => row.section === "qa");
  return {
    transcriptId: record.transcriptId,
    eventDate: record.eventDate,
    fiscalPeriod: record.fiscalPeriod,
    eventType: record.eventType,
    sourcePath: record.sourcePath,
    sourceType: record.sourceType ?? "transcript",
    sourceQualityTag: record.sourceQualityTag ?? "ManualUpload",
    hasQA: Boolean(record.hasQA),
    qaBoundaryConfidence: record.qaBoundaryConfidence ?? "unknown",
    rowCount: transcriptRows.length,
    qaRowCount: qaRows.length,
    speakers,
    managementSpeakers: speakers.filter((speaker) => /ceo|cfo|chief|david|anna|michel/i.test(speaker)),
    analystSpeakers: speakers.filter((speaker) => /analyst|jpmorgan|ubs|morgan|barclays|citi|berenberg|jefferies|goldman|bank/i.test(speaker)),
    managementCommentaryText: normalizeText(transcriptRows.filter((row) => row.section !== "qa").map((row) => row.text).join(" ")).slice(0, 6000),
    qaText: normalizeText(qaRows.map((row) => row.text).join(" ")).slice(0, 6000),
    valuationImpactAllowed: false,
    modelReady: false,
    displayOnly: true,
    notes: "Transcript database rows are display-only. They require human review before being mapped into forecast assumptions.",
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  sourceFiles: [METADATA_PATH, TRANSCRIPTS_PATH],
  recordCount: records.length,
  records,
  warnings: records
    .filter((record) => record.hasQA && record.qaRowCount === 0)
    .map((record) => `${record.transcriptId} is marked hasQA but has zero QA rows.`),
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath: OUTPUT_PATH, recordCount: records.length, warnings: output.warnings }, null, 2));
