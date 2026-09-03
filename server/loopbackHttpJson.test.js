import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { requestLoopbackJson } from "../scripts/loopback-http-json.mjs";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

test("loopback JSON client accepts headers delayed within its explicit overall timeout", async (context) => {
  const server = await listen(http.createServer((request, response) => {
    setTimeout(() => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ authorization: request.headers.authorization }));
    }, 50);
  }));
  context.after(() => server.close());

  const result = await requestLoopbackJson(
    new URL(`http://127.0.0.1:${server.address().port}/delayed-headers`),
    {
      headers: { authorization: "Bearer test-secret" },
      timeoutMs: 500
    }
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { authorization: "Bearer test-secret" });
});

test("loopback JSON client aborts delayed headers at the configured overall timeout", async (context) => {
  const server = await listen(http.createServer(() => {}));
  context.after(() => server.close());
  const startedAt = Date.now();

  await assert.rejects(
    requestLoopbackJson(
      new URL(`http://127.0.0.1:${server.address().port}/never-responds`),
      { timeoutMs: 40 }
    ),
    (error) => {
      assert.equal(error.code, "ETIMEDOUT");
      assert.match(error.message, /timed out after 40ms/);
      return true;
    }
  );
  assert.ok(Date.now() - startedAt < 1000);
});

test("loopback JSON client applies the overall timeout after headers arrive", async (context) => {
  const server = await listen(http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"partial":');
  }));
  context.after(() => server.close());

  await assert.rejects(
    requestLoopbackJson(
      new URL(`http://127.0.0.1:${server.address().port}/stalled-body`),
      { timeoutMs: 40 }
    ),
    (error) => {
      assert.equal(error.code, "ETIMEDOUT");
      assert.match(error.message, /timed out after 40ms/);
      return true;
    }
  );
});

test("loopback JSON client rejects non-loopback origins before opening a request", async () => {
  assert.throws(
    () => requestLoopbackJson("http://example.com/api/health", { timeoutMs: 100 }),
    /only to a loopback HTTP origin/
  );
});
