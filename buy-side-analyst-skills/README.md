# Buy-side Analyst Skills Pack for Codex

This pack contains instruction-only Codex skills that encode repeatable workflows used in institutional-quality public-equity research.

## Install locally

From the folder that contains this README:

```bash
mkdir -p "$HOME/.agents/skills"
cp -R ./* "$HOME/.agents/skills/"
```

Or use the included installer:

```bash
bash install.sh
```

Restart Codex if the skills do not appear.

## Use in Codex

In Codex CLI or IDE, type `$` and select a skill, or invoke one directly, for example:

```text
$bs-variant-perception Analyze the attached Q1 call transcript, the latest 10-Q, and consensus notes. Build a variant perception memo with evidence table and disconfirming checks.
```

## Included skills

- `bs-initiation-research` — full initiation-style company research memo
- `bs-earnings-call-analysis` — earnings call and release analysis
- `bs-filing-qoe-review` — 10-K/10-Q/20-F quality-of-earnings and filing review
- `bs-variant-perception` — consensus-vs-differentiated-view thesis work
- `bs-valuation-triangulation` — DCF, multiples, unit-economics, scenario triangulation
- `bs-model-audit` — audit Excel/Python valuation or forecast models
- `bs-channel-check-synthesis` — synthesize channel checks, expert calls, and qualitative evidence
- `bs-risk-red-team` — bear case, kill memo, and thesis falsification
- `bs-pm-memo` — concise PM-ready investment memo
- `bs-position-monitor` — post-investment KPI, catalyst, and risk monitoring

## Guardrails

These skills are for research workflow assistance. They do not provide personalized investment advice. Always verify facts and use licensed data sources where required. The skills instruct Codex to separate evidence from assumptions, cite sources supplied by the user, and flag missing or stale data.
