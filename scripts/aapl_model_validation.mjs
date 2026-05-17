#!/usr/bin/env node
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
try {
  const calculations = await server.ssrLoadModule("/src/stocks/aapl/calculations.ts");
  const dataModule = await server.ssrLoadModule("/src/stocks/aapl/data.ts");
  const result = calculations.calculateAaplValuation(dataModule.aaplDataset, {}, "Base");
  const fairValue = result.recommendedFairValue ?? result.blendedFairValue;
  if (!Number.isFinite(result.currentPrice) || !Number.isFinite(fairValue)) {
    console.error("AAPL model validation failed: non-finite price or fair value.");
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: "passed",
    currentPrice: result.currentPrice,
    fairValue,
    targetPrice3Y: result.targetPrice3Y,
  }, null, 2));
} finally {
  await server.close();
}
