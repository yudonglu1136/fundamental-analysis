import { getStockBackend, listStockBackends } from "../stockBackend/registry.mjs";

function readCommonFilters(url) {
  return {
    eventId: url.searchParams.get("eventId"),
    asOfDate: url.searchParams.get("asOfDate"),
    scenario: url.searchParams.get("scenario"),
    modelVersion: url.searchParams.get("modelVersion"),
  };
}

function resolveStockRoute(url) {
  const unifiedMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)(?:\/(.*))?$/);
  if (unifiedMatch) {
    return {
      slug: unifiedMatch[1].toLowerCase(),
      action: unifiedMatch[2] || "",
      canonical: true,
    };
  }

  const legacyMatch = url.pathname.match(/^\/api\/([^/]+)(?:\/(.*))?$/);
  if (legacyMatch) {
    const slug = legacyMatch[1].toLowerCase();
    if (!getStockBackend(slug)) return null;
    return {
      slug,
      action: legacyMatch[2] || "",
      canonical: false,
    };
  }

  return null;
}

export async function routeStockBackend(request, url, body) {
  if (request.method === "GET" && url.pathname === "/api/stocks") {
    return { status: 200, body: { backends: listStockBackends() } };
  }

  const matched = resolveStockRoute(url);
  if (!matched) return null;

  const backend = getStockBackend(matched.slug);
  if (!backend) {
    return { status: 404, body: { error: "unknown_stock_backend", slug: matched.slug } };
  }

  const action = matched.action;
  if (request.method === "GET" && action === "events") {
    return { status: 200, body: { ticker: backend.ticker, events: backend.getEvents() } };
  }

  if (request.method === "GET" && action === "snapshot") {
    return {
      status: 200,
      body: {
        ticker: backend.ticker,
        ...backend.getSnapshot({
          eventId: url.searchParams.get("eventId"),
          asOfDate: url.searchParams.get("asOfDate"),
        }),
      },
    };
  }

  if (request.method === "GET" && action === "valuation-runs") {
    return {
      status: 200,
      body: {
        ticker: backend.ticker,
        valuationRuns: backend.getValuationRuns(readCommonFilters(url)),
      },
    };
  }

  if (request.method === "GET" && action === "historical-valuations") {
    return {
      status: 200,
      body: {
        ticker: backend.ticker,
        historicalValuations: backend.getHistoricalValuations({
          scenario: url.searchParams.get("scenario") ?? "Base",
          modelVersion: url.searchParams.get("modelVersion") ?? backend.modelVersion,
          series: url.searchParams.get("series") ?? undefined,
        }),
      },
    };
  }

  if (request.method === "GET" && action === "capital-returns") {
    if (backend.getCapitalReturns) {
      return {
        status: 200,
        body: backend.getCapitalReturns({
          years: url.searchParams.get("years") ?? undefined,
        }),
      };
    }
    return {
      status: 404,
      body: {
        ticker: backend.ticker,
        error: "capital_returns_not_supported",
      },
    };
  }

  if (request.method === "GET" && action === "incentives-vs-net-revenue") {
    if (backend.getIncentivesVsNetRevenue) {
      return {
        status: 200,
        body: backend.getIncentivesVsNetRevenue({
          quarters: url.searchParams.get("quarters") ?? undefined,
        }),
      };
    }
    return {
      status: 404,
      body: {
        ticker: backend.ticker,
        error: "incentives_vs_net_revenue_not_supported",
      },
    };
  }

  if (request.method === "GET" && action === "subscription-agent-history") {
    if (backend.getSubscriptionAgentHistory) {
      return {
        status: 200,
        body: backend.getSubscriptionAgentHistory({
          quarters: url.searchParams.get("quarters") ?? undefined,
        }),
      };
    }
    return {
      status: 404,
      body: {
        ticker: backend.ticker,
        error: "subscription_agent_history_not_supported",
      },
    };
  }

  if (request.method === "GET" && action === "cloud-ai-history") {
    if (backend.getCloudAiHistory) {
      return {
        status: 200,
        body: backend.getCloudAiHistory({
          quarters: url.searchParams.get("quarters") ?? undefined,
        }),
      };
    }
    return {
      status: 404,
      body: {
        ticker: backend.ticker,
        error: "cloud_ai_history_not_supported",
      },
    };
  }

  if (request.method === "POST" && action === "valuation-runs") {
    return { status: 201, body: await backend.createValuationRun(body ?? {}) };
  }

  if (request.method === "POST" && action === "valuation-runs/backfill") {
    return { status: 201, body: await backend.backfillValuationRuns(body ?? {}) };
  }

  if (request.method === "POST" && action === "update") {
    return { status: 202, body: backend.createUpdateJob(body ?? {}) };
  }

  const jobMatch = action.match(/^jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch) {
    return { status: 200, body: backend.getUpdateJob(jobMatch[1]) };
  }

  if (request.method === "GET" && action === "backtests") {
    if (backend.getBacktests) {
      return {
        status: 200,
        body: {
          ticker: backend.ticker,
          backtests: backend.getBacktests(),
          status: "online",
        },
      };
    }
    return {
      status: 200,
      body: {
        ticker: backend.ticker,
        backtests: [],
        status: "stub",
        message: backend.backtestMessage,
      },
    };
  }

  if (request.method === "POST" && action === "backtests") {
    if (backend.runBacktest) {
      return { status: 201, body: backend.runBacktest(body ?? {}) };
    }
    return {
      status: 202,
      body: {
        id: `${backend.slug}-backtest-${Date.now()}`,
        ticker: backend.ticker,
        status: "stub_created",
        request: body ?? {},
      },
    };
  }

  return null;
}
