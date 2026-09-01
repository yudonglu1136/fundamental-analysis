import fs from "node:fs";
import os from "node:os";
import {
  databaseInfo,
  readBackgroundJobRuns,
  readDatabaseTableSummaries,
  readValuationPodcastInsightSummary
} from "./localDatabase.js";
import { guruBacktestRefreshStatus } from "./backtest.js";
import { listAdminPortfolioUsers } from "./userPortfolioStore.js";

const HOUR_MS = 60 * 60 * 1000;

const requiredPublicTables = [
  "dashboard_snapshots",
  "guru_snapshots",
  "guru_exposure_snapshots",
  "guru_assets",
  "guru_backtests",
  "valuation_snapshots",
  "valuation_ticker_snapshots",
  "valuation_podcast_insights",
  "price_points",
  "portfolio_nav_points",
  "ticker_assets",
  "dividend_events",
  "background_job_runs"
];

const publicDataModules = [
  {
    id: "guru_data",
    label: "Guru dashboard data",
    tables: ["guru_snapshots"],
    warningHours: 48,
    failedHours: 168
  },
  {
    id: "guru_backtests",
    label: "Guru simulation / backtests",
    tables: ["guru_backtests"],
    warningHours: 36,
    failedHours: 120
  },
  {
    id: "valuation",
    label: "Valuation models",
    tables: ["valuation_ticker_snapshots"],
    warningHours: 72,
    failedHours: 240
  },
  {
    id: "market_prices",
    label: "Market prices",
    tables: ["price_points"],
    warningHours: 48,
    failedHours: 120
  }
];

function isoOrEmpty(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : "";
}

function hoursSince(value, now = Date.now()) {
  const time = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return null;
  return (now - time) / HOUR_MS;
}

export function statusForAge(value, warningHours, failedHours, now = Date.now()) {
  const age = hoursSince(value, now);
  if (age === null) return "unknown";
  if (age > failedHours) return "failed";
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
    const exists = stats.isFile();
    return {
      path: info.path,
      exists,
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
      status: exists && stats.size > 0 ? "success" : "failed",
      ...(exists && stats.size > 0 ? {} : { message: "Database file is missing or empty." })
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

function latestTimestamp(values) {
  return values
    .map(isoOrEmpty)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function roundedHours(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function publicStateForAge(value, warningHours, failedHours, now) {
  return {
    success: "healthy",
    warning: "stale",
    failed: "failed",
    unknown: "unknown"
  }[statusForAge(value, warningHours, failedHours, now)] || "unknown";
}

function publicStateSeverity(state) {
  return {
    failed: 4,
    stale: 3,
    unknown: 2,
    healthy: 0
  }[state] ?? 2;
}

function publicOverallState(states) {
  return states
    .filter(Boolean)
    .sort((left, right) => publicStateSeverity(right) - publicStateSeverity(left))[0] || "unknown";
}

function tableModuleHealth(spec, tables, now) {
  const rows = spec.tables.map((table) => tables.find((entry) => entry.table === table));
  const missingTables = spec.tables.filter((table, index) => !rows[index]);
  const failedTables = rows
    .filter((row) => row && !["ok", "success"].includes(row.status))
    .map((row) => row.table);
  const rowCount = rows.reduce((sum, row) => sum + Number(row?.rowCount || 0), 0);
  const latestAt = latestTimestamp(rows.map((row) => row?.latestAt));
  const ageHours = hoursSince(latestAt, now);
  const state = missingTables.length || failedTables.length || rowCount <= 0
    ? "failed"
    : publicStateForAge(latestAt, spec.warningHours, spec.failedHours, now);
  const message = missingTables.length
    ? `Missing table${missingTables.length === 1 ? "" : "s"}: ${missingTables.join(", ")}`
    : failedTables.length
      ? `Unreadable table${failedTables.length === 1 ? "" : "s"}: ${failedTables.join(", ")}`
      : rowCount <= 0
        ? "No persisted rows are available."
        : state === "failed"
          ? "Persisted data is beyond the failure freshness threshold."
          : state === "stale"
            ? "Persisted data is beyond the warning freshness threshold."
            : state === "unknown"
              ? "Persisted data has no usable freshness timestamp."
              : "";
  return {
    id: spec.id,
    label: spec.label,
    state,
    message,
    freshness: {
      latestAt,
      ageHours: roundedHours(ageHours),
      warningHours: spec.warningHours,
      failedHours: spec.failedHours
    },
    details: {
      tables: spec.tables,
      rowCount,
      missingTables,
      failedTables
    }
  };
}

function ontologyModuleHealth(ontology, now) {
  const latestAt = isoOrEmpty(ontology?.manifest?.generated_at) || isoOrEmpty(ontology?.updatedAt);
  const warningHours = 24 * 7;
  const failedHours = 24 * 30;
  const ageHours = hoursSince(latestAt, now);
  const available = Boolean(ontology?.ok && ontology?.exists && Number(ontology?.sizeBytes || 0) > 0);
  const state = available
    ? publicStateForAge(latestAt, warningHours, failedHours, now)
    : "failed";
  return {
    id: "ontology",
    label: "Ontology snapshot",
    state,
    message: !available
      ? "Ontology snapshot is missing or unreadable."
      : state === "failed"
        ? "Ontology snapshot is beyond the failure freshness threshold."
        : state === "stale"
          ? "Ontology snapshot is beyond the warning freshness threshold."
          : state === "unknown"
            ? "Ontology snapshot has no usable freshness timestamp."
            : "",
    freshness: {
      latestAt,
      ageHours: roundedHours(ageHours),
      warningHours,
      failedHours
    },
    details: {
      sizeBytes: Number(ontology?.sizeBytes || 0),
      schemaVersion: ontology?.manifest?.schema_version ?? null,
      responseCount: Number(ontology?.manifest?.responses || 0)
    }
  };
}

export function buildPublicSystemHealth({
  database: databaseOverride,
  tables: tablesOverride,
  ontology = {},
  now = Date.now()
} = {}) {
  const rawDatabase = databaseOverride || databaseHealth();
  const tables = tablesOverride || safeRead("database tables", [], () => readDatabaseTableSummaries());
  const tableRows = Array.isArray(tables) ? tables : [];
  const tableNames = new Set(tableRows.map((table) => table.table));
  const missingTables = requiredPublicTables.filter((table) => !tableNames.has(table));
  const failedTables = tableRows
    .filter((table) => !["ok", "success"].includes(table.status))
    .map((table) => table.table);
  const databaseState = rawDatabase.exists && Number(rawDatabase.sizeBytes || 0) > 0 &&
    !missingTables.length && !failedTables.length
    ? "healthy"
    : "failed";
  const databaseModule = {
    id: "database",
    label: "SQLite database",
    state: databaseState,
    message: databaseState === "healthy"
      ? ""
      : !rawDatabase.exists || Number(rawDatabase.sizeBytes || 0) <= 0
        ? "Database file is missing or empty."
        : missingTables.length
          ? `Missing table${missingTables.length === 1 ? "" : "s"}: ${missingTables.join(", ")}`
          : `Unreadable table${failedTables.length === 1 ? "" : "s"}: ${failedTables.join(", ")}`,
    freshness: {
      latestAt: isoOrEmpty(rawDatabase.updatedAt),
      ageHours: roundedHours(hoursSince(rawDatabase.updatedAt, now)),
      warningHours: null,
      failedHours: null
    },
    details: {
      sizeBytes: Number(rawDatabase.sizeBytes || 0),
      requiredTableCount: requiredPublicTables.length,
      discoveredTableCount: tableRows.length,
      missingTables,
      failedTables
    }
  };
  const modules = [
    databaseModule,
    ...publicDataModules.map((spec) => tableModuleHealth(spec, tableRows, now)),
    ontologyModuleHealth(ontology, now)
  ];
  const status = publicOverallState(modules.map((module) => module.state));
  const { path: _path, ...publicDatabase } = rawDatabase;

  return {
    generatedAt: new Date(now).toISOString(),
    ok: status === "healthy",
    status,
    service: "guru-analysis-dashboard",
    database: {
      ...publicDatabase,
      state: databaseState,
      missingTables,
      failedTables
    },
    ontology: {
      ...ontology,
      state: modules.at(-1).state
    },
    modules
  };
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
