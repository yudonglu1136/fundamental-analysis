---
name: bs-model-audit
description: Audit an Excel, CSV, or Python valuation/forecast model for broken formulas, assumption consistency, circularity, unit errors, scenario logic, and investment conclusion robustness. Use for model QA before IC or PM review.
---

# Model audit workflow

## Inputs
- Spreadsheet, notebook, Python model, assumptions tab, output summary, and any stated investment conclusion.

## Process
1. Map model structure: inputs, calculations, outputs, scenarios, and external links.
2. Check formula integrity: broken references, hardcodes in calculation sections, inconsistent formulas across rows/columns, hidden sheets, circular references, and unusual named ranges.
3. Check accounting flow: revenue to EBITDA/EBIT, taxes, working capital, capex, D&A, debt, interest, equity issuance/buybacks, cash flow, and balance-sheet consistency.
4. Check assumptions: units, currencies, fiscal years, share count, segment totals, growth/margin bridge, terminal values, and peer multiples.
5. Test scenarios: bull/base/bear switches, downside case, sensitivity ranges, and edge cases.
6. Compare conclusion robustness: what assumptions must be true, which assumptions are most fragile, and where conclusion changes.

## Output format
- Model QA status: pass / caution / fail
- Critical issues table
- Non-critical cleanup items
- Assumption sensitivity summary
- Suggested fixes
- Questions for model owner

Do not change model files unless the user asks. When modifying files, preserve a backup or clearly list changes.
