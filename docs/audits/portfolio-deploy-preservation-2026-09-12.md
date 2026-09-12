# Portfolio preservation release audit — 2026-09-12

## Scope and result

This audit covers preservation of authenticated users' broker connections,
portfolio reports and NAV history during the scoped owner-Admin deployment.
It does not certify unrelated unreleased investment/strategy features. The
auditor did not deploy, modify AWS resources, read live broker credentials into
tool output, or invoke the production priming command.

The main defect was a process-local-only portfolio report cache. Connections
and NAV rows were durable, but a restart followed by a broker outage could
produce an empty holdings response. The release now saves complete, successful
broker report inputs in each user's existing private SQLite database. Failed,
partial-account, or failed-history refreshes retain the dated last complete
report. Without a complete prior report, incomplete inputs are explicitly
partial and do not count as a successful synchronization.

## Identity, storage and encryption invariants

- Keep original Supabase subject IDs and exact credential-key bytes. The
  existing effective key is `PORTFOLIO_CREDENTIALS_KEY`, falling back to
  `SUPABASE_JWT_SECRET`. It also derives the HMAC-based private directory name;
  rotating it without a verified migration can orphan user data.
- Existing production research data remains separate from private portfolio
  data. Legacy paths remain `/var/app/data/guru-analysis.sqlite` and
  `/var/app/data/user-portfolios/`; registry and login databases remain in the
  latter directory. This release does not switch production storage roots.
- Credential encryption and its original AAD are unchanged. Report ciphertext
  uses the same effective encryption key with owner-bound AAD
  `thesisforge-portfolio-report-v1:<existing user hash>`.
- The additive `portfolio_report_snapshots` table is keyed by provider,
  connection revision and report date. Replacing/disconnecting a connection
  cannot expose a prior account's report or publish an old in-flight result.
- No credentials or connection configuration are copied into report payloads.
  The report contains dated broker input fields, not a replacement research
  database or a newly recalculated valuation overlay.
- The existing no-op replacement of legacy restore hooks prevents deployment
  from merging an unrelated portfolio snapshot over live private databases.

## Verification evidence

All tests use synthetic local users and broker responses, not real accounts.

- Main workspace expanded persistence/backup/HTTP/storage regression: 138
  passed before the final narrow history-query guard.
- Clean release persistence, cache, path, backup, recovery and user-handle
  tests: 27 passed. Additional raw report preservation tests: 4 passed.
- Final history-query failure, exact NAV preservation and operator-prime
  regression: 14 passed in both main and clean release directories.
- Backup, one-off priming CLI and AWS priming transport/preservation safety:
  18 passed in the clean release directory. `git diff --check` passed.
- Parent's final clean-release full server test run: 554 passed. Deployment
  operator remains responsible for post-deployment acceptance evidence.

Specific cases include restart, user isolation, unchanged credential/NAV
records, copied-ciphertext owner mismatch, disconnected/replaced connections,
in-flight replacement, stale reports, partial multi-account refreshes, failed
history queries, and no fabricated zero daily P&L from a period statement.

## Before and after deployment

1. Retain a verified off-host encrypted backup and isolated restore receipt.
   Store its recovery key separately from the encrypted objects. A successful
   local-only snapshot is not off-host durability. Root-volume storage can
   disappear with instance replacement.
2. Keep deployment code-only for the private user stores. No seed DB,
   destructive restore, ownership reassignment, or credential-key replacement.
3. Verify the intended Ready/Green EB version, original instance and deployed
   runtime hashes before priming. Recheck current counts rather than assuming
   registry users equal tenant databases: the parent observed 17 listed users,
   14 existing tenant databases, and 2 configured broker connections.
4. From the clean release repository matching the deployed runtime, use the
   operator wrapper only after deployment and the preceding backup:

   ```sh
   node scripts/prime-aws-user-portfolios.mjs --prime-real-users \
     --expected-release <actual-deployed-version> \
     --expected-connected 2 --expected-users 17 --expected-databases 14
   ```

   These are observed pre-release counts, not permanently fixed product
   limits. Supply the latest verified values. The wrapper pins SSH host keys,
   uses an operation-specific temporary TCP22 `/32`, drops to the actual
   application UID/GID, and runs the deployed CLI under the original EB
   environment. No HTTP identity impersonation is used.

5. Priming uses the internal `captureNav:false` option; normal user sync is
   unchanged. The wrapper checks original owner mapping, exact connection
   ciphertext/creation time, all original NAV columns, and retained report
   identities before/after. It produces only aggregate counts, dates and safe
   error categories. A broker/identity/preservation failure is not reported as
   success, and no automatic rollback or database rewrite is attempted.
6. Verify temporary SSH ingress removal, check both connected accounts have
   complete saved reports (or explicitly report unresolved broker failures),
   and create a second verified off-host backup containing the new report rows.

## Remaining operational limits

SQLite backups are internally consistent per database, not one global
cross-database transaction. A future storage migration needs a coordinated
write pause or reconciliation. Independent user schemas and bounded handles
are suitable for the current small deployment, but do not turn instance-local
storage into replicated storage. Broker data freshness remains the broker's
actual report date; saved reports are not live quotes.
