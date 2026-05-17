#!/usr/bin/env node
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
try {
  const calculations = await server.ssrLoadModule("/src/stocks/amzn/calculations.ts");
  const data = await server.ssrLoadModule("/src/stocks/amzn/data.ts");
  const valuation = calculations.calculateAmznValuation(data.amznDataset, {}, "Base");
  if (!Number.isFinite(valuation.recommendedFairValue) || !Number.isFinite(valuation.targetPrice3Y)) {
    console.error("AMZN frontend valuation did not produce finite fair value and target price.");
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      status: "ok",
      currentPrice: valuation.currentPrice,
      fairValue: valuation.recommendedFairValue,
      targetPrice3Y: valuation.targetPrice3Y,
      methodCount: valuation.methodCards.length,
    }, null, 2));
  }
} finally {
  await server.close();
}
