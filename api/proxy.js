import http from "node:http";
import https from "node:https";

const LEGACY_AWS_ORIGIN =
  process.env.AWS_API_ORIGIN ||
  "http://guru-analysis-api-prod-378477120101.us-east-1.elasticbeanstalk.com";
const ONTOLOGY_API_ORIGIN =
  process.env.ONTOLOGY_API_ORIGIN ||
  "https://api.thesisforge.tech";

const RETIRED_PATH_ALIASES = new Map([
  ["/api/dbmf", "/api/ontology/overview"]
]);

const ONTOLOGY_PATHS = [
  "/api/ontology",
  "/api/decision",
  "/api/strategies",
  "/api/market",
  "/api/overview",
  "/api/graph",
  "/api/methodology",
  "/api/timeline",
  "/api/rankings",
  "/api/company",
  "/api/snapshot"
];

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const REQUEST_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "content-type",
  "if-none-match",
  "user-agent"
];

export function targetUrl(request) {
  const requestUrl = new URL(request.url, "https://thesisforge.tech");
  const path = request.query.path || "";
  requestUrl.searchParams.delete("path");
  const normalizedPath = String(path).startsWith("/")
    ? String(path)
    : `/${path}`;
  const targetPath = RETIRED_PATH_ALIASES.get(normalizedPath) || normalizedPath;
  const ontologyRequest = ONTOLOGY_PATHS.some((prefix) => (
    targetPath === prefix || targetPath.startsWith(`${prefix}/`)
  ));
  const target = new URL(
    targetPath,
    ontologyRequest ? ONTOLOGY_API_ORIGIN : LEGACY_AWS_ORIGIN
  );
  target.search = requestUrl.searchParams.toString();
  return target;
}

export function isPrivateInternalPath(value) {
  const pathname = value instanceof URL
    ? value.pathname
    : new URL(String(value || "/"), "https://thesisforge.tech").pathname;
  let normalized = pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  normalized = normalized.toLowerCase();
  return normalized === "/api/internal" || normalized.startsWith("/api/internal/");
}

export function forwardedHeaders(request) {
  const headers = {};
  for (const key of REQUEST_HEADERS) {
    const value = request.headers[key];
    if (value) headers[key] = value;
  }
  headers["x-forwarded-host"] = request.headers.host || "thesisforge.tech";
  headers["x-forwarded-proto"] = "https";
  return headers;
}

export function forwardedResponseHeaders(headers) {
  return Object.entries(headers).filter(([key]) => !HOP_BY_HOP_HEADERS.has(key.toLowerCase()));
}

function hasRequestBody(request) {
  return !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

function sendProxyError(response, code, error) {
  if (response.headersSent) {
    response.destroy(error);
    return;
  }
  for (const header of response.getHeaderNames()) response.removeHeader(header);
  const body = Buffer.from(JSON.stringify({ error: code, message: error.message }));
  response.statusCode = 502;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-length", body.length);
  response.end(body);
}

export default async function handler(request, response) {
  const target = targetUrl(request);
  // The production Elastic Beanstalk origin is currently HTTP-only. Internal
  // bearer credentials must never be forwarded across that public hop; release
  // automation reaches the same routes through loopback on the EB instance.
  if (isPrivateInternalPath(target)) {
    const body = Buffer.from(JSON.stringify({
      error: "not_found",
      message: "This endpoint is not available through the public API proxy."
    }));
    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-length", body.length);
    response.end(body);
    return;
  }
  const body = hasRequestBody(request)
    ? await new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks)));
        request.on("error", reject);
      })
    : undefined;
  const transport = target.protocol === "https:" ? https : http;

  await new Promise((resolve) => {
    let completed = false;
    const settle = () => {
      if (completed) return;
      completed = true;
      resolve();
    };
    const fail = (code, error) => {
      if (completed) return;
      sendProxyError(response, code, error);
      completed = true;
      resolve();
    };
    const upstreamRequest = transport.request(target, {
      method: request.method,
      headers: forwardedHeaders(request)
    }, (upstream) => {
      response.statusCode = upstream.statusCode || 502;
      for (const [key, value] of forwardedResponseHeaders(upstream.headers)) {
        if (value !== undefined) response.setHeader(key, value);
      }
      upstream.once("aborted", () => fail(
        "upstream_stream_failed",
        new Error("Upstream response ended before its declared body arrived")
      ));
      upstream.once("error", (error) => fail("upstream_stream_failed", error));
      upstream.pipe(response);
    });

    upstreamRequest.once("error", (error) => fail("upstream_unavailable", error));

    if (body?.length) upstreamRequest.end(body);
    else upstreamRequest.end();

    request.once?.("aborted", () => {
      if (completed) return;
      upstreamRequest.destroy();
      settle();
    });
    response.once?.("finish", settle);
    response.once?.("close", () => {
      if (!response.writableEnded) upstreamRequest.destroy();
      settle();
    });
  });
}
