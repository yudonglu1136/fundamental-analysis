import http from "node:http";
import { corsHeaders, isCorsOriginAllowed } from "./auth/cors.mjs";
import { requireAuth } from "./auth/requireAuth.mjs";
import { routeGoogl } from "./routes/googl.mjs";
import { routePortfolio } from "./routes/portfolio.mjs";
import { routeStockBackend } from "./routes/stockBackend.mjs";
import { listStockBackends } from "./stockBackend/registry.mjs";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
const host = process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) return resolve(null);
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function send(request, response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(request),
  });
  response.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (!isCorsOriginAllowed(request)) {
      send(request, response, 403, { error: "cors_forbidden", message: "Origin is not allowed" });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(request));
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      send(request, response, 200, {
        ok: true,
        service: "fundamental-analysis-api",
        unifiedStockBackend: true,
        lsegBackendPilot: true,
        msftBackendPilot: true,
        aaplBackendPilot: true,
        maBackendPilot: true,
        vBackendPilot: true,
        nowBackendPilot: true,
        anetBackendPilot: true,
        metaBackendPilot: true,
        triBackendPilot: true,
        nocBackendPilot: true,
        isrgBackendPilot: true,
        mckBackendPilot: true,
        legnBackendPilot: true,
        gildBackendPilot: true,
        bmyBackendPilot: true,
        dgeBackendPilot: true,
        rtxBackendPilot: true,
        amznBackendPilot: true,
        nvdaBackendPilot: true,
        deepResearchBackendPilot: true,
        portfolioBackendPilot: true,
        avavBackendPilot: true,
        ktosBackendPilot: true,
        jpmBackendPilot: true,
        cbBackendPilot: true,
        trvBackendPilot: true,
        eqtBackendPilot: true,
        qcomBackendPilot: true,
        bacBackendPilot: true,
        unhBackendPilot: true,
        stockBackends: listStockBackends().map(({ slug, ticker, modelVersion }) => ({ slug, ticker, modelVersion })),
        googlBackendPilot: true,
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const auth = await requireAuth(request);
      if (!auth.ok) {
        send(request, response, auth.status, auth.body);
        return;
      }
    }
    const body = request.method === "POST" ? await readBody(request) : null;
    const portfolioRoute = await routePortfolio(request, url, body);
    if (portfolioRoute) {
      send(request, response, portfolioRoute.status, portfolioRoute.body);
      return;
    }
    const stockBackendRoute = await routeStockBackend(request, url, body);
    if (stockBackendRoute) {
      send(request, response, stockBackendRoute.status, stockBackendRoute.body);
      return;
    }
    const googlRoute = await routeGoogl(request, url, body);
    if (googlRoute) {
      send(request, response, googlRoute.status, googlRoute.body);
      return;
    }
    send(request, response, 404, { error: "not_found", path: url.pathname });
  } catch (error) {
    send(request, response, 500, { error: "internal_error", message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`fundamental-analysis API listening on http://${host}:${port}`);
});
