import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = path.join(ROOT, "data/local/lseg/official");
const DOWNLOAD_DATE = new Date().toISOString();

const officialPages = [
  {
    url: "https://www.lseg.com/en/investor-relations/annual-reports/2025",
    title: "LSEG Annual Report 2025",
    reportingPeriod: "Year ended 31 December 2025",
    sourceType: "official_actual",
    knownDocuments: [
      {
        title: "LSEG Annual Report 2025 PDF",
        url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/annual-reports/lseg-annual-report-2025.pdf",
      },
    ],
  },
  {
    url: "https://www.lseg.com/en/investor-relations/financial-results/2025-preliminary-results",
    title: "LSEG 2025 Preliminary Results",
    reportingPeriod: "Year ended 31 December 2025",
    sourceType: "official_actual",
    knownDocuments: [
      {
        title: "LSEG 2025 Preliminary Results RNS",
        url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/rns/lseg-2025-preliminary-results-rns-26feb2026.pdf",
      },
      {
        title: "LSEG 2025 Preliminary Results Transcript",
        url: "https://www.lseg.com/content/dam/lseg/en_us/documents/investor-relations/financial-results/preliminary-results/transcripts/lseg-2025-preliminary-results-transcript-26feb2026.pdf",
        sourceType: "transcript",
      },
    ],
  },
  {
    url: "https://www.lseg.com/en/investor-relations/financial-results",
    title: "LSEG Financial Results Centre",
    reportingPeriod: "Investor archive",
    sourceType: "presentation",
  },
  {
    url: "https://www.lseg.com/en/investor-relations",
    title: "LSEG Investor Relations",
    reportingPeriod: "Investor relations landing page",
    sourceType: "presentation",
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90);
}

function hashUrl(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
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
    if (!/\.pdf($|\?)|\.zip($|\?)|\.xhtml($|\?)|\/content\/dam\//i.test(href)) continue;
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      links.set(absoluteUrl, { url: absoluteUrl, title: label });
    } catch {
      // Ignore malformed page chrome links.
    }
  }
  return [...links.values()];
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 LSEG buy-side cockpit official-data fetcher",
      accept: "text/html,application/pdf,application/xhtml+xml,application/zip,application/xml;q=0.9,*/*;q=0.8",
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
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
    return { path: filePath, written: true };
  }
}

function detectBlocked(buffer) {
  const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 4000));
  return /Pardon Our Interruption|Request unsuccessful|Incapsula|Access Denied|captcha|Akamai/i.test(preview);
}

async function fetchPage(page) {
  const response = await fetchBuffer(page.url);
  const blocked = detectBlocked(response.buffer);
  const html = response.buffer.toString("utf8");
  const pageSlug = slugify(page.title);
  const htmlPath = path.join(OUTPUT_DIR, `${pageSlug}.html`);
  const textPath = path.join(OUTPUT_DIR, `${pageSlug}.txt`);
  await writeIfNew(htmlPath, response.buffer);
  await writeIfNew(textPath, stripHtml(html));
  const links = blocked || !response.contentType.includes("html")
    ? page.knownDocuments ?? []
    : [...new Map([...(page.knownDocuments ?? []), ...extractDocumentLinks(page.url, html)].map((link) => [link.url, link])).values()];
  return {
    ...page,
    sourceUrl: page.url,
    downloadDate: DOWNLOAD_DATE,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    localHtmlPath: htmlPath,
    localTextPath: textPath,
    source_type: page.sourceType,
    blocked,
    parseStatus: blocked ? "blocked" : "parsed_html_text",
    extractedTextLength: stripHtml(html).length,
    documentLinks: links,
  };
}

async function fetchDocument(doc, parent) {
  const response = await fetchBuffer(doc.url);
  const blocked = detectBlocked(response.buffer);
  const lower = doc.url.toLowerCase();
  const extension = lower.includes(".pdf") || response.contentType.includes("pdf")
    ? "pdf"
    : lower.includes(".zip") || response.contentType.includes("zip")
      ? "zip"
      : lower.includes(".xhtml") || response.contentType.includes("xhtml")
        ? "xhtml"
        : "bin";
  const filePath = path.join(OUTPUT_DIR, `${slugify(parent.title)}__${slugify(doc.title)}__${hashUrl(doc.url)}.${extension}`);
  const writeResult = await writeIfNew(filePath, response.buffer);
  let textPath = null;
  let parseStatus = "raw_document_cached";
  if (blocked) {
    parseStatus = "blocked";
  } else if (extension === "xhtml" || response.contentType.includes("html")) {
    textPath = `${filePath}.txt`;
    await writeIfNew(textPath, stripHtml(response.buffer.toString("utf8")));
    parseStatus = "parsed_html_text";
  } else if (extension === "pdf") {
    parseStatus = "raw_pdf_cached_text_extraction_requires_pdf_parser";
  }
  return {
    title: doc.title,
    sourceUrl: doc.url,
    parentUrl: parent.url,
    reportingPeriod: parent.reportingPeriod,
    downloadDate: DOWNLOAD_DATE,
    source_type: doc.sourceType ?? parent.sourceType,
    status: response.status,
    ok: response.ok,
    contentType: response.contentType,
    localPath: filePath,
    localTextPath: textPath,
    written: writeResult.written,
    byteLength: response.buffer.length,
    blocked,
    parseStatus,
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
  company: "London Stock Exchange Group plc",
  ticker: "LSEG.L",
  downloadDate: DOWNLOAD_DATE,
  outputDir: OUTPUT_DIR,
  pages,
  documents,
  notes: [
    "Caches official pages and linked documents without overwriting existing cached files.",
    "Metadata records source URL, download date, reporting period and source_type.",
    "PDF table values are not automatically promoted to official actuals; curated fields live in lseg_build_official_dataset.mjs and src/stocks/lseg/data.",
    "Blocked or parse-failed responses are explicitly flagged.",
  ],
};

await fs.writeFile(path.join(OUTPUT_DIR, "fetch_metadata.json"), JSON.stringify(metadata, null, 2));
console.log(`LSEG official fetch complete: ${pages.length} pages, ${documents.length} documents. Metadata saved to ${path.join(OUTPUT_DIR, "fetch_metadata.json")}`);
