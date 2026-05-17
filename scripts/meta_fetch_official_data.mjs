import fs from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OFFICIAL_DIR = path.join(ROOT, "data/local/meta/official");
const SEC_DIR = path.join(ROOT, "data/local/meta/sec");
const ATTEMPTED_AT = new Date().toISOString();

const officialPages = [
  {
    url: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/",
    title: "Meta Reports First Quarter 2026 Results",
    reportingPeriod: "Q1 2026",
    outputDir: OFFICIAL_DIR,
  },
  {
    url: "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/",
    title: "Meta Reports Fourth Quarter and Full Year 2025 Results",
    reportingPeriod: "FY 2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    url: "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000041/meta-20260331.htm",
    title: "Meta Platforms Q1 2026 Form 10-Q",
    reportingPeriod: "Quarter ended March 31, 2026",
    outputDir: SEC_DIR,
  },
  {
    url: "https://www.sec.gov/Archives/edgar/data/1326801/000132680126000011/meta-20251231.htm",
    title: "Meta Platforms 2025 Form 10-K",
    reportingPeriod: "Year ended December 31, 2025",
    outputDir: SEC_DIR,
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

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 META research module official data fetcher",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

async function fetchPage(page) {
  await fs.mkdir(page.outputDir, { recursive: true });
  const slug = slugify(page.title);
  const htmlPath = path.join(page.outputDir, `${slug}.html`);
  const textPath = path.join(page.outputDir, `${slug}.txt`);
  try {
    const response = await fetchBuffer(page.url);
    const text = response.buffer.toString("utf8");
    const blocked = /captcha|bot|blocked|access denied|akamai|pardon our interruption/i.test(text);
    await fs.writeFile(htmlPath, response.buffer);
    await fs.writeFile(textPath, stripHtml(text));
    return {
      title: page.title,
      source_url: page.url,
      reportingPeriod: page.reportingPeriod,
      attempted_at: ATTEMPTED_AT,
      ok: response.ok,
      status: response.status,
      contentType: response.contentType,
      filePath: htmlPath,
      textPath,
      blocked,
      reason: blocked ? "challenge_or_blocked_response_cached" : undefined,
      fallback_used: false,
      extractedTextLength: stripHtml(text).length,
    };
  } catch (error) {
    return {
      title: page.title,
      source_url: page.url,
      reportingPeriod: page.reportingPeriod,
      attempted_at: ATTEMPTED_AT,
      ok: false,
      blocked: true,
      reason: error instanceof Error ? error.message : String(error),
      fallback_used: true,
      fallback_note: "Use scripts/meta_build_official_dataset.mjs curated seed until network fetch succeeds.",
    };
  }
}

const pages = [];
for (const page of officialPages) {
  pages.push(await fetchPage(page));
}

const metadata = {
  company: "Meta Platforms, Inc.",
  ticker: "META",
  attempted_at: ATTEMPTED_AT,
  pages,
  notes: [
    "This fetch script caches official Meta IR and SEC pages without parsing tables heuristically.",
    "If a site blocks automation, the metadata records blocked=true with reason and fallback_used=true.",
    "Run meta_build_official_dataset.mjs for curated structured fields with source references.",
  ],
};

await fs.mkdir(OFFICIAL_DIR, { recursive: true });
await fs.mkdir(SEC_DIR, { recursive: true });
await fs.writeFile(path.join(OFFICIAL_DIR, "fetch_metadata.json"), JSON.stringify(metadata, null, 2));
console.log(`META official fetch complete: ${pages.length} pages attempted. Metadata saved to ${path.join(OFFICIAL_DIR, "fetch_metadata.json")}`);
