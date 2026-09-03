import http from "node:http";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "::1"]);
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function loopbackHttpUrl(value) {
  const url = value instanceof URL ? new URL(value.href) : new URL(value);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Loopback JSON requests may connect only to a loopback HTTP origin.");
  }
  if (url.username || url.password) {
    throw new Error("Loopback JSON request URLs must not contain credentials.");
  }
  return url;
}

function requestTimeoutError(url, timeoutMs) {
  const error = new Error(
    `Loopback HTTP ${url.pathname}${url.search} timed out after ${timeoutMs}ms.`
  );
  error.code = "ETIMEDOUT";
  return error;
}

export function requestLoopbackJson(value, {
  method = "GET",
  headers = {},
  body,
  timeoutMs,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
} = {}) {
  const url = loopbackHttpUrl(value);
  const overallTimeoutMs = positiveInteger(timeoutMs, "Loopback JSON timeoutMs");
  const responseLimit = positiveInteger(maxResponseBytes, "Loopback JSON maxResponseBytes");
  const requestMethod = String(method || "GET").trim().toUpperCase();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const fail = (error) => finish(reject, error);

    const request = http.request(url, {
      agent: false,
      method: requestMethod,
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        ...headers
      }
    }, (response) => {
      const chunks = [];
      let byteLength = 0;
      response.on("data", (chunk) => {
        byteLength += chunk.length;
        if (byteLength > responseLimit) {
          const error = new Error(
            `Loopback HTTP ${url.pathname}${url.search} exceeded the ${responseLimit}-byte response limit.`
          );
          error.code = "ERR_RESPONSE_TOO_LARGE";
          fail(error);
          response.destroy(error);
          request.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.once("aborted", () => {
        const error = new Error(
          `Loopback HTTP ${url.pathname}${url.search} closed before the response completed.`
        );
        error.code = "ECONNRESET";
        fail(error);
      });
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        const rawBody = Buffer.concat(chunks).toString("utf8");
        let body = {};
        if (rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch (cause) {
            const error = new Error(
              `Loopback HTTP ${url.pathname}${url.search} returned invalid JSON (HTTP ${response.statusCode || 0}).`,
              { cause }
            );
            error.code = "ERR_INVALID_JSON_RESPONSE";
            fail(error);
            return;
          }
        }
        const status = Number(response.statusCode || 0);
        finish(resolve, {
          body,
          headers: response.headers,
          ok: status >= 200 && status < 300,
          status
        });
      });
    });

    request.once("error", fail);
    timer = setTimeout(() => {
      const error = requestTimeoutError(url, overallTimeoutMs);
      fail(error);
      request.destroy(error);
    }, overallTimeoutMs);
    timer.unref?.();
    request.end(body);
  });
}
