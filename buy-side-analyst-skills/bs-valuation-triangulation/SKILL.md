---
name: bs-valuation-triangulation
description: Build or review valuation triangulation for public equities using DCF, FCF yield, EV/EBITDA, P/E, EV/Sales, SOTP, unit economics, and scenario analysis. Use for valuation memos, model assumptions, and upside/downside work.
---

# Valuation triangulation workflow

## Inputs
- Current price/market cap/EV if supplied, financial model, historical financials, peer set, segment data, assumptions, and required valuation methods.

## Process
1. State data availability and missing market data. Do not invent price, EV, share count, consensus, WACC, or peer multiples.
2. Normalize financials: remove one-offs, stock comp treatment, lease treatment, non-core assets, minority interest, associates, net cash/debt, and working capital quirks.
3. Build the right valuation menu:
   - DCF/FCF yield for cash-generative businesses.
   - EV/EBITDA or EV/EBIT for operating businesses with comparable margins.
   - EV/Sales or gross-profit multiples for early-stage or negative-earnings businesses.
   - SOTP for multi-segment, holding company, or conglomerate structures.
   - Unit-economics valuation for marketplaces, SaaS, fintech, or subscription models.
4. Create base, bull, bear, and stress scenarios with explicit drivers.
5. Identify which variable dominates valuation: growth, margin, reinvestment, terminal value, working capital, discount rate, share count, or multiple.
6. Produce sensitivity tables and key debate questions.

## Output format
- Valuation conclusion with caveats
- Normalization adjustments
- Scenario table
- Method-by-method valuation bridge
- Sensitivities
- Debate variables and data needed

If valuation data is incomplete, output a template and ask for missing fields rather than filling them with guesses.
