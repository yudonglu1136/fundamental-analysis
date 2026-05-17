import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

export async function buildDefensePrimeOfficialDataset(ticker) {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "silent",
  });

  try {
    const registryModule = await server.ssrLoadModule("/src/stocks/registry.ts");
    const module = registryModule.stockRegistry[ticker];
    if (!module) throw new Error(`${ticker} is not registered in src/stocks/registry.ts.`);
    const data = module.data;
    const outDir = path.join("data", "local", ticker.toLowerCase());
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${ticker.toLowerCase()}_official_dataset.json`);
    await writeFile(
      outPath,
      JSON.stringify(
        {
          company: data.company,
          ticker: data.ticker,
          currency: data.currency,
          latestReportingPeriod: data.latestReportingPeriod,
          financials: data.periods,
          segments: data.segments,
          backlog: data.periods.map((period) => ({
            period: period.label,
            backlog: period.backlog,
            backlogDefense: period.backlogDefense ?? null,
            backlogCommercial: period.backlogCommercial ?? null,
            sourceId: period.sourceId,
          })),
          orderIntake: data.periods.map((period) => ({
            period: period.label,
            orderIntake: period.orderIntake ?? null,
            sourceStatus: period.orderIntakeSourceStatus ?? "missing",
          })),
          guidance: data.guidance,
          programs: data.programs,
          capitalReturns: data.capitalReturns,
          marketData: data.marketData,
          reportingEvents: data.reportingEvents,
          sources: data.sources,
          dataGaps: data.dataGaps,
        },
        null,
        2,
      ),
    );
    console.log(`${ticker}: wrote structured dataset to ${outPath}`);
  } finally {
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildDefensePrimeOfficialDataset(process.argv[2] ?? "RTX");
}
