import { getLsegReportingEvents, getLsegSnapshot } from "../services/lsegSnapshotService.mjs";
import { createLsegUpdateJob, getLsegUpdateJob } from "../services/lsegUpdateJobService.mjs";
import {
  backfillLsegValuationRuns,
  createLsegValuationRun,
  getLsegHistoricalValuations,
  getLsegValuationRuns,
} from "../services/lsegValuationService.mjs";
import { getLsegBacktests, runLsegBacktest } from "../services/lsegBacktestService.mjs";

export async function routeLseg(request, url, body) {
  if (request.method === "GET" && url.pathname === "/api/lseg/events") {
    return { status: 200, body: { events: getLsegReportingEvents() } };
  }
  if (request.method === "GET" && url.pathname === "/api/lseg/snapshot") {
    return { status: 200, body: getLsegSnapshot({ eventId: url.searchParams.get("eventId"), asOfDate: url.searchParams.get("asOfDate") }) };
  }
  if (request.method === "GET" && url.pathname === "/api/lseg/valuation-runs") {
    return {
      status: 200,
      body: {
        valuationRuns: getLsegValuationRuns({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
          scenario: url.searchParams.get("scenario"),
          modelVersion: url.searchParams.get("modelVersion"),
        }),
      },
    };
  }
  if (request.method === "GET" && url.pathname === "/api/lseg/historical-valuations") {
    return {
      status: 200,
      body: {
        historicalValuations: getLsegHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? "lseg_v1_backend_pilot",
        }),
      },
    };
  }
  if (request.method === "POST" && url.pathname === "/api/lseg/valuation-runs") {
    return { status: 201, body: await createLsegValuationRun(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/lseg/valuation-runs/backfill") {
    return { status: 201, body: await backfillLsegValuationRuns(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/lseg/update") {
    return { status: 202, body: createLsegUpdateJob(body ?? {}) };
  }
  const jobMatch = url.pathname.match(/^\/api\/lseg\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: getLsegUpdateJob(jobMatch[1]) };
  }
  if (request.method === "GET" && url.pathname === "/api/lseg/backtests") {
    return { status: 200, body: { ticker: "LSEG.L", backtests: getLsegBacktests(), status: "online" } };
  }
  if (request.method === "POST" && url.pathname === "/api/lseg/backtests") {
    return { status: 201, body: runLsegBacktest(body ?? {}) };
  }
  return null;
}
