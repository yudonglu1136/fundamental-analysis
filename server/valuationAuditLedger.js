import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { buildValuationQaReport } from "./valuationQaReport.js";
import { inspectUnmodeledFinancialPeriods } from "./valuationCoverageAudit.js";
import { inspectValuationTemporalContinuity } from "./valuationTemporalAudit.js";

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "server/data/guru-analysis.sqlite");
const JSON_PATH = process.env.VALUATION_AUDIT_LEDGER_JSON ||
  path.join(process.cwd(), "server/reports/valuation-audit-ledger.json");
const MARKDOWN_PATH = process.env.VALUATION_AUDIT_LEDGER_MARKDOWN ||
  path.join(process.cwd(), "server/reports/valuation-audit-ledger.md");

const EXPECTED_PROFILE = new Map([
  ["CIEN", "optical_networking_turnaround"],
  ["COHR", "optical_networking_turnaround"],
  ["CPAY", "payments_processor"],
  ["FI", "payments_processor"],
  ["FIS", "payments_processor"],
  ["FISV", "payments_processor"],
  ["GPN", "payments_processor"],
  ["MA", "payments_network"],
  ["PYPL", "payments_processor"],
  ["V", "payments_network"],
  ["XYZ", "payments_processor"]
]);

const CUSTOMER_CASH_EXCLUSION_PROFILES = new Set([
  "asset_manager",
  "insurance_broker",
  "managed_care",
  "payments_processor"
]);

const REVENUE_GUIDANCE_ROUTES = new Set(["operating_company", "multi_method_growth", "revenue_stage"]);
const OPERATING_GUIDANCE_ROUTES = new Set(["operating_company", "multi_method_growth"]);

const RESOLVED_ISSUES = [
  {
    id: "VAL-001",
    severity: "P0",
    status: "fixed",
    title: "Guidance crossed the next financial-release boundary",
    scope: "DG, FERG, FDX and GPN; 21 guidance metrics across five prior PIT nodes",
    resolution: "Each node now receives only guidance observed before the next distinct financial release; the final node may retain all later same-period evidence."
  },
  {
    id: "VAL-002",
    severity: "P0",
    status: "fixed",
    title: "Share-count changes were mistaken for stock splits",
    scope: "92 tickers, 143 material share jumps and 1,614 historical valuation nodes",
    resolution: "Removed inferred retrospective split factors. Every node uses its own event-visible quoted-security share count."
  },
  {
    id: "VAL-003",
    severity: "P0",
    status: "fixed",
    title: "DGE.L ADR share factor was applied to London ordinary shares",
    scope: "27 historical DGE.L nodes",
    resolution: "The paid ADR factor is retained for lineage but not applied to DGE.L ordinary-share valuation or London price comparison."
  },
  {
    id: "VAL-004",
    severity: "P1",
    status: "fixed",
    title: "Fiscal-calendar transition periods looked like duplicate or inverted quarters",
    scope: "GPN and MOS transition histories",
    resolution: "Official SEC-supported transition windows are recorded and preserved in filing-date order."
  },
  {
    id: "VAL-005",
    severity: "P0",
    status: "fixed",
    title: "Payment processors were valued as card networks or generic software",
    scope: "CPAY, FI/FISV, FIS, GPN, PYPL and XYZ",
    resolution: "Introduced a through-cycle payment-processor EPS profile and excluded customer funds from FCFE valuation."
  },
  {
    id: "VAL-006",
    severity: "P0",
    status: "fixed",
    title: "Managed-care policyholder cash flows entered operating-company DCF",
    scope: "All managed_care issuers, including CNC and UNH",
    resolution: "Managed care now uses point-in-time current/cycle EPS with policyholder cash-flow exclusion instead of FCFE DCF."
  },
  {
    id: "VAL-007",
    severity: "P1",
    status: "fixed",
    title: "Optical-networking issuers used a generic hardware profile",
    scope: "CIEN and COHR",
    resolution: "Both issuers now use the optical-networking turnaround profile used for AAOI and LITE."
  },
  {
    id: "VAL-008",
    severity: "P0",
    status: "fixed",
    title: "Unpriced optionality premiums were multiplied into base fair value",
    scope: "Hypergrowth AI, genetic diagnostics, space-platform and EV/autonomy histories",
    resolution: "Base fair value no longer receives a blanket 1.04x-1.55x uplift. The multiplier is retained only as a disclosed bull-case scenario input."
  },
  {
    id: "VAL-009",
    severity: "P1",
    status: "fixed",
    title: "Hypergrowth base-case multiple ceilings allowed speculative outputs",
    scope: "Hypergrowth AI software profile",
    resolution: "Base-case EV/sales is capped at 40x, P/E at 72x and FCF yield floored at 2.5%; extreme option value belongs in scenarios, not base fair value."
  },
  {
    id: "VAL-010",
    severity: "P0",
    status: "fixed",
    title: "AZN USD financials were converted with a cross-listing price ratio",
    scope: "All 134 AZN ARQ/ART source rows used by 67 historical valuation nodes",
    resolution: "Financials now retain USD source lineage and are converted to the GBP model currency with the nearest prior official ECB reference rate. Cross-listing prices and fixed 0.75 fallbacks are rejected by the release verifier."
  },
  {
    id: "VAL-011",
    severity: "P1",
    status: "fixed",
    title: "LSEG full-year equity FCF guidance was stored as unscoped",
    scope: "LSEG H1 2026 official issuer guidance",
    resolution: "The issuer override now carries structured full-year scope and year lineage. The model records the at-least GBP 2.7 billion guide as explicit_full_year instead of an unscoped fallback."
  },
  {
    id: "VAL-012",
    severity: "P1",
    status: "fixed",
    title: "Prepared remarks and procedural handoffs were misclassified as analyst Q&A",
    scope: "All transcript-backed valuation periods",
    resolution: "Questions must occur after a detected Q&A boundary and must contain a complete analyst question plus a substantive management response. Audio checks, handoffs and stale parsed rows are rejected."
  },
  {
    id: "VAL-013",
    severity: "P0",
    status: "fixed",
    title: "Bilingual enrichment could silently fall back to an unaudited online translation",
    scope: "All stored valuation transcript Q&A",
    resolution: "Chinese translation is now opt-in and cache-only. Publication fails when any locally generated Qwen 4B translation is missing or fails numeric-placeholder validation."
  },
  {
    id: "VAL-014",
    severity: "P0",
    status: "fixed",
    title: "Unscoped monetary guidance could replace annual valuation inputs",
    scope: "Historical revenue, operating-income and free-cash-flow guidance",
    resolution: "Only explicitly annual operating-income and FCF amounts can enter the model. Unscoped annual-scale revenue remains research evidence; quarter-scale revenue may only enter through bounded annualization and a disclosed blend with the formula forecast."
  },
  {
    id: "VAL-015",
    severity: "P1",
    status: "fixed",
    title: "Near-zero EV-to-equity residuals created false-precision fair values",
    scope: "Highly leveraged loss-making periods, with a stricter 20% residual floor for optical-networking turnarounds",
    resolution: "The EV/sales component is excluded when the surviving post-debt equity residual is below the audited profile floor (20% for optical-networking turnarounds; 1% general floor). If no independent earnings or FCFE method remains, the period is explicitly unmodeled instead of publishing false precision."
  },
  {
    id: "VAL-016",
    severity: "P0",
    status: "fixed",
    title: "Scoped management guidance was stored but silently ignored by mature-company models",
    scope: "All operating-company PIT nodes, including LSEG annual equity FCF guidance",
    resolution: "Operating, growth, and revenue-stage routes now evaluate explicit annual guidance at every node. Plausible guidance enters the applicable revenue, margin, or FCFE input; rejected guidance retains its reported amount and a machine-audited rejection reason."
  },
  {
    id: "VAL-017",
    severity: "P0",
    status: "fixed",
    title: "London market prices were divided by 100 after already being stored in GBP",
    scope: "All post-2018 AZN, BA.L, DGE.L, and LSEG historical price-comparison nodes",
    resolution: "Valuation imports now consume price_points exactly in their stored quote-currency unit. A shared ticker-to-market-symbol map handles London aliases, and the strict release verifier reconciles every available model-node price back to the raw stored close."
  },
  {
    id: "VAL-018",
    severity: "P0",
    status: "fixed",
    title: "Plus-minus guidance tolerances were averaged as range endpoints",
    scope: "494 historical transcript guidance rows containing +/- disclosures, including WDC quarterly revenue",
    resolution: "The extractor and valuation reader now select the quoted center before the plus-minus marker, preserve the tolerance as evidence only, and the strict release verifier rejects any stored scaled guidance amount that differs from that center."
  },
  {
    id: "VAL-019",
    severity: "P0",
    status: "fixed",
    title: "A loss-making observed period could depress normalized earnings with a one-off below-operating burden",
    scope: "Loss-making historical nodes without a positive through-cycle burden estimate, including current INTC",
    resolution: "Observed below-operating burden is now eligible only when both observed operating and net margins are positive. A loss period may use the tax-based normalized margin only for an explicitly cycle-normalized profile; other loss-making models remain unmodeled unless positive independent valuation evidence exists."
  },
  {
    id: "VAL-020",
    severity: "P1",
    status: "fixed",
    title: "A current paid comparison price was not reconciled when the legacy price table lagged",
    scope: "Model nodes whose paid split-adjusted price is newer than the generic price_points table, including current CRWD",
    resolution: "The release verifier now reconciles every non-null comparison price to either the exact raw price_points date or the exact paid price stored in the released ticker snapshot. A price absent from both sources, or any value mismatch, blocks release."
  },
  {
    id: "VAL-021",
    severity: "P0",
    status: "fixed",
    title: "Single-quarter or transcript growth could create valuation-multiple cliffs",
    scope: "All historical PIT nodes whose P/E, EV/sales, forward revenue, or FCFE assumptions use revenue growth",
    resolution: "Every profile now uses an event-visible rolling growth median (eight periods by default). Only clear management guidance growth can influence the model, with a maximum 25% weight and a 15 percentage-point deviation from the PIT financial trend. Other transcript growth remains research-only, and every released node records the growth source, window, sample count, bounds, and weight."
  },
  {
    id: "VAL-022",
    severity: "P0",
    status: "fixed",
    title: "Annual and quarterly provider rows could be mixed into a false trailing period",
    scope: "Every historical operating-company PIT node",
    resolution: "Trailing values now use a reported ART row or exactly four consecutive ARQ periods. Annual rows are never mixed into a quarterly sum, and every unavailable trailing basis is explicitly classified."
  },
  {
    id: "VAL-023",
    severity: "P0",
    status: "fixed",
    title: "Repeated provider TTM values counted as independent valuation evidence",
    scope: "Cycle earnings, cash-flow and growth evidence histories",
    resolution: "Repeated reported trailing values count once. Method confidence and normalization maturity advance only with independent event-visible observations."
  },
  {
    id: "VAL-024",
    severity: "P1",
    status: "fixed",
    title: "A newly available low-weight method could jump to half of fair value",
    scope: "Sparse two-method histories, including VST 2017 Q3",
    resolution: "Evidence confidence scales requested weights without promoting a requested sub-30% independent method to 50%. The sparse-earnings cap remains active only when the independent requested allocation is material."
  },
  {
    id: "VAL-025",
    severity: "P1",
    status: "fixed",
    title: "Cycle-sensitive earnings were activated before enough independent history existed",
    scope: "Materials histories, including DD 2010 Q2 and DOW 2018 Q4",
    resolution: "Materials require four independent profitable PIT observations before reported earnings can enter the valuation. Earlier nodes rely only on independently usable owner cash flow."
  },
  {
    id: "VAL-026",
    severity: "P1",
    status: "fixed",
    title: "Economically de minimis earnings or cash flow could create a method component",
    scope: "All operating and growth-company model routes",
    resolution: "Unguided earnings and owner cash flow below 1% of revenue are rejected. The stored rejection reason and zero method weight are audited at every node."
  },
  {
    id: "VAL-027",
    severity: "P1",
    status: "fixed",
    title: "Pre-model financial periods were indistinguishable from importer omissions",
    scope: "All selected PIT financial periods before the first defensible valuation node",
    resolution: "Every selected provider period is now either modeled or assigned a machine-readable reason, including insufficient initial independent evidence, incomplete true-TTM history, precommercial status and missing economic valuation support."
  },
  {
    id: "VAL-028",
    severity: "P1",
    status: "fixed",
    title: "Immature corroborative cash flow could become the sole valuation method",
    scope: "Sparse materials and power-utility histories, including APD, DOW, MOS and VST transitions",
    resolution: "A profile-specific evidence floor now applies whenever FCFE DCF would stand alone. Materials require at least 62.5% cash-flow evidence confidence and power utilities require 75%; otherwise the PIT period is explicitly unmodeled until an independent earnings method or mature cash-flow history exists."
  },
  {
    id: "VAL-029",
    severity: "P1",
    status: "fixed",
    title: "An original full-year guidance range was treated as unscoped segment revenue",
    scope: "GEV 2025 Q2 and any transcript using original-guidance-range wording",
    resolution: "Original company guidance ranges are now recognized as explicit annual guidance when no quarter scope is present. The GEV regression fixture selects the USD 36.5 billion company revenue midpoint and prevents segment EBITDA or one-time settlement amounts from becoming forward revenue."
  },
  {
    id: "VAL-030",
    severity: "P1",
    status: "fixed",
    title: "The release verifier exhausted memory before reporting audit failures",
    scope: "Multi-gigabyte S&P 500 PIT release artifacts",
    resolution: "Model, snapshot, price, path, coverage and temporal checks now iterate or hash in bounded chunks. The same full release audit passes with a 512 MB Node heap instead of loading complete JSON tables into memory."
  },
  {
    id: "VAL-031",
    severity: "P1",
    status: "fixed",
    title: "The release audit formula lagged the model's growth-evidence ramp",
    scope: "6,392 false audit findings across immature historical growth windows",
    resolution: "The verifier now independently reconstructs the four-sample admission rule, 25%/50%/75%/100% evidence ramp, conservative 5% anchor, bounded guidance blend, source label and final capped growth value for every node."
  },
  {
    id: "VAL-032",
    severity: "P0",
    status: "fixed",
    title: "Parallel guidance metrics could bind to the wrong quoted amount",
    scope: "Compound transcript clauses containing multiple metrics and multiple monetary values, including APTV revenue, EBITDA and operating-income guidance",
    resolution: "Ordinal value binding now considers only the leading metric owners before the first amount. Independent source auditing reconstructs the pairing and blocks any released amount assigned to the wrong metric."
  },
  {
    id: "VAL-033",
    severity: "P0",
    status: "fixed",
    title: "A shared trailing scale was omitted from the first endpoint of a range",
    scope: "Guidance written as `$1.66-$1.68 billion`, `$205-$225 million`, and equivalent shared-unit ranges",
    resolution: "The parser now propagates the explicit trailing currency scale to both endpoints before computing the midpoint. The release verifier independently parses and reconciles every scaled range."
  },
  {
    id: "VAL-034",
    severity: "P0",
    status: "fixed",
    title: "Historical actual results and prior-guide comparisons entered the guidance table",
    scope: "Transcript sentences describing results above or below `our guidance`, including prior APP actual-result evidence",
    resolution: "Historical-result, exceeded-guide and comparison language is research-only. It cannot create a model-authoritative guidance value, and regression fixtures cover the previously admitted wording."
  },
  {
    id: "VAL-035",
    severity: "P0",
    status: "fixed",
    title: "Segment, acquisition, delta and non-company amounts could masquerade as company guidance",
    scope: "Revenue and operating metrics across GPC, CTSH, WMB, CVS and all transcript-backed issuers",
    resolution: "Every extracted metric now carries a structured subject classification. Only company-total or explicitly company-unspecified periodic guidance may enter company valuation inputs; segment, acquisition, contribution, delta and non-periodic evidence remains visible but model-excluded."
  },
  {
    id: "VAL-036",
    severity: "P0",
    status: "fixed",
    title: "A missing nullable guidance scalar could become zero or coexist with a valued duplicate",
    scope: "All guidance serialization, deduplication and model-selection paths",
    resolution: "Nullable scalars remain null end to end. Exact source/metric/period evidence is deduplicated, and the release gate blocks empty-plus-valued duplicate groups or a selected zero manufactured from a missing value."
  },
  {
    id: "VAL-037",
    severity: "P0",
    status: "fixed",
    title: "Transcript extraction could override official issuer guidance",
    scope: "SEC and UK issuer guidance sharing the same ticker, fiscal period and metric with transcript evidence",
    resolution: "Official SEC and UK issuer records are model-authoritative for the same metric and period. Transcript evidence remains stored for traceability but cannot replace the official value."
  },
  {
    id: "VAL-038",
    severity: "P0",
    status: "fixed",
    title: "Legacy UK fiscal calendars could assign a future period end to an earlier release",
    scope: "Historical LSEG releases under the former 31 March fiscal year and subsequent calendar transitions",
    resolution: "Issuer-specific fiscal calendars now derive the real period end for each reporting regime. Every official period end must be on or before its availability date, with the derivation retained in source lineage."
  },
  {
    id: "VAL-039",
    severity: "P0",
    status: "fixed",
    title: "Named-month quarter guidance and nearby cost amounts were parsed as annual revenue",
    scope: "Phrases such as `June quarter` and `September quarter`, including STX revenue guidance adjacent to opex savings and underutilization costs",
    resolution: "All named-month quarter forms now establish quarterly scope. Costs, expenses, savings, charges, synergies, taxes and share counts own their amounts and block those values from ordinal revenue or operating-income binding."
  },
  {
    id: "VAL-040",
    severity: "P0",
    status: "fixed",
    title: "The `+ or -` tolerance spelling was treated as a range endpoint",
    scope: "Guidance using textual plus-or-minus variants, including STX `$2.1 billion + or - $150 million`",
    resolution: "Symbolic and textual plus-minus variants all retain the first amount as the center and the second as tolerance evidence. Independent release arithmetic blocks any averaged or midpoint substitute."
  },
  {
    id: "VAL-041",
    severity: "P1",
    status: "fixed",
    title: "Two identical valuation imports produced different release signatures",
    scope: "Full S&P 500 deterministic rebuild and release comparison",
    resolution: "The importer accepts a validated fixed `PIT_VALUATION_GENERATED_AT`; both candidate runs use the same canonical timestamp, allowing model and snapshot signatures to prove data and calculation determinism rather than clock equality."
  },
  {
    id: "VAL-042",
    severity: "P0",
    status: "fixed",
    title: "Official filing importers could diverge from the audited transcript amount parser",
    scope: "Official SEC and UK guidance with actual-value comparisons, repeated currencies, ranges and nearby non-guidance amounts",
    resolution: "All source paths now share the same actual-versus-guidance, range, scale and economic-owner contract. Independent source auditing reconstructs the original evidence rather than trusting the stored scalar."
  },
  {
    id: "VAL-043",
    severity: "P0",
    status: "fixed",
    title: "A legal range endpoint could be replaced by a later amount owned by another metric",
    scope: "Repeated-currency and `range from` forms, including PANW revenue beside shares and STZ guidance beside NCI",
    resolution: "The parser completes the local range before scanning later clauses. Regression fixtures prove the correct midpoint while the independent release audit rejects share-count, cost, tax and NCI collisions."
  },
  {
    id: "VAL-044",
    severity: "P0",
    status: "fixed",
    title: "A year-end result period could overwrite the forward guidance target year",
    scope: "LSEG FY2024/FY2025 releases and every Q4 result that guides the following year",
    resolution: "Reported fiscal year and guidance target year are stored separately. The importer selects the nearest preceding annual-guidance heading and stops before medium-term or later-year sections; all 62 LSEG PIT nodes and 21 explicit full-year rows pass focused lineage, GBP price and model-arithmetic checks."
  },
  {
    id: "VAL-045",
    severity: "P0",
    status: "fixed",
    title: "A fiscal year and later capital-allocation amount were combined into false FCF guidance",
    scope: "Year-to-amount wording, including Jacobs `fiscal year 2025 to $1.4 billion` of share repurchases",
    resolution: "Bare four-digit years cannot start a shared-scale monetary range. Share-repurchase amounts own themselves and are classified as non-periodic capital allocation, leaving no false company FCF scalar in the rebuilt source data."
  },
  {
    id: "VAL-046",
    severity: "P0",
    status: "fixed",
    title: "Guidance values could bind to the wrong metric, scope, range endpoint, or revision amount",
    scope: "Structural transcript and filing forms across CDNS, GTLB, APTV, CARR, RTX and every modeled guidance period",
    resolution: "The extractor now binds amounts to explicit economic owners before selection, treats legal ranges and signed ranges as atomic, pairs parallel metric/value lists in source order, gives an explicit quarter label precedence over a nearby fiscal-year token, selects the destination in `raise by X to Y`, and excludes historical or non-periodic owner amounts. An independent audit reconstructed all 18,367 guidance rows used by the model and found zero historical-actual, non-guidance-owner, parallel-pairing, or illegal-midpoint mismatches."
  },
  {
    id: "VAL-047",
    severity: "P0",
    status: "fixed",
    title: "Application restart could replace the full PIT dashboard with a stale bundled snapshot",
    scope: "Persistent AWS and local runtime databases when the bundled dashboard is older or has lower ticker coverage",
    resolution: "Bundled valuation snapshots now install monotonically: every row must be newer, and a dashboard update may never reduce tracked-ticker coverage. Regression tests prove that the old zero-ticker bundle cannot overwrite the 533-ticker PIT release after a restart."
  }
];

const WATCH_DISPOSITIONS = {
  large_fair_value_step: {
    status: "explained_watch",
    disposition: "Retained when the adjacent PIT nodes identify a financial, guidance, share, method, or assumption transition; fourfold moves must also pass the strict temporal release gate."
  },
  date_gap: {
    status: "explained_watch",
    disposition: "Retained only when every selected source period is either modeled or explicitly classified as non-modelable by the release verifier."
  },
  share_count_jump: {
    status: "explained_watch",
    disposition: "Retained after source-basis arithmetic verifies period-end provider shares and confirms no retrospective split inference."
  },
  latest_fair_to_price_extreme: {
    status: "economic_watch",
    disposition: "Market divergence is visible for review; price is comparison-only and cannot alter fair value."
  },
  high_target_pe: {
    status: "sensitivity_watch",
    disposition: "Assumption is below the audited 72x hard ceiling and remains visible as a valuation sensitivity."
  },
  high_ev_sales: {
    status: "sensitivity_watch",
    disposition: "Assumption is below the audited 40x hard ceiling and remains visible as a valuation sensitivity."
  },
  high_normalized_margin: {
    status: "sensitivity_watch",
    disposition: "Assumption is below the audited 65% hard ceiling and remains visible as a valuation sensitivity."
  },
  high_terminal_value_share: {
    status: "sensitivity_watch",
    disposition: "Terminal value remains below the 80% release ceiling; discount-rate, growth, and cash-flow arithmetic are independently recomputed."
  },
  short_history: {
    status: "coverage_watch",
    disposition: "Limited history reflects source/listing coverage and does not permit fabricated backfill."
  },
  model_input_audit: {
    status: "coverage_watch",
    disposition: "Verified financial or guidance evidence exists, but the coverage note remains visible."
  }
};

function watchDisposition(code) {
  return WATCH_DISPOSITIONS[code] || {
    status: "reviewed_watch",
    disposition: "Recorded for human review; it is not a release blocker unless a structural or arithmetic gate fails."
  };
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 3) {
  const number = finite(value);
  return number == null ? null : Number(number.toFixed(digits));
}

function percent(value, digits = 2) {
  const number = finite(value);
  return number == null ? null : round(number * 100, digits);
}

function markdown(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function issueKey(issue) {
  return `${issue.severity}::${issue.code}::${issue.ticker || "*"}`;
}

function collectForbiddenPriceInputs(value, parts = [], matches = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectForbiddenPriceInputs(child, [...parts, String(index)], matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  for (const [key, child] of Object.entries(value)) {
    const next = [...parts, key];
    if (/^(?:priceAtDate|currentPrice|marketPrice|valuationAnchorPrice)$/i.test(key) && child != null) {
      matches.push(next.join("."));
    }
    collectForbiddenPriceInputs(child, next, matches);
  }
  return matches;
}

function addIssue(map, issue) {
  const key = issueKey(issue);
  const existing = map.get(key) || {
    severity: issue.severity,
    code: issue.code,
    ticker: issue.ticker || null,
    title: issue.title,
    count: 0,
    periods: [],
    evidence: []
  };
  existing.count += 1;
  if (issue.period && existing.periods.length < 8 && !existing.periods.includes(issue.period)) {
    existing.periods.push(issue.period);
  }
  if (issue.evidence != null && existing.evidence.length < 4) existing.evidence.push(issue.evidence);
  map.set(key, existing);
}

function summarizeIssueCounts(issues) {
  return Object.fromEntries([...issues.reduce((counts, issue) => {
    counts.set(issue.code, (counts.get(issue.code) || 0) + issue.count);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildMarkdown(ledger) {
  const watchRows = Object.entries(ledger.summary.watchByCode).map(([code, tickerGroups]) => {
    const observations = ledger.watchObservations.filter((item) => item.code === code);
    const observationCount = observations.reduce(
      (sum, item) => sum + Math.max(1, Array.isArray(item.evidence) ? item.evidence.length : 0),
      0
    );
    const disposition = observations[0] || watchDisposition(code);
    return { code, tickerGroups, observationCount, ...disposition };
  });
  const lines = [
    "# Valuation PIT Audit Ledger",
    "",
    `Generated from model artifact \`${markdown(ledger.database.modelVersion)}\` at ${markdown(ledger.generatedAt)}.`,
    "",
    "## Release Gate",
    "",
    "| Check | Result |",
    "| --- | ---: |",
    `| Overall status | **${ledger.status.toUpperCase()}** |`,
    `| Tickers audited | ${ledger.summary.tickerCount} |`,
    `| Modeled tickers | ${ledger.summary.modeledTickerCount} |`,
    `| Historical PIT nodes audited | ${ledger.summary.modelNodeCount.toLocaleString("en-US")} |`,
    `| Selected PIT financial periods | ${ledger.coverageAudit.selectedFinancialPeriods.toLocaleString("en-US")} |`,
    `| Explicitly unmodeled periods | ${ledger.coverageAudit.explicitlyUnmodeledPeriods.toLocaleString("en-US")} |`,
    `| Unexpected modelable gaps | ${ledger.coverageAudit.unexpected.length} |`,
    `| Material adjacent-node transitions | ${ledger.temporalAudit.materialChanges} |`,
    `| Unexplained material transitions | ${ledger.temporalAudit.blockers.length} |`,
    `| Blocking P0/P1 findings | ${ledger.summary.blockerCount} |`,
    `| Economic watch groups | ${ledger.summary.watchCount} |`,
    `| Recorded watch observations | ${ledger.summary.watchObservationCount} |`,
    `| Not applicable | ${ledger.summary.notApplicableCount} |`,
    "",
    "The release gate fails only for data lineage, arithmetic, model-route, hard economic-bound or look-ahead errors. A market-price divergence is recorded as a watch item and never used to force fair value toward the quote.",
    "",
    "## Fixed Issues",
    "",
    "| ID | Severity | Status | Issue | Scope | Resolution |",
    "| --- | --- | --- | --- | --- | --- |",
    ...ledger.resolvedIssues.map((item) => `| ${item.id} | ${item.severity} | ${item.status} | ${markdown(item.title)} | ${markdown(item.scope)} | ${markdown(item.resolution)} |`),
    "",
    "## Open Blockers",
    ""
  ];

  if (!ledger.blockers.length) {
    lines.push("No unresolved P0/P1 findings.", "");
  } else {
    lines.push(
      "| Severity | Code | Ticker | Count | Periods | Finding |",
      "| --- | --- | --- | ---: | --- | --- |",
      ...ledger.blockers.map((item) => `| ${item.severity} | ${item.code} | ${item.ticker || "all"} | ${item.count} | ${markdown(item.periods.join(", "))} | ${markdown(item.title)} |`),
      ""
    );
  }

  lines.push(
    "## Economic Watch",
    "",
    "These are reviewed conclusions or sensitivity flags, not automatic errors.",
    "",
    "| Code | Ticker groups | Recorded observations | Status | Disposition |",
    "| --- | ---: | ---: | --- | --- |",
    ...watchRows.map((item) => `| ${item.code} | ${item.tickerGroups} | ${item.observationCount} | ${item.status} | ${markdown(item.disposition)} |`),
    "",
    "Every watch observation, period transition, input-change reason, assumption and source-basis note is retained in `valuation-audit-ledger.json`; the Markdown table is the compact release summary.",
    "",
    "## Profile Coverage",
    "",
    "| Profile | Tickers | PIT nodes | Blockers | Watch items |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...ledger.profiles.map((profile) => `| ${profile.profile} | ${profile.tickerCount} | ${profile.nodeCount} | ${profile.blockerCount} | ${profile.watchCount} |`),
    "",
    "## Ticker Ledger",
    "",
    "| Ticker | Profile | Nodes | First / latest | Status | Latest FV | Latest price | FV / price | Watch observations | Flags |",
    "| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...ledger.tickers.map((ticker) => `| ${ticker.ticker} | ${ticker.profile || "n/a"} | ${ticker.nodeCount} | ${markdown(`${ticker.firstPeriod || "-"} / ${ticker.latestPeriod || "-"}`)} | ${ticker.status} | ${ticker.latestFairValue ?? "-"} | ${ticker.latestPrice ?? "-"} | ${ticker.latestFairToPrice ?? "-"} | ${ticker.watchObservationCount} | ${markdown(ticker.flags.join(", "))} |`),
    "",
    "## Audit Policy",
    "",
    "- Financials and guidance must be point-in-time visible at every node; market price is comparison-only.",
    "- Cross-currency financials and guidance must use an official event-visible ECB reference rate with source/target currency, rate date, rate math, and URL retained. Cross-listing price ratios and fixed FX fallbacks are forbidden.",
    "- Stored market prices are consumed in their recorded quote-currency unit. A `.L` suffix identifies the market symbol but never authorizes an inferred divide-by-100 conversion; every model-node comparison price is reconciled to `price_points`.",
    "- Period-end quoted-security shares are used exactly once with the recorded provider factor; no retrospective split inference is allowed.",
    "- Customer, policyholder, brokerage and fund cash flows are excluded from operating-company FCFE models.",
    "- Base fair value cannot include a blanket optionality uplift. Optionality belongs in separately labeled bull/bear scenarios.",
    "- EV/sales above 40x, target P/E above 72x, normalized operating margin above 65%, or DCF assumptions outside the release bounds are blockers.",
    "- Extreme fair-value/price ratios remain visible for human review but do not make price an input to fair value.",
    "- Transcript Q&A is research-only, must begin after a detected Q&A boundary, contain a substantive management response, and be stored bilingually before release.",
    "- Chinese Q&A must come from the audited local translation cache. Currency, percentage, basis-point, quarter and numeric tokens are restored deterministically; a missing cache item is a release blocker.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

export function buildValuationAuditLedger(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const snapshotTickers = new Set();
    for (const row of db.prepare("SELECT ticker FROM valuation_ticker_snapshots ORDER BY ticker").iterate()) {
      snapshotTickers.add(String(row.ticker).toUpperCase());
    }
    const modelRows = db.prepare(`
      SELECT ticker, fiscal_period, model_version, as_of_date, financial_available_at,
             guidance_max_observed_at, input_json, output_json, generated_at
      FROM valuation_pit_model_runs
      ORDER BY ticker, as_of_date
    `);
    const tickerStats = new Map();
    const issues = new Map();
    let modelVersion = null;
    let generatedAt = null;
    let modelNodeCount = 0;

    for (const raw of modelRows.iterate()) {
      modelNodeCount += 1;
      const ticker = String(raw.ticker).toUpperCase();
      const input = parseJson(raw.input_json, {});
      const output = parseJson(raw.output_json, {});
      const semantics = input.valuationSemantics || output.dataSnapshot?.valuationSemantics || {};
      const score = semantics.scoreInputs || {};
      const profile = String(score.profile || "");
      const modelRoute = String(score.modelRoute || "");
      const methodOutputs = Array.isArray(output.methodOutputs) ? output.methodOutputs : [];
      const methodKeys = new Set(methodOutputs.map((item) => item?.key).filter(Boolean));
      const guidanceSelection = input.guidance?.guidanceSelection || {};
      const forwardRevenueSource = String(score.forwardRevenueSource || "");
      const row = {
        ticker,
        fiscalPeriod: raw.fiscal_period,
        asOfDate: raw.as_of_date,
        profile,
        fairValue: finite(output.fairValue),
        priceAtDate: finite(output.priceAtDate),
        targetPE: finite(score.targetPE),
        evSales: finite(score.evSalesMultiple),
        normalizedMargin: finite(score.normalizedMargin),
        optionalityMultiplier: finite(score.optionalityMultiplier) ?? 1,
        bullCaseOptionalityMultiplier: finite(score.bullCaseOptionalityMultiplier) ?? 1,
        dcf: score.equityDcf || null,
        score,
        methodKeys
      };
      const ledgerRow = {
        ticker: row.ticker,
        fiscalPeriod: row.fiscalPeriod,
        asOfDate: row.asOfDate,
        profile: row.profile,
        fairValue: row.fairValue,
        priceAtDate: row.priceAtDate,
        targetPE: row.targetPE,
        evSales: row.evSales,
        normalizedMargin: row.normalizedMargin,
        optionalityMultiplier: row.optionalityMultiplier,
        bullCaseOptionalityMultiplier: row.bullCaseOptionalityMultiplier,
        dcf: row.dcf
      };
      const stats = tickerStats.get(ticker) || { count: 0, first: null, latest: null };
      stats.count += 1;
      if (!stats.first || String(row.asOfDate).localeCompare(String(stats.first.asOfDate)) < 0) {
        stats.first = { fiscalPeriod: row.fiscalPeriod, asOfDate: row.asOfDate };
      }
      if (!stats.latest || String(row.asOfDate).localeCompare(String(stats.latest.asOfDate)) >= 0) {
        stats.latest = ledgerRow;
      }
      tickerStats.set(ticker, stats);
      modelVersion = modelVersion || raw.model_version;
      generatedAt = [generatedAt, raw.generated_at].filter(Boolean).sort().at(-1) || null;

      const add = (severity, code, title, evidence = null) => addIssue(issues, {
        severity,
        code,
        title,
        ticker,
        period: raw.fiscal_period,
        evidence
      });
      if (!(row.fairValue > 0)) add("P0", "invalid_fair_value", "Fair value is missing or non-positive.", row.fairValue);
      if (!(finite(score.sharesM) > 0)) add("P0", "invalid_share_count", "Point-in-time share count is missing or non-positive.", score.sharesM);
      if (raw.financial_available_at > raw.as_of_date) add("P0", "future_financial", "Financial source became available after the model node.");
      const financialSourceRecord = input.sourceRecord || input.trailingTwelveMonthsSourceRecord || {};
      const financialPeriodEnd = String(financialSourceRecord.periodEndDate || "").slice(0, 10);
      const financialEventDate = String(financialSourceRecord.eventDate || "").slice(0, 10);
      if (financialPeriodEnd && financialPeriodEnd > raw.financial_available_at) {
        add("P0", "future_financial_period_end", "Reported financial period ends after the source became available.", {
          financialPeriodEnd,
          financialAvailableAt: raw.financial_available_at
        });
      }
      if (financialEventDate && financialEventDate > raw.as_of_date) {
        add("P0", "future_financial_event", "Official financial event date is after the model node.", {
          financialEventDate,
          asOfDate: raw.as_of_date
        });
      }
      if (raw.guidance_max_observed_at && raw.guidance_max_observed_at > raw.as_of_date) add("P0", "future_guidance", "Guidance was observed after the model node.");
      if (semantics.priceExcludedFromFairValue !== true) add("P0", "market_price_policy", "Market price is not explicitly excluded from fair value.");
      const pricePaths = collectForbiddenPriceInputs(input);
      if (pricePaths.length) add("P0", "market_price_in_input", "A market-price field entered the model input.", pricePaths);
      if (semantics.shareBasisAdjustmentFactor != null) add("P0", "retroactive_share_adjustment", "A retrospective share-basis adjustment remains in the PIT node.");
      if (EXPECTED_PROFILE.has(ticker) && profile !== EXPECTED_PROFILE.get(ticker)) {
        add("P0", "wrong_economic_profile", `Ticker must use ${EXPECTED_PROFILE.get(ticker)} rather than ${profile || "missing"}.`);
      }
      if (!modelRoute) add("P0", "missing_model_route", "The model node does not identify its economic calculation route.");
      if (row.optionalityMultiplier > 1.000001) {
        add("P0", "base_optionality_uplift", "Base fair value contains an unpriced optionality multiplier.", row.optionalityMultiplier);
      }
      if (row.targetPE != null && row.targetPE > 72.000001) add("P1", "target_pe_hard_bound", "Target P/E exceeds the audited 72x base-case ceiling.", row.targetPE);
      if (row.evSales != null && row.evSales > 40.000001) add("P1", "ev_sales_hard_bound", "EV/sales exceeds the audited 40x base-case ceiling.", row.evSales);
      if (row.normalizedMargin != null && row.normalizedMargin > 65.000001) add("P1", "normalized_margin_hard_bound", "Normalized operating margin exceeds 65%.", row.normalizedMargin);
      if (forwardRevenueSource === "unscoped_annual_guidance") {
        add("P0", "unscoped_annual_revenue_used", "An unscoped revenue amount replaced the annual forward-revenue input.");
      }
      if (forwardRevenueSource === "full_year_guidance" && guidanceSelection.revenue?.mode !== "explicit_full_year") {
        add("P0", "full_year_revenue_without_explicit_scope", "Full-year revenue input lacks explicit annual scope.", guidanceSelection.revenue?.mode);
      }
      if (finite(score.guidanceOperatingIncomeM) > 0 && guidanceSelection.operatingIncome?.mode !== "explicit_full_year") {
        add("P0", "operating_income_guidance_without_explicit_scope", "Operating-income guidance entered the model without explicit annual scope.", guidanceSelection.operatingIncome?.mode);
      }
      if (finite(score.fcfGuidanceM) > 0 && guidanceSelection.freeCashFlow?.mode !== "explicit_full_year") {
        add("P0", "fcf_guidance_without_explicit_scope", "Free-cash-flow guidance entered the model without explicit annual scope.", guidanceSelection.freeCashFlow?.mode);
      }
      if (REVENUE_GUIDANCE_ROUTES.has(modelRoute) && guidanceSelection.revenue?.mode === "explicit_full_year" &&
          forwardRevenueSource !== "full_year_guidance" && !score.revenueGuidanceRejectedReason) {
        add("P0", "explicit_revenue_guidance_silently_ignored", "Explicit annual revenue guidance was neither used nor rejected with an auditable reason.", {
          modelRoute,
          reportedRevenueGuidanceM: finite(score.reportedRevenueGuidanceM)
        });
      }
      if (OPERATING_GUIDANCE_ROUTES.has(modelRoute) && guidanceSelection.operatingIncome?.mode === "explicit_full_year" &&
          !(finite(score.guidanceOperatingIncomeM) > 0) && !score.guidanceOperatingIncomeRejectedReason) {
        add("P0", "explicit_operating_income_guidance_silently_ignored", "Explicit annual operating-income guidance was neither used nor rejected with an auditable reason.", {
          modelRoute,
          reportedGuidanceOperatingIncomeM: finite(score.reportedGuidanceOperatingIncomeM)
        });
      }
      if (OPERATING_GUIDANCE_ROUTES.has(modelRoute) && guidanceSelection.freeCashFlow?.mode === "explicit_full_year" &&
          !(finite(score.fcfGuidanceM) > 0) && !score.fcfGuidanceRejectedReason) {
        add("P0", "explicit_fcf_guidance_silently_ignored", "Explicit annual free-cash-flow guidance was neither used nor rejected with an auditable reason.", {
          modelRoute,
          reportedFcfGuidanceM: finite(score.reportedFcfGuidanceM)
        });
      }
      const salesWeight = finite(score.methodWeights?.["ev-sales-equity-value"]);
      const salesRetention = finite(score.salesEquityRetention);
      const minimumSalesRetention = finite(score.minimumSalesEquityRetention) ?? 0.01;
      if (salesWeight > 0 && (!(salesRetention >= minimumSalesRetention) || score.salesValueRejectionReason)) {
        add("P1", "fragile_ev_to_equity_bridge", "An EV/sales component with a near-zero or nonpositive post-debt equity residual entered model weights.", {
          salesWeight,
          salesRetention,
          minimumSalesRetention,
          reason: score.salesValueRejectionReason || null
        });
      }

      if (CUSTOMER_CASH_EXCLUSION_PROFILES.has(profile)) {
        if (row.dcf || methodKeys.has("fcfe-dcf")) add("P0", "customer_cash_dcf", "Customer or policyholder cash-flow profile contains FCFE DCF.");
        if (!methodKeys.has("customer-cash-flow-exclusion")) add("P0", "customer_cash_exclusion_missing", "Customer cash-flow exclusion is not disclosed in the model output.");
        if (!methodKeys.has("through-cycle-eps")) add("P0", "through_cycle_eps_missing", "Customer cash-flow profile is not anchored to through-cycle EPS.");
      }

      const weights = score.methodWeights && typeof score.methodWeights === "object"
        ? Object.values(score.methodWeights).map(finite).filter((value) => value != null)
        : [];
      if (weights.length && Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) > 1e-7) {
        add("P0", "method_weight_sum", "Valuation method weights do not sum to 100%.", weights);
      }
      for (const [name, value] of [
        ["earnings", score.earningsMethodEvidenceConfidence],
        ["free_cash_flow", score.freeCashFlowMethodEvidenceConfidence]
      ]) {
        const confidence = finite(value);
        if (confidence != null && (confidence < 0 || confidence > 1)) {
          add("P0", "method_evidence_confidence_bound", `${name} method evidence confidence is outside 0%-100%.`, confidence);
        }
      }
      const normalizedNetIncome = finite(score.normalizedNetIncome);
      const valuationRevenue = finite(score.valuationRevenue);
      if (normalizedNetIncome > 0 && valuationRevenue > 0 && normalizedNetIncome / valuationRevenue < 0.01 - 1e-9 &&
          !(finite(score.adjustedEpsGuidance) > 0)) {
        add("P1", "de_minimis_earnings_method", "Unguided normalized earnings below 1% of revenue entered fair value.", {
          normalizedNetIncome,
          valuationRevenue,
          ratio: normalizedNetIncome / valuationRevenue
        });
      }

      if (row.dcf) {
        const discountRate = finite(row.dcf.discountRate);
        const terminalGrowth = finite(row.dcf.terminalGrowth);
        const terminalShare = finite(row.dcf.terminalValueShare);
        if (!(discountRate >= 0.085 && discountRate <= 0.18)) add("P0", "dcf_discount_rate", "DCF discount rate is outside 8.5%-18%.", discountRate);
        if (!(terminalGrowth >= 0.01 && terminalGrowth <= 0.04)) add("P0", "dcf_terminal_growth", "DCF terminal growth is outside 1%-4%.", terminalGrowth);
        if (discountRate != null && terminalGrowth != null && discountRate - terminalGrowth < 0.045 - 1e-9) {
          add("P0", "dcf_spread", "DCF discount-rate minus terminal-growth spread is below 4.5%.", discountRate - terminalGrowth);
        }
        if (!(terminalShare > 0 && terminalShare <= 0.8)) add("P1", "dcf_terminal_share", "DCF terminal value exceeds 80% of present value.", terminalShare);
      }
    }

    const coverageAudit = inspectUnmodeledFinancialPeriods(db);
    for (const gap of coverageAudit.unexpected) {
      addIssue(issues, {
        severity: "P1",
        code: "unclassified_modelable_financial_period",
        ticker: gap.ticker,
        period: gap.fiscalPeriod,
        title: "A selected PIT financial period appears modelable but produced no valuation and has no explicit exclusion.",
        evidence: gap
      });
    }
    const temporalAudit = inspectValuationTemporalContinuity(db, { unmodeledAudit: coverageAudit });
    for (const change of temporalAudit.blockers) {
      addIssue(issues, {
        severity: "P1",
        code: "unexplained_material_fair_value_transition",
        ticker: change.ticker,
        period: `${change.fromPeriod} -> ${change.toPeriod}`,
        title: "An adjacent PIT fair-value transition of at least fourfold lacks sufficient reported operating or corporate-action evidence.",
        evidence: change
      });
    }

    const qa = buildValuationQaReport(dbPath);
    const qaByTicker = new Map(qa.tickers.map((ticker) => [ticker.ticker, ticker]));
    const allTickers = [...new Set([...snapshotTickers, ...tickerStats.keys()])].sort();
    const snapshotByTicker = db.prepare(`
      SELECT payload_json
      FROM valuation_ticker_snapshots
      WHERE ticker = ?
    `);
    const tickerLedger = [];

    for (const ticker of allTickers) {
      const stats = tickerStats.get(ticker) || { count: 0, first: null, latest: null };
      const latest = stats.latest;
      const snapshot = parseJson(snapshotByTicker.get(ticker)?.payload_json, {});
      const qaTicker = qaByTicker.get(ticker) || {};
      const tickerBlockers = [...issues.values()].filter((item) => item.ticker === ticker && ["P0", "P1"].includes(item.severity));
      const watchMap = new Map();
      const observe = (code, evidence = null) => {
        const existing = watchMap.get(code) || {
          code,
          ...watchDisposition(code),
          evidence: []
        };
        if (evidence != null) {
          if (Array.isArray(evidence)) existing.evidence.push(...evidence);
          else existing.evidence.push(evidence);
        }
        watchMap.set(code, existing);
      };
      const latestPrice = finite(snapshot.latest?.latestPrice) ?? latest?.priceAtDate ?? null;
      const latestRatio = latest?.fairValue > 0 && latestPrice > 0 ? latest.fairValue / latestPrice : null;
      if (latest?.targetPE != null && latest.targetPE >= 50) observe("high_target_pe", { targetPE: round(latest.targetPE, 2), hardCeiling: 72 });
      if (latest?.evSales != null && latest.evSales >= 25) observe("high_ev_sales", { evSales: round(latest.evSales, 2), hardCeiling: 40 });
      if (latest?.normalizedMargin != null && latest.normalizedMargin >= 50) observe("high_normalized_margin", { normalizedMarginPct: round(latest.normalizedMargin, 2), hardCeilingPct: 65 });
      if (finite(latest?.dcf?.terminalValueShare) >= 0.75) observe("high_terminal_value_share", {
        terminalValueSharePct: percent(latest.dcf.terminalValueShare),
        hardCeilingPct: 80
      });
      for (const note of qaTicker.watchNotes || []) observe(note.code, note.evidence);
      const watchObservations = [...watchMap.values()].sort((left, right) => left.code.localeCompare(right.code));
      const flags = [...new Set([...tickerBlockers.map((item) => item.code), ...watchMap.keys()])].sort();
      const status = snapshot.dataQuality?.valuationStatus === "not_applicable"
        ? "not_applicable"
        : tickerBlockers.length
          ? "blocked"
          : watchMap.size
            ? "watch"
            : "pass";
      tickerLedger.push({
        ticker,
        name: snapshot.name || ticker,
        profile: latest?.profile || null,
        nodeCount: stats.count,
        firstPeriod: stats.first?.fiscalPeriod || null,
        latestPeriod: latest?.fiscalPeriod || null,
        latestAsOfDate: latest?.asOfDate || null,
        latestFairValue: round(latest?.fairValue, 2),
        latestPrice: round(latestPrice, 2),
        latestFairToPrice: round(latestRatio, 3),
        status,
        flags,
        blockerCount: tickerBlockers.reduce((sum, item) => sum + item.count, 0),
        watchCount: watchMap.size,
        watchObservationCount: watchObservations.reduce((sum, item) => sum + Math.max(1, item.evidence.length), 0),
        watchObservations,
        latestInputs: latest ? {
          targetPE: round(latest.targetPE, 2),
          evSales: round(latest.evSales, 2),
          normalizedMarginPct: round(latest.normalizedMargin, 2),
          dcfDiscountRatePct: percent(latest.dcf?.discountRate),
          dcfTerminalGrowthPct: percent(latest.dcf?.terminalGrowth),
          dcfTerminalValueSharePct: percent(latest.dcf?.terminalValueShare),
          baseOptionalityMultiplier: latest.optionalityMultiplier,
          bullCaseOptionalityMultiplier: latest.bullCaseOptionalityMultiplier
        } : null
      });
    }

    const blockerList = [...issues.values()]
      .filter((item) => ["P0", "P1"].includes(item.severity))
      .sort((left, right) => left.severity.localeCompare(right.severity) || String(left.ticker).localeCompare(String(right.ticker)) || left.code.localeCompare(right.code));
    const blockerKeys = new Set(blockerList.map((item) => `${item.ticker}::${item.code}`));
    const watchIssues = tickerLedger.flatMap((ticker) => ticker.flags
      .filter((code) => !blockerKeys.has(`${ticker.ticker}::${code}`))
      .map((code) => ({ code, ticker: ticker.ticker, count: 1 })));
    const watchObservations = tickerLedger.flatMap((ticker) => ticker.watchObservations.map((observation) => ({
      ticker: ticker.ticker,
      latestPeriod: ticker.latestPeriod,
      ...observation
    })));
    const profileMap = new Map();
    for (const ticker of tickerLedger) {
      const profile = ticker.profile || "not_applicable";
      const current = profileMap.get(profile) || { profile, tickerCount: 0, nodeCount: 0, blockerCount: 0, watchCount: 0 };
      current.tickerCount += 1;
      current.nodeCount += ticker.nodeCount;
      current.blockerCount += ticker.blockerCount;
      current.watchCount += ticker.watchCount;
      profileMap.set(profile, current);
    }

    return {
      generatedAt: generatedAt || new Date().toISOString(),
      status: blockerList.length ? "fail" : "pass",
      database: {
        path: dbPath,
        modelVersion,
        integrity: db.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown"
      },
      summary: {
        tickerCount: tickerLedger.length,
        modeledTickerCount: tickerLedger.filter((ticker) => ticker.nodeCount > 0).length,
        modelNodeCount,
        blockerCount: blockerList.reduce((sum, item) => sum + item.count, 0),
        blockerGroups: blockerList.length,
        watchCount: watchIssues.length,
        watchObservationCount: tickerLedger.reduce((sum, ticker) => sum + ticker.watchObservationCount, 0),
        watchByCode: summarizeIssueCounts(watchIssues),
        passTickerCount: tickerLedger.filter((ticker) => ticker.status === "pass").length,
        watchTickerCount: tickerLedger.filter((ticker) => ticker.status === "watch").length,
        blockedTickerCount: tickerLedger.filter((ticker) => ticker.status === "blocked").length,
        notApplicableCount: tickerLedger.filter((ticker) => ticker.status === "not_applicable").length,
        modelQa: qa.summary
      },
      coverageAudit,
      temporalAudit,
      resolvedIssues: RESOLVED_ISSUES,
      blockers: blockerList,
      watchObservations,
      profiles: [...profileMap.values()].sort((left, right) => left.profile.localeCompare(right.profile)),
      tickers: tickerLedger
    };
  } finally {
    db.close();
  }
}

export function writeValuationAuditLedger({
  dbPath = DB_PATH,
  jsonPath = JSON_PATH,
  markdownPath = MARKDOWN_PATH
} = {}) {
  const ledger = buildValuationAuditLedger(dbPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(ledger, null, 2));
  fs.writeFileSync(markdownPath, buildMarkdown(ledger));
  return ledger;
}

function main() {
  const ledger = writeValuationAuditLedger();
  console.log(JSON.stringify({
    status: ledger.status,
    generatedAt: ledger.generatedAt,
    database: ledger.database,
    summary: ledger.summary,
    jsonPath: JSON_PATH,
    markdownPath: MARKDOWN_PATH
  }, null, 2));
  if (ledger.status !== "pass") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
