import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import express from "express";

import {
  installJsonTransport,
  jsonTransportStats,
  selectJsonEncoding
} from "./jsonTransport.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, headers = {}, path = "/payload") {
  return new Promise((resolve, reject) => {
    const call = http.request({
      host: "127.0.0.1",
      port: server.address().port,
      path,
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    call.on("error", reject);
    call.end();
  });
}

test("negotiates supported JSON encodings", () => {
  assert.equal(selectJsonEncoding("gzip, br", 100_000), "br");
  assert.equal(selectJsonEncoding("br;q=0, gzip;q=0.8", 100_000), "gzip");
  assert.equal(selectJsonEncoding("identity", 100_000), "identity");
  assert.equal(selectJsonEncoding("gzip, br", 100), "identity");
});

test("compresses large JSON, preserves semantics, and supports conditional GET", async (context) => {
  const payload = {
    generatedAt: "2026-08-30T00:00:00.000Z",
    rows: Array.from({ length: 5000 }, (_, index) => ({
      ticker: `T${index % 50}`,
      state: index % 2 ? "improving" : "surging",
      value: index
    }))
  };
  const app = express();
  installJsonTransport(app);
  app.get("/payload", (_request, response) => response.json(payload));
  const server = await listen(app);
  context.after(() => server.close());

  const identity = await request(server, { "accept-encoding": "identity" });
  const compressed = await request(server, { "accept-encoding": "gzip" });

  assert.equal(identity.status, 200);
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers["content-encoding"], "gzip");
  assert.match(compressed.headers.vary, /Accept-Encoding/i);
  assert.deepEqual(
    JSON.parse(gunzipSync(compressed.body).toString("utf8")),
    JSON.parse(identity.body.toString("utf8"))
  );
  assert.ok(compressed.body.length <= identity.body.length * 0.25);

  const conditional = await request(server, {
    "accept-encoding": "gzip",
    "if-none-match": compressed.headers.etag
  });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body.length, 0);
  assert.equal(conditional.headers.etag, compressed.headers.etag);
  assert.ok(jsonTransportStats().bytes <= jsonTransportStats().budgetBytes);
});

test("conditional requests preserve error status and no-content responses stay bodyless", async (context) => {
  const app = express();
  installJsonTransport(app);
  app.get("/missing", (_request, response) => response.status(404).json({ error: "missing" }));
  app.get("/empty", (_request, response) => response.status(204).json({ ignored: true }));
  const server = await listen(app);
  context.after(() => server.close());

  const missing = await request(server, { "accept-encoding": "gzip" }, "/missing");
  assert.equal(missing.status, 404);
  assert.ok(missing.headers.etag);
  const missingConditional = await request(server, {
    "accept-encoding": "gzip",
    "if-none-match": missing.headers.etag
  }, "/missing");
  assert.equal(missingConditional.status, 404);
  assert.deepEqual(JSON.parse(missingConditional.body.toString("utf8")), { error: "missing" });

  const empty = await request(server, { "accept-encoding": "gzip" }, "/empty");
  assert.equal(empty.status, 204);
  assert.equal(empty.body.length, 0);
  assert.equal(empty.headers["content-encoding"], undefined);
  assert.equal(empty.headers["content-length"], undefined);
});
