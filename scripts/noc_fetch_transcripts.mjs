import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TRANSCRIPT_DIR = path.join(ROOT, "data/local/noc/transcripts");
const RAW_DIR = path.join(TRANSCRIPT_DIR, "raw");
const MANIFEST_PATH = path.join(TRANSCRIPT_DIR, "transcript_manifest.json");

const defaultManifest = {
  ticker: "NOC",
  createdAt: new Date().toISOString(),
  sourceDiscipline:
    "NOC transcripts are research-only unless numeric claims are validated against official releases, 10-Q/10-K, or 8-K exhibits.",
  records: [
    {
      fiscalYear: 2026,
      fiscalQuarter: 1,
      callDate: "2026-04-21",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry, but official transcript URL was not identified in the module seed. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2025,
      fiscalQuarter: 4,
      callDate: "2026-01-27",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Official transcript URL was not identified in the module seed. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callDate: "2025-10-21",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2025,
      fiscalQuarter: 2,
      callDate: "2025-07-22",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2025,
      fiscalQuarter: 1,
      callDate: "2025-04-22",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2024,
      fiscalQuarter: 4,
      callDate: "2025-01-30",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2024,
      fiscalQuarter: 3,
      callDate: "2024-10-24",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
    {
      fiscalYear: 2024,
      fiscalQuarter: 2,
      callDate: "2024-07-25",
      sourceName: "Official IR archive / third-party transcript placeholder",
      officialTranscriptAvailable: false,
      transcriptUrl: null,
      notes: "Third-party index confirms an earnings-call transcript entry. Add a reliable URL manually before fetching.",
    },
  ],
};

function safeName(record) {
  return `noc_fy${record.fiscalYear}_q${record.fiscalQuarter}_${record.callDate}.html`;
}

async function readManifest() {
  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
    const existingKeys = new Set((manifest.records ?? []).map((record) => `${record.fiscalYear}-Q${record.fiscalQuarter}`));
    const missingDefaults = defaultManifest.records.filter((record) => !existingKeys.has(`${record.fiscalYear}-Q${record.fiscalQuarter}`));
    if (missingDefaults.length) {
      return {
        ...manifest,
        records: [...(manifest.records ?? []), ...missingDefaults],
      };
    }
    return manifest;
  } catch {
    await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(defaultManifest, null, 2));
    return defaultManifest;
  }
}

async function fetchTranscript(record) {
  if (!record.transcriptUrl) {
    return {
      ...record,
      status: "missing_transcript_url",
      outputPath: null,
      downloadDate: new Date().toISOString(),
      blocked: false,
      parsedSuccessfully: false,
      manuallySeeded: Boolean(record.manuallySeeded),
      sourceType: "transcript",
      sourceStatus: "research_only",
      valuationImpactAllowed: false,
      notes: `${record.notes ?? ""} No transcriptUrl supplied. Official earnings release remains the source for actuals/guidance.`.trim(),
    };
  }
  const response = await fetch(record.transcriptUrl, {
    headers: {
      "User-Agent": "fundamental-analysis-noc-transcript-fetcher",
      Accept: "text/html,text/plain,*/*",
    },
  });
  if (!response.ok) {
    const error = new Error(`${record.transcriptUrl} returned ${response.status}`);
    error.statusCode = response.status;
    error.blocked = [401, 403, 429].includes(response.status);
    throw error;
  }
  const text = await response.text();
  const blocked = /captcha|bot challenge|access denied|pardon our interruption|request unsuccessful/i.test(text);
  const outPath = path.join(RAW_DIR, safeName(record));
  await fs.writeFile(outPath, text);
  return {
    ...record,
    status: blocked ? "blocked_or_challenge_response_cached" : "raw_fetched",
    outputPath: path.relative(ROOT, outPath),
    downloadDate: new Date().toISOString(),
    blocked,
    parsedSuccessfully: false,
    manuallySeeded: false,
    sourceType: "transcript",
    sourceStatus: "research_only",
    valuationImpactAllowed: false,
    bytes: Buffer.byteLength(text),
    error: null,
  };
}

await fs.mkdir(RAW_DIR, { recursive: true });
const manifest = await readManifest();
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
      downloadDate: new Date().toISOString(),
      blocked: Boolean(error?.blocked) || /blocked|forbidden|403|429|captcha|bot/i.test(error instanceof Error ? error.message : String(error)),
      parsedSuccessfully: false,
      manuallySeeded: Boolean(record.manuallySeeded),
      sourceType: "transcript",
      sourceStatus: "research_only",
      valuationImpactAllowed: false,
      statusCode: error?.statusCode ?? null,
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
console.log(`NOC transcript fetch complete: ${nextRecords.filter((record) => record.status === "raw_fetched").length}/${nextRecords.length} raw transcripts fetched.`);
console.log("Transcript outputs remain research_only and valuationImpactAllowed=false.");
