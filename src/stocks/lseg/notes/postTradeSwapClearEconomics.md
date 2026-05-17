# LSEG Post Trade / SwapClear Forward Economics Note

## Current model diagnosis

The pre-refactor model was mechanically consistent but structurally conservative around the Post Trade / SwapClear transaction.

- FY2024 to Q1 2025 fair value rose because the historical backend snapshots moved from pre-2025 segment taxonomy, lower margin and weaker cash flow into the stronger 2025 run-rate.
- Q1, H1, Q3 and FY2025 fair value then stayed mostly flat because the revenue run-rate barely changed across those snapshots. The 2025 run-rate inputs were roughly GBP 9.0bn across Q1, H1, Q3 and FY.
- FCF yield improved from Q1 to FY2025 as normalized FCF and official FCF floors improved, but that method is only a 20% weight in the blended valuation.
- Q3 net debt rose meaningfully versus earlier 2025 snapshots, offsetting part of the margin and cash-flow improvement in EV-to-equity methods.
- DCF, SOTP, EV/EBITDA and P/E were not explicitly capitalizing the recurring 2026-2045 economics of the reduced SwapClear bank revenue share.

This was not a calculation bug. It was a model design limitation: the model treated the transaction mainly as a 2025 financial snapshot effect rather than as a forward economics layer.

## Refactor principle

The new layer keeps the 2025 effect separate from the 2026 onward effect.

- FY2025 actual margin, FCF and net debt already reflect part of the transaction, so the model does not add a second 2025 uplift.
- The forward layer only applies after the transaction is known as of the selected snapshot date.
- The 2026 onward step from a 15% bank revenue share to a 10% bank revenue share flows into DCF, FCF yield, SOTP and multiples through typed assumptions.
- The bridge labels the layer as forecast-assumption driven until exact SwapClear surplus-pool source data is added.
