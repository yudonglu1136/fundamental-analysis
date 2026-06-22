import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGuruDashboard, loadGuruMarketContext } from "./secClient.js";
import { loadOperationCommentary } from "./commentarySearch.js";
import { gurus } from "./gurus.js";
import { loadDbmfDashboard } from "./dbmfClient.js";
import { clearPortfolioCache, loadPortfolioDashboard, startPortfolioNavRecorder } from "./portfolioClient.js";
import { requireAuth } from "./auth/requireAuth.js";
import {
  guruBacktestRefreshStatus,
  loadGuruBacktest,
  loadGuruBacktests,
  refreshGuruBacktestCache,
  startGuruBacktestRefresher
} from "./backtest.js";
import { loadValuationDashboard, loadValuationTicker } from "./valuationClient.js";
import { translateTextsToChinese } from "./translationClient.js";
import { databaseInfo } from "./localDatabase.js";
import { loadTickerLogo } from "./logoClient.js";
import {
  refreshDividendCalendarForTickers,
  startDividendCalendarRefresher
} from "./dividendClient.js";
import {
  addPortfolioAccount,
  deletePortfolioConnection,
  listAdminPortfolioUsers,
  portfolioUserForAdminHash,
  readPortfolioConnectionStatus,
  recordPortfolioUser,
  savePortfolioConnection
} from "./userPortfolioStore.js";

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
    const isLocalDevOrigin =
      process.env.NODE_ENV !== "production" &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
    if (!origin || allowedOrigins.includes(origin) || isLocalDevOrigin) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed"));
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["authorization", "content-type"]
}));
app.use(express.json());

const avatarAssetDir = fs.existsSync(path.join(rootDir, "dist", "guru-avatars"))
  ? path.join(rootDir, "dist", "guru-avatars")
  : path.join(rootDir, "web", "guru-avatars");
if (fs.existsSync(avatarAssetDir)) {
  app.use("/guru-avatars", express.static(avatarAssetDir, {
    immutable: true,
    maxAge: "30d"
  }));
}

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

app.get("/api/logo/:ticker", async (request, response) => {
  try {
    const asset = await loadTickerLogo(request.params.ticker);
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Cache-Control", "public, max-age=604800, immutable");
    response.setHeader("X-Logo-Source", asset.source || "unknown");
    response.send(asset.body);
  } catch {
    response.status(404).json({ error: "logo_not_found" });
  }
});

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function internalCronAuthorized(request) {
  const secret = process.env.INTERNAL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const authorization = String(request.headers.authorization || "");
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const provided =
    String(request.headers["x-cron-secret"] || "") ||
    bearer ||
    String(request.query.secret || "");
  return secureCompare(provided, secret);
}

function requireInternalCron(request, response, next) {
  if (!internalCronAuthorized(request)) {
    response.status(403).json({
      error: "cron_forbidden",
      message: "Internal refresh endpoint requires a configured cron secret."
    });
    return;
  }
  next();
}

app.get("/api/internal/backtests/status", requireInternalCron, (_request, response) => {
  response.json(guruBacktestRefreshStatus());
});

app.post("/api/internal/backtests/refresh", requireInternalCron, async (request, response) => {
  try {
    const payload = await refreshGuruBacktestCache({
      years: request.query.years || request.body?.years || "all",
      detail: request.query.detail || request.body?.detail || "compact",
      reason: "internal-api"
    });
    response.json(payload);
  } catch (error) {
    response.status(500).json({
      error: "backtest_refresh_failed",
      message: error.message
    });
  }
});

app.use("/api", requireAuth);

const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || "luyudong1136@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function isAdminRequest(request) {
  return adminEmails.has(String(request.user?.email || "").trim().toLowerCase());
}

function requireAdmin(request, response, next) {
  if (!isAdminRequest(request)) {
    response.status(403).json({ error: "admin_forbidden", message: "Admin access is restricted." });
    return;
  }
  next();
}

function recordPortfolioRequestUser(request) {
  try {
    recordPortfolioUser(request.user);
  } catch (error) {
    console.warn("Unable to record portfolio user", error.message);
  }
}

app.use("/api", (request, _response, next) => {
  recordPortfolioRequestUser(request);
  next();
});

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

app.get("/api/portfolio", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    const forceRefresh = request.query.refresh === "1" || request.query.refresh === "true";
    const payload = await loadPortfolioDashboard({ forceRefresh, user: request.user });
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/portfolio/connection", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    response.json(readPortfolioConnectionStatus(request.user));
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.post("/api/portfolio/connection", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    const status = savePortfolioConnection(request.user, request.body || {});
    clearPortfolioCache(request.user);
    const payload = await loadPortfolioDashboard({ forceRefresh: true, user: request.user });
    response.json({
      ok: true,
      connection: status,
      portfolio: payload
    });
  } catch (error) {
    response.status(400).json({ error: "portfolio_connection_invalid", message: error.message });
  }
});

app.post("/api/portfolio/accounts", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    const status = addPortfolioAccount(request.user, request.body || {});
    clearPortfolioCache(request.user);
    const payload = await loadPortfolioDashboard({ forceRefresh: true, user: request.user });
    response.json({
      ok: true,
      connection: status,
      portfolio: payload
    });
  } catch (error) {
    response.status(400).json({ error: "portfolio_account_invalid", message: error.message });
  }
});

app.post("/api/portfolio/sync", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    clearPortfolioCache(request.user);
    const payload = await loadPortfolioDashboard({ forceRefresh: true, user: request.user });
    response.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      connection: payload.connection,
      summary: payload.summary,
      portfolio: payload
    });
  } catch (error) {
    response.status(500).json({ error: "portfolio_sync_failed", message: error.message });
  }
});

app.delete("/api/portfolio/connection", async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    deletePortfolioConnection(request.user);
    clearPortfolioCache(request.user);
    response.json({ ok: true, connection: readPortfolioConnectionStatus(request.user) });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.post("/api/portfolio/dividends/refresh", async (_request, response) => {
  try {
    recordPortfolioRequestUser(_request);
    const payload = await loadPortfolioDashboard({ forceRefresh: true, user: _request.user });
    const result = await refreshDividendCalendarForTickers(payload.holdings || [], { force: true });
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/portfolio-users", requireAdmin, async (request, response) => {
  try {
    recordPortfolioRequestUser(request);
    response.setHeader("Cache-Control", "private, max-age=30");
    response.json(listAdminPortfolioUsers());
  } catch (error) {
    response.status(500).json({ error: "admin_portfolio_list_failed", message: error.message });
  }
});

app.get("/api/admin/portfolio-users/:hash", requireAdmin, async (request, response) => {
  try {
    const target = portfolioUserForAdminHash(request.params.hash);
    if (!target) {
      response.status(404).json({ error: "portfolio_user_not_found" });
      return;
    }
    const forceRefresh = request.query.refresh === "1" || request.query.refresh === "true";
    const portfolio = await loadPortfolioDashboard({ forceRefresh, user: target.user });
    response.setHeader("Cache-Control", forceRefresh ? "no-store" : "private, max-age=30");
    response.json({
      generatedAt: new Date().toISOString(),
      user: target.publicUser,
      portfolio
    });
  } catch (error) {
    response.status(500).json({ error: "admin_portfolio_detail_failed", message: error.message });
  }
});

app.get("/api/admin/backtests/status", requireAdmin, (_request, response) => {
  response.json(guruBacktestRefreshStatus());
});

app.post("/api/admin/backtests/refresh", requireAdmin, async (request, response) => {
  try {
    const payload = await refreshGuruBacktestCache({
      years: request.query.years || request.body?.years || "all",
      detail: request.query.detail || request.body?.detail || "compact",
      reason: "admin-api"
    });
    response.json(payload);
  } catch (error) {
    response.status(500).json({
      error: "admin_backtest_refresh_failed",
      message: error.message
    });
  }
});

app.get("/api/valuation", async (_request, response) => {
  try {
    const payload = await loadValuationDashboard();
    response.setHeader("Cache-Control", "private, max-age=120");
    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/valuation/:ticker", async (request, response) => {
  try {
    const payload = await loadValuationTicker(request.params.ticker, {
      pricePoints: request.query.pricePoints
    });
    response.setHeader("Cache-Control", "private, max-age=120");
    response.json(payload);
  } catch (error) {
    response.status(404).json({ error: error.message });
  }
});

app.post("/api/translate/zh", async (request, response) => {
  try {
    const texts = Array.isArray(request.body?.texts) ? request.body.texts : [];
    const totalChars = texts.reduce((sum, value) => sum + String(value || "").length, 0);
    if (texts.length > 24 || totalChars > 60000) {
      response.status(400).json({
        error: "translation_request_too_large",
        message: "Translation request is too large."
      });
      return;
    }
    const translations = await translateTextsToChinese(texts);
    response.setHeader("Cache-Control", "private, max-age=86400");
    response.json({ targetLanguage: "zh-CN", translations });
  } catch (error) {
    response.status(502).json({
      error: "translation_failed",
      message: error.message
    });
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
      years: request.query.years,
      detail: request.query.detail
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
      years: request.query.years,
      detail: request.query.detail
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
  const distDir = path.join(rootDir, "dist");
  const distIndexPath = path.join(distDir, "index.html");

  if (fs.existsSync(distIndexPath)) {
    app.use(express.static(distDir));
    app.use((_request, response) => {
      response.sendFile(distIndexPath);
    });
  } else {
    app.use((_request, response) => {
      response.status(404).json({
        error: "not_found",
        message: "This AWS service hosts API routes only. Use https://www.thesisforge.tech for the frontend."
      });
    });
  }
}

app.listen(port, () => {
  console.log(`Guru Analysis backend listening on http://127.0.0.1:${port}`);
});

if (process.env.PORTFOLIO_NAV_AUTO_CAPTURE !== "false") {
  startPortfolioNavRecorder();
}

if (process.env.DIVIDEND_CALENDAR_AUTO_REFRESH !== "false") {
  startDividendCalendarRefresher(async () => {
    const payload = await loadPortfolioDashboard({ forceRefresh: false });
    return payload.holdings || [];
  });
}

if (process.env.GURU_BACKTEST_AUTO_REFRESH !== "false") {
  startGuruBacktestRefresher();
}
