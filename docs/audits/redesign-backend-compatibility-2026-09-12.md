# Redesigned investment backend: production compatibility

## Release boundary

The redesigned `/api/investment` routes are opt-in. Production startup now requires `INVESTMENT_WORKFLOW_ENABLED=true`, explicitly separated public research, strategy and composition databases, a fresh or verified account-owned investment journal, and a root-owned verified release manifest. A failed check stops startup; it does not replace or repair any database automatically.

- Keep the existing `SQLITE_DB_PATH`, portfolio encryption keys, user identities, portfolio directory and encrypted broker reports unchanged.
- Set `INVESTMENT_SOURCE_DB_PATH`, `STRATEGY_DATA_DB_PATH` and `STRATEGY_COMPOSITION_PRICE_DB_PATH` to immutable files in one versioned investment release directory.
- Set `INVESTMENT_DB_PATH` to a separate private journal under the existing portfolio directory. Never deploy the local preview journal.
- Set `INVESTMENT_RELEASE_ID` and `INVESTMENT_RELEASE_MANIFEST_PATH` to the installer's verified release. Startup verifies its identity, ownership, file sizes, bounded schemas, no pending WAL, warehouse versions and cutoff. The installer verifies full SHA-256 and SQLite integrity before writing the manifest.
- The public research database has an explicit table allowlist; private account tables are rejected. Public/private aliases and hard links are rejected.
- Production rejects local-owner overrides and authentication bypass flags. Every investment request must bind the authenticated UUID to the same authenticated bearer subject. Account reads and append-only writes remain owner-scoped. Existing owner-only admin authorization is unchanged.

## Compatibility and bounded work

The existing broker client remains the source of real portfolios. The only added broker-client behavior requests a bounded 365-day Flex report when no separate history query is configured; the existing complete encrypted-report fallback is preserved on upstream failure. No secrets or account reports are copied to the public release.

Backtests run off the API event loop, with one active production worker, no unbounded queue, a 512 MB old-generation heap, and a 90-second composition deadline (45 seconds for legacy strategy requests). Concurrent excess requests receive HTTP 429. Errors do not substitute fabricated or cash-only curves.

Public health now performs its existing full table/curve audit in one read-only worker instead of blocking the API event loop on synchronous SQLite scans. The worker has an eight-second deadline, 256 MB old-generation / 16 MB young-generation / 4 MB stack limits, and an 8 MB SQLite page cache. It never imports the writable legacy database initializer. A timed-out worker retains its single slot until actual exit, so repeated requests cannot pile up native reads. The existing success/failure TTL limits remain 30/5 seconds, measured after completion; unavailable verification replaces any previous healthy result with HTTP 503 and the complete dynamic curve matrix marked unverified. No strict/proxy, temporal, identity, freshness or coverage gate was weakened.

Read-only runtime dependencies were included explicitly: investment/strategy/hedge modules, portfolio analytical adapters, company-name and value-flow catalogs, and the original-document hash ledger used by guidance verification. No financial API refresh, financial database updater or pending valuation activation script was added. Existing backtest math defaults remain unchanged; newly exported allocation helpers and opt-in explicit strategy cash support are tested separately. Guru catalog additions and the exact BioTime/Lineage CUSIP continuity entry follow the existing identity mechanisms.

## Verification

- Clean release clone: `npm ci --ignore-scripts` completed; npm reported zero vulnerabilities.
- Exact production runtime, Node **22.22.3**: `node --test --test-reporter=spec server/*.test.js` — **1,251 passed; zero failed; zero skipped** after the health-worker and WAL-retention fixes.
- Required transport/cache/performance regression suite — **52 passed**. Health-specific suite — **32 passed**, including identical direct/worker payloads, unchanged SQLite SHA and schemas, no creation of missing databases, worker timeout/error handling, bounded failure caching, and eight coalesced health callers while a real anonymous portfolio HTTP request still returns 401 during a blocked audit.
- Production gates cover disabled startup, copied private tables, unverified owners, dev impersonation, manifest ownership, file aliases, symlinks, pending WAL, schema/version mismatches, and per-account idempotency/isolation.
- Sanitized candidate databases were independently exercised with the production worker limits: index/annual CTA/leverage (214 ms), four-factor/30% valuation filter (12.1 s), and three-Guru/61% valuation filter/annual CTA (1.95 s). Each produced 21 snapshots through 2026-09-11 with no cash substitution. Worst measured total process RSS was approximately 474 MB; this is a measured representative workload, not a concurrency or load-test guarantee.

Deployment and end-to-end production checks are separate from these local results. The existing single-host SQLite setup remains a low-user-count architecture; horizontal scaling requires deliberate shared-storage or database migration rather than copying private files across hosts.

The worker change is an availability containment fix, not a claim that the underlying table scans became faster. Whole-dataset before/after p95 comparison and a cold production-disk health burst remain deployment verification work; local synthetic timing is not production latency. The old read-only aggregate still audits the original legacy database, and this change does not make incompatible or missing Guru caches healthy.

## WAL disk maintenance

The writable legacy connection explicitly retains its existing 1,000-page automatic checkpoint policy and adds a 64 MiB retained journal-size limit. This limit reclaims excess allocation after a successful WAL reset; it is **not** a hard limit on an active WAL. Long-lived readers, a large write transaction, or sustained writers can still make the WAL exceed it. No journal mode, schema or application row was changed by this policy.

The standalone `scripts/checkpoint-sqlite-wal.mjs` is read-only unless `--execute` is supplied. Its NOOP inspection reports both physical sidecar size and logical frames. Execution requires the exact current database device/inode, execution as its non-root owner, a matching user-backup generation with verified remote/off-host restore captured within two hours, and an explicit rollback-snapshot ID. The snapshot ID is an operator acknowledgement; the script does not call AWS or independently verify snapshot completion.

After verifying that snapshot in AWS and stopping unrelated installer/audit disk I/O, run at most one maintenance attempt. The script performs normal SQLite `wal_checkpoint(TRUNCATE)` in a separate process with a one-second busy timeout and a 15-second outer deadline. It never deletes WAL/SHM files, copies the live database, runs VACUUM, or modifies application rows. A busy or unconfirmed result requires inspection, not automatic retries or file deletion. Schema digests are compared; concurrent writers may append new frames immediately after success.

Targeted verification: **5/5 passed** on Node 22.22.3 / SQLite 3.51.3, including unchanged read-only inspection bytes, rejected unsafe identities/backups, successful allocation reclamation with preserved rows/schema and subsequent writes, and a pinned reader returning busy in approximately one second without losing committed data. No production checkpoint was performed as part of these source tests.
