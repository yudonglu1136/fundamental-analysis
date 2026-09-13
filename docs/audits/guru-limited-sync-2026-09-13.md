# Limited Guru synchronization candidate — 2026-09-13

Status: **offline candidate verified; this document does not attest deployment**.

The user explicitly requested “四个新guru和缓存 同步 发布上线 申报错误不要管了”.
This authorizes a limited synchronization while source-filing repair is deferred.
It does not authorize fabricated holdings, altered computation timestamps,
relabeled cache identities, weakened coverage, or a claim that every curve is ready.
The normal full-data release gate remains unchanged and failing. A separate narrow
acceptance check permits exactly the two documented John Stamas failures.

## Exact data scope

The artifact contains only four existing public Guru tables: four new snapshots,
four exposure payloads, the complete 32-enabled-manager × 5Y/10Y strict cache
matrix, and 33 existing compatible linked proxies. The other 31 proxy keys are
explicit delete operations so an older incompatible proxy cannot resurface.
There are no price, financial, user, portfolio, credential, strategy-warehouse,
or dashboard rows. The redesigned consensus and quarter views read the snapshot
and exposure tables directly, so no legacy dashboard rebuild is required.

| New manager | Correct filer CIK | Latest original | Positions | Exposure nodes |
|---|---|---|---:|---:|
| William Heard — Heard Capital LLC | 0001796409 | 0001172661-26-003256 | 21 | 27 |
| Evan McGoff — Dock Street Asset Management Inc | 0001172779 | 0001172779-26-000003 | 64 | 40 |
| Michael Cuggino — Pacific Heights Asset Management LLC | 0001323414 | 0001193125-26-353582 | 77 | 40 |
| John Stamas — Defender Capital, LLC. | 0001766929 | 0001766929-26-000003 | 37 | 31, including two explicit failures |

All four latest report dates are 2026-06-30. The offline builder independently
reconciled latest and prior official cached SEC table shares and values, portfolio
weights, descending rank, full activity sets and category counts. Every latest
ticker also matches the current canonical security master. Official receipt URLs,
body SHA-256, actual source-fetch times and source-stage hashes are in the JSON
companion. This is firm-level 13F history, not a personal track record; Dock
Street's history predates McGoff's tenure, and Pacific Heights' 13F does not
reconstruct the entire Permanent Portfolio allocation.

## Compatible caches and explicit failures

The actual isolated recomputation source is the previously retained
`guru-curve-acceptance-work-E4NH9Q/guru-analysis.acceptance.sqlite` artifact.
Its original data timestamps and payload JSON are preserved for all usable
curves: **29 strict-ready + 33 proxy-ready = 62 displayable of 64 slots**.
Method is `manager13f-drifted-total-return-v9`, proxy method is
`manager13f-public-holdings-proxy-v1`, and security master is
`holding-resolution-v1-cb446ae272b57a41`. No new root refresh generation is asserted.
The 31 comparable managers share 1,145 sessions, 2022-02-15 to 2026-09-10.

John Stamas' 5Y and 10Y native `insufficient_data` results remain unavailable.
Their original generated times, method identity and failure status remain intact.
Known untrustworthy numeric coverage diagnostics were redacted, not recalculated;
the operator manifest binds both original and redacted row hashes.

- 2022 Q1, accession `0001766929-22-000002`: erroneous original MIRION value;
  its later restatement is neither backdated nor substituted.
- 2025 Q3, accession `0001766929-25-000005`: placeholder CUSIP repeated across
  unrelated issuers. The old staging's fabricated-looking aggregate COST 100%
  holding is not published. The existing strategy warehouse's unresolved row is
  separate and is not changed by this artifact.
- Both dates remain explicit `source_error` exposure nodes, with null economic
  values and no holdings/movement results. They are not zero-value portfolios.
- The following valid quarters, 2022 Q2 and 2025 Q4, retain actual current
  holdings but suppress comparisons against the bad prior quarter. There is no
  silent carry-forward or invented add/sell activity.

Historical coverage is not certified complete: 36 older Dock Street originals
and one Pacific Heights original remain unparsed; three Heard 2021 Q1/Q2/Q3
cover totals disagree with summed rows. Excluded amendments retain the existing
original-only policy. Those source repairs remain deferred.

## Preservation, transfer size and checks

The local candidate was made from the sanitized public research file using a
copy-on-write copy, then the exact operator SQL and row-key contract. Full
streaming semantic hashes of every non-target row and every non-Guru table are
identical before/after. Schema is unchanged. Full SQLite `integrity_check` and
`foreign_key_check` passed at 2026-09-13T04:58:28.227Z. Reapplying the delta is an
`already_applied` no-op and preserves the exact final file hash.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Base public research | 2,952,052,736 | `1eb637ca72dab198075b92f1a72b6536fff0e5c4da18be1578bc2c8e922bfce9` |
| Guru-only delta | 50,774,016 | `c91433a8c1fee7d45d41b8f7f29a226bcd613eea68991a9055c1bbbedcd69fa0` |
| Final research candidate | 2,956,435,456 | `92665cbd7e9c7f6464ade2a657af4fefeae86c1f917f6adfc610f2db91b9ec10` |

Research grows by 4,382,720 bytes, not another price/financial database upload.
The measured rollback journal peak is 46,346,776 bytes (5 ms sampling). The
operator must still reserve its conservative margin and existing 10 GiB free
space floor. Unchanged strategy and composition files should remain referenced
at their existing immutable locations.

Tests: eight focused builder tests and six independent scoped-gate tests pass.
The actual candidate also passes the independent scoped gate at both 2026-09-10
and 2026-09-11. The outer public-release cutoff remains the base's 2026-09-11;
the Guru curves retain their real 2026-09-10 end. `fullDataReady` and
`strictReleasePass` remain false. Production backup, AWS install, service restart,
both-domain promotion and visible UI verification are separate operator steps.

Local artifacts are under
`/Users/yudonglu/Documents/guru-limited-release-20260913/`.
Only `guru-delta.sqlite` and the reviewed operator manifest need transfer;
the full research candidate exists for deterministic producer verification.
