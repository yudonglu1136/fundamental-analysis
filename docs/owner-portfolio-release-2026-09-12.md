# Owner-only Admin and portfolio preservation — release runbook

Scope: a narrow code release from production commit 730dc21. This is not publication of the local investment workflow, factor/CTA backtests or replacement market/financial databases.

## Invariants

- Only server-verified luyudong1136@gmail.com can use Admin; environment role lists cannot grant additional administrators. UI visibility is not authorization.
- Preserve the existing authenticated subject IDs, PORTFOLIO_CREDENTIALS_KEY (or original SUPABASE_JWT_SECRET fallback), HMAC directories and all explicit database paths. Do not derive ownership from email.
- Production continues to use its original per-user SQLite databases. No local portfolio database, SQLite seed, PIT migration artifact or frontend dist is included in the AWS package.
- New portfolio_report_snapshots is additive and encrypted with tenant-bound authenticated encryption. Existing credentials and NAV rows remain in their original tables.
- Save complete successful reports only. Broker failure uses the dated last-good report, explicitly stale; it must not be shown as a fresh successful synchronization.
- Disconnect hides the old report; an in-flight request using an old connection revision cannot republish it.
- The legacy automatic restore/merge hooks are retired. Deployments never restore, merge or reassign user data.

## Pre-release checkpoint (2026-09-12)

A real encrypted off-host backup was uploaded to the existing private AWS S3 bucket and downloaded into an isolated restore directory:
16 databases, 581,632 bytes, 18 encrypted objects. Generation: 4b7817cc-4c21-43cd-a0f4-16a216bc929d.
Both existing credential envelopes decrypted using the original recovered secret. No production databases were replaced. The manifest and separate credential-key recovery envelope are encrypted; the outer recovery key stays outside Git and outside the S3 backup objects.

Source EBS snapshot snap-0d022b9c971b7f469 and encrypted copy snap-064779969926f9020 are completed. Original AWS application version guru-admin-20260906-730dc21 remains the code rollback target.

The operator's temporary SSH permission was restricted to its own /32 address and removed after backup. No additional RDS, instance, ALB or fixed-capacity infrastructure was provisioned. Storage/requests are still usage billed.

## Operator tools

Run under the existing application's OS identity and original environment, never through a public maintenance endpoint. Node 22.22.3 is the validated production runtime.

- `npm run user-data -- inventory`: aggregate counts only.
- `npm run user-data -- backup --output <new-absolute-private-directory>`: authenticated encrypted online SQLite backup; provide USER_DATA_BACKUP_KEY through a protected environment, not command arguments.
- `npm run user-data -- restore --input <backup-directory> --output <new-private-directory>`: isolated integrity/schema/row-count checked restore; refuses existing output paths.
- `node scripts/backup-aws-user-data.mjs --backup-real-users <new-private-directory-outside-repository>`: bounded existing-AWS backup, S3 round trip, credential recovery verification and temporary access cleanup.
- `node scripts/prime-user-portfolio-reports.mjs --apply --expected-connected 2 --expected-users 17`: verify exact original subject/HMAC mappings, then serially fetch and persist complete current reports. Recheck inventory before using these checkpoint counts. The observed-user count (17) is distinct from tenant databases (14) and all backed-up databases (16). Unexpected identities, changed inventory or unreadable credentials fail closed.

The AWS backup wrapper intentionally refuses USER_DATA_ROOT migrations until it shares the deployed path resolver. Existing production paths must not be changed to make the command pass.

## Deployment and verification

1. Run auth/portfolio/storage/backup tests, full backend and Flutter suites, i18n and Ontology checks, performance regression checks, and production prebuild.
2. Commit only the reviewed release closure in a clean trunk checkout; verify the actual published origin/trunk commit.
3. Package AWS code without SQLite, PIT artifacts, Ontology snapshots or frontend dist; deploy the exact version to guru-analysis-api-prod.
4. Verify version/status, preserve original configuration and key bytes. Prime original connected users using validated identities; report any broker failures instead of marking them successful.
5. Re-back up and compare existing identity mappings, credential ciphertext and NAV rows; verify newly persisted reports survive isolated restore.
6. Publish the verified Vercel build and verify both apex and www point to the same artifact. Verify owner Admin access and anonymous/non-owner denials, no-store responses and private-route 404s.
7. Record actual deployment IDs, hashes, test counts, preservation receipts and any outstanding health failures in a separate post-release audit.

For recovery, restore into a new private directory, verify original owner and credential decryptability, freeze writers and obtain explicit cutover authority before changing any paths. A code rollback must retain the additive report table and new user data; it must not restore old databases over new writes.

## Limits

The S3 backup is a verified checkpoint, not an installed daily backup schedule or a measured RPO/RTO commitment. Per-database SQLite snapshots are consistent, but are not one atomic transaction across all user stores. Existing research-data readiness failures and the HTTP-only Vercel-to-EB upstream remain separate release debt; no health gate or local investment production guard is weakened by this code release.
