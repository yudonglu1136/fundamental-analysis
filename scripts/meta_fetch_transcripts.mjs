import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TRANSCRIPT_DIR = path.join(ROOT, "data/local/meta/transcripts");
const ATTEMPTED_AT = new Date().toISOString();

const transcripts = [
  {
    title: "Meta Q2 2024 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q2/META-Q2-2024-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q2 2024",
  },
  {
    title: "Meta Q3 2024 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q3/META-Q3-2024-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q3 2024",
  },
  {
    title: "Meta Q4 2024 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2024/q4/META-Q4-2024-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q4 2024",
  },
  {
    title: "Meta Q1 2025 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q1/META-Q1-2025-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q1 2025",
  },
  {
    title: "Meta Q2 2025 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q2/META-Q2-2025-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q2 2025",
  },
  {
    title: "Meta Q3 2025 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q3/META-Q3-2025-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q3 2025",
  },
  {
    title: "Meta Q4 2025 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q4 2025 / FY 2025",
  },
  {
    title: "Meta Q1 2026 Earnings Call Transcript",
    url: "https://s21.q4cdn.com/399680738/files/doc_financials/2026/q1/META-Q1-2026-Earnings-Call-Transcript.pdf",
    reportingPeriod: "Q1 2026",
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90);
}

async function fetchTranscript(item) {
  await fs.mkdir(TRANSCRIPT_DIR, { recursive: true });
  const filePath = path.join(TRANSCRIPT_DIR, `${slugify(item.title)}.pdf`);
  try {
    const response = await fetch(item.url, {
      headers: {
        "user-agent": "Mozilla/5.0 META research module transcript fetcher",
        accept: "application/pdf,text/html,*/*;q=0.8",
      },
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 2000));
    const blocked = /captcha|bot|blocked|access denied|akamai|pardon our interruption/i.test(preview);
    await fs.writeFile(filePath, buffer);
    return {
      title: item.title,
      source_url: item.url,
      reportingPeriod: item.reportingPeriod,
      attempted_at: ATTEMPTED_AT,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "unknown",
      filePath,
      byteLength: buffer.length,
      blocked,
      reason: blocked ? "challenge_or_blocked_response_cached" : undefined,
      fallback_used: false,
    };
  } catch (error) {
    return {
      title: item.title,
      source_url: item.url,
      reportingPeriod: item.reportingPeriod,
      attempted_at: ATTEMPTED_AT,
      ok: false,
      blocked: true,
      reason: error instanceof Error ? error.message : String(error),
      fallback_used: true,
      fallback_note: "Curated transcript insights in src/stocks/meta/data/transcriptData.ts remain available.",
    };
  }
}

const records = [];
for (const transcript of transcripts) {
  records.push(await fetchTranscript(transcript));
}

await fs.writeFile(path.join(TRANSCRIPT_DIR, "transcript_metadata.json"), JSON.stringify({
  company: "Meta Platforms, Inc.",
  ticker: "META",
  attempted_at: ATTEMPTED_AT,
  records,
}, null, 2));

console.log(`META transcript fetch complete: ${records.length} transcript(s) attempted. Metadata saved to ${path.join(TRANSCRIPT_DIR, "transcript_metadata.json")}`);
