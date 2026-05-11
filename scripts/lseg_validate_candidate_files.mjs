#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const candidateRoot = path.join(repoRoot, "src", "stocks", "lseg", "data", "candidates");
const mappingRoot = path.join(repoRoot, "data", "local", "lseg", "transcripts", "mapping");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function extractJsonArray(tsPath) {
  const text = fs.readFileSync(tsPath, "utf8");
  const match = text.match(/=\s*(\[[\s\S]*\])\s*;\s*$/);
  if (!match) {
    throw new Error(`Could not locate JSON array in ${tsPath}`);
  }
  return JSON.parse(match[1]);
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

const guidance = extractJsonArray(path.join(candidateRoot, "guidanceCandidates.ts"));
const forecast = extractJsonArray(path.join(candidateRoot, "forecastAnchorCandidates.ts"));
const monitoring = extractJsonArray(path.join(candidateRoot, "monitoringKpiCandidates.ts"));
const risk = extractJsonArray(path.join(candidateRoot, "riskRegisterCandidates.ts"));
const capital = extractJsonArray(path.join(candidateRoot, "capitalAllocationCandidates.ts"));
const thesis = extractJsonArray(path.join(candidateRoot, "thesisSignalCandidates.ts"));

const all = [
  ["guidanceCandidates", guidance],
  ["forecastAnchorCandidates", forecast],
  ["monitoringKpiCandidates", monitoring],
  ["riskRegisterCandidates", risk],
  ["capitalAllocationCandidates", capital],
  ["thesisSignalCandidates", thesis],
];

for (const [name, rows] of all) {
  const seenIds = new Set();
  for (const row of rows) {
    assertTrue(row.candidateOnly === true, `${name}: candidateOnly must be true for ${row.id}`);
    assertTrue(row.needsHumanReview === true, `${name}: needsHumanReview must be true for ${row.id}`);
    assertTrue(row.modelReady === false, `${name}: modelReady must be false for ${row.id}`);
    assertTrue(row.valuationImpactAllowed === false, `${name}: valuationImpactAllowed must be false for ${row.id}`);
    assertTrue(Boolean(row.transcriptId), `${name}: transcriptId missing for ${row.id}`);
    assertTrue(Boolean(row.supportingQuoteShort), `${name}: supportingQuoteShort missing for ${row.id}`);
    assertTrue(!seenIds.has(row.id), `${name}: duplicate candidate id ${row.id}`);
    seenIds.add(row.id);
  }
}

for (const row of guidance) {
  assertTrue(row.suggestedTargetFile === "guidance.ts", `guidanceCandidates: unexpected target ${row.suggestedTargetFile}`);
  const lower = (row.guidanceCategory || "").toLowerCase();
  assertTrue(!lower.includes("dividend") && !lower.includes("buyback"), `guidanceCandidates: capital allocation item leaked into guidance ${row.id}`);
}

for (const row of forecast) {
  assertTrue(row.requiresAnalystConversion === true, `forecastAnchorCandidates: requiresAnalystConversion must be true for ${row.id}`);
  assertTrue(row.directModelInput === false, `forecastAnchorCandidates: directModelInput must be false for ${row.id}`);
}

const guidanceMapping = readJson(path.join(mappingRoot, "draft_guidance_mapping.json"));
const kpiMapping = readJson(path.join(mappingRoot, "draft_kpi_monitoring_mapping.json"));
const riskMapping = readJson(path.join(mappingRoot, "draft_risk_register_mapping.json"));
const capitalMapping = readJson(path.join(mappingRoot, "draft_capital_allocation_mapping.json"));
const thesisMapping = readJson(path.join(mappingRoot, "draft_thesis_signal_mapping.json"));

const expectedGuidance = guidanceMapping.acceptedDraftMappings.filter((row) => row.mappingStatus === "accepted_candidate" && row.suggestedTargetFile === "guidance.ts").length;
const expectedForecast = guidanceMapping.acceptedDraftMappings.filter((row) => row.mappingStatus === "accepted_candidate" && row.suggestedTargetFile === "forecastAnchors.ts").length;
const expectedMonitoring = kpiMapping.items.length
  + guidanceMapping.rejectedOrDeferred.filter((row) => row.mappingStatus === "moved_to_kpi_monitoring").length
  + capitalMapping.items.filter((row) => row.mappingStatus === "moved_to_kpi_monitoring").length;
const expectedRisk = riskMapping.items.length;
const expectedCapital = capitalMapping.items.filter((row) => row.mappingStatus !== "moved_to_kpi_monitoring").length;
const expectedThesis = thesisMapping.items.length;

assertTrue(guidance.length === expectedGuidance, `guidanceCandidates count mismatch: expected ${expectedGuidance}, got ${guidance.length}`);
assertTrue(forecast.length === expectedForecast, `forecastAnchorCandidates count mismatch: expected ${expectedForecast}, got ${forecast.length}`);
assertTrue(monitoring.length === expectedMonitoring, `monitoringKpiCandidates count mismatch: expected ${expectedMonitoring}, got ${monitoring.length}`);
assertTrue(risk.length === expectedRisk, `riskRegisterCandidates count mismatch: expected ${expectedRisk}, got ${risk.length}`);
assertTrue(capital.length === expectedCapital, `capitalAllocationCandidates count mismatch: expected ${expectedCapital}, got ${capital.length}`);
assertTrue(thesis.length === expectedThesis, `thesisSignalCandidates count mismatch: expected ${expectedThesis}, got ${thesis.length}`);

const summary = {
  validatedAt: new Date().toISOString(),
  counts: {
    guidanceCandidates: guidance.length,
    forecastAnchorCandidates: forecast.length,
    monitoringKpiCandidates: monitoring.length,
    riskRegisterCandidates: risk.length,
    capitalAllocationCandidates: capital.length,
    thesisSignalCandidates: thesis.length,
  },
  status: "passed",
};
console.log(JSON.stringify(summary, null, 2));
