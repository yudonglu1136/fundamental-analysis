import test from "node:test";
import assert from "node:assert/strict";

test("net-income/share never borrows normalized FFO/share even with the same original paragraph", () => {
  const evidence = "Last night, we updated our previously issued full year 2023 outlook for net income attributable to common stockholders to a range of $0.73-$0.84 per diluted share, and normalized FFO of $3.48-$3.59 per diluted share, or $3.535 at the midpoint.";
  assert.equal(independentPerShareEvidence({ evidence, value: 0.785, unit: "currency_per_share", currency: "USD" }), null);
  assert.ok(independentPerShareEvidence({ evidence, value: 3.535, unit: "currency_per_share", currency: "USD" }));
  assert.ok(independentPerShareEvidence({ evidence: "We expect net income to improve, with normalized FFO of $3.48-$3.59 per diluted share.", value: 3.535, unit: "currency_per_share", currency: "USD" }));
});

test("separated net-income/share is EPS but operating-income/share and total millions are not", () => {
  for (const [evidence, value] of [
    ["For Q2 we expect net income to range from $1.20 to $1.35 per share.", 1.275],
    ["For Q3 we expect non-GAAP net income for diluted share in a range of $1 to $1.04.", 1.02],
    ["For the full year we expect net income in the range of $1.18-$1.22 per diluted share.", 1.2],
  ]) assert.equal(independentPerShareEvidence({ evidence, value, unit: "currency_per_share", currency: "USD" }), null);
  for (const evidence of [
    "For the full year we expect operating income of $5.10-$5.40 per share.",
    "For the full year we expect operating earnings of $5.10-$5.40 per share.",
    "For Q2 we expect net income of $5 million and dividends of $0.25 per share.",
    "For Q2 we expect net income of $5 million based on 100 million shares.",
  ]) assert.ok(independentPerShareEvidence({ evidence, value: 5, unit: "currency_per_share", currency: "USD" }));
});

test("pre-owner full-year ranges and explicitly new EPS ranges retain their correct level", () => {
  for (const [evidence, value] of [
    ["We maintain our guidance range of $3.70-$3.80 for full-year adjusted EPS, despite the impact of delayed development deals.", 3.75],
    ["We reaffirm guidance for 2022 at $1.36-$1.38 for non-GAAP EPS.", 1.37],
    ["Full year non-GAAP EPS guidance is being raised $0.12 on the bottom end to $12.27-$12.35.", 12.31],
    ["We raise full year diluted EPS guidance from our prior range of $11.70-$11.90, to a new range of $11.85-$11.95.", 11.9],
    ["We are increasing EPS by $0.15 to a new range of $8.70-$8.80.", 8.75],
  ]) {
    assert.equal(independentPerShareEvidence({ evidence, value, unit: "currency_per_share", currency: "USD" }), null, evidence);
    assert.ok(independentPerShareEvidence({ evidence, value: 0.12, unit: "currency_per_share", currency: "USD" }), evidence);
  }
});
import { independentPerShareEvidence, resolveIndependentPerShareOwner } from "./guidancePerShareEvidenceAudit.js";

test("split adjustment alone is not non-GAAP adjusted earnings basis", () => {
  const evidence = "Split-adjusted fiscal 2018 EPS of $1.43 to $1.48 includes an expected tax impact of $0.03.";
  assert.equal(independentPerShareEvidence({ evidence, value: 1.455, unit: "currency_per_share", currency: "USD", basis: "unspecified" }), null);
  assert.ok(independentPerShareEvidence({ evidence, value: 1.455, unit: "currency_per_share", currency: "USD", basis: "adjusted" }));
  assert.ok(independentPerShareEvidence({ evidence, value: 0.03, unit: "currency_per_share", currency: "USD" }));
});

test("explicit guidance midpoint reference is the EPS target rather than the old actual comparator", () => {
  for (const [evidence, value, actual] of [
    ["The difference between the Company's full year 2018 EPS of $1.77 and the midpoint of the full year 2019 guidance range of $1.93 is due primarily to lower expected property sale gains.", 1.93, 1.77],
    ["The difference between the fourth quarter 2018 EPS of $0.31 and the first quarter 2019 guidance midpoint of $0.27 is due primarily to the items described below.", 0.27, 0.31],
  ]) {
    const args = { evidence, value, unit: "currency_per_share", currency: "USD" };
    assert.equal(independentPerShareEvidence(args), null);
    assert.ok(independentPerShareEvidence({ ...args, value: actual }));
  }
});

test("EPS legal range and revision connectors reconstruct the absolute target", () => {
  for (const [evidence, value, wrong] of [
    ["We are raising full-year adjusted earnings per share guidance by $0.10 to between $10.71 and $10.91.", 10.81, 0.10],
    ["For 2025 we expect earnings per share to be in the range of $4.85 and $5.05.", 4.95, 4.85],
    ["Our core EPS guidance for 2016 is lowered by $2.05 a share to now be between $6.10 and $6.30.", 6.20, 2.05],
    ["Core earnings per share guidance for 2015 has increased $0.25 to now be between $7.95-$8.15 a share.", 8.05, 0.25],
    ["For the full year 2026 we anticipate $10-$10.30 in adjusted earnings per share.", 10.15, 10],
  ]) {
    const args = { evidence, value, unit: "currency_per_share", currency: "USD" };
    assert.equal(independentPerShareEvidence(args), null, evidence);
    assert.ok(independentPerShareEvidence({ ...args, value: wrong }), evidence);
  }
  assert.ok(independentPerShareEvidence({ evidence: "For 2026 we discussed EPS of $4.85 and $5.05 without defining a range.",
    value: 4.95, unit: "currency_per_share", currency: "USD" }));
});

// Original transcript excerpt, ABT sourceId004380f026b63d7c9153b630.
const abtAnnualAndQuarterEvidence = "For the full year, we now forecast ongoing EPS of $5.17-$5.23, which is comprised of our year-to-date results through September, plus ongoing EPS guidance of $0.86-$0.92 for the fourth quarter.";
test("ABT quarter EPS independently resolves to the second original occurrence", () => {
  const args = { evidence: abtAnnualAndQuarterEvidence, value: 0.89, unit: "currency_per_share", currency: "USD" };
  const result = resolveIndependentPerShareOwner(args);
  assert.equal(result.status, "ready");
  assert.equal(result.owner.metricIndex, abtAnnualAndQuarterEvidence.lastIndexOf("EPS"));
  const quotedRange = abtAnnualAndQuarterEvidence.slice(result.owner.valueStartIndex, result.owner.valueEndIndex);
  assert.match(quotedRange, /\$0\.86-\$0\.92/);
  const annual = resolveIndependentPerShareOwner({ ...args, value: 5.20 });
  assert.equal(annual.owner.metricIndex, abtAnnualAndQuarterEvidence.indexOf("EPS"));
  for (const value of [0.86, 0.92, 5.17, 5.23, 99]) {
    assert.equal(resolveIndependentPerShareOwner({ ...args, value }).reason, "guidance_per_share_value_mismatch");
  }
});

test("owner resolution ignores forged producer positions, selected values and stored scope", () => {
  const args = { evidence: abtAnnualAndQuarterEvidence, value: 0.89, unit: "currency_per_share", currency: "USD" };
  assert.deepEqual(resolveIndependentPerShareOwner({
    ...args, metric_position: 0, selected_values: [{ value: 99 }], guidance_scope: "full_year"
  }), resolveIndependentPerShareOwner(args));
});

test("equal EPS at different occurrences stays ambiguous even when stored scope points to one", () => {
  const evidence = "For the full year, we expect EPS of $1.00-$1.20; for Q4, we expect EPS of $1.00-$1.20.";
  for (const guidance_scope of ["quarter", "full_year", undefined]) {
    const result = resolveIndependentPerShareOwner({
      evidence, value: 1.1, unit: "currency_per_share", currency: "USD", guidance_scope
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "guidance_per_share_owner_ambiguous");
    assert.equal(result.candidates.length, 2);
  }
});

test("owner evidence keeps unit, GAAP basis and explicit currency checks", () => {
  const args = { evidence: "FY2026 adjusted EPS is MXN 6.00 to MXN 8.00.", value: 7, unit: "currency_per_share", basis: "adjusted", currency: "MXN" };
  assert.equal(resolveIndependentPerShareOwner(args).status, "ready");
  assert.equal(resolveIndependentPerShareOwner({ ...args, currency: "USD" }).reason, "guidance_source_currency_mismatch");
  assert.equal(resolveIndependentPerShareOwner({ ...args, basis: "gaap" }).reason, "guidance_per_share_value_mismatch");
  assert.equal(resolveIndependentPerShareOwner({ ...args, unit: "MXN millions" }).reason, "guidance_per_share_unit_invalid");
});

const evidence = "Full Year 2026 Guidance. GAAP diluted earnings per share in a range of $5.29 to $6.09 and adjusted diluted earnings per share in a range of $10.20 to $11.00.";
test("a range immediately before EPS owns both endpoints, not the later FX delta", () => {
  const evidence = "We expect to deliver between $5.90 and $6.04 of earnings per share in FY 2026. That is a $0.04 increase due to currency.";
  assert.equal(independentPerShareEvidence({ evidence, value: 5.97, unit: "currency_per_share", currency: "USD" }), null);
  for (const value of [0.04, 5.90, 6.04]) assert.equal(independentPerShareEvidence({ evidence, value, unit: "currency_per_share", currency: "USD" }).reason, "guidance_per_share_value_mismatch");
});
test("EPS raise-by revision cannot replace or split the revised target range", () => {
  const evidence = "We are raising our full-year adjusted EPS guidance by $0.33 to $7.66-$7.76.";
  assert.equal(independentPerShareEvidence({ evidence, value: 7.71, unit: "currency_per_share", basis: "adjusted", currency: "USD" }), null);
  for (const value of [0.33, 7.66, 3.995]) assert.equal(independentPerShareEvidence({ evidence, value, unit: "currency_per_share", basis: "adjusted", currency: "USD" }).reason, "guidance_per_share_value_mismatch");
});
test("a preceding revenue range or non-range cannot masquerade as EPS", () => {
  for (const evidence of ["Revenue is $5.90 to $6.04 billion; adjusted EPS is $1.00 to $1.20.", "Revenue is $5.90 billion and $6.04 million is our tax expense; adjusted EPS is $1.00 to $1.20.", "We discussed $5.90 and $6.04 of EPS without defining a range."]) {
    assert.notEqual(independentPerShareEvidence({ evidence, value: 5.97, unit: "currency_per_share", currency: "USD" }), null);
  }
});
test("cents per share are independently normalized once", () => {
  const evidence = "For the full year 2026, management expects adjusted EPS of approximately 60 cents per share.";
  assert.equal(independentPerShareEvidence({ evidence, value: 0.6, unit: "currency_per_share", basis: "adjusted", currency: "USD" }), null);
  assert.equal(independentPerShareEvidence({ evidence, value: 60, unit: "currency_per_share", basis: "adjusted", currency: "USD" }).reason, "guidance_per_share_value_mismatch");
});
test("EPS independently reconstructs separate GAAP and adjusted per-share ranges", () => {
  assert.equal(independentPerShareEvidence({ evidence, value: 5.69, unit: "currency_per_share", basis: "gaap", currency: "USD" }), null);
  assert.equal(independentPerShareEvidence({ evidence, value: 10.60, unit: "currency_per_share", basis: "adjusted", currency: "USD" }), null);
  assert.equal(independentPerShareEvidence({ evidence, value: 10.60, unit: "currency_per_share", basis: "gaap", currency: "USD" }).reason, "guidance_per_share_value_mismatch");
});
test("EPS cannot masquerade as millions or use a nearby share count", () => {
  assert.equal(independentPerShareEvidence({ evidence, value: 5.69, unit: "USD millions", basis: "gaap", currency: "USD" }).reason, "guidance_per_share_unit_invalid");
  const text = "For Q1, non-GAAP diluted EPS is expected between $1.40 and $1.42 with approximately 304 million shares outstanding.";
  assert.equal(independentPerShareEvidence({ evidence: text, value: 304, unit: "currency_per_share", basis: "adjusted", currency: "USD" }).reason, "guidance_per_share_value_mismatch");
});
test("EPS source currency is independently checked when explicit", () => {
  assert.equal(independentPerShareEvidence({ evidence: "FY2026 EPS guidance MXN 6.00 to MXN 8.00.", value: 7, unit: "currency_per_share", currency: "USD" }).reason, "guidance_source_currency_mismatch");
});
