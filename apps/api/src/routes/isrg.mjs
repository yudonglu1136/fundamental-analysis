import { getIsrgReportingEvents, getIsrgSnapshot } from "../services/isrgSnapshotService.mjs";
import { createIsrgUpdateJob, getIsrgUpdateJob } from "../services/isrgUpdateJobService.mjs";
import {
  backfillIsrgValuationRuns,
  createIsrgValuationRun,
  getIsrgHistoricalValuations,
  getIsrgValuationRuns,
} from "../services/isrgValuationService.mjs";
import { getIsrgBacktests, runIsrgBacktest } from "../services/isrgBacktestService.mjs";

export async function routeIsrg(request, url, body) {
  if (request.method === "GET" && url.pathname === "/api/isrg/events") {
    return { status: 200, body: { events: getIsrgReportingEvents() } };
  }
  if (request.method === "GET" && url.pathname === "/api/isrg/snapshot") {
    return { status: 200, body: getIsrgSnapshot({ eventId: url.searchParams.get("eventId"), asOfDate: url.searchParams.get("asOfDate") }) };
  }
  if (request.method === "GET" && url.pathname === "/api/isrg/valuation-runs") {
    return {
      status: 200,
      body: {
        valuationRuns: getIsrgValuationRuns({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
          scenario: url.searchParams.get("scenario"),
          modelVersion: url.searchParams.get("modelVersion"),
        }),
      },
    };
  }
  if (request.method === "GET" && url.pathname === "/api/isrg/historical-valuations") {
    return {
      status: 200,
      body: {
        historicalValuations: getIsrgHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? "isrg_v1_backend_pilot",
        }),
      },
    };
  }
  if (request.method === "POST" && url.pathname === "/api/isrg/valuation-runs") {
    return { status: 201, body: await createIsrgValuationRun(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/isrg/valuation-runs/backfill") {
    return { status: 201, body: await backfillIsrgValuationRuns(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/isrg/update") {
    return { status: 202, body: createIsrgUpdateJob(body ?? {}) };
  }
  const jobMatch = url.pathname.match(/^\/api\/isrg\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: getIsrgUpdateJob(jobMatch[1]) };
  }
  if (request.method === "GET" && url.pathname === "/api/isrg/backtests") {
    return { status: 200, body: { ticker: "ISRG", backtests: getIsrgBacktests(), status: "online" } };
  }
  if (request.method === "POST" && url.pathname === "/api/isrg/backtests") {
    return { status: 201, body: runIsrgBacktest(body ?? {}) };
  }
  return null;
}
