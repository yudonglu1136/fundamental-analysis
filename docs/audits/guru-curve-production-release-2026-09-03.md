# Guru Curve Production Release Audit — 2026-09-03

## Verdict

- **PASS: all 18 enabled manager pages have a displayable 5Y and 10Y curve (36/36), with 0 failures.**
- Production health reports 1 strict + 17 proxy curves for 5Y and the same for 10Y.
- The strict 90% adjusted-close execution-coverage floor was not lowered.
- A proxy is shown only when its linked strict result fails and every filing still retains at least 30% of the selected Top-60 common-long book and at least two fully priceable positions.
- Production backend: Elastic Beanstalk deployment `205`, application version `guru-curves-20260903-cdb0f1c`.
- Release code was first verified on Vercel deployment `dpl_6YvwA2M3XXePLe2WJsB3tY9Rqj6j`, built from GitHub `trunk` commit `cdb0f1cc1f10a2f862d8c39ad7e119aaff26ae84`; the subsequent report-only commit does not change the runtime bundle.
- `thesisforge.tech` and `www.thesisforge.tech` are explicitly aliased to that same Vercel deployment.

This report contains no licensed price observations, credentials, private holdings, or user portfolio data.

## Before and after

| Gate | Before repair | Final production |
| --- | ---: | ---: |
| Enabled managers visible in the reported broken UI | 1/18 | 18/18 |
| Auditable manager/window cache matrix | 30/36 | 36/36 |
| 5Y displayable | 16/18 | 18/18 |
| 10Y displayable | 14/18 | 18/18 |
| Final health failures | 6 | 0 |

The six production-cache gaps were Stanley Druckenmiller 5Y/10Y, Li Lu 10Y, Chris Bloomstran 5Y/10Y, and George Soros 10Y. The wider user-visible failure also involved the old shell's handling of strict failures and missing/incompatible caches; the restored shell now accepts a correctly linked, explicitly disclosed public-sleeve proxy without presenting it as audited fund performance.

## Manager-by-manager production result

| Manager | 5Y | 10Y | Display status |
| --- | --- | --- | --- |
| Gavin Baker | proxy | proxy | visible |
| Chamath Palihapitiya | proxy | proxy | visible |
| Bill Ackman | proxy | proxy | visible |
| Stanley Druckenmiller | proxy | proxy | visible |
| Brad Gerstner | proxy | proxy | visible |
| Chase Coleman | proxy | proxy | visible |
| Philippe Laffont | proxy | proxy | visible |
| Li Lu | strict | strict | visible |
| Chuck Akre | proxy | proxy | visible |
| Dev Kantesaria | proxy | proxy | visible |
| Chris Bloomstran | proxy | proxy | visible |
| Samantha McLemore | proxy | proxy | visible |
| Terry Smith | proxy | proxy | visible |
| Stan Moss | proxy | proxy | visible |
| Baillie Gifford | proxy | proxy | visible |
| Warren Buffett | proxy | proxy | visible |
| Tom Gayner | proxy | proxy | visible |
| George Soros | proxy | proxy | visible |

Renaissance Technologies and Nick Sleep / Qais Zakaria remain intentionally excluded from the enabled 18-manager simulation population because their public disclosures do not support a truthful proportional copy simulation. No curve was fabricated for either one.

## Data and model repair

- Preserved the current model identities:
  - strict method `manager13f-drifted-total-return-v8`;
  - proxy method `manager13f-public-holdings-proxy-v1`;
  - security master `holding-resolution-v1-c82cc16972346fdb`.
- Repaired audited security mappings, corporate-action continuity, active holding intervals, adjusted-close completeness, same-session filing supersession, and non-common 13F claim filtering.
- Installed one atomic production batch containing 12 independently verified series and 430 exact adjusted-close rows.
- The batch created 12 child audit records and one aggregate audit ledger in the same transaction.
- Production wrote no interpolated, forward-filled, synthetic, or Git-committed price rows.
- A compatible strict result always outranks a proxy. Proxy storage and method identity remain separate from strict storage.

## Production safety evidence

- Source EBS snapshot: `snap-0226aaa938d454958`, completed and bound to root volume `vol-01b9f94bdff27b71b`.
- Encrypted rollback copy: `snap-05a9b452409e8d4c5`, completed and tagged with the source-snapshot lineage.
- Consistent pre-write SQLite backup: `database-backups/guru-analysis-pre-guru-price-20260902T234137Z.sqlite.gz`.
- Clone validation against the production snapshot:
  - 36/36 displayable, 0 failures;
  - `PRAGMA quick_check = ok`;
  - `PRAGMA integrity_check = ok`;
  - Guru holdings, exposure, dashboard, Valuation PIT, and Portfolio NAV non-target counts unchanged;
  - Guru holdings, exposure, and dashboard semantic hashes unchanged.

## Release incident and correction

The data transaction succeeded on the first production attempt, but the deployment did not initially promote:

1. The first attempt completed the atomic price repair and 5Y prewarm, then Node 22's built-in `fetch`/undici response-header timeout stopped the still-running 10Y request after approximately five minutes (`UND_ERR_HEADERS_TIMEOUT`).
2. The second attempt replaced `fetch` with an explicit loopback `node:http` client, but the environment's zero-delay automatic refresher started first. Its CPU-heavy refresh temporarily prevented the release runner's status request from returning within ten seconds.
3. The final release delayed that startup refresh, added bounded retry for transient loopback transport errors, retained immediate failure for non-2xx responses, and capped every window with an explicit 25-minute end-to-end budget. Elastic Beanstalk's command timeout was raised from 1,800 to 3,600 seconds.

The successful run was bound to the repaired generation:

| Window | Started (UTC) | Finished (UTC) | Duration | Result |
| --- | --- | --- | ---: | --- |
| 5Y | 2026-09-03 00:26:33 | 2026-09-03 00:30:39 | 4m 06s | 18/18 displayable |
| 10Y | 2026-09-03 00:30:39 | 2026-09-03 00:37:52 | 7m 13s | 18/18 displayable |

The hook then recorded `displayable=36`, `expectedRows=36`, and `failures=0`; Elastic Beanstalk reported deployment `205` successful after approximately 12 minutes.

## Frontend and API verification

- AWS CNAME `/api/health`: HTTP 200, healthy, 36/36.
- `https://thesisforge.tech/api/health`: HTTP 200, healthy, 36/36.
- `https://www.thesisforge.tech/api/health`: HTTP 200, healthy, 36/36.
- Both public domains returned the same 3,313,401-byte `main.dart.js` with SHA-256 `66b1fc770afc6c1bc08a635a07f267e0b5976d9fa6796dcaf5261bc692040b9d`.
- Flutter regression coverage confirms the curve, 1Y/3Y/5Y/10Y/All selectors, two-handle free date range, proxy coverage disclosure, desktop first-viewport layout, and mobile overflow safety.
- Public internal-route probes remain unavailable through Vercel and the normal EB internal path contract.

## Test matrix

| Check | Result |
| --- | --- |
| Server suite | 350/350 passed |
| Node 22 loopback/prewarm suite | passed |
| Snapshot/repair suite | 12/12 passed |
| Flutter widget suite | 60/60 passed |
| Flutter analyzer | 0 issues |
| Performance/transport suite | 33/33 passed |
| Ontology Python tests | 3/3 passed |
| Ontology Node tests | 17/17 passed |
| Ontology module verification | passed |
| Bilingual coverage audit | passed |
| Flutter production build | passed |

## Cleanup and retained recovery

- Removed the one-time private S3 price-repair object.
- Removed the one-time scoped EC2-role read policy.
- Removed all seven one-time `GURU_PRICE_REPAIR_*` environment variables and reverified 36/36 afterward.
- Terminated the temporary read-only audit EC2 instance and deleted its detached clone volume, security group, AWS key pair, local private key, and local licensed-price working copies.
- Retained the source EBS snapshot, encrypted rollback snapshot, and consistent compressed SQLite backup for recovery.

## Interpretation and remaining limitation

`strict` is the selected Top-60 common-long simulation after every rebalance passes the 90% adjusted-close execution-coverage audit. `proxy` is a separately labeled, fully priceable public-holdings sleeve that passes the 30% and two-position floors. Seventeen production managers currently use that proxy in both windows, so their curves are useful research views but are not represented as audited whole-fund returns.

The remaining architectural issue is operational rather than correctness-related: a full 10Y recomputation is CPU-heavy on the single web instance and can temporarily increase API latency. A future reliability release should move prewarming to a worker or use a multi-instance rolling deployment; this release keeps the one-hour startup delay so routine deployments do not immediately compete with live API traffic.
