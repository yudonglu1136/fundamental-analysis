import { getMsftReportingEvents, getMsftSnapshot } from "../services/msftSnapshotService.mjs";
import { getMsftBacktests, runMsftBacktest } from "../services/msftBacktestService.mjs";
import { createMsftUpdateJob, getMsftUpdateJob } from "../services/msftUpdateJobService.mjs";
import {
  backfillMsftValuationRuns,
  createMsftValuationRun,
  getMsftHistoricalValuations,
  getMsftValuationRuns,
} from "../services/msftValuationService.mjs";

export async function routeMsft(request, url, body) {
  if (request.method === "GET" && url.pathname === "/api/msft/events") {
    return { status: 200, body: { events: getMsftReportingEvents() } };
  }
  if (request.method === "GET" && url.pathname === "/api/msft/snapshot") {
    return { status: 200, body: getMsftSnapshot({ eventId: url.searchParams.get("eventId"), asOfDate: url.searchParams.get("asOfDate") }) };
  }
  if (request.method === "GET" && url.pathname === "/api/msft/valuation-runs") {
    return {
      status: 200,
      body: {
        valuationRuns: getMsftValuationRuns({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
          scenario: url.searchParams.get("scenario"),
          modelVersion: url.searchParams.get("modelVersion"),
        }),
      },
    };
  }
  if (request.method === "GET" && url.pathname === "/api/msft/historical-valuations") {
    return {
      status: 200,
      body: {
        historicalValuations: getMsftHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? "msft_v1_backend_pilot",
        }),
      },
    };
  }
  if (request.method === "POST" && url.pathname === "/api/msft/valuation-runs") {
    return { status: 201, body: await createMsftValuationRun(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/msft/valuation-runs/backfill") {
    return { status: 201, body: await backfillMsftValuationRuns(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/msft/update") {
    return { status: 202, body: createMsftUpdateJob(body ?? {}) };
  }
  const jobMatch = url.pathname.match(/^\/api\/msft\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: getMsftUpdateJob(jobMatch[1]) };
  }
  if (request.method === "GET" && url.pathname === "/api/msft/backtests") {
    return { status: 200, body: { backtests: getMsftBacktests(), status: "online" } };
  }
  if (request.method === "POST" && url.pathname === "/api/msft/backtests") {
    return { status: 201, body: runMsftBacktest(body ?? {}) };
  }
  return null;
}
