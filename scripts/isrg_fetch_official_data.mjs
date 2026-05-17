import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = path.join(ROOT, "data/local/isrg");
const OFFICIAL_DIR = path.join(LOCAL_DIR, "official");
const SEC_DIR = path.join(LOCAL_DIR, "sec");
const REGULATORY_DIR = path.join(OFFICIAL_DIR, "regulatory");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-isrg-module contact@example.com";
const FETCH_TIMEOUT_MS = Number(process.env.ISRG_FETCH_TIMEOUT_MS ?? 4000);

const now = () => new Date().toISOString();

const officialSources = [
  {
    id: "q1_2026_earnings_release",
    url: "https://www.globenewswire.com/de/news-release/2026/04/21/3278489/7637/en/intuitive-announces-first-quarter-earnings.html",
    sourceType: "earnings_release",
    sourceStatus: "official_actual",
    reportingPeriod: "Q1 2026",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "q4_2025_earnings_release",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-fourth-quarter-earnings-5/",
    sourceType: "earnings_release",
    sourceStatus: "official_actual",
    reportingPeriod: "FY 2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "fy2025_preliminary_metrics",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-preliminary-fourth-quarter-and-full-year-5",
    sourceType: "official_ir",
    sourceStatus: "official_actual",
    reportingPeriod: "FY 2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "investor_overview",
    url: "https://investor.intuitivesurgical.com/",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "events_presentations",
    url: "https://investor.intuitivesurgical.com/events-and-presentations",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "press_releases",
    url: "https://investor.intuitivesurgical.com/press-releases",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "financials_filings",
    url: "https://investor.intuitivesurgical.com/sec-filings",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "sec_submissions",
    url: "https://data.sec.gov/submissions/CIK0001035267.json",
    sourceType: "sec_filing",
    sourceStatus: "official_actual",
    reportingPeriod: "multi-period",
    outputDir: SEC_DIR,
  },
  {
    id: "sec_companyfacts",
    url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001035267.json",
    sourceType: "sec_filing",
    sourceStatus: "official_actual",
    reportingPeriod: "multi-period",
    outputDir: SEC_DIR,
  },
  {
    id: "dv5_fda_clearance",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-fda-clearance-fifth-generation-robotic/",
    sourceType: "product_announcement",
    sourceStatus: "research_only",
    reportingPeriod: "2024",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "dv5_ce_mark",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitives-da-vinci-5-surgical-system-receives-ce-mark",
    sourceType: "product_announcement",
    sourceStatus: "research_only",
    reportingPeriod: "2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "dv5_cardiac_clearance",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/da-vinci-5-cleared-cardiac-procedures",
    sourceType: "product_announcement",
    sourceStatus: "research_only",
    reportingPeriod: "2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "dv5_real_time_insights",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-introduces-real-time-surgical-insights-da-vinci-5",
    sourceType: "product_announcement",
    sourceStatus: "research_only",
    reportingPeriod: "2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "sp_expanded_indications",
    url: "https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-expanded-indications-da-vinci-sp",
    sourceType: "product_announcement",
    sourceStatus: "research_only",
    reportingPeriod: "2025",
    outputDir: OFFICIAL_DIR,
  },
  {
    id: "fda_recalls_search",
    url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: REGULATORY_DIR,
  },
  {
    id: "fda_maude_search",
    url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfMAUDE/search.CFM",
    sourceType: "official_ir",
    sourceStatus: "research_only",
    reportingPeriod: "current",
    outputDir: REGULATORY_DIR,
  },
];

function fileNameFor(source, contentType = "") {
  if (contentType.includes("application/json") || source.url.endsWith(".json")) return `${source.id}.json`;
  if (contentType.includes("application/pdf") || source.url.endsWith(".pdf")) return `${source.id}.pdf`;
  return `${source.id}.html`;
}

function headersFor(source) {
  if (source.url.includes("sec.gov")) {
    return {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json,text/plain,*/*",
    };
  }
  return {
    "User-Agent": "fundamental-analysis-isrg-official-fetcher",
    Accept: "text/html,application/pdf,application/json,*/*",
  };
}

async function fetchSource(source) {
  const downloadedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, { headers: headersFor(source), redirect: "follow", signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    const blocked = [401, 403, 429].includes(response.status);
    if (!response.ok) {
      return {
        ...source,
        url: source.url,
        downloadDate: downloadedAt,
        status: "failed",
        statusCode: response.status,
        contentType,
        blocked,
        parsedSuccessfully: false,
        manuallySeeded: false,
        outputPath: null,
        bytes: 0,
        error: `${response.status} ${response.statusText}`,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(source.outputDir, { recursive: true });
    const outputPath = path.join(source.outputDir, fileNameFor(source, contentType));
    await fs.writeFile(outputPath, bytes);
    return {
      ...source,
      url: source.url,
      downloadDate: downloadedAt,
      status: "fetched",
      statusCode: response.status,
      contentType,
      blocked: false,
      parsedSuccessfully: contentType.includes("json") || contentType.includes("html") || contentType.includes("text"),
      manuallySeeded: false,
      outputPath: path.relative(ROOT, outputPath),
      bytes: bytes.length,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...source,
      url: source.url,
      downloadDate: downloadedAt,
      status: "failed",
      statusCode: null,
      contentType: null,
      blocked: /blocked|forbidden|403|429|captcha|bot/i.test(message),
      parsedSuccessfully: false,
      manuallySeeded: false,
      outputPath: null,
      bytes: 0,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    try {
      const url = new URL(match[1], baseUrl).toString();
      if (/intuitive|isrg|sec\.gov|annual|quarter|earnings|presentation|proxy|pdf|10-k|10-q|8-k/i.test(`${text} ${url}`)) {
        links.push({ text, url });
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return links;
}

await fs.mkdir(OFFICIAL_DIR, { recursive: true });
await fs.mkdir(SEC_DIR, { recursive: true });
await fs.mkdir(REGULATORY_DIR, { recursive: true });

const results = [];
for (const source of officialSources) {
  results.push(await fetchSource(source));
}

let discoveredLinks = [];
for (const result of results.filter((item) => item.status === "fetched" && item.outputPath?.endsWith(".html"))) {
  try {
    const html = await fs.readFile(path.join(ROOT, result.outputPath), "utf8");
    discoveredLinks = discoveredLinks.concat(extractLinks(html, result.url));
  } catch {
    // Raw artifact may not be text despite content-type.
  }
}

const sourceIndex = {
  ticker: "ISRG",
  createdAt: now(),
  sourceDiscipline:
    "Official-first fetch manifest. Fetched raw files are not equivalent to validated model inputs; blocked/failed/partial parsing is explicitly recorded.",
  dataLayerBoundary: {
    officialActual: "Earnings releases and SEC filings may feed actualData after parsing/validation.",
    managementGuidance: "Guidance can feed assumptions only through explicit mapping.",
    productAndRegulatory: "Product/FDA/MAUDE/recall artifacts are research-only until mapped to validated assumptions.",
    transcripts: "Transcripts remain research-only unless numeric disclosures are validated against official sources.",
  },
  sources: results,
  discoveredLinks,
};

await fs.writeFile(path.join(OFFICIAL_DIR, "official_source_index.json"), JSON.stringify(sourceIndex, null, 2));
console.log(`ISRG official fetch complete: ${results.filter((item) => item.status === "fetched").length}/${results.length} sources fetched.`);
console.log(`Blocked sources: ${results.filter((item) => item.blocked).length}. Failed sources: ${results.filter((item) => item.status === "failed").length}.`);
console.log(`Discovered ${discoveredLinks.length} official/event links.`);
