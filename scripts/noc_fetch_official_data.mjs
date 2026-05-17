import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "data/local/noc/official");
const DOWNLOAD_DATE = new Date().toISOString();
const FORCE = process.argv.includes("--force");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-noc-module contact@example.com";
const FETCH_TIMEOUT_MS = Number(process.env.NOC_FETCH_TIMEOUT_MS ?? 10_000);

const officialSources = [
  {
    id: "noc_ir_quarterly_earnings",
    url: "https://investor.northropgrumman.com/financial-information/quarterly-earnings",
    title: "Northrop Grumman quarterly earnings archive",
    documentType: "ir_page",
    reportingPeriod: "Investor archive",
  },
  {
    id: "noc_2025_annual_report_pdf",
    url: "https://cdn.northropgrumman.com/-/media/Project/Northrop-Grumman/ngc/who-we-are/corporate-responsibility/2025-Annual-Report-Northrop-Grumman.pdf?rev=6725192060ff4fd79c041d38cc4b842b",
    title: "Northrop Grumman 2025 Annual Report PDF",
    documentType: "annual_report_pdf",
    reportingPeriod: "FY 2025",
  },
  {
    id: "noc_q1_2026_earnings_release",
    url: "https://investor.northropgrumman.com/static-files/50bb4c80-e273-4ed4-92bb-f1653b8b1156",
    title: "Northrop Grumman Q1 2026 earnings release",
    documentType: "earnings_release_pdf",
    reportingPeriod: "Q1 2026",
  },
  {
    id: "noc_sec_submissions",
    url: "https://data.sec.gov/submissions/CIK0001133421.json",
    title: "SEC submissions for Northrop Grumman",
    documentType: "sec_submissions_json",
    reportingPeriod: "multi-period",
  },
  {
    id: "noc_sec_companyfacts",
    url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001133421.json",
    title: "SEC companyfacts for Northrop Grumman",
    documentType: "sec_companyfacts_json",
    reportingPeriod: "multi-period",
  },
  {
    id: "noc_b21_production_press_release",
    url: "https://news.northropgrumman.com/b-21/northrop-grumman-accelerating-b-21-raider-production",
    title: "Northrop Grumman accelerating B-21 Raider production",
    documentType: "press_release",
    reportingPeriod: "2026",
  },
  {
    id: "usaf_b21_delivery_article",
    url: "https://www.af.mil/News/Article-Display/Article/4459893/b-21-raider-accelerates-delivery-of-long-range-strike-capability/",
    title: "U.S. Air Force B-21 Raider delivery article",
    documentType: "government_article",
    reportingPeriod: "2026",
  },
  {
    id: "noc_sentinel_momentum_press_release",
    url: "https://investor.northropgrumman.com/news-releases/news-release-details/northrop-grumman-and-us-air-force-accelerate-sentinel-program",
    title: "Northrop Grumman and U.S. Air Force accelerate Sentinel Program momentum",
    documentType: "press_release",
    reportingPeriod: "2026",
  },
  {
    id: "dod_sentinel_nunn_mccurdy",
    url: "https://www.defense.gov/News/Releases/Release/Article/3829985/department-of-defense-announces-results-of-sentinel-nunn-mccurdy-review/",
    title: "DoD Sentinel Nunn-McCurdy review",
    documentType: "government_article",
    reportingPeriod: "2024",
  },
  {
    id: "dod_contracts_northrop",
    url: "https://www.defense.gov/News/Contracts/Contract/Article/3219710/",
    title: "DoD contract announcement example for Northrop Grumman",
    documentType: "government_contract_announcement",
    reportingPeriod: "contract archive",
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function headersFor(source) {
  if (source.url.includes("sec.gov")) {
    return {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json,text/plain,*/*",
    };
  }
  return {
    "User-Agent": "Mozilla/5.0 fundamental-analysis-noc-official-fetcher",
    Accept: "text/html,application/pdf,application/json,*/*",
  };
}

function isBlocked(status, content) {
  return [401, 403, 429].includes(status) || /captcha|bot challenge|access denied|akamai|incapsula|pardon our interruption|request unsuccessful/i.test(content);
}

function extensionFor(url, contentType) {
  if (contentType.includes("json") || url.endsWith(".json")) return "json";
  if (contentType.includes("pdf") || /\.pdf($|\?)/i.test(url)) return "pdf";
  if (contentType.includes("text/plain")) return "txt";
  return "html";
}

async function writeIfNew(filePath, bytes) {
  try {
    await fs.access(filePath);
    if (!FORCE) return { path: filePath, written: false, skippedExisting: true };
  } catch {
    // Missing files are written below.
  }
  await fs.writeFile(filePath, bytes);
  return { path: filePath, written: true, skippedExisting: false };
}

async function fetchBuffer(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      headers: headersFor(source),
      redirect: "follow",
      signal: controller.signal,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? "unknown",
      bytes,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusText: null,
      contentType: "unknown",
      bytes: Buffer.alloc(0),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPdfText(pdfPath) {
  const textPath = `${pdfPath}.txt`;
  try {
    await execFileAsync("pdftotext", ["-layout", pdfPath, textPath], { timeout: 20_000 });
    const stat = await fs.stat(textPath);
    return { extractionStatus: "pdf_text_extracted_with_pdftotext", textPath, extractedBytes: stat.size, extractionError: null };
  } catch (error) {
    return {
      extractionStatus: "raw_pdf_cached_text_extraction_failed",
      textPath: null,
      extractedBytes: 0,
      extractionError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractDocumentLinks(baseUrl, html) {
  const links = new Map();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const label = stripHtml(match[2]) || match[1];
    const rawUrl = match[1];
    if (!/pdf|10-k|10-q|8-k|earnings|presentation|annual|quarter|transcript|static-files/i.test(`${label} ${rawUrl}`)) continue;
    try {
      const absoluteUrl = new URL(rawUrl, baseUrl).href;
      links.set(absoluteUrl, { title: label, url: absoluteUrl });
    } catch {
      // Ignore malformed links.
    }
  }
  return [...links.values()];
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const records = [];
const discoveredLinks = [];
for (const source of officialSources) {
  const response = await fetchBuffer(source);
  const preview = response.bytes.toString("utf8", 0, Math.min(response.bytes.length, 4_000));
  const blocked = response.status == null ? /blocked|forbidden|403|429|captcha|bot/i.test(response.error ?? "") : isBlocked(response.status, preview);
  const extension = extensionFor(source.url, response.contentType);
  const localPath = path.join(OUTPUT_DIR, `${source.id}.${extension}`);
  let writeResult = { path: localPath, written: false, skippedExisting: false };
  let extractionStatus = response.error ? "fetch_failed" : "raw_document_cached";
  let extractionError = response.error;
  let textPath = null;
  let extractedBytes = 0;

  if (response.bytes.length) {
    writeResult = await writeIfNew(localPath, response.bytes);
    if (blocked) {
      extractionStatus = "blocked_or_challenge_response_cached";
    } else if (extension === "pdf") {
      const pdfExtraction = await extractPdfText(localPath);
      extractionStatus = pdfExtraction.extractionStatus;
      extractionError = pdfExtraction.extractionError;
      textPath = pdfExtraction.textPath;
      extractedBytes = pdfExtraction.extractedBytes;
    } else if (extension === "html") {
      textPath = `${localPath}.txt`;
      await writeIfNew(textPath, Buffer.from(stripHtml(response.bytes.toString("utf8"))));
      extractionStatus = "html_text_extracted";
      try {
        discoveredLinks.push(...extractDocumentLinks(source.url, response.bytes.toString("utf8")).map((link) => ({ ...link, parentId: source.id })));
      } catch {
        // Link discovery is a convenience only.
      }
    } else if (extension === "json") {
      extractionStatus = "json_cached";
    }
  }

  records.push({
    id: source.id,
    sourceUrl: source.url,
    title: source.title,
    documentType: source.documentType,
    reportingPeriod: source.reportingPeriod,
    downloadDate: DOWNLOAD_DATE,
    statusCode: response.status,
    ok: response.ok,
    blocked,
    contentType: response.contentType,
    localPath: response.bytes.length ? path.relative(ROOT, localPath) : null,
    textPath: textPath ? path.relative(ROOT, textPath) : null,
    extractionStatus,
    extractionError,
    byteLength: response.bytes.length,
    written: writeResult.written,
    skippedExisting: writeResult.skippedExisting,
    extractedBytes,
  });
}

const metadata = {
  company: "Northrop Grumman Corporation",
  ticker: "NOC",
  downloadDate: DOWNLOAD_DATE,
  force: FORCE,
  outputDir: path.relative(ROOT, OUTPUT_DIR),
  records,
  discoveredLinks,
  sourceDiscipline:
    "Official-first fetch manifest. Raw cached files are not validated model inputs until parsed by noc_build_official_dataset.mjs and reviewed.",
  notes: [
    "The fetcher does not overwrite cached source files unless --force is provided.",
    "Blocked, challenge, partial and PDF extraction failures are explicit in metadata.",
    "Program press releases and government program pages are research-only unless separately mapped into forecast assumptions.",
  ],
};

await fs.writeFile(path.join(OUTPUT_DIR, "fetch_metadata.json"), JSON.stringify(metadata, null, 2));
console.log(`NOC official fetch complete: ${records.filter((record) => record.ok).length}/${records.length} sources fetched.`);
console.log(`Blocked sources: ${records.filter((record) => record.blocked).length}. Metadata saved to ${path.join(OUTPUT_DIR, "fetch_metadata.json")}`);
