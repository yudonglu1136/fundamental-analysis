import {
  deleteHolding,
  deleteHistoryPoint,
  deleteIncomeEvent,
  getPortfolioSnapshot,
  refreshHoldingPrices,
  refreshPortfolioNav,
  refreshStockDividends,
  saveHolding,
  saveHistoryPoint,
  saveIncomeEvent,
} from "../services/portfolioService.mjs";

export async function routePortfolio(request, url, body) {
  if (!url.pathname.startsWith("/api/portfolio")) return null;

  if (request.method === "GET" && url.pathname === "/api/portfolio/snapshot") {
    return { status: 200, body: getPortfolioSnapshot(request) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/holdings") {
    return { status: 200, body: saveHolding(request, body ?? {}) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/history") {
    return { status: 200, body: await saveHistoryPoint(request, body ?? {}) };
  }

  const historyMatch = url.pathname.match(/^\/api\/portfolio\/history\/([^/]+)$/);
  if (request.method === "DELETE" && historyMatch) {
    return { status: 200, body: deleteHistoryPoint(request, decodeURIComponent(historyMatch[1])) };
  }

  const holdingMatch = url.pathname.match(/^\/api\/portfolio\/holdings\/([^/]+)$/);
  if (request.method === "DELETE" && holdingMatch) {
    return { status: 200, body: deleteHolding(request, decodeURIComponent(holdingMatch[1])) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/income-events") {
    return { status: 200, body: saveIncomeEvent(request, body ?? {}) };
  }

  const incomeEventMatch = url.pathname.match(/^\/api\/portfolio\/income-events\/([^/]+)$/);
  if (request.method === "DELETE" && incomeEventMatch) {
    return { status: 200, body: deleteIncomeEvent(request, decodeURIComponent(incomeEventMatch[1])) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/stock-dividends/refresh") {
    return { status: 200, body: await refreshStockDividends(request) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/holding-prices/refresh") {
    return { status: 200, body: await refreshHoldingPrices(request) };
  }

  if (request.method === "POST" && url.pathname === "/api/portfolio/nav/refresh") {
    return { status: 200, body: await refreshPortfolioNav(request) };
  }

  return {
    status: 404,
    body: {
      error: "portfolio_route_not_found",
      path: url.pathname,
    },
  };
}
