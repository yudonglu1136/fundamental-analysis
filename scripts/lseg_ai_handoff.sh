#!/usr/bin/env bash

cat <<'EOF'
You are working inside the repository:
/Users/yudonglu/Documents/fundamental-analysis

This repository is a plugin-based buy-side fundamental analysis platform, not a
collection of standalone stock pages.

======================================================================
1. Relevant Skills You Should Use
======================================================================

Platform / integration skill:
- bs-platform-adapter
  Use when adapting research or model outputs into the repository's stock-module
  contract, shared UI, validation scripts, and platform types.

Core buy-side research skills relevant to LSEG:
- bs-model-audit
  Use for checking model mechanics, bridge logic, taxonomy consistency, score
  logic, SOTP integrity, and data-quality warnings.
- bs-valuation-triangulation
  Use for DCF / P/E / FCF yield / SOTP cross-checking and valuation framing.
- bs-earnings-call-analysis
  Use for transcript review, management guidance extraction, KPI changes, Q&A
  analysis, and post-event read-through.
- bs-position-monitor
  Use for KPI watchlists, risk triggers, catalyst tracking, and transcript-based
  monitoring design.
- bs-risk-red-team
  Use for bear-case framing, risk register construction, and disconfirming
  evidence plans.
- bs-initiation-research
  Use for full company / thesis synthesis when you need a broader LSEG research
  memo, not just a model tweak.
- bs-pm-memo
  Use to compress outputs into a PM-ready decision note after analysis is done.

Repository-level guidance:
- Read AGENTS.md first.
- Read src/stocks/types.ts before changing output schemas.
- Read src/stocks/registry.ts before changing stock integration behavior.

======================================================================
2. What LSEG Is In This Repository
======================================================================

LSEG is a platform-native stock module, not a standalone web page.

Core module contract:
- data
- calculateSummary
- calculateValuation
- Dashboard
- valuationConfig

Key module entry points:
- src/stocks/lseg/config.ts
- src/stocks/lseg/calculations.ts
- src/stocks/lseg/dashboard.tsx
- src/stocks/lseg/model.ts
- src/stocks/registry.ts

The dashboard should consume LSEG through module.data and the stock registry.
Do not bypass the platform contract unless a migration explicitly requires it.

======================================================================
3. How LSEG Is Analyzed
======================================================================

The LSEG module is built as a buy-side underwriting stack with multiple
cross-checks, not as a single-method valuation page.

Primary valuation methods:
- Forward P/E
- FCF Yield
- DCF
- Operating SOTP
- Strategic / Activist SOTP (optionality only, not base blend)

Key analytical rules:
- DCF uses unlevered FCF and deducts net debt after enterprise value.
- FCF yield uses equity FCF.
- Operating SOTP is base operating value.
- Strategic SOTP is optionality, not default fair value.
- Full SOTP should not silently drive recommended fair value when SOTP
  confidence is weak.
- Facts, assumptions, derived outputs, and placeholders must remain separated.

Current score framework:
- overallIntegrityScore
- sotpIntegrityScore
- sotpConfidenceScore
- dataQualityScore
- recommendedValuationConfidence

Current transcript intelligence is research-only:
- not wired into valuation
- not model-ready
- requires human review before promotion

======================================================================
4. How LSEG Is Constructed
======================================================================

Primary engine graph:
- revenueEngine
- marginEngine
- fcfEngine
- buybackEngine
- waccEngine
- dcfEngine
- sotpEngine
- scenarioEngine
- valuationEngine
- marketImpliedValuationEngine
- consensusComparisonEngine
- qualityDiagnosticsEngine
- valuationIntegrityEngine

These are orchestrated from:
- src/stocks/lseg/calculations.ts

Important older files that are no longer the main architecture:
- moatEngine
- platformGraphEngine
- postTradeEngine
- recurringRevenueEngine
- synergyEngine

Do not treat those older names as the primary current engine graph.

======================================================================
5. LSEG Data Architecture
======================================================================

The LSEG data layer separates:
- actuals
- guidance
- forecast anchors
- market data
- peers
- consensus
- transcripts
- provenance
- strategic optionality inputs
- validation warnings

Important files:
- src/stocks/lseg/data/actuals.ts
- src/stocks/lseg/data/guidance.ts
- src/stocks/lseg/data/forecastAnchors.ts
- src/stocks/lseg/data/marketData.ts
- src/stocks/lseg/data/lsegMarketData.ts
- src/stocks/lseg/data/lsegPeers.ts
- src/stocks/lseg/data/lsegOwnership.ts
- src/stocks/lseg/data/lsegCorporateReconciliation.ts
- src/stocks/lseg/data/provenance.ts
- src/stocks/lseg/data/index.ts
- src/stocks/lseg/data/loaders/composeDataset.ts

Mock fallback is still part of the architecture:
- src/data/mock/lsegRaw.ts

Current real-data staging layers:
- data/local/lseg/yfinance/
- data/local/lseg/transcripts/

These are local research data stores and should not be treated as
institutional-grade facts without verification.

======================================================================
6. Transcript Intelligence Layer
======================================================================

Transcript pipeline artifacts live under:
- data/local/lseg/transcripts/raw/
- data/local/lseg/transcripts/curated/
- data/local/lseg/transcripts/extracted/
- data/local/lseg/transcripts/mapping/

UI / data files:
- src/stocks/lseg/components/TranscriptIntelligenceLab.tsx
- src/stocks/lseg/data/transcripts/callSummaries.ts
- src/stocks/lseg/data/transcripts/callTrendComparisons.ts
- src/stocks/lseg/data/transcripts/callWatchlists.ts
- src/stocks/lseg/data/transcripts/qaPairs.ts
- src/stocks/lseg/data/transcripts/types.ts

Transcript-derived candidates live under:
- src/stocks/lseg/data/candidates/

Critical boundary:
- transcript candidates are candidate-only
- all require human review
- none are model-ready
- none should automatically update valuation assumptions

======================================================================
7. yfinance Layer
======================================================================

Local yfinance research store:
- data/local/lseg/yfinance/raw/
- data/local/lseg/yfinance/curated/

Key current use:
- marketData normalization
- peer multiple cross-checks
- provenance / stale-data warnings

Critical boundary:
- yfinance is an unofficial Yahoo Finance snapshot source
- do not treat it as institutional-grade source data
- do not use it to overwrite curated company guidance or strategic assumptions

======================================================================
8. Safe Working Rules For AI
======================================================================

Do:
- preserve valuation isolation unless explicitly asked to change it
- preserve the stock module contract
- use src/stocks/registry.ts integration path
- add validation when changing model logic or data plumbing
- keep business-specific logic inside src/stocks/lseg
- keep shared math / shared valuation behavior in src/utils
- surface warnings when data is stale, placeholder, manual, or analyst-estimate

Do not:
- create standalone LSEG pages
- wire transcript or candidate data directly into valuation without approval
- invent prices, multiples, consensus, WACC, or ownership data
- treat strategic optionality as base operating value
- silently change valuation outputs when doing data-layer or UI work

======================================================================
9. Recommended Workflow For Future AI Work
======================================================================

If the task is platform integration:
1. Read AGENTS.md
2. Read src/stocks/types.ts
3. Read src/stocks/registry.ts
4. Read src/stocks/lseg/config.ts, calculations.ts, dashboard.tsx, model.ts
5. Check validation scripts before editing

If the task is valuation/model audit:
1. Read calculations.ts and engine files
2. Read data files used by the method under review
3. Read scripts/lseg-model-validation.mjs
4. Check whether outputs are base valuation, optionality, or diagnostics

If the task is transcript / research mapping:
1. Start from data/local/lseg/transcripts/mapping/
2. Treat transcript evidence as candidate-only
3. Require human verification against original PDF and, ideally, IR release/slides
4. Promote only after analyst approval

If the task is market-data ingestion:
1. Start from data/local/lseg/yfinance/curated/
2. Preserve manual fallback
3. Normalize units carefully, especially GBp vs GBP
4. Add provenance and stale-data warnings

======================================================================
10. Key Validation Commands
======================================================================

Run these after material LSEG changes:
- npm run typecheck
- node scripts/lseg-model-validation.mjs
- npm run build

If transcript work changed:
- python scripts/lseg_validate_transcripts.py
- node scripts/lseg_validate_candidate_files.mjs

======================================================================
11. Final Reminder
======================================================================

LSEG in this repository is already a serious buy-side research module.
Your job is usually to improve:
- auditability
- source discipline
- platform compatibility
- research usability
- validation coverage

Your job is not to force more optimistic valuation outputs.
If uncertainty remains, reflect it in:
- warnings
- confidence scores
- candidate-only staging
- monitoring layers
- human-review gates

EOF
