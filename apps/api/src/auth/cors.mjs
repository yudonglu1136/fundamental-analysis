const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
].join(",");

function allowedOrigins() {
  return new Set(
    String(process.env.API_ALLOWED_ORIGINS ?? defaultAllowedOrigins)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isCorsOriginAllowed(request) {
  const origin = request.headers.origin;
  return !origin || allowedOrigins().has(origin);
}

export function corsHeaders(request) {
  const origin = request.headers.origin;
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}
