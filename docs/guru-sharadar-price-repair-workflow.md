# Guru Sharadar price-repair workflow

This workflow restores exact adjusted-price rows needed by an audited Guru
backtest without committing paid Sharadar data to Git. It is for documented
historical gaps only; it is not a general market-data seed.

## Inputs and selection

The source is the local Sharadar SEP `prices` Parquet dataset. The builder also
requires the original `stocks.csv.zip` and its `download_manifest.json`; it
checks the archive byte count and SHA-256 before reading any rows. Raw OHLC and
volume come from SEP, and `closeadj` is the adjusted close used by the return
engine.

The plan must contain the minimum active holding intervals produced by the
same 40-quarter SEC schedule used by the 5Y/10Y backtest. An interval begins on
the modeled execution session and ends at the next modeled rebalance or the
backtest end. A verified corporate action may shorten it with an end-exclusive
terminal date. Do not substitute first/last 13F report dates for these modeled
execution intervals.

The input target manifest uses schema version 2 and must declare the expected
post-repair result for every affected Guru and every required window. There is
no implicit `ready` default. Copy each status from the isolated candidate's 5Y
and 10Y acceptance reports only after reviewing the strict/proxy evidence:

```json
{
  "schemaVersion": 2,
  "kind": "guru_active_price_targets",
  "targets": [
    {"symbol": "ZEN", "guruIds": ["dan-loeb"]},
    {"symbol": "JHG", "guruIds": ["nelson-peltz"]}
  ],
  "refreshTargets": [
    {"guruId": "dan-loeb", "years": 5, "expectedStatus": "ready"},
    {"guruId": "dan-loeb", "years": 10, "expectedStatus": "ready"},
    {"guruId": "nelson-peltz", "years": 5, "expectedStatus": "proxy_ready"},
    {"guruId": "nelson-peltz", "years": 10, "expectedStatus": "proxy_ready"}
  ]
}
```

The builder rejects the legacy `refreshGuruIds` shortcut, duplicates, missing
5Y/10Y rows, unknown statuses, and any price-series Guru without a status
matrix. It canonicalizes the matrix and records both the target-manifest hash
and refresh-target hash in `generatedFrom.refreshTargetContract`.

Example plan shape (dates and versions are illustrative, not release inputs):

```json
{
  "schemaVersion": 1,
  "kind": "guru_sharadar_price_repair_plan",
  "generatedFrom": {
    "refreshTargetContract": {
      "mode": "explicit_per_guru_window",
      "targetManifestSchemaVersion": 2,
      "targetManifestSha256": "<sha256>",
      "refreshTargetsSha256": "<sha256>",
      "allowedExpectedStatuses": ["ready", "proxy_ready"],
      "requiredWindows": [5, 10],
      "targetCount": 2,
      "proxyTargets": []
    }
  },
  "series": [
    {
      "symbol": "ZEN",
      "startDate": "2022-05-17",
      "endDate": "2022-11-21",
      "affectedGuruIds": ["dan-loeb"]
    }
  ],
  "refreshTargets": [
    {"guruId": "dan-loeb", "years": 5, "expectedStatus": "ready"},
    {"guruId": "dan-loeb", "years": 10, "expectedStatus": "ready"}
  ],
  "expectations": {
    "strictMethodVersion": "<current strict version>",
    "proxyMethodVersion": "<current proxy version>",
    "securityMasterVersion": "<current security-master version>",
    "expectedDisplayableRows": 54
  }
}
```

Generate the minimum plan from the same runtime price-requirement helper used
by manager backtests. The helper is manager-aware, so corporate-action and
private-rollover boundaries (including JHG for Nelson Peltz) cannot diverge
between plan generation and execution. The script opens the candidate only for
SPY-calendar reads and directs SEC/cache work to a disposable scratch database.

```bash
node scripts/build-guru-active-price-plan.mjs \
  --database=/absolute/private/candidate.sqlite \
  --targets=/absolute/private/active-price-targets.json \
  --output=/absolute/private/active-price-plan.json \
  --end-date=2026-09-01 \
  --years=10
```

The target manifest is an explicit allowlist of delisted symbols, affected
managers, and exact expected outcomes; it is not inferred from a broad paid-
price universe. Review the generated public schedule and status-contract
metadata before extraction. The private artifact builder re-hashes the status
matrix and rejects a changed status or contract before reading licensed rows.

## Build the private unbound artifact

Write both the plan and artifact outside the repository. Use the exact
candidate database that will be audited so its SPY sessions define the trading
calendar.

```bash
python3 scripts/build-guru-sharadar-price-repair.py \
  --parquet-dir /absolute/private/sharadar/parquet/prices \
  --download-manifest /absolute/private/sharadar/raw/download_manifest.json \
  --source-archive /absolute/private/sharadar/raw/stocks.csv.zip \
  --database /absolute/private/candidate.sqlite \
  --plan /absolute/private/active-price-plan.json \
  --output /absolute/private/guru-price-repair.unbound.json \
  --generated-at 2026-09-03T00:00:00Z
```

The default is fail-closed if any planned SPY session lacks a Sharadar row. Use
`--allow-missing-spy-sessions` only after auditing the missing dates; it emits
separate exact runs around each gap and records every missing date. The builder
sorts rows, rejects duplicates and invalid OHLCV, never interpolates or
forward-fills, enforces the runtime 5,000-row series and 20,000-row batch limits,
and creates the artifact with mode `0600`.

A split artifact with `buildDisposition` set to
`partial_exact_rows_with_known_source_gaps` may restore only the exact rows it
contains. It is not evidence of complete strict-price coverage:
`strictPriceCoverageEligible` remains false, and the strict curve must continue
to fail closed across the missing session. A separately labelled proxy curve
may be shown only if it independently passes its own coverage gates.

The artifact's hashed `sourceReference` binds the verified source archive, the
download manifest, and the selected Parquet partitions. `buildAudit` records
the exact SPY-session hash and per-symbol coverage. The file remains unbound
until production snapshot and release identities exist.

For the September 2026 catalog release, the verified Sharadar archive and its
Parquet derivative both end LFG at 2022-12-22. The public active interval still
requires 2022-12-23 and 2022-12-27: the merger closed and NYSE trading halted
before the open on 2022-12-28. Those two sessions are therefore a known upstream
source gap, not a corporate-action cutoff. They must never be forward-filled or
synthesized. The official boundary is documented in the issuer's
[December 28, 2022 Form 8-K](https://www.sec.gov/Archives/edgar/data/1823766/000121390022083247/ea170864-8k_archaea.htm).

## Apply to an offline candidate

Dry-run validation is the default:

```bash
node scripts/apply-local-guru-price-repair.mjs \
  --artifact=/absolute/private/guru-price-repair.unbound.json \
  --database=/absolute/private/candidate.sqlite \
  --release-id=guru-curves-local-candidate-20260903 \
  --operator=local-candidate/analyst
```

An offline write needs an explicit confirmation and creates a consistent
pre-write SQLite backup before the atomic audited import:

```bash
node scripts/apply-local-guru-price-repair.mjs \
  --artifact=/absolute/private/guru-price-repair.unbound.json \
  --database=/absolute/private/candidate.sqlite \
  --backup=/absolute/private/candidate-before-price-repair.sqlite \
  --output=/absolute/private/candidate-price-repair-report.json \
  --release-id=guru-curves-local-candidate-20260903 \
  --operator=local-candidate/analyst \
  --apply=true \
  --confirm=offline-candidate-write
```

This mode refuses `NODE_ENV=production`, `/var/app/*`, and any database,
artifact report, or backup in the repository. Its release and operator fields
are visibly non-production in the SQLite audit ledger.

## Production binding

After creating and verifying the required EBS source snapshot and encrypted
rollback copy, bind the same unbound rows to the release:

```bash
node scripts/bind-guru-price-repair-release.mjs \
  --input=/absolute/private/guru-price-repair.unbound.json \
  --output=/absolute/private/guru-price-repair.bound.json \
  --release-id=guru-curves-<release> \
  --source-volume-id=vol-<id> \
  --source-snapshot-id=snap-<id> \
  --encrypted-snapshot-id=snap-<id> \
  --operator=<release-operator>
```

Continue with the private-S3, postdeploy, full-population 5Y/10Y prewarm, and
cleanup gates in `docs/deployment-contract.md`. Never reuse the local-candidate
identity in production and never upload the unbound or bound licensed artifact
to GitHub or a public object store.

The production route requires exact status equality. An undeclared
`proxy_ready` result cannot satisfy a target declared as `ready`, and a strict
`ready` result cannot silently replace a target declared as `proxy_ready`.

## Test

```bash
node --test server/guruActivePricePlan.test.js server/guruPriceRepairRoute.test.js
python3 -m unittest scripts/test_build_guru_sharadar_price_repair.py -v
```

The tests cover explicit status matrices, missing/invalid status failures,
runtime exact-status matching, status-contract hashes, source-hash rejection,
SPY-session gaps, row sorting, `closeadj` selection, repository-output refusal,
existing release binding, and the backed-up non-production candidate import
ledger.
