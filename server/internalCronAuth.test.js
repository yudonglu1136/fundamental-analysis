import assert from "node:assert/strict";
import test from "node:test";

import { isLoopbackRequest, requireLoopbackRequest } from "./internalCronAuth.js";

test("loopback release authorization trusts the socket, not forwarded headers", () => {
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
  assert.equal(isLoopbackRequest({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(isLoopbackRequest({
    socket: { remoteAddress: "203.0.113.9" },
    headers: { "x-forwarded-for": "127.0.0.1" }
  }), false);
});

test("non-loopback release calls fail closed even with forged proxy metadata", () => {
  let nextCalled = false;
  const response = {
    statusCode: 200,
    payload: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
    }
  };
  requireLoopbackRequest({
    socket: { remoteAddress: "198.51.100.8" },
    headers: { "x-forwarded-for": "127.0.0.1" }
  }, response, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.error, "not_found");
});
