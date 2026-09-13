# Scoped Guru and cache release — 2026-09-13

## Authorization and limits

The owner explicitly requested: “四个新guru和缓存 同步 发布上线 申报错误不要管了”. This approves synchronizing the four added managers and compatible existing caches while deferring filing-source repairs. It does **not** certify the full data estate or replace the strict all-manager readiness gate.

This scope supersedes the earlier release hold only for these changes. It does not waive authentication, portfolio preservation, source identity, cache methodology, integrity, deduplication, or disk-headroom checks.

## Exact data change

- William Heard / Heard Capital; Evan McGoff / Dock Street Asset Management; Michael Cuggino / Pacific Heights Asset Management; John Stamas / Defender Capital.
- Four latest profiles and four exposure histories. Latest reported quarter: 2026 Q2; 21, 64, 77 and 37 holdings respectively.
- 64 existing strict-cache outcomes and 33 compatible proxy-cache rows for the 32 enabled managers. Existing computation timestamps and method/security-master identities are retained.
- 62 displayable 5Y/10Y windows; exactly John Stamas 5Y and 10Y remain `insufficient_data`. No successful curve is synthesized.
- Defender's 2022 Q1 reported-value error and 2025 Q3 invalid identifiers remain explicit source-error gaps. The next-quarter comparisons are suppressed, not inferred. Historical source repairs and older parse gaps remain deferred.
- Upserts are guarded by exact business keys and before/after row hashes. Stale proxy rows are removed only for listed keys. Reapplying the same patch is a byte-stable no-op.

## Storage and compatibility

The 50,774,016-byte delta has SHA-256 `c91433a8c1fee7d45d41b8f7f29a226bcd613eea68991a9055c1bbbedcd69fa0`.

The research candidate is 2,956,435,456 bytes, SHA-256 `92665cbd7e9c7f6464ade2a657af4fefeae86c1f917f6adfc610f2db91b9ec10`; growth over the immutable baseline is 4,382,720 bytes. Complete SQLite integrity and foreign-key checks pass. Full non-Guru-table and non-target-Guru-row semantic hashes remain unchanged.

The v2 manifest explicitly reuses the existing immutable strategy and composition databases. Paths, base-manifest digest, file sizes, digests, ownership and inode identities are pinned; no duplicate warehouse upload or hardlink-based release is introduced. The old research database is retained for rollback. The installer enforces at least 10 GiB free space even at projected peak usage, with measured rollback-journal reserve.

Only the research path, release-manifest path and release ID change in AWS configuration. User stores, portfolio data, broker connections, credentials, owner-only administration, prices, financials and strategy warehouses are not modified. Financial API refresh remains paused.

## Release acceptance

The dedicated scoped audit must pass with `fullDataReady: false` and `strictReleasePass: false`; unrelated failures are not allowed by this exception. The existing full readiness audit remains strict.

The only UI change explains a source-error quarter as a data gap rather than an empty portfolio or an exit. No Guru redesign, fields or scoring rules are added.

Before activation, capture and verify an encrypted user-data backup and encrypted root-volume rollback snapshot. Deploy v2-compatible backend code against the old v1 manifest first; install the new immutable candidate; then switch the three configuration keys. Verify the live candidate, API access controls, user-data preservation and both production frontend aliases after deployment.

This document records the approved scope and preflight evidence, not a claim that deployment has completed. The operational release receipt records final deployment identifiers and post-deployment checks.
