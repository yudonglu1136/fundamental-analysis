import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = path.join(ROOT, "data/local/ba/official");
const DOWNLOAD_DATE = new Date().toISOString();

const officialPages = [
  {
    url: "https://www.baesystems.com/en/article/2024-half-year-results",
    title: "BAE Systems 2024 half year results",
    reportingPeriod: "Six months ended 30 June 2024",
  },
  {
    url: "https://www.baesystems.com/en/article/annual-general-meeting-and-market-update-may-2024",
    title: "BAE Systems AGM market update May 2024",
    reportingPeriod: "FY2024 trading update",
  },
  {
    url: "https://www.baesystems.com/en-uk/article/market-update-nov-2024",
    title: "BAE Systems market update November 2024",
    reportingPeriod: "FY2024 trading update",
  },
  {
    url: "https://www.baesystems.com/en-us/article/2024-full-year-results",
    title: "BAE Systems 2024 full year results",
    reportingPeriod: "Year ended 31 December 2024",
  },
  {
    url: "https://www.baesystems.com/en-uk/article/annual-general-meeting-and-market-update-may-2025",
    title: "BAE Systems AGM market update May 2025",
    reportingPeriod: "FY2025 trading update",
  },
  {
    url: "https://www.baesystems.com/annualreport/2025",
    title: "BAE Systems Annual Report 2025",
    reportingPeriod: "Year ended 31 December 2025",
    knownDocuments: [
      {
        title: "BAE Systems Annual Report 2025 PDF",
        url: "https://investors.baesystems.com/dam/jcr%3A105fe9f2-cff7-4960-9d99-956aba996540/BAE-Systems-Annual-Report-2025.2026-03-24-10-33-48.pdf",
      },
    ],
  },
  {
    url: "https://www.baesystems.com/en-uk/article/2025-full-year-results",
    title: "BAE Systems 2025 full year results",
    reportingPeriod: "Year ended 31 December 2025",
  },
  {
    url: "https://www.baesystems.com/en/article/2025-half-year-results",
    title: "BAE Systems 2025 half year results",
    reportingPeriod: "Six months ended 30 June 2025",
  },
  {
    url: "https://www.baesystems.com/en-us/article/market-update-nov-2025",
    title: "BAE Systems market update November 2025",
    reportingPeriod: "FY2025 trading update",
  },
  {
    url: "https://www.globenewswire.com/news-release/2026/05/07/3289615/1953/en/BAE-Systems-Trading-update.html",
    title: "BAE Systems trading update May 2026",
    reportingPeriod: "FY2026 trading update",
  },
  {
    url: "https://investors.baesystems.com/results-centre",
    title: "BAE Systems results centre",
    reportingPeriod: "Investor archive",
    knownDocuments: [
      {
        title: "BAE Systems November 2025 market update PDF",
        url: "https://investors.baesystems.com/dam/jcr%3A38e3ed22-5e3b-4988-bb54-02f2cd4e4495/bae-systems-trading-statement-nov-2025.2025-11-12-07-09-26.pdf",
      },
    ],
  },
  {
    url: "https://investors.baesystems.com/share-price-monitor",
    title: "BAE Systems share price monitor",
    reportingPeriod: "Market data snapshot",
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

function extractDocumentLinks(baseUrl, html) {
  const links = new Map();
  const hrefPattern = /href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = hrefPattern.exec(html))) {
    const href = match[1];
    const label = stripHtml(match[2]) || href;
    if (!/\.pdf($|\?)|\/dam\/jcr/i.test(href)) continue;
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      links.set(absoluteUrl, { url: absoluteUrl, title: label });
    } catch {
      // Ignore malformed links from page chrome.
    }
  }
  return [...links.values()];
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 BA.L research module data fetcher",
      accept: "text/html,application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const arrayBuffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "unknown",
    buffer: Buffer.from(arrayBuffer),
  };
}

async function writeIfNew(filePath, bytes) {
  try {
    await fs.access(filePath);
    return { path: filePath, written: false };
  } catch {
    await fs.writeFile(filePath, bytes);
    return { path: filePath, written: true };
  }
}

async function fetchPage(page) {
  const response = await fetchBuffer(page.url);
  const html = response.buffer.toString("utf8");
  const blocked = /Pardon Our Interruption|Request unsuccessful|Incapsula/i.test(html);
  const pageSlug = slugify(page.title);
  const htmlPath = path.join(OUTPUT_DIR, `${pageSlug}.html`);
  const textPath = path.join(OUTPUT_DIR, `${pageSlug}.txt`);
  await writeIfNew(htmlPath, response.buffer);
  await writeIfNew(textPath, stripHtml(html));
  const extractedLinks = response.contentType.includes("html") && !blocked ? extractDocumentLinks(page.url, html) : [];
  const links = [...new Map([...(page.knownDocuments ?? []), ...extractedLinks].map((link) => [link.url, link])).values()];
  return {
    ...page,
    sourceUrl: page.url,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    htmlPath,
    textPath,
    blocked,
    extractedTextLength: stripHtml(html).length,
    documentLinks: links,
  };
}

async function fetchDocument(doc, parent) {
  const response = await fetchBuffer(doc.url);
  const preview = response.buffer.toString("utf8", 0, Math.min(response.buffer.length, 2_000));
  const blocked = /Pardon Our Interruption|Request unsuccessful|Incapsula/i.test(preview);
  const extension = !blocked && (response.contentType.includes("pdf") || /\.pdf($|\?)/i.test(doc.url))
    ? "pdf"
    : response.contentType.includes("html")
      ? "html"
      : "bin";
  const filePath = path.join(OUTPUT_DIR, `${slugify(parent.title)}__${slugify(doc.title)}.${extension}`);
  const writeResult = await writeIfNew(filePath, response.buffer);
  const extractedTextPath = `${filePath}.txt`;
  let extractionStatus = "raw_document_cached";
  if (blocked) {
    extractionStatus = "blocked_or_challenge_response_cached";
  } else if (extension === "pdf") {
    extractionStatus = "raw_pdf_cached_text_extraction_requires_pdf_parser";
  } else {
    await writeIfNew(extractedTextPath, stripHtml(response.buffer.toString("utf8")));
    extractionStatus = "html_or_binary_cached_with_text_attempt";
  }
  return {
    title: doc.title,
    sourceUrl: doc.url,
    parentUrl: parent.url,
    reportingPeriod: parent.reportingPeriod,
    downloadDate: DOWNLOAD_DATE,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    filePath,
    written: writeResult.written,
    byteLength: response.buffer.length,
    blocked,
    extractionStatus,
  };
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const pages = [];
const documents = [];
for (const page of officialPages) {
  const pageRecord = await fetchPage(page);
  pages.push(pageRecord);
  for (const doc of pageRecord.documentLinks) {
    documents.push(await fetchDocument(doc, page));
  }
}

const metadata = {
  company: "BAE Systems plc",
  ticker: "BA.L",
  downloadDate: DOWNLOAD_DATE,
  outputDir: OUTPUT_DIR,
  pages,
  documents,
  notes: [
    "This script caches official pages and linked documents without overwriting existing files.",
    "If BAE's web application firewall blocks direct PDF retrieval, the challenge response is retained and flagged in metadata.",
    "PDF table parsing is intentionally not guessed. Use ba_build_official_dataset.mjs for curated structured fields with source references.",
  ],
};

await fs.writeFile(path.join(OUTPUT_DIR, "fetch_metadata.json"), JSON.stringify(metadata, null, 2));
console.log(`BA.L official fetch complete: ${pages.length} pages, ${documents.length} linked documents. Metadata saved to ${path.join(OUTPUT_DIR, "fetch_metadata.json")}`);
