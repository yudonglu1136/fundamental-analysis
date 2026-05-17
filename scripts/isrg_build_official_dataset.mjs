import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = path.join(ROOT, "data/local/isrg");
const OFFICIAL_DIR = path.join(LOCAL_DIR, "official");
const EXTRACTED_DIR = path.join(LOCAL_DIR, "extracted");
const VALIDATION_DIR = path.join(LOCAL_DIR, "validation");

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const sourceIndex = await readJson(path.join(OFFICIAL_DIR, "official_source_index.json"), {
  ticker: "ISRG",
  createdAt: null,
  sources: [],
  discoveredLinks: [],
  missing: true,
});

const officialDatasetSnapshot = {
  ticker: "ISRG",
  builtAt: new Date().toISOString(),
  buildDiscipline:
    "This artifact records the official-first dataset contract and local source cache status. It does not pretend that every metric was automatically parsed.",
  layerContract: {
    actualData: {
      allowedSourceStatus: ["official_actual", "derived"],
      valuationAllowed: true,
      notes: "Financial, procedure, installed-base, placement, and margin actuals must reconcile to official releases or SEC filings.",
    },
    officialGuidance: {
      allowedSourceStatus: ["management_guidance"],
      valuationAllowed: true,
      notes: "Guidance is mapped to forecast assumptions; it does not overwrite actuals.",
    },
    forecastAnchors: {
      allowedSourceStatus: ["forecast_assumption"],
      valuationAllowed: true,
      notes: "Manual underwriting assumptions require rationale, last-reviewed date, and sensitivity impact in assumptions.ts.",
    },
    transcripts: {
      allowedSourceStatus: ["research_only"],
      valuationAllowed: false,
      notes: "Transcript claims remain research-only unless numeric disclosures are validated against official sources.",
    },
    marketData: {
      allowedSourceStatus: ["market_data"],
      valuationAllowed: false,
      notes: "Market price and multiples are reverse-valuation/sanity-check inputs only.",
    },
    regulatorySafety: {
      allowedSourceStatus: ["research_only"],
      valuationAllowed: false,
      notes: "FDA/MAUDE/recall items require analyst validation before becoming model assumptions.",
    },
  },
  sourceCache: {
    sourceIndexCreatedAt: sourceIndex.createdAt,
    fetched: sourceIndex.sources.filter((source) => source.status === "fetched").length,
    failed: sourceIndex.sources.filter((source) => source.status === "failed").length,
    blocked: sourceIndex.sources.filter((source) => source.blocked).length,
    sources: sourceIndex.sources.map((source) => ({
      id: source.id,
      url: source.url,
      sourceType: source.sourceType,
      sourceStatus: source.sourceStatus,
      reportingPeriod: source.reportingPeriod,
      downloadDate: source.downloadDate,
      blocked: Boolean(source.blocked),
      parsedSuccessfully: Boolean(source.parsedSuccessfully),
      manuallySeeded: Boolean(source.manuallySeeded),
      outputPath: source.outputPath,
      error: source.error ?? null,
    })),
  },
  manualSeedPolicy:
    "The TypeScript seed dataset may include manually entered official numbers only when source URL, period, confidence, usedInValuation, and researchOnly flags are populated.",
  outputFiles: [
    "src/stocks/isrg/data/officialDataset.ts",
    "data/local/isrg/extracted/official_dataset_snapshot.json",
    "data/local/isrg/validation/official_dataset_manifest.json",
  ],
};

await fs.mkdir(EXTRACTED_DIR, { recursive: true });
await fs.mkdir(VALIDATION_DIR, { recursive: true });
await fs.writeFile(path.join(EXTRACTED_DIR, "official_dataset_snapshot.json"), JSON.stringify(officialDatasetSnapshot, null, 2));
await fs.writeFile(
  path.join(VALIDATION_DIR, "official_dataset_manifest.json"),
  JSON.stringify(
    {
      ticker: "ISRG",
      builtAt: officialDatasetSnapshot.builtAt,
      sourceCount: officialDatasetSnapshot.sourceCache.sources.length,
      blockedCount: officialDatasetSnapshot.sourceCache.blocked,
      failedCount: officialDatasetSnapshot.sourceCache.failed,
      validationRule: "Run npm run validate:isrg after updating TypeScript actuals/assumptions.",
    },
    null,
    2,
  ),
);

console.log("ISRG official dataset snapshot built.");
console.log(`Sources tracked: ${officialDatasetSnapshot.sourceCache.sources.length}. Blocked: ${officialDatasetSnapshot.sourceCache.blocked}. Failed: ${officialDatasetSnapshot.sourceCache.failed}.`);

