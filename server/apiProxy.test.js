import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { gzipSync, gunzipSync } from "node:zlib";

process.env.AWS_API_ORIGIN = "https://legacy.example";
process.env.ONTOLOGY_API_ORIGIN = "https://ontology.example";

const {
  forwardedHeaders,
  forwardedResponseHeaders,
  targetUrl
} = await import(`../api/proxy.js?test=${Date.now()}`);

function request(path, search = "") {
  return {
    url: `https://thesisforge.tech${path}${search}`,
    query: { path }
  };
}

test("routes strategy catalog and detail requests to Ontology", () => {
  assert.equal(
    targetUrl(request("/api/strategies")).href,
    "https://ontology.example/api/strategies"
  );
  assert.equal(
    targetUrl(request("/api/strategies/integrated-ml-ontology", "?period=evaluation_2018_2026")).href,
    "https://ontology.example/api/strategies/integrated-ml-ontology?period=evaluation_2018_2026"
  );
});

test("keeps unrelated API requests on the legacy backend", () => {
  assert.equal(
    targetUrl(request("/api/gurus")).href,
    "https://legacy.example/api/gurus"
  );
});

test("rewrites the retired DBMF endpoint to Ontology", () => {
  assert.equal(
    targetUrl(request("/api/dbmf", "?refresh=1")).href,
    "https://ontology.example/api/ontology/overview?refresh=1"
  );
});

test("forwards compression negotiation and preserves end-to-end response headers", () => {
  const headers = forwardedHeaders({
    headers: {
      host: "thesisforge.tech",
      authorization: "Bearer token",
      "accept-encoding": "gzip, br"
    }
  });
  assert.equal(headers["accept-encoding"], "gzip, br");
  assert.equal(headers.authorization, "Bearer token");

  const conditionalHeaders = forwardedHeaders({
    headers: { "if-none-match": "W/\"payload-hash\"" }
  });
  assert.equal(conditionalHeaders["if-none-match"], "W/\"payload-hash\"");

  const responseHeaders = Object.fromEntries(forwardedResponseHeaders({
    connection: "keep-alive",
    "content-encoding": "gzip",
    "content-length": "123",
    "content-type": "application/json"
  }));
  assert.equal(responseHeaders.connection, undefined);
  assert.equal(responseHeaders["content-encoding"], "gzip");
  assert.equal(responseHeaders["content-length"], "123");
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("streams a compressed upstream response before it has fully arrived", async (context) => {
  const payload = Buffer.from(JSON.stringify({ rows: Array.from({ length: 1000 }, (_, index) => ({ index, value: "repeat-value" })) }));
  const compressed = gzipSync(payload);
  let receivedAcceptEncoding = "";
  const origin = await listen(http.createServer((incoming, outgoing) => {
    receivedAcceptEncoding = String(incoming.headers["accept-encoding"] || "");
    outgoing.statusCode = 200;
    outgoing.setHeader("content-type", "application/json");
    outgoing.setHeader("content-encoding", "gzip");
    outgoing.setHeader("content-length", compressed.length);
    const midpoint = Math.floor(compressed.length / 2);
    outgoing.write(compressed.subarray(0, midpoint));
    setTimeout(() => outgoing.end(compressed.subarray(midpoint)), 50);
  }));
  context.after(() => origin.close());

  const previousOrigin = process.env.AWS_API_ORIGIN;
  process.env.AWS_API_ORIGIN = `http://127.0.0.1:${origin.address().port}`;
  const { default: handler } = await import(`../api/proxy.js?stream=${Date.now()}`);
  if (previousOrigin === undefined) delete process.env.AWS_API_ORIGIN;
  else process.env.AWS_API_ORIGIN = previousOrigin;

  const proxy = await listen(http.createServer((incoming, outgoing) => {
    const url = new URL(incoming.url, "http://127.0.0.1");
    incoming.query = Object.fromEntries(url.searchParams.entries());
    handler(incoming, outgoing);
  }));
  context.after(() => proxy.close());

  const result = await new Promise((resolve, reject) => {
    const started = Date.now();
    const call = http.request({
      host: "127.0.0.1",
      port: proxy.address().port,
      path: "/proxy?path=/api/gurus",
      headers: { "accept-encoding": "gzip" }
    }, (response) => {
      const chunks = [];
      let firstChunkMs = null;
      response.on("data", (chunk) => {
        firstChunkMs ??= Date.now() - started;
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        body: Buffer.concat(chunks),
        encoding: response.headers["content-encoding"],
        firstChunkMs,
        endMs: Date.now() - started
      }));
    });
    call.on("error", reject);
    call.end();
  });

  assert.equal(receivedAcceptEncoding, "gzip");
  assert.equal(result.encoding, "gzip");
  assert.deepEqual(gunzipSync(result.body), payload);
  assert.ok(result.firstChunkMs < result.endMs - 20);
});

test("replaces unsent upstream representation headers when the stream fails", async (context) => {
  const origin = await listen(http.createServer((_incoming, outgoing) => {
    outgoing.statusCode = 200;
    outgoing.setHeader("content-type", "application/json");
    outgoing.setHeader("content-encoding", "gzip");
    outgoing.setHeader("content-length", "100");
    outgoing.setHeader("etag", "W/\"upstream-body\"");
    outgoing.flushHeaders();
    setImmediate(() => outgoing.destroy(new Error("synthetic upstream failure")));
  }));
  context.after(() => origin.close());

  const previousOrigin = process.env.AWS_API_ORIGIN;
  process.env.AWS_API_ORIGIN = `http://127.0.0.1:${origin.address().port}`;
  const { default: handler } = await import(`../api/proxy.js?failure=${Date.now()}`);
  if (previousOrigin === undefined) delete process.env.AWS_API_ORIGIN;
  else process.env.AWS_API_ORIGIN = previousOrigin;

  const proxy = await listen(http.createServer((incoming, outgoing) => {
    const url = new URL(incoming.url, "http://127.0.0.1");
    incoming.query = Object.fromEntries(url.searchParams.entries());
    handler(incoming, outgoing);
  }));
  context.after(() => proxy.close());

  const result = await new Promise((resolve, reject) => {
    http.get({
      host: "127.0.0.1",
      port: proxy.address().port,
      path: "/proxy?path=/api/gurus"
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    }).on("error", reject);
  });

  assert.equal(result.status, 502);
  assert.equal(result.headers["content-encoding"], undefined);
  assert.equal(result.headers.etag, undefined);
  assert.equal(Number(result.headers["content-length"]), result.body.length);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(JSON.parse(result.body.toString("utf8")).error, "upstream_stream_failed");
});
