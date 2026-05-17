import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RAW_DIR = path.join(ROOT, "data/local/lseg/transcripts/raw");
const DOWNLOAD_DATE = new Date().toISOString();

const transcriptDocuments = [
  {
    title: "LSEG FY2025 preliminary results transcript",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/transcripts/lseg-2025-preliminary-results-transcript-26feb2026.pdf",
    reportingPeriod: "FY2025",
    eventDate: "2026-02-26",
    source_type: "transcript",
  },
  {
    title: "LSEG H1 2025 interim results transcript",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/interim-results/transcripts/lseg-h1-2025-interim-results-transcript-31july2025.pdf",
    reportingPeriod: "H1 2025",
    eventDate: "2025-07-31",
    source_type: "transcript",
  },
  {
    title: "LSEG Q1 2026 trading update transcript",
    url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/trading-update/transcripts/lseg-q1-2026-trading-update-transcript-23apr2026.pdf",
    reportingPeriod: "Q1 2026",
    eventDate: "2026-04-23",
    source_type: "transcript",
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100);
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 LSEG transcript fetcher",
      accept: "application/pdf,text/html,*/*;q=0.8",
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "unknown",
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

function detectBlocked(buffer) {
  const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 4000));
  return /Pardon Our Interruption|Request unsuccessful|Access Denied|captcha|Akamai/i.test(preview);
}

async function writeIfNew(filePath, bytes) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
    return true;
  }
}

await fs.mkdir(RAW_DIR, { recursive: true });

const records = [];
for (const doc of transcriptDocuments) {
  const response = await fetchBuffer(doc.url);
  const blocked = detectBlocked(response.buffer);
  const extension = response.contentType.includes("pdf") || doc.url.toLowerCase().includes(".pdf") ? "pdf" : "bin";
  const localPath = path.join(RAW_DIR, "official_fetch", `${slugify(doc.title)}.${extension}`);
  const written = await writeIfNew(localPath, response.buffer);
  records.push({
    ...doc,
    downloadDate: DOWNLOAD_DATE,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    localPath,
    written,
    blocked,
    parseStatus: !response.ok ? "http_error_cached" : blocked ? "blocked" : "raw_pdf_cached_text_extraction_requires_parser",
    byteLength: response.buffer.length,
  });
}

const metadata = {
  company: "London Stock Exchange Group plc",
  ticker: "LSEG.L",
  downloadDate: DOWNLOAD_DATE,
  records,
  notes: [
    "Official transcript PDFs are cached without overwriting prior files.",
    "If direct download is blocked, blocked=true and the challenge response is retained for audit.",
    "Structured transcript extraction is handled by lseg_build_transcript_database.mjs and lseg_build_qa_pairs.mjs from curated/manual exports.",
  ],
};

await fs.writeFile(path.join(RAW_DIR, "official_fetch_metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`LSEG transcript fetch complete: ${records.length} records. Metadata saved to ${path.join(RAW_DIR, "official_fetch_metadata.json")}`);
