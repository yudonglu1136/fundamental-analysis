import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "data/local/mck/official");
const rawDir = path.join(outDir, "raw");
const processedDir = path.join(root, "data/local/mck/processed");

const sources = [
  {
    id: "mck-fy2026-q4-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2026/mckesson-reports-fiscal-2026-fourth-quarter-and-full-year-results/",
  },
  {
    id: "mck-fy2026-q3-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2026/mckesson-corporation-reports-fiscal-2026-third-quarter-results/",
  },
  {
    id: "mck-fy2026-q2-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2025/mckesson-corporation-reports-fiscal-2026-second-quarter-results-and-raises-full-year-adjusted-eps-guidance/",
  },
  {
    id: "mck-fy2026-q1-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2025/mckesson-corporation-reports-fiscal-2026-first-quarter-results/",
  },
  {
    id: "mck-fy2025-q4-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2025/mckesson-reports-fiscal-2025-fourth-quarter-and-full-year-results/",
  },
  {
    id: "mck-fy2025-q3-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-mckesson/newsroom/press-releases/2025/mckesson-corporation-reports-fiscal-2025-third-quarter-results/",
  },
  {
    id: "mck-fy2025-q2-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2024/mckesson-corporation-reports-fiscal-2025-second-quarter-results/",
  },
  {
    id: "mck-fy2025-q1-release",
    type: "earnings_release",
    url: "https://www.mckesson.com/about-us/newsroom/press-releases/2024/mckesson-corporation-reports-fiscal-2025-first-quarter-results/",
  },
  {
    id: "mck-sec-submissions",
    type: "sec_submissions",
    url: "https://data.sec.gov/submissions/CIK0000927653.json",
  },
  {
    id: "mck-sec-companyfacts",
    type: "sec_companyfacts",
    url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000927653.json",
  },
];

async function fetchText(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "fundamental-analysis-mck-research/0.1 contact: local",
      Accept: source.type.startsWith("sec") ? "application/json,text/plain,*/*" : "text/html,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${source.id} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function extractNumbers(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const collapsed = text.replace(/\s+/g, " ");
  return {
    hasFiscal2026Revenue: /\$403\.4 billion/i.test(collapsed),
    hasFiscal2026AdjustedEps: /\$39\.11/i.test(collapsed),
    hasFiscal2027EpsGuide: /\$43\.80.*\$44\.60|\$43\.80 to \$44\.60/i.test(collapsed),
    excerpt: collapsed.slice(0, 5000),
  };
}

async function main() {
  await mkdir(rawDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
  const manifest = [];
  const processed = [];
  for (const source of sources) {
    try {
      const text = await fetchText(source);
      const extension = source.type.startsWith("sec") ? "json" : "html";
      const rawPath = path.join(rawDir, `${source.id}.${extension}`);
      await writeFile(rawPath, text);
      manifest.push({ ...source, rawPath, fetchedAt: new Date().toISOString(), ok: true });
      if (source.type === "earnings_release") {
        processed.push({ id: source.id, url: source.url, ...extractNumbers(text) });
      }
    } catch (error) {
      manifest.push({ ...source, fetchedAt: new Date().toISOString(), ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await writeFile(path.join(outDir, "official_source_index.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(processedDir, "official_release_checks.json"), JSON.stringify(processed, null, 2));
  const failures = manifest.filter((item) => !item.ok);
  if (failures.length > 0) {
    console.error(`MCK official fetch completed with ${failures.length} failure(s). See data/local/mck/official/official_source_index.json.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Fetched ${manifest.length} official MCK sources into data/local/mck/official.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
