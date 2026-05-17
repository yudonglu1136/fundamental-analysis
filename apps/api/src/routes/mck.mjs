import { getMckCapitalReturnHistory, getMckReportingEvents, getMckSnapshot } from "../services/mckSnapshotService.mjs";
import { getMckBacktests, runMckBacktest } from "../services/mckBacktestService.mjs";
import { createMckUpdateJob, getMckUpdateJob } from "../services/mckUpdateJobService.mjs";
import {
  backfillMckValuationRuns,
  createMckValuationRun,
  getMckHistoricalValuations,
  getMckValuationRuns,
} from "../services/mckValuationService.mjs";
import { MCK_BACKEND_MODEL_VERSION } from "../../../../modules/mck/valuation/modelVersion.mjs";

export async function routeMck(request, url, body) {
  const stockHistoricalMatch = url.pathname === "/api/stocks/mck/historical-valuations";
  const stockBacktestMatch = url.pathname === "/api/stocks/mck/backtests";
  if (request.method === "GET" && url.pathname === "/api/mck/events") {
    return { status: 200, body: { events: getMckReportingEvents() } };
  }
  if (request.method === "GET" && url.pathname === "/api/mck/snapshot") {
    return { status: 200, body: getMckSnapshot({ eventId: url.searchParams.get("eventId"), asOfDate: url.searchParams.get("asOfDate") }) };
  }
  if (request.method === "GET" && url.pathname === "/api/mck/valuation-runs") {
    return {
      status: 200,
      body: {
        valuationRuns: getMckValuationRuns({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
          scenario: url.searchParams.get("scenario"),
          modelVersion: url.searchParams.get("modelVersion"),
        }),
      },
    };
  }
  if (request.method === "GET" && (url.pathname === "/api/mck/historical-valuations" || stockHistoricalMatch)) {
    return {
      status: 200,
      body: {
        historicalValuations: getMckHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? MCK_BACKEND_MODEL_VERSION.version,
        }),
      },
    };
  }
  if (request.method === "GET" && (url.pathname === "/api/mck/capital-returns" || url.pathname === "/api/stocks/mck/capital-returns")) {
    return { status: 200, body: getMckCapitalReturnHistory({ years: url.searchParams.get("years") ?? undefined }) };
  }
  if (request.method === "POST" && url.pathname === "/api/mck/valuation-runs") {
    return { status: 201, body: await createMckValuationRun(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/mck/valuation-runs/backfill") {
    return { status: 201, body: await backfillMckValuationRuns(body ?? {}) };
  }
  if (request.method === "POST" && url.pathname === "/api/mck/update") {
    return { status: 202, body: createMckUpdateJob(body ?? {}) };
  }
  const jobMatch = url.pathname.match(/^\/api\/mck\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: getMckUpdateJob(jobMatch[1]) };
  }
  if (request.method === "GET" && (url.pathname === "/api/mck/backtests" || stockBacktestMatch)) {
    return {
      status: 200,
      body: {
        backtests: getMckBacktests(),
        status: "online",
      },
    };
  }
  if (request.method === "POST" && (url.pathname === "/api/mck/backtests" || stockBacktestMatch)) {
    return { status: 201, body: runMckBacktest(body ?? {}) };
  }
  return null;
}
