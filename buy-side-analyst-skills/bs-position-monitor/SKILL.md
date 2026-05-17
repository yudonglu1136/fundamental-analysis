---
name: bs-position-monitor
description: Create or update a post-investment monitoring system for a public-equity position, including KPIs, catalysts, risk triggers, data sources, and review cadence. Use after a position is initiated or for ongoing portfolio monitoring.
---

# Position monitoring workflow

## Inputs
- Position thesis, model drivers, current holdings context if supplied, catalyst calendar, data sources, and risk limits.

## Process
1. Convert the thesis into measurable leading and lagging indicators.
2. Build a monitoring dashboard spec: KPIs, source, frequency, owner, threshold, and action implication.
3. Define catalyst calendar: earnings, investor days, product launches, regulatory dates, macro releases, competitor reports, lockup expiries, and capital allocation events.
4. Create risk triggers: data thresholds that require review, reduce/add discussion, or exit debate.
5. Link monitoring items to model assumptions and valuation drivers.
6. Generate a weekly/monthly review prompt that can be reused in Codex.

## Output format
- Thesis-to-KPI map
- Catalyst calendar
- Risk trigger table
- Data source checklist
- Review cadence
- Reusable monitoring prompt

Do not assume access to live market data unless an MCP, plugin, or user-provided data source is available.
