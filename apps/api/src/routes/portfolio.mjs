import {
  deleteHolding,
  deleteHistoryPoint,
  deleteIncomeEvent,
  getPortfolioSnapshot,
  refreshHoldingPrices,
  refreshPortfolioMarketData,
  refreshPortfolioNav,
  refreshStockDividends,
  saveHolding,
  saveHistoryPoint,
  saveIncomeEvent,
  searchPortfolioMarketData,
} from "../services/portfolioService.mjs";

export async function routePortfolio(request, url, body) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.startsWith("/api/portfolio")) return null;

  if (request.method === "GET" && pathname === "/api/portfolio/snapshot") {
    return { status: 200, body: getPortfolioSnapshot(request) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/holdings") {
    return { status: 200, body: await saveHolding(request, body ?? {}) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/history") {
    return { status: 200, body: await saveHistoryPoint(request, body ?? {}) };
  }

  const historyMatch = pathname.match(/^\/api\/portfolio\/history\/([^/]+)$/);
  if (request.method === "DELETE" && historyMatch) {
    return { status: 200, body: deleteHistoryPoint(request, decodeURIComponent(historyMatch[1])) };
  }

  const holdingMatch = pathname.match(/^\/api\/portfolio\/holdings\/([^/]+)$/);
  if (request.method === "DELETE" && holdingMatch) {
    return { status: 200, body: await deleteHolding(request, decodeURIComponent(holdingMatch[1])) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/income-events") {
    return { status: 200, body: saveIncomeEvent(request, body ?? {}) };
  }

  const incomeEventMatch = pathname.match(/^\/api\/portfolio\/income-events\/([^/]+)$/);
  if (request.method === "DELETE" && incomeEventMatch) {
    return { status: 200, body: deleteIncomeEvent(request, decodeURIComponent(incomeEventMatch[1])) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/stock-dividends/refresh") {
    return { status: 200, body: await refreshStockDividends(request, body ?? {}) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/holding-prices/refresh") {
    return { status: 200, body: await refreshHoldingPrices(request, body ?? {}) };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/nav/refresh") {
    return { status: 200, body: await refreshPortfolioNav(request) };
  }

  if (request.method === "GET" && pathname === "/api/portfolio/market-data/search") {
    return {
      status: 200,
      body: searchPortfolioMarketData(url.searchParams.get("q") ?? "", {
        limit: Number(url.searchParams.get("limit") ?? 20),
      }),
    };
  }

  if (request.method === "POST" && pathname === "/api/portfolio/market-data/refresh") {
    return { status: 200, body: await refreshPortfolioMarketData(body ?? {}) };
  }

  return {
    status: 404,
    body: {
      error: "portfolio_route_not_found",
      path: url.pathname,
    },
  };
}
