import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data/local/pltr/transcripts/transcript_manifest.json");
const RAW_DIR = path.join(ROOT, "data/local/pltr/transcripts/raw");

function safeName(record) {
  return `pltr_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.html`;
}

async function fetchTranscript(record) {
  if (!record.transcriptUrl) {
    return { ...record, status: "missing_transcript_url", outputPath: null, notes: `${record.notes ?? ""} No transcriptUrl supplied.`.trim() };
  }
  const response = await fetch(record.transcriptUrl, {
    headers: {
      "User-Agent": "fundamental-analysis-pltr-transcript-fetcher",
      Accept: "text/html,text/plain,*/*",
    },
  });
  if (!response.ok) throw new Error(`${record.transcriptUrl} returned ${response.status}`);
  const text = await response.text();
  const outPath = path.join(RAW_DIR, safeName(record));
  await fs.writeFile(outPath, text);
  return {
    ...record,
    status: "raw_fetched",
    outputPath: path.relative(ROOT, outPath),
    fetchedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(text),
    error: null,
  };
}

await fs.mkdir(RAW_DIR, { recursive: true });
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
const records = manifest.records ?? [];
const nextRecords = [];

for (const record of records) {
  try {
    nextRecords.push(await fetchTranscript(record));
  } catch (error) {
    nextRecords.push({
      ...record,
      status: "fetch_failed",
      outputPath: null,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const nextManifest = {
  ...manifest,
  updatedAt: new Date().toISOString(),
  records: nextRecords,
};
await fs.writeFile(MANIFEST_PATH, JSON.stringify(nextManifest, null, 2));
console.log(`PLTR transcript fetch complete: ${nextRecords.filter((record) => record.status === "raw_fetched").length}/${nextRecords.length} raw transcripts fetched.`);
