# Backend Consolidation Phase 5

## Near-Term Strategy

Use per-ticker SQLite databases with a unified runner framework.

This keeps the existing backend data intact while standardizing operations. A single unified research database remains a possible future destination, but it would currently require coordinated migrations across ticker-specific API services, schema modules, seeders, validators, and local data. The safer near-term path is to wrap existing workflows with a shared manifest and runner.

## Current Shape

- Local research databases live at `data/local/{ticker}/backend/{ticker}_research.sqlite`.
- Backend schema and ingestion code generally live under `modules/{ticker}`.
- API access is already unified through `apps/api/src/routes/stockBackend.mjs`.
- Operational commands are still fragmented across many per-ticker scripts.

## Shared Task Vocabulary

- `seed`
- `import-prices`
- `backfill-valuations`
- `run-valuation`
- `validate`
- `fetch-official`
- `fetch-transcripts`
- `build-dataset`
- `build-metrics`
- `build-qa-pairs`
- `model-validate`

## New Runner

Inspect capabilities:

```bash
node scripts/backend_runner.mjs --list
```

Run validation for selected tickers:

```bash
node scripts/backend_runner.mjs --task validate --tickers v,now,anet,ma --continue-on-error
```

Preview a write task without running it:

```bash
node scripts/backend_runner.mjs --task import-prices --all --dry-run
```

## Migration Path

1. Keep existing ticker scripts as the source of truth.
2. Use `backend_manifest.mjs` to discover which tickers support which tasks.
3. Use `backend_runner.mjs` for safe orchestration.
4. In Phase 6, compose top-level update workflows from the runner.
5. Later, move common script internals into shared backend utilities after the runner proves stable.

## Phase 6 Operator Workflow

Phase 6 adds `scripts/data_workflow.mjs` as the operator-facing orchestrator. The default `data:update` sequence is:

```text
import-prices -> backfill-valuations -> validate
```

This keeps `seed`, official fetchers, transcript fetchers, dataset builders, metric builders, and QA-pair builders out of the broad default update path. See `docs/data_operator_runbook.md` for exact commands.

## Phase 7 Handoff Docs

The central operator handoff is now `docs/platform_operations_guide.md`.

Use it for:

- platform architecture and stock module boundaries
- backend Option B rationale
- command semantics
- maintenance cadence
- source freshness checks
- failure investigation
- capability matrix
