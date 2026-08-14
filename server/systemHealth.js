import fs from "node:fs";
import os from "node:os";
import {
  databaseInfo,
  readBackgroundJobRun,
  readBackgroundJobRuns,
  readDatabaseTableSummaries,
  readValuationPodcastInsightSummary
} from "./localDatabase.js";
import { guruBacktestRefreshStatus } from "./backtest.js";
import { listAdminPortfolioUsers } from "./userPortfolioStore.js";

const HOUR_MS = 60 * 60 * 1000;

function isoOrEmpty(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : "";
}

function hoursSince(value) {
  const time = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return null;
  return (Date.now() - time) / HOUR_MS;
}

function statusForAge(value, warningHours, _failedHours) {
  const age = hoursSince(value);
  if (age === null) return "unknown";
  if (age > warningHours) return "warning";
  return "success";
}

function severity(status) {
  return {
    failed: 4,
    error: 4,
    warning: 3,
    unknown: 2,
    running: 1,
    success: 0,
    ok: 0
  }[status] ?? 2;
}

function summarizeStatus(statuses) {
  const worst = statuses
    .filter(Boolean)
    .sort((left, right) => severity(right) - severity(left))[0];
  return worst || "unknown";
}

function safeRead(label, fallback, reader) {
  try {
    return reader();
  } catch (error) {
    if (Array.isArray(fallback)) return fallback;
    return {
      ...fallback,
      status: "failed",
      message: `${label} unavailable: ${error.message}`
    };
  }
}

function databaseHealth() {
  const info = databaseInfo();
  try {
    const stats = fs.statSync(info.path);
    return {
      path: info.path,
      exists: stats.isFile(),
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      status: stats.isFile() ? "success" : "failed"
    };
  } catch (error) {
    return {
      path: info.path,
      exists: false,
      sizeBytes: 0,
      updatedAt: "",
      status: "failed",
      message: error.message
    };
  }
}

function jobFromRun({
  id,
  label,
  run,
  fallbackLatestAt = "",
  warningHours = 30,
  failedHours = 96,
  detail = {}
}) {
  const status = String(run?.status || "").trim();
  const finishedAt = isoOrEmpty(run?.finishedAt) || isoOrEmpty(fallbackLatestAt);
  const startedAt = isoOrEmpty(run?.startedAt);
  const payload = run?.payload || {};
  const runningAge = hoursSince(startedAt);
  const normalizedStatus = status === "running"
    ? runningAge !== null && runningAge > 6 ? "warning" : "running"
    : status === "failed" || status === "error"
      ? "failed"
      : status === "success" || status === "ok"
        ? statusForAge(finishedAt, warningHours, failedHours)
        : statusForAge(finishedAt, warningHours, failedHours);
  const message = payload.error ||
    payload.message ||
    (status === "running" && normalizedStatus === "warning"
      ? "Run started but no completion was recorded."
      : "") ||
    (normalizedStatus === "unknown"
      ? "No recorded run yet."
      : normalizedStatus === "warning"
        ? "Latest run is getting stale."
        : "");
  return {
    id,
    label,
    status: normalizedStatus,
    startedAt,
    finishedAt,
    message,
    details: {
      ...detail,
      ...payload
    }
  };
}

function tableByName(tables, name) {
  return tables.find((table) => table.table === name) || {};
}

function portfolioSummary() {
  return safeRead("portfolio registry", {
    users: [],
    summary: {
      users: 0,
      linked: 0,
      accounts: 0,
      errors: 0,
      latestNav: 0
    }
  }, () => {
    const payload = listAdminPortfolioUsers();
    return {
      users: Array.isArray(payload.users) ? payload.users.slice(0, 12) : [],
      summary: payload.summary || {}
    };
  });
}

export function buildAdminSystemHealth({ allowedOrigins = [], adminEmails = [] } = {}) {
  const database = databaseHealth();
  const tables = safeRead("database tables", [], () => readDatabaseTableSummaries());
  const runs = safeRead("job runs", [], () => readBackgroundJobRuns());
  const runById = new Map((Array.isArray(runs) ? runs : []).map((run) => [run.jobId, run]));
  const backtestStatus = safeRead("backtest status", {}, () => guruBacktestRefreshStatus());
  const podcastSummary = safeRead("podcast summary", {}, () => readValuationPodcastInsightSummary(25));
  const portfolio = portfolioSummary();

  const backtestTable = tableByName(tables, "guru_backtests");
  const valuationTable = tableByName(tables, "valuation_ticker_snapshots");
  const guruTable = tableByName(tables, "guru_snapshots");
  const dividendTable = tableByName(tables, "dividend_events");
  const navTable = tableByName(tables, "portfolio_nav_points");
  const podcastTable = tableByName(tables, "valuation_podcast_insights");

  const backtestRun =
    runById.get("guru_backtest_refresh") ||
    (backtestStatus.startedAt || backtestStatus.finishedAt
      ? {
          jobId: "guru_backtest_refresh",
          startedAt: backtestStatus.startedAt,
          finishedAt: backtestStatus.finishedAt,
          status: backtestStatus.running
            ? "running"
            : Number(backtestStatus.failed || 0) > 0
              ? "failed"
              : "success",
          payload: backtestStatus
        }
      : null);

  const jobs = [
    jobFromRun({
      id: "guru_snapshots",
      label: "Guru dashboard data",
      run: null,
      fallbackLatestAt: guruTable.latestAt,
      warningHours: 48,
      failedHours: 168,
      detail: { rows: guruTable.rowCount }
    }),
    jobFromRun({
      id: "guru_backtest_refresh",
      label: "Guru simulation / backtests",
      run: backtestRun,
      fallbackLatestAt: backtestTable.latestAt,
      warningHours: 36,
      failedHours: 120,
      detail: {
        rows: backtestTable.rowCount,
        latestBacktestEndDate: backtestTable.maxDate
      }
    }),
    jobFromRun({
      id: "valuation_database",
      label: "Valuation models",
      run: null,
      fallbackLatestAt: valuationTable.latestAt,
      warningHours: 72,
      failedHours: 240,
      detail: { tickerRows: valuationTable.rowCount }
    }),
    jobFromRun({
      id: "valuation_podcast_insights",
      label: "Podcast / YouTube insights",
      run: runById.get("valuation_podcast_insights"),
      fallbackLatestAt: podcastTable.latestAt,
      warningHours: 72,
      failedHours: 240,
      detail: {
        rows: podcastTable.rowCount,
        observedThrough: podcastTable.maxDate,
        tickers: podcastSummary.tickerCount || 0,
        sources: podcastSummary.sourceCount || 0
      }
    }),
    jobFromRun({
      id: "portfolio_sync",
      label: "User portfolio sync",
      run: runById.get("portfolio_sync"),
      fallbackLatestAt: navTable.latestAt,
      warningHours: 24,
      failedHours: 96,
      detail: portfolio.summary
    }),
    jobFromRun({
      id: "portfolio_nav_capture",
      label: "Portfolio NAV recorder",
      run: runById.get("portfolio_nav_capture"),
      fallbackLatestAt: navTable.latestAt,
      warningHours: 36,
      failedHours: 120,
      detail: {
        rows: navTable.rowCount,
        latestNavDate: navTable.maxDate
      }
    }),
    jobFromRun({
      id: "portfolio_dividend_calendar",
      label: "Dividend calendar",
      run: runById.get("portfolio_dividend_calendar"),
      fallbackLatestAt: dividendTable.latestAt,
      warningHours: 168,
      failedHours: 336,
      detail: {
        rows: dividendTable.rowCount,
        minExDate: dividendTable.minDate,
        maxExDate: dividendTable.maxDate
      }
    })
  ];

  const status = summarizeStatus([
    database.status,
    ...jobs.map((job) => job.status)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    ok: status !== "failed" && status !== "error",
    status,
    service: {
      name: "guru-analysis-dashboard",
      runtime: "node",
      nodeVersion: process.version,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      host: os.hostname(),
      environment: process.env.NODE_ENV || "development",
      port: Number(process.env.PORT || 8787)
    },
    deployment: {
      frontend: "Vercel",
      backend: "AWS Elastic Beanstalk",
      apiProxy: "/api/* -> AWS backend"
    },
    database,
    auth: {
      adminEmails,
      adminEmailCount: adminEmails.length,
      allowedOrigins,
      allowedOriginCount: allowedOrigins.length,
      supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      apiCorsConfigured: allowedOrigins.some((origin) => origin.includes("thesisforge.tech"))
    },
    portfolio,
    jobs,
    tables,
    recentRuns: Array.isArray(runs) ? runs.slice(0, 12) : []
  };
}
