import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data/local/pltr/official");
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? "fundamental-analysis-pltr-module contact@example.com";

const officialSources = [
  { id: "events", url: "https://investors.palantir.com/events.html", type: "official_ir" },
  { id: "reports_2024", url: "https://investors.palantir.com/reports-2024.html", type: "official_ir" },
  { id: "reports_2021", url: "https://investors.palantir.com/reports-2021.html", type: "official_ir" },
  { id: "sec_submissions", url: "https://data.sec.gov/submissions/CIK0001321655.json", type: "sec_filing" },
  { id: "sec_companyfacts", url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0001321655.json", type: "sec_filing" },
  { id: "platform_overview", url: "https://www.palantir.com/docs/foundry/platform-overview/overview", type: "product" },
  { id: "aip_overview", url: "https://www.palantir.com/docs/foundry/aip/overview", type: "product" },
  { id: "ontology_overview", url: "https://www.palantir.com/docs/foundry/ontology/overview", type: "product" },
  { id: "architecture_platforms", url: "https://www.palantir.com/docs/foundry/architecture-center/platforms", type: "product" },
  { id: "apollo_intro", url: "https://www.palantir.com/docs/apollo/core/introduction/", type: "product" },
];

function fileNameFor(source, contentType = "") {
  if (contentType.includes("application/json") || source.url.endsWith(".json")) return `${source.id}.json`;
  if (contentType.includes("application/pdf") || source.url.endsWith(".pdf")) return `${source.id}.pdf`;
  return `${source.id}.html`;
}

async function fetchSource(source) {
  const headers = {
    "User-Agent": source.url.includes("sec.gov") ? SEC_USER_AGENT : "fundamental-analysis-pltr-module",
    Accept: source.url.includes("sec.gov") ? "application/json,text/plain,*/*" : "text/html,application/pdf,application/json,*/*",
  };
  const response = await fetch(source.url, { headers });
  if (!response.ok) throw new Error(`${source.url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const outPath = path.join(OUT_DIR, fileNameFor(source, contentType));
  await fs.writeFile(outPath, bytes);
  return {
    ...source,
    status: "fetched",
    fetchedAt: new Date().toISOString(),
    contentType,
    outputPath: path.relative(ROOT, outPath),
    bytes: bytes.length,
  };
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    try {
      const url = new URL(href, baseUrl).toString();
      if (/palantir|d18rn0p25nwr6d|sec\.gov|youtube|on24|q4cdn|businesswire|prnewswire/i.test(url)) {
        links.push({ text, url });
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return links;
}

await fs.mkdir(OUT_DIR, { recursive: true });

const results = [];
for (const source of officialSources) {
  try {
    results.push(await fetchSource(source));
  } catch (error) {
    results.push({
      ...source,
      status: "failed",
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const eventFile = path.join(OUT_DIR, "events.html");
let discoveredLinks = [];
try {
  const eventsHtml = await fs.readFile(eventFile, "utf8");
  discoveredLinks = extractLinks(eventsHtml, "https://investors.palantir.com/events.html");
} catch {
  discoveredLinks = [];
}

const sourceIndex = {
  ticker: "PLTR",
  createdAt: new Date().toISOString(),
  sourceDiscipline:
    "Official sources are fetched as source artifacts. Metric extraction is handled by scripts/pltr_build_metric_database.mjs; transcript text is handled separately by manifest-driven transcript scripts.",
  sources: results,
  discoveredLinks,
};

await fs.writeFile(path.join(OUT_DIR, "official_source_index.json"), JSON.stringify(sourceIndex, null, 2));
console.log(`PLTR official fetch complete: ${results.filter((item) => item.status === "fetched").length}/${results.length} sources fetched.`);
console.log(`Discovered ${discoveredLinks.length} official/event links.`);
