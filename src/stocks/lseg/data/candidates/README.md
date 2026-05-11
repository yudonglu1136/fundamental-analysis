# LSEG Transcript Candidate Staging Files

These files are **transcript-derived candidates only**.

They are not official company data, not approved model inputs, and not production assumptions.

## Provenance
- Source quality: `ManualUpload`
- Source type: `transcript_manual_upload`
- Review status: `draft_needs_human_review`
- Verification required: `true` for every item

## Guardrails
- None of these files are wired into the live valuation path.
- None are model-ready.
- None should update valuation automatically.
- Capital allocation items are intentionally separated from operating guidance candidates.
- Forecast anchor candidates require analyst conversion before any promotion.

## Current Candidate Counts
- `guidanceCandidates.ts`: 7
- `forecastAnchorCandidates.ts`: 4
- `monitoringKpiCandidates.ts`: 11
- `riskRegisterCandidates.ts`: 4
- `capitalAllocationCandidates.ts`: 7
- `thesisSignalCandidates.ts`: 9

## Promotion Workflow
1. Verify the quote against the original PDF transcript.
2. Reconcile the wording against official IR release / slides where available.
3. Analyst approves whether the item belongs in an official data file.
4. Promote into the official LSEG data file only after that review.
5. Run validation before any model-facing change.

## What This Step Does Not Do
- It does not edit `guidance.ts`.
- It does not edit `forecastAnchors.ts`.
- It does not edit `strategicOptionality.ts`.
- It does not change valuation outputs.
- It does not change model logic.

## Source Review Context
See the reviewed mapping summary here:
- `/Users/yudonglu/Documents/fundamental-analysis/data/local/lseg/transcripts/mapping/mapping_review_summary.md`
