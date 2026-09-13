# Guru-only immutable revision

This operator procedure updates four new manager profiles/exposures and the exact
32-manager × 5Y/10Y cache key set. It does not assert that all 64 simulations are
displayable. Source-error/insufficient-data artifacts retain their real state;
no proxy or strict-readiness threshold is changed.

## Scope and rollback

- Run on Node 22.22.3 / SQLite 3.51.3 for deterministic candidate bytes. Root must
  first verify a fresh encrypted EBS snapshot and restorable user-data backup.
- Deploy the reviewed backend with the existing v1 environment first. Do not
  deploy unrelated pending health, financial-source, or parser changes.
- Upload only `guru-delta.sqlite` to the private release object. Keep the reviewed
  external JSON contract off the public frontend. Never upload a user database.
- The new `guru-sync-YYYYMMDD-vN` directory contains its independent research DB,
  the delta receipt DB, and a root-owned readonly v2 manifest. No warehouse copy
  or hard link is created. The old research DB and v1 manifest remain intact.
- v2 permits only strategy/composition reuse from one sibling root-owned readonly
  v1 release. Base manifest SHA, exact file paths/sizes/SHA, and device/inode pins
  are checked at startup. The private and legacy database paths remain unchanged.

## Operator contract

Build `p` from the producer's `guru-delta-manifest.json` (`m`):

```js
const p = {
  version: 'investment-guru-install-v1',
  releaseId: 'guru-sync-20260913-v1',
  cutoff: baseManifest.cutoff, // preserve the warehouse cutoff
  sourceAlignment: 'pass',
  rollbackVerified: true,
  rollbackSnapshot: verifiedEncryptedSnapshotId,
  measuredJournalBytes: m.measurements.measuredJournalBytes,
  baseManifest: {path: originalManifestPath, sha256: originalManifestSha256,
    releaseId: baseManifest.releaseId},
  patch: m,
  delta: {...m.delta, tables: Object.keys(m.tables), downloadUrl: privateSignedUrl},
  research: m.research
};
```

Invoke `installInvestmentGuruDelta(p)` by importing the deployed absolute module
path (`/var/app/current/scripts/install-investment-guru-delta.mjs`). Do not paste
the module into a different working directory with unresolved relative imports.
Use the normal operator SSH helper, low I/O priority, and a bounded Node heap
(384 MiB old-generation is sufficient for the measured ~275 MiB RSS validation
run; measure the actual install process independently).

The installer verifies/copies the exact base bytes at 32 MiB/s, applies one
guarded transaction to a private candidate, then checks the complete candidate
SHA/size and schema against the producer's full integrity/FK and semantic proof.
Only the four static Guru tables are writable. No executable schema or foreign
key path may affect other tables. The producer compares every non-target table
and unselected Guru row semantically; the host's exact-result SHA binds that proof
without repeating multi-million-row price scans on a small production instance.

After successful publication, change only the research path, release manifest
path and release ID environment values. Keep the original strategy/composition,
legacy SQL, private portfolio directory, encryption key and private journal paths.
Rollback is the inverse three-value environment change, not a database restore.

Completed identical installs are no-ops and remain valid after activation.
Unfinished directories are intentionally not overwritten/deleted automatically:
stop, inspect the exact partial artifact and dead installer state, and request a
scoped operator recovery. A failed candidate has no activation manifest.

## Disk evidence (2026-09-13)

| Measure | Bytes |
|---|---:|
| Fresh host available space | 14,555,856,896 |
| New research | 2,956,435,456 |
| Delta | 50,774,016 |
| Measured rollback journal (5 ms sampling) | 46,346,776 |
| Reserved journal (125% + 1 MiB) | 58,982,046 |
| Additional operating reserve | 16,777,216 |
| Projected minimum free during install | 11,472,888,162 |
| Projected final free | 11,548,647,424 |
| Required minimum free | 10,737,418,240 |

These are a preflight, streaming-copy check and final check, not a filesystem
quota. Re-read actual free bytes immediately before install and do not run other
large data writers concurrently. No old research deletion/compression or health
index installation is required or authorized by this procedure.

## Validation

The scoped test suite covers atomic exact-key updates, true failed-cache
preservation, full-byte idempotence, unknown tables/keys, missing/duplicate slots,
wrong filers, stale-target all-or-nothing checks, executable schema rejection,
readonly and hard-link rejection, v1 rollback, v2 SHA/inode/permission/symlink
reuse gates, measured peak-space budgeting and failed-publication isolation.
The full backend suite on the shared reviewed working tree passed 1,274 tests;
the final narrowly packaged release must rerun its own full suite because that
working tree also contains separately scoped, unshipped health changes.

Legacy dashboard synchronization is a separate guarded operation: preserve
`cache_revisions` triggers and merge only the four new catalog profiles. Do not
import a public research file over the legacy database or call a successful-only
refresh bundle to relabel failed source data.
