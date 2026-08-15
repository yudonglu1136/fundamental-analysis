import assert from "node:assert/strict";
import test from "node:test";

process.env.AWS_API_ORIGIN = "https://legacy.example";
process.env.ONTOLOGY_API_ORIGIN = "https://ontology.example";

const { targetUrl } = await import(`./proxy.js?test=${Date.now()}`);

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
