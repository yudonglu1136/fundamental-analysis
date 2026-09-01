# Source database diagnostic side effect

Status: contained; no production deployment; no further direct access allowed

## What happened

At approximately 2026-09-01 06:42 +03, a diagnostic command imported
`server/localDatabase.js` with the sibling research database set as
`SQLITE_DB_PATH`:

```text
SQLITE_DB_PATH=/Users/yudonglu/Documents/fundamental-analysis/server/data/guru-analysis.sqlite
node --input-type=module -e 'import { readDatabaseTableSummaries } from "./server/localDatabase.js"; ...'
```

That module has startup synchronization side effects. Its log reported:

- 2 bundled Guru backtest rows considered for synchronization;
- 53 dividend events and 5 ticker assets synchronized.

The source database retained the same byte size (`709,148,672` bytes), but its
SHA-256 changed from a recorded pre-import prefix of `be91...` to:

```text
47726f0396cb8acb366211d1c4e88c8c08f838527e0266f6955d5f9eef8e6c87
```

The two bundled all-history backtest keys were `chamath-palihapitiya:0` and
`gavin-baker:0`, both ending 2026-08-31. The dividend synchronization covered
53 events for AAPL, GOOGL, MSFT, NVDA and TSM. The post-event source contains
37 backtest rows and 58 dividend rows in total.

## Containment

- The sibling source database is no longer opened by any diagnostic or test.
- The current source and Ontology files were frozen into a temporary input set;
  every benchmark process copies that frozen database again before starting.
- Benchmark child processes disable all bundled synchronization, refreshers and
  scheduled writes.
- No AWS, Vercel, GitHub or production database was changed.

## Recovery judgment

An exact byte-for-byte pre-import snapshot is not available: the first benchmark
had copied the database before the import, but its temporary directory was
cleaned after a failed semantic check. Several older temporary research copies
exist, but their Guru backtest refresh times differ, so none can be proven to be
the exact source state at 06:42.

No speculative restoration was attempted. Replacing the two rows from an older
copy could overwrite intentional work, and rewriting the whole database would
be substantially riskier. If restoration is requested, use an authoritative
pre-06:42 backup or production backup, compare only the affected table keys,
and apply a reviewed transaction after creating a fresh backup.
