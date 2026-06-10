import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGuruDashboard, loadGuruMarketContext } from "./secClient.js";
import { loadOperationCommentary } from "./commentarySearch.js";
import { gurus } from "./gurus.js";
import { loadDbmfDashboard } from "./dbmfClient.js";
import { requireAuth } from "./auth/requireAuth.js";
import { loadGuruBacktest, loadGuruBacktests } from "./backtest.js";
import { loadValuationDashboard, loadValuationTicker } from "./valuationClient.js";
import { databaseInfo } from "./localDatabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8787);

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];
const allowedOrigins = String(process.env.API_ALLOWED_ORIGINS || defaultAllowedOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["authorization", "content-type"]
}));
app.use(express.json());

function databaseHealth() {
  const info = databaseInfo();
  try {
    const stats = fs.statSync(info.path);
    return {
      exists: stats.isFile(),
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      sizeBytes: 0,
      updatedAt: null
    };
  }
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "guru-analysis-dashboard",
    database: databaseHealth()
  });
});

app.use("/api", requireAuth);

app.get("/api/gurus/config", (_request, response) => {
  response.json({ gurus });
});

app.get("/api/gurus", async (request, response) => {
  try {
    const forceRefresh = request.query.refresh === "1" || request.query.refresh === "true";
    const payload = await loadGuruDashboard({ forceRefresh });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/dbmf", async (request, response) => {
  try {
    const forceRefresh = request.query.refresh === "1" || request.query.refresh === "true";
    const payload = await loadDbmfDashboard({ forceRefresh });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/valuation", async (_request, response) => {
  try {
    const payload = await loadValuationDashboard();
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/valuation/:ticker", async (request, response) => {
  try {
    const payload = await loadValuationTicker(request.params.ticker);
    response.json(payload);
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

app.get("/api/gurus/:id", async (request, response) => {
  try {
    const payload = await loadGuruDashboard({
      forceRefresh: request.query.refresh === "1" || request.query.refresh === "true"
    });
    const guru = payload.gurus.find((item) => item.id === request.params.id);
    if (!guru) {
      response.status(404).json({ error: "Guru not found" });
      return;
    }
    response.json({ generatedAt: payload.generatedAt, source: payload.source, guru });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/gurus/:id/context", async (request, response) => {
  try {
    const payload = await loadGuruMarketContext(request.params.id, {
      ticker: request.query.ticker,
      refresh: request.query.refresh === "1" || request.query.refresh === "true"
    });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/gurus/:id/backtest", async (request, response) => {
  try {
    const payload = await loadGuruBacktest(request.params.id, {
      refresh: request.query.refresh === "1" || request.query.refresh === "true",
      years: request.query.years || 5
    });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/backtests", async (request, response) => {
  try {
    const payload = await loadGuruBacktests({
      refresh: request.query.refresh === "1" || request.query.refresh === "true",
      years: request.query.years || 5
    });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/gurus/:id/commentary", async (request, response) => {
  try {
    const payload = await loadOperationCommentary(request.params.id, request.query);
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.use((_request, response) => {
    response.sendFile(path.join(rootDir, "dist", "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Guru Analysis backend listening on http://127.0.0.1:${port}`);
});
