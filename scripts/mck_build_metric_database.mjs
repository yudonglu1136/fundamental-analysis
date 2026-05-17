import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const processedDir = path.join(root, "data/local/mck/processed");

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  await mkdir(processedDir, { recursive: true });
  const officialChecks = await readJson(path.join(processedDir, "official_release_checks.json"), []);
  const metricDatabase = {
    generatedAt: new Date().toISOString(),
    ticker: "MCK",
    sourceDiscipline: {
      actualReportedData: "Official McKesson earnings releases and SEC files when available.",
      marketData: "Market snapshots are unofficial and must not overwrite official fundamentals.",
      transcriptData: "Transcript-derived fields are research-only.",
    },
    actuals: [
      { periodId: "fy2026", metric: "revenue", value: 403400, unit: "USD millions", source: "McKesson FY2026 Q4/full-year earnings release" },
      { periodId: "fy2026", metric: "adjustedDilutedEps", value: 39.11, unit: "USD/share", source: "McKesson FY2026 Q4/full-year earnings release" },
      { periodId: "fy2026", metric: "freeCashFlow", value: 5400, unit: "USD millions", source: "McKesson FY2026 Q4/full-year earnings release" },
      { periodId: "fy2026", metric: "shareRepurchases", value: 4800, unit: "USD millions", source: "McKesson FY2026 Q4/full-year earnings release" },
      { periodId: "fy2026", metric: "remainingRepurchaseAuthorization", value: 7700, unit: "USD millions", source: "McKesson FY2026 Q4/full-year earnings release" },
    ],
    guidance: [
      { fiscalYear: 2027, metric: "adjustedDilutedEps", low: 43.8, high: 44.6, midpoint: 44.2, source: "McKesson FY2026 Q4/full-year earnings release" },
      { fiscalYear: 2027, metric: "longTermAdjustedEpsGrowth", low: 0.13, high: 0.16, midpoint: 0.145, source: "McKesson FY2026 Q4/full-year earnings release" },
    ],
    officialReleaseChecks: officialChecks,
    sourceGaps: [
      "Diluted weighted-average shares should be refreshed from FY2026 10-K.",
      "Net debt should be refreshed from FY2026 10-K balance sheet.",
      "Peer metrics should be refreshed from COR/CAH filings and market data.",
      "Full earnings call Q&A should be loaded from local transcript text.",
    ],
  };
  await writeFile(path.join(processedDir, "metric_database.json"), JSON.stringify(metricDatabase, null, 2));
  console.log("Built data/local/mck/processed/metric_database.json.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
