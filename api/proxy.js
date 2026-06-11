const AWS_ORIGIN =
  "http://guru-analysis-api-prod-378477120101.us-east-1.elasticbeanstalk.com";

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

function targetUrl(request) {
  const requestUrl = new URL(request.url, "https://thesisforge.tech");
  const path = request.query.path || "";
  requestUrl.searchParams.delete("path");
  const normalizedPath = String(path).startsWith("/")
    ? String(path)
    : `/${path}`;
  const target = new URL(normalizedPath, AWS_ORIGIN);
  target.search = requestUrl.searchParams.toString();
  return target;
}

export default async function handler(request, response) {
  const upstream = await fetch(targetUrl(request), {
    method: request.method,
    headers: {
      accept: request.headers.accept || "*/*",
      "user-agent": request.headers["user-agent"] || "vercel-proxy"
    }
  });

  for (const [key, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      response.setHeader(key, value);
    }
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  response.status(upstream.status).send(body);
}
