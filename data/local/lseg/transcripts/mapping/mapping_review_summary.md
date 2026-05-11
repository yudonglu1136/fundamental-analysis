# LSEG Transcript Mapping Review Summary

Generated at: 2026-05-10T19:41:16Z

## Scope
This review updates the **draft transcript mapping layer only**. No LSEG valuation assumptions, model files, valuation outputs, or candidate `.ts` files were changed or generated.

## Changes Made By Category
### Guidance mapping
- Re-bucketed dividend payout framework out of guidance and into capital allocation policy review.
- Re-bucketed the forward £1 billion buyback announcement out of guidance and into capital allocation review.
- Kept dividend growth policy in capital allocation review rather than guidance-file candidate staging.
- Deferred context-poor margin excerpts and medium-term target language pending transcript-page verification.
- Moved the context-dependent `50% plus` target and the long-dated `circa 8% in 2029` capex target out of near-term guidance candidates.
- Preserved the reviewer-approved safe near-term guidance and forecast-anchor candidates.

### KPI monitoring mapping
- Removed non-operating KPI items: margin expansion, buyback execution, and dividend policy.
- Kept KPI monitoring focused on operating/business KPIs only.

### Risk register mapping
- Removed pricing competition / Workspace competition from the risk register draft and left it in thesis/competition monitoring only.
- Downgraded leverage / capital return commentary out of the risk register and into capital allocation monitoring.
- Downgraded regulatory uncertainty out of the risk register and into neutral-to-cautious monitoring.
- Kept only quote-grounded specific risks in the draft risk register.

### Thesis signal mapping
- Softened MCP wording to `data re-architecture progress is advancing MCP readiness`.
- Downgraded the regulatory item from negative thesis signal to neutral-to-cautious monitoring.
- Softened competition phrasing to `stable for now, but still worth monitoring`.
- Kept the upper-half-of-guide signal at medium confidence and explicitly non-model-ready.

## Updated Candidate Counts
### Guidance
- Before cleanup pass: **36 reviewed / 13 accepted / 23 non-accepted**
- After cleanup pass: **34 reviewed / 11 accepted / 23 non-accepted**
- Moved to capital allocation: **2**
- Moved to KPI monitoring: **2**
- Deferred pending human verification: **1**
- Removed from candidate set: **18**

### KPI monitoring
- Before cleanup pass: **8 kept / 3 removed**
- After cleanup pass: **8 kept / 3 removed**
- Moved within monitoring layers: **0**

### Risk register
- Before cleanup pass: **4 kept / 3 downgraded or moved out**
- After cleanup pass: **4 kept / 3 downgraded or moved out**

### Thesis signals
- Before cleanup pass: **9 revised candidates**
- After cleanup pass: **9 revised candidates**
- Explicitly downgraded / softened: **4**

## Remaining Items Requiring Manual Verification
- All transcript-derived items remain `draft_needs_human_review`.
- OCR-noisy quotes remain in the corpus, especially in some 2024 / H1 2025 passages.
- Three transcript events still have low Q&A boundary confidence.
- All staged transcript sources are still manual uploads rather than verified IR downloads.
- Some extracted subtopics remain imperfect even where the quote itself is useful.

## Explicit Non-Changes
- No LSEG valuation assumptions were changed.
- No valuation outputs were changed.
- No model files were edited.
- No transcript insight was wired into `guidance.ts`, `forecastAnchors.ts`, `strategicOptionality.ts`, or valuation logic.

## Recommended Next Step
Re-review the revised mapping JSON files, then manually verify the remaining accepted guidance candidates against the original transcript PDFs and, where possible, the official release / presentation wording before creating any candidate `.ts` mapping layer.
