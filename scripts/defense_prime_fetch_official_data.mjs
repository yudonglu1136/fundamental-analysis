import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OFFICIAL_DOCS = {
  RTX: [
    {
      title: "RTX Reports 2025 Results and Announces 2026 Outlook",
      period: "FY2025",
      url: "https://www.rtx.com/news/news-center/2026/01/27/rtx-reports-2025-results-and-announces-2026-outlook",
      publisher: "RTX",
    },
    {
      title: "RTX Reports Q1 2026 Results",
      period: "Q1 2026",
      url: "https://www.rtx.com/news/news-center/2026/04/21/rtx-reports-q1-2026-results-",
      publisher: "RTX",
    },
    {
      title: "RTX quarterly results archive",
      period: "Archive",
      url: "https://investors.rtx.com/financial-information/quarterly-results",
      publisher: "RTX Investor Relations",
    },
  ],
  LMT: [
    {
      title: "Lockheed Martin Reports Fourth Quarter and Full Year 2025 Financial Results",
      period: "FY2025",
      url: "https://investors.lockheedmartin.com/news-releases/news-release-details/lockheed-martin-reports-fourth-quarter-and-full-year-2025/",
      publisher: "Lockheed Martin",
    },
    {
      title: "Lockheed Martin Reports First Quarter 2026 Financial Results",
      period: "Q1 2026",
      url: "https://investors.lockheedmartin.com/news-releases/news-release-details/lockheed-martin-reports-first-quarter-2026-financial-results",
      publisher: "Lockheed Martin",
    },
    {
      title: "Lockheed Martin investor relations news archive",
      period: "Archive",
      url: "https://investors.lockheedmartin.com/news-releases",
      publisher: "Lockheed Martin Investor Relations",
    },
  ],
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "fundamental-analysis-research-bot/1.0 (+local analyst workflow)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
      return { response, raw: await response.text(), error: null, warning: null };
  } catch (error) {
    const fetchError = error instanceof Error ? error.message : String(error);
    try {
      const { stdout } = await execFileAsync("curl", ["-L", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-A", "fundamental-analysis-research-bot/1.0", url], {
        maxBuffer: 25 * 1024 * 1024,
      });
      return { response: { status: "curl-fallback" }, raw: stdout, error: null, warning: `node-fetch failed: ${fetchError}; curl fallback succeeded` };
    } catch (curlError) {
      const fallbackError = curlError instanceof Error ? curlError.message : String(curlError);
      return { response: null, raw: "", error: `node-fetch failed: ${fetchError}; curl fallback failed: ${fallbackError}`, warning: null };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDefensePrimeOfficialData(ticker) {
  const docs = OFFICIAL_DOCS[ticker];
  if (!docs) throw new Error(`Unsupported defense-prime ticker: ${ticker}`);

  const outDir = path.join("data", "local", ticker.toLowerCase(), "official");
  await mkdir(outDir, { recursive: true });
  const downloadDate = new Date().toISOString();
  const metadata = [];
  let successCount = 0;
  let errorCount = 0;

  for (const doc of docs) {
    const { response, raw, error, warning } = await fetchWithTimeout(doc.url);
    const hash = createHash("sha256").update(error ? `${doc.url}:${error}` : raw).digest("hex").slice(0, 12);
    const baseName = `${slugify(doc.period)}_${slugify(doc.title)}_${hash}`;
    const htmlPath = path.join(outDir, `${baseName}.html`);
    const textPath = path.join(outDir, `${baseName}.txt`);
    const jsonPath = path.join(outDir, `${baseName}.json`);

    const extractedText = stripHtml(raw);
    if (!error && !(await exists(htmlPath))) await writeFile(htmlPath, raw);
    if (!error && !(await exists(textPath))) await writeFile(textPath, extractedText);
    if (error) errorCount += 1;
    else successCount += 1;
    if (!(await exists(jsonPath))) {
      await writeFile(
        jsonPath,
        JSON.stringify(
          {
            companyTicker: ticker,
            documentTitle: doc.title,
            reportingPeriod: doc.period,
            publisher: doc.publisher,
            sourceUrl: doc.url,
            downloadDate,
            status: response?.status ?? "ERROR",
            error,
            warning,
            contentHash: hash,
            extractedText,
          },
          null,
          2,
        ),
      );
    }

    metadata.push({
      companyTicker: ticker,
      documentTitle: doc.title,
      reportingPeriod: doc.period,
      publisher: doc.publisher,
      sourceUrl: doc.url,
      downloadDate,
      status: response?.status ?? "ERROR",
      error,
      warning,
      contentHash: hash,
      htmlPath,
      textPath,
      jsonPath,
    });
  }

  const metadataPath = path.join(outDir, "fetch_metadata.json");
  let previous = [];
  if (await exists(metadataPath)) {
    previous = JSON.parse(await readFile(metadataPath, "utf8"));
  }
  const known = new Set(previous.map((row) => `${row.sourceUrl}:${row.contentHash}`));
  const merged = [...previous, ...metadata.filter((row) => !known.has(`${row.sourceUrl}:${row.contentHash}`))];
  await writeFile(metadataPath, JSON.stringify(merged, null, 2));
  console.log(`${ticker}: cached ${successCount} official pages and recorded ${errorCount} fetch errors in ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await fetchDefensePrimeOfficialData(process.argv[2] ?? "RTX");
}
