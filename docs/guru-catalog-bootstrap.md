# Atomic Guru catalog bootstrap

`scripts/bootstrap-guru-catalog.mjs` is the one-time, fail-closed path for
adding explicitly selected manager-13F profiles to an existing dashboard. It
does not infer managers from a repair artifact and it is not a replacement for
the recurring 13F refresh job.

The script derives the catalog, enabled-manager population, required curve
windows, and expected curve-row count from `server/gurus.js`. For the
2026-09-03 catalog this produces 38 profiles, 29 manager-13F profiles, 27
enabled backtest managers, and 54 required 5Y/10Y rows. These numbers are
descriptive only and are not frozen in the implementation.

## Preconditions and transaction boundary

Before any SEC request, the command requires all of the following:

- `--guru` is a non-empty, duplicate-free explicit allowlist of enabled
  manager-13F IDs.
- The current dashboard contains every non-selected configured profile exactly
  once and none of the selected profiles. A rerun over an already-installed
  catalog therefore fails before network work.
- `--expectations` points either to a schema-version-1
  `guru_price_series_repair_batch` (bound or unbound) with `refreshTargets`, or
  to a successful installer report with `refreshes`.
- The expectation document matches the running strict method, proxy method,
  security-master version, and derived full-population row count. Every manager
  named anywhere in the document must be known and enabled, and every named
  manager must have exactly one target for each required window.
- The selected targets have an existing strict artifact for every window. A
  `ready` expectation must resolve to the strict artifact; a `proxy_ready`
  expectation must resolve to a separately audited proxy linked to a complete
  fail-closed strict artifact. Accepted strict failures are deliberately
  closed: either audited execution coverage below the 90% floor, or
  `missing_active_price` with exact failure policy, valid failure/last-complete
  dates, tickers, positive reconciled missing weight and details. The latter
  must link to the proxy's exact compact strict-failure summary and may not use
  synthetic prices, zero-return substitution, or forward filling. Unknown
  failure codes remain rejected. The command never changes an expected status,
  lowers the 90% strict/proxy linkage gate, invents a price, or grants
  manager-specific success treatment.
- All enabled managers—not only the bootstrap selection—pass the current and
  fresh displayable-curve health matrix.

A successful installer report is the stronger expectation source: each
database curve must match that report row's exact `generatedAt`, in addition
to its method, security master, window, expected status, and pass result. A raw
artifact has no post-install curve generation and therefore supplies only the
explicit status/identity contract; the script reports this source as
`artifact`, not as post-install generation proof.

Only then does the command fetch each selected manager's latest snapshot and
40-quarter-capacity exposure history with `persist: false`. It rejects SEC
fallbacks, blocked report dates, filing errors, incomplete primary/alternate
CIK coverage, mismatched latest filings, missing holdings/change fields, and
exposure histories that do not reconcile to the staged snapshot. It strips
transport-only `cache` and `dataStatus` fields, applies current bilingual
catalog metadata and canonical avatar URLs, then calls
`writeGuru13fRefreshBundle` exactly once. That existing writer commits the
dashboard, selected snapshots, selected exposures, selected strict rows, and
selected proxy rows in one SQLite transaction or rolls the transaction back.
The bundle carries the staged dashboard, exposure-history and per-window curve
revision tokens, the exact old dashboard IDs, and the exact configured catalog
order. The writer rechecks all of them only after acquiring `BEGIN IMMEDIATE`
and before its first write, eliminating the stage-to-commit race without
changing legacy callers that omit this optional precondition.

The command intentionally does not validate PNG bytes, Flutter navigation, or
rendered UI. Those remain covered by the avatar/catalog tests and the Guru UI
acceptance suite. `limit=40` is a requested capacity, not a claim that every
manager has forty public filing quarters; shorter valid public histories retain
their actual returned-quarter count.

## Candidate usage

Use a writable, consistent candidate copy outside Git. Do not point this at the
source database used by a concurrently running curve acceptance job. Set a
real monitored SEC contact because the SEC client captures its user agent when
the module is imported.

```bash
SQLITE_DB_PATH=/absolute/private/guru-analysis.candidate.sqlite \
SEC_USER_AGENT='ThesisForge catalog bootstrap sec-ops@thesisforge.tech' \
node scripts/bootstrap-guru-catalog.mjs \
  --guru=chris-hohn,david-tepper,dan-loeb,seth-klarman,nelson-peltz,andreas-halvorsen,david-einhorn,mohnish-pabrai,pat-dorsey \
  --expectations=/absolute/private/guru-price-repair.unbound.json \
  --exposure-limit=40 \
  --reason=catalog-bootstrap-candidate
```

The artifact may contain additional valid targets, such as an already-present
manager affected by the same price repair. Those rows are still validated
against SQLite and reported as `ignoredExpectationTargets`, but they are not
written because they were not named by `--guru`.

## Production usage

Production bootstrap is allowed only after the final isolated full-population
acceptance passes and a fresh completed rollback snapshot of the production
volume exists. Other Guru writers may continue while SEC data is staged: this
bootstrap fails closed if their dashboard, exposure-history, or curve revisions
change before the transaction lock is acquired. Operational quiescence remains
recommended to avoid a harmless failed attempt and another SEC fetch.

Copy the approved private expectation evidence to a protected path outside the
repository. Prefer the successful installer report because it binds every
target to its exact installed curve generation.

```bash
SQLITE_DB_PATH=/absolute/production/guru-analysis.sqlite \
SEC_USER_AGENT='ThesisForge production sec-ops@thesisforge.tech' \
node scripts/bootstrap-guru-catalog.mjs \
  --guru=chris-hohn,david-tepper,dan-loeb,seth-klarman,nelson-peltz,andreas-halvorsen,david-einhorn,mohnish-pabrai,pat-dorsey \
  --expectations=/absolute/private/guru-price-repair-install-report.json \
  --exposure-limit=40 \
  --reason=catalog-bootstrap-production
```

`SQLITE_DB_PATH` must be an existing absolute file. The command disables all
optional bundled-cache synchronization before importing the database module
and verifies that the module opened that exact file. It does not create an EBS
snapshot, deploy code, or restart the service; those remain explicit release
runbook steps.

## Offline verification

The dependency-injected suite never imports the production database runtime or
calls SEC/Yahoo:

```bash
node --test \
  server/bootstrapGuruCatalog.test.js \
  server/guruCatalogAtomicPrecondition.test.js
```

The test lives under `server/` so it is also included by `npm run test:server`.
It covers exact dashboard composition, expectation supersets, installer
generation provenance, strict/proxy status and linkage, full-matrix gating,
`persist:false` staging, CLI exit codes, concurrent dashboard/curve revision
changes, transaction rollback, exact catalog metadata/order, and the one-call
writer contract.
