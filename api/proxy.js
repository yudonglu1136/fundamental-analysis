const LEGACY_AWS_ORIGIN =
  process.env.AWS_API_ORIGIN ||
  "http://guru-analysis-api-prod-378477120101.us-east-1.elasticbeanstalk.com";
const ONTOLOGY_API_ORIGIN =
  process.env.ONTOLOGY_API_ORIGIN ||
  "https://api.thesisforge.tech";

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
  "content-encoding",
  "content-length",
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
  const ontologyRequest = ONTOLOGY_PATHS.some((prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
  const target = new URL(
    normalizedPath,
    ontologyRequest ? ONTOLOGY_API_ORIGIN : LEGACY_AWS_ORIGIN
  );
  target.search = requestUrl.searchParams.toString();
  return target;
}

function forwardedHeaders(request) {
  const headers = {};
  for (const key of REQUEST_HEADERS) {
    const value = request.headers[key];
    if (value) headers[key] = value;
  }
  headers["x-forwarded-host"] = request.headers.host || "thesisforge.tech";
  headers["x-forwarded-proto"] = "https";
  return headers;
}

function hasRequestBody(request) {
  return !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

export default async function handler(request, response) {
  const body = hasRequestBody(request)
    ? await new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks)));
        request.on("error", reject);
      })
    : undefined;
  const upstream = await fetch(targetUrl(request), {
    method: request.method,
    headers: forwardedHeaders(request),
    body
  });

  for (const [key, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      response.setHeader(key, value);
    }
  }

  const upstreamBody = Buffer.from(await upstream.arrayBuffer());
  response.status(upstream.status).send(upstreamBody);
}
