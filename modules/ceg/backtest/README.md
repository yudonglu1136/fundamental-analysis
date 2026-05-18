# CEG Backend Backtest

CEG uses the unified stock-backend buy-and-hold pattern. Daily price bars are imported from the local Nasdaq chart payloads for CEG and SPY. Nasdaq chart payloads do not provide a clean dividend-adjusted close, so imported rows are marked `market_data_unadjusted_or_close_fallback`.
