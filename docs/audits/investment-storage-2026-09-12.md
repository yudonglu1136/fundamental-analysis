# Investment release storage audit — 2026-09-12

This is a bounded storage/data-isolation audit, not a completed production deployment or Guru-curve release. Filesystem inventory and duplicate proof were read-only. Do not infer that proposed cleanup has occurred; the deployment operator owns the final receipt.

## Existing host and exact recoverable duplicate

The existing volume is 32,132,542,464 bytes. The initial bounded inventory found 14,901,981,184 bytes free. The original active database remains `/var/app/data/guru-analysis.sqlite` (2,739,519,488 bytes); it is not replaced by this release. No bundled SQLite copies were found under the active or staged application directories.

An inactive historical audit directory contains a raw `runtime.sqlite` (2,739,396,608 bytes) and its gzip (303,698,427 bytes). A streamed, throttled full-byte proof verified gzip CRC, expanded size and expanded SHA-256 against the raw file:

| File | SHA-256 |
| --- | --- |
| `/var/app/data/guru-valuation-audit-20260905/runtime.sqlite` | `48ebd5798d59e1914273fe39a4811bae7db4e9c15547d1c9da8da54f731ff6d4` |
| Same path plus `.gz` | `20f943ce3b670739e6ee2430689cec3f98fc502b17b5e354c73bbcd2f7d996d9` |

Before/after process-FD consumers and Elastic Beanstalk environment references were empty, and the audit WAL was empty. Before removing only the raw audit copy, the operator must also check active code/service references, compare the proof's unchanged size/inode/mtime/ownership, and retain the verified gzip and rollback snapshot. This is a recoverable duplicate, not permission to delete its directory or any active database.

The 2,368,653,952-byte active database WAL is a SQLite journal, not an uploaded duplicate. It must never be manually deleted. Any checkpoint must be SQLite-managed, bounded, backed up and separately approved. Thirteen older compressed backups (2,352,654,035 bytes total), one prior-release compressed backup (298,940,622 bytes), and all per-user portfolio stores remain protected; they were not proven identical or disposable.

## Isolated public release and capacity

The release contains exactly three immutable public-only databases:

| Role | Bytes | SHA-256 |
| --- | ---: | --- |
| Research | 2,952,052,736 | `1eb637ca72dab198075b92f1a72b6536fff0e5c4da18be1578bc2c8e922bfce9` |
| Strategy | 4,905,816,064 | `54767025ada6ab58648b72ce282c2b632d84a2bd69eaa05c4fc219c1a07e42a5` |
| Composition | 543,330,304 | `d95bfc4ef45b6c5acdfa793014644f05b70b2523a59007c4d180924db8c77c9b` |

Only the new research file was installed at audit time. The remaining transfer needs 5,449,146,368 bytes. At the completed proof's free space of 14,901,706,752 bytes, installation would leave 9,452,560,384 bytes free without cleanup, or 12,191,956,992 bytes after removing only the verified inactive raw audit copy. The installer requires at least 10 GiB projected free and counts only missing bytes, including resumable partials.

Research, strategy and composition were freshly fully validated locally at 20:15:14.166Z, 20:11:35.325Z and 20:11:40.166Z respectively. All returned full `integrity_check=ok`, zero foreign-key violations, exact public table allowlists, DELETE journal mode with no sidecars, and matching SHA-256. Source inode and modification time remained unchanged. The private producer receipt binds these checks to the exact bytes. AWS verifies the same SHA-256 during bounded sequential transfer, then validates schema/header/isolation; it does not claim another full integrity/FK scan on the small live EBS volume.

## Intended materialization versus accidental duplication

Research and strategy contain overlapping historical observations by design, not multiple rows caused by repeated imports. Research serves the existing JSON/PIT source adapter. Strategy is a normalized warehouse with source documents, explicit security/filing lineage, and indexed metrics. Composition carries an independently audited, consistent-vintage adjusted-return history. Provider, adjustment basis and vintage must not be conflated during deduplication.

Local `dbstat` attribution found research `price_points` plus its primary-key index use about 613 MB, strategy `price_observations` plus its primary-key index about 1.44 GB, and composition prices plus its index about 535 MB. Much of the remaining footprint is valuation snapshots/model JSON, source evidence and normalized metrics—not duplicate price files.

Existing unique-key behavior is already idempotent at the intended grain:

- Runtime prices: `(symbol, date)` primary key; audited append uses `ON CONFLICT DO NOTHING`, while existing controlled writers upsert that key.
- Guru caches: `(guru_id, years)`; snapshots retain their existing manager/ticker keys.
- Strategy observations: `(series_id, date)`. Immutable import accepts an existing key only when the complete typed row agrees; a conflicting immutable record raises an error.
- Composition prices: `(symbol, date)`; provider-vintage harvest updates that exact key, not a second copy of the date.

Dropping the research price table would break the required source contract and the fallback reader in `strategyLabSource.js`. A future shared market-data store needs explicit provider/vintage keys and adapter/PIT regression work; deleting a table now is not safe optimization.

## Immediate prevention and bounded retention

The reviewed installer now uses exclusive operator locks, exact SHA/size/table contracts, resumable no-clobber downloads, and immutable root-owned manifests. Re-running the exact finalized release returns the same receipt with zero downloaded/additional bytes. A differently named release with the same complete content set is rejected and identifies the existing release for explicit pointer reuse. It does not silently create another copy or hard link unrelated databases. Tests cover both behaviors, mismatched/corrupt files, writable/unexpected entries and disk preflight.

On this volume, retain one active immutable release locally. A new candidate may be staged only if the 10 GiB headroom guard passes. A second complete 8.4 GB public release may exceed that reserve after activation; the guard stops before download instead of accumulating copies. Subsequent full-data updates therefore need a separately reviewed incremental/versioned storage or off-host retention plan. Before rotating an old inactive public release off-host, verify its complete private object set, manifest and rollback restore path; check all consumers and exact activation pointers; then remove only that explicit inactive release with an operator receipt. Never apply release retention to user portfolio stores or the original legacy database. Preserve existing backups until a separately reviewed off-host retention plan is in place. No automatic broad cleanup is introduced.

## Truth-state limitation

Data/code compatibility does not mean the existing Guru-study caches are current. The candidate has incompatible older security-master curve identities and lacks current caches for the newly configured managers. These must remain explicitly unavailable, not be relabeled as current curves. Public health and a complete 5Y/10Y Guru refresh have separate existing gates; installing the redesigned source cannot make them pass by assertion.
