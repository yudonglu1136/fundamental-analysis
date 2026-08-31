import crypto from "node:crypto";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync
} from "node:zlib";

const compressionThreshold = Math.max(
  1024,
  Number(process.env.JSON_COMPRESSION_THRESHOLD_BYTES) || 16 * 1024
);
const cacheBudgetBytes = Math.max(
  1024 * 1024,
  Number(process.env.JSON_TRANSPORT_CACHE_BYTES) || 32 * 1024 * 1024
);

const encodedPayloads = new Map();
const payloadEtags = new WeakMap();
let encodedPayloadBytes = 0;

function etagFor(raw) {
  return `W/"${crypto.createHash("sha256").update(raw).digest("base64url")}"`;
}

function entryBytes(entry) {
  return (entry.raw?.length || 0) + (entry.gzip?.length || 0) + (entry.br?.length || 0);
}

function removeEntry(etag) {
  const entry = encodedPayloads.get(etag);
  if (!entry) return;
  encodedPayloadBytes -= entryBytes(entry);
  encodedPayloads.delete(etag);
}

function remember(entry) {
  removeEntry(entry.etag);
  encodedPayloads.set(entry.etag, entry);
  encodedPayloadBytes += entryBytes(entry);
  while (encodedPayloadBytes > cacheBudgetBytes && encodedPayloads.size > 1) {
    removeEntry(encodedPayloads.keys().next().value);
  }
  if (entryBytes(entry) > cacheBudgetBytes) removeEntry(entry.etag);
  return entry;
}

function touch(entry) {
  if (!encodedPayloads.has(entry.etag)) return;
  encodedPayloads.delete(entry.etag);
  encodedPayloads.set(entry.etag, entry);
}

function serialize(payload) {
  if (payload && typeof payload === "object") {
    const knownEtag = payloadEtags.get(payload);
    const known = knownEtag ? encodedPayloads.get(knownEtag) : null;
    if (known) {
      touch(known);
      return known;
    }
  }

  const raw = Buffer.from(JSON.stringify(payload));
  const etag = etagFor(raw);
  const cached = encodedPayloads.get(etag);
  if (cached) {
    if (payload && typeof payload === "object") payloadEtags.set(payload, etag);
    touch(cached);
    return cached;
  }

  const entry = { etag, raw, gzip: null, br: null };
  if (payload && typeof payload === "object") payloadEtags.set(payload, etag);
  if (raw.length >= compressionThreshold) remember(entry);
  return entry;
}

function qualityFor(acceptEncoding, name) {
  let wildcard = null;
  for (const part of String(acceptEncoding || "").toLowerCase().split(",")) {
    const [token, ...parameters] = part.trim().split(";");
    let quality = 1;
    for (const parameter of parameters) {
      const match = parameter.trim().match(/^q=(0(?:\.\d+)?|1(?:\.0+)?)$/);
      if (match) quality = Number(match[1]);
    }
    if (token === name) return quality;
    if (token === "*") wildcard = quality;
  }
  return wildcard ?? 0;
}

export function selectJsonEncoding(acceptEncoding, rawBytes) {
  if (rawBytes < compressionThreshold) return "identity";
  const brotliQuality = qualityFor(acceptEncoding, "br");
  const gzipQuality = qualityFor(acceptEncoding, "gzip");
  if (brotliQuality > 0 && brotliQuality >= gzipQuality) return "br";
  if (gzipQuality > 0) return "gzip";
  return "identity";
}

function encodedBody(entry, encoding) {
  if (encoding === "gzip" && !entry.gzip) {
    const before = entryBytes(entry);
    entry.gzip = gzipSync(entry.raw, { level: 6 });
    if (encodedPayloads.has(entry.etag)) {
      encodedPayloadBytes += entryBytes(entry) - before;
      remember(entry);
    }
  }
  if (encoding === "br" && !entry.br) {
    const before = entryBytes(entry);
    entry.br = brotliCompressSync(entry.raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4
      }
    });
    if (encodedPayloads.has(entry.etag)) {
      encodedPayloadBytes += entryBytes(entry) - before;
      remember(entry);
    }
  }
  return entry[encoding] || entry.raw;
}

function requestEtagMatches(request, etag) {
  const normalizedEtag = etag.replace(/^W\//, "");
  return String(request.headers["if-none-match"] || "")
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .some((value) => value === "*" || value === normalizedEtag);
}

export function sendJson(request, response, payload) {
  if (payload === undefined) {
    response.end();
    return response;
  }

  if (
    (response.statusCode >= 100 && response.statusCode < 200) ||
    [204, 205, 304].includes(response.statusCode)
  ) {
    response.removeHeader("Content-Type");
    response.removeHeader("Content-Length");
    response.removeHeader("Content-Encoding");
    response.end();
    return response;
  }

  const entry = serialize(payload);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("ETag", entry.etag);
  if (typeof response.vary === "function") response.vary("Accept-Encoding");
  else {
    const existing = String(response.getHeader("Vary") || "");
    const values = existing.split(",").map((value) => value.trim()).filter(Boolean);
    if (!values.some((value) => value.toLowerCase() === "accept-encoding")) {
      values.push("Accept-Encoding");
    }
    response.setHeader("Vary", values.join(", "));
  }

  if (
    response.statusCode >= 200 &&
    response.statusCode < 300 &&
    ["GET", "HEAD"].includes(request.method) &&
    requestEtagMatches(request, entry.etag)
  ) {
    response.removeHeader("Content-Length");
    response.removeHeader("Content-Encoding");
    response.statusCode = 304;
    response.end();
    return response;
  }

  const encoding = selectJsonEncoding(request.headers["accept-encoding"], entry.raw.length);
  const body = encodedBody(entry, encoding);
  if (encoding === "identity") response.removeHeader("Content-Encoding");
  else response.setHeader("Content-Encoding", encoding);
  response.setHeader("Content-Length", body.length);
  if (request.method === "HEAD") response.end();
  else response.end(body);
  return response;
}

export function installJsonTransport(app) {
  app.use((request, response, next) => {
    response.json = (payload) => sendJson(request, response, payload);
    next();
  });
}

export function jsonTransportStats() {
  return {
    entries: encodedPayloads.size,
    bytes: encodedPayloadBytes,
    budgetBytes: cacheBudgetBytes,
    thresholdBytes: compressionThreshold
  };
}
