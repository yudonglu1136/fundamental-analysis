import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = path.join(ROOT, "data/local/goog/official");
const METADATA_PATH = path.join(ROOT, "data/local/goog/fetch_metadata.json");

const targets = [
  {
    id: "goog-ir-home",
    title: "Alphabet Investor Relations",
    url: "https://abc.xyz/investor/",
    sourceType: "official_actual",
    kind: "html",
    reportingPeriod: "Investor relations landing page",
  },
  {
    id: "goog-ir-earnings",
    title: "Alphabet Investor Relations Earnings",
    url: "https://abc.xyz/investor/Earnings/default.aspx",
    sourceType: "official_actual",
    kind: "html",
    reportingPeriod: "Earnings centre",
  },
  {
    id: "goog-q1-2026-release",
    title: "Alphabet Announces First Quarter 2026 Results",
    url: "https://s206.q4cdn.com/479360582/files/doc_financials/2026/q1/2026q1-alphabet-earnings-release.pdf",
    sourceType: "official_actual",
    kind: "pdf",
    reportingPeriod: "Quarter ended March 31, 2026",
  },
  {
    id: "goog-q1-2026-transcript",
    title: "Alphabet Q1 2026 Earnings Call Transcript",
    url: "https://abc.xyz/investor/events/event-details/default.aspx",
    sourceType: "company_commentary",
    kind: "html",
    reportingPeriod: "Quarter ended March 31, 2026",
  },
  {
    id: "goog-q1-2026-10q",
    title: "Alphabet Q1 2026 Form 10-Q",
    url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000048/goog-20260331.htm",
    sourceType: "official_actual",
    kind: "html",
    reportingPeriod: "Quarter ended March 31, 2026",
  },
  {
    id: "goog-fy-2025-10k",
    title: "Alphabet FY2025 Form 10-K",
    url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm",
    sourceType: "official_actual",
    kind: "html",
    reportingPeriod: "Year ended December 31, 2025",
  },
  {
    id: "goog-q4-2025-release",
    title: "Alphabet Announces Fourth Quarter and Fiscal Year 2025 Results",
    url: "https://s206.q4cdn.com/479360582/files/doc_news/2026/Feb/04/attachments/2025q4-alphabet-earnings-release.pdf",
    sourceType: "official_actual",
    kind: "pdf",
    reportingPeriod: "Quarter and year ended December 31, 2025",
  },
  {
    id: "goog-q4-2025-transcript",
    title: "Alphabet Q4 2025 Earnings Call Transcript",
    url: "https://abc.xyz/investor/events/event-details/2026/2025-Q4-Earnings-Call-2026-Dr_C033hS6/default.aspx",
    sourceType: "company_commentary",
    kind: "html",
    reportingPeriod: "Quarter and year ended December 31, 2025",
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const metadata = [];

for (const target of targets) {
  const base = slugify(target.id);
  const binaryPath = path.join(OUTPUT_DIR, `${base}.${target.kind === "pdf" ? "pdf" : "html"}`);
  const textPath = path.join(OUTPUT_DIR, `${base}.txt`);
  const record = {
    ...target,
    downloadedAt: new Date().toISOString(),
    outputPath: binaryPath,
    textPath,
    blocked: false,
    skippedExisting: false,
    status: "pending",
  };

  if (await pathExists(binaryPath)) {
    record.skippedExisting = true;
    record.status = "exists";
    metadata.push(record);
    continue;
  }

  try {
    const response = await fetch(target.url, {
      headers: {
        "user-agent": "fundamental-analysis-research-bot/1.0 contact: local-research",
        accept: target.kind === "pdf" ? "application/pdf,text/html,*/*" : "text/html,*/*",
      },
    });
    record.httpStatus = response.status;
    record.contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const bodyPreview = buffer.subarray(0, 2048).toString("utf8");
    const looksBlocked = /captcha|access denied|verify you are human|unusual traffic|robot/i.test(bodyPreview);
    record.blocked = looksBlocked;
    await fs.writeFile(binaryPath, buffer);

    if (target.kind === "html" || record.contentType.includes("text/html")) {
      await fs.writeFile(textPath, textFromHtml(buffer.toString("utf8")));
    } else {
      await fs.writeFile(
        textPath,
        [
          `${target.title}`,
          `URL: ${target.url}`,
          "Binary PDF cached. Use official PDF or SEC HTML for structured extraction.",
          looksBlocked ? "Blocked/challenge content detected in preview." : "No bot/challenge marker detected in PDF preview.",
        ].join("\n"),
      );
    }
    record.status = looksBlocked ? "blocked_cached" : "downloaded";
  } catch (error) {
    record.status = "failed";
    record.blocked = true;
    record.error = error instanceof Error ? error.message : String(error);
  }

  metadata.push(record);
}

await fs.writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2));
console.log(`GOOG official fetch metadata written to ${METADATA_PATH}`);
