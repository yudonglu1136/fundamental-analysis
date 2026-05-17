import { getGooglReportingEvents, getGooglSnapshot } from "../services/googlSnapshotService.mjs";
import { getGooglBacktests, runGooglBacktest } from "../services/googlBacktestService.mjs";
import { createGooglUpdateJob, getGooglUpdateJob } from "../services/googlUpdateJobService.mjs";
import {
  backfillGooglValuationRuns,
  createGooglValuationRun,
  getGooglHistoricalValuations,
  getGooglValuationRuns,
} from "../services/googlValuationService.mjs";

export async function routeGoogl(request, url, body) {
  if (request.method === "GET" && url.pathname === "/api/googl/events") {
    return { status: 200, body: { events: getGooglReportingEvents() } };
  }
  if (request.method === "GET" && url.pathname === "/api/googl/snapshot") {
    return { status: 200, body: getGooglSnapshot({ eventId: url.searchParams.get("eventId"), asOfDate: url.searchParams.get("asOfDate") }) };
  }
  if (request.method === "GET" && url.pathname === "/api/googl/valuation-runs") {
    return {
      status: 200,
      body: {
        valuationRuns: getGooglValuationRuns({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
          scenario: url.searchParams.get("scenario"),
          modelVersion: url.searchParams.get("modelVersion"),
        }),
      },
    };
  }
  if (request.method === "GET" && url.pathname === "/api/googl/historical-valuations") {
    return {
      status: 200,
      body: {
        historicalValuations: getGooglHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? "googl_v1_backend_pilot",
          series: url.searchParams.get("series") ?? "quarterly",
        }),
      },
    };
  }
  if (request.method === "POST" && url.pathname === "/api/googl/valuation-runs") {
    return { status: 201, body: await createGooglValuationRun(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/googl/valuation-runs/backfill") {
    return { status: 201, body: await backfillGooglValuationRuns(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/googl/update") {
    return { status: 202, body: createGooglUpdateJob(body ?? {}) };
  }
  const jobMatch = url.pathname.match(/^\/api\/googl\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: getGooglUpdateJob(jobMatch[1]) };
  }
  if (request.method === "GET" && url.pathname === "/api/googl/backtests") {
    return { status: 200, body: { backtests: getGooglBacktests(), status: "online" } };
  }
  if (request.method === "POST" && url.pathname === "/api/googl/backtests") {
    return { status: 201, body: runGooglBacktest(body ?? {}) };
  }
  return null;
}
