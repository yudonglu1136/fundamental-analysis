# English entry and public ISRG case

## Scope

The existing terminal stays at `/`. First visits default to English, explicit
Chinese remains supported, and the login panel links to an English-only case
that does not require a session: `/research/isrg/`. Social posts should link
directly to this trailing-slash URL, not to the login page.

The case is static HTML, CSS and SVG; it makes no API calls and loads no Flutter,
auth SDK or third-party tracking code. Continuing research links to
`/?view=valuation&valuation=ISRG&lang=en&ref=isrg-public-case`. Existing auth
continues to protect the terminal. A save-to-account flow has not been added
or advertised.

## Content and data

- Audited v55 snapshot: model 2026-07-21; observed price 2026-08-27.
- $367.07 observed price; $442.83 blended model value; +20.6% modeled gap.
- Explicit 66% normalized earnings / 34% FCFE DCF method; standalone DCF $187.95.
- Three assumptions: 49.1× earnings multiple, 20.3% normalized growth input,
  10% cost of equity (2.61% terminal growth disclosed).
- Q1–Q2 model change: +$26.88; earnings contribution +$19.15, DCF +$7.73.
- Illustrative stress: 15% lower normalized earnings and projected FCFE,
  35× earnings multiple → $283.82 blended value, −22.7% versus the dated price.
- All 21 reporting nodes in the selected history including the preceding carry
  baseline; 80 exact sampled price observations. No synthetic observations.
- Historical estimates are a retrospective constant-method PIT replay, not
  proof of published contemporaneous forecasts.

See `isrg-public-case-data-2026-09-05.md` for the read-only source audit and
export reproducibility. This change does not refresh valuations or databases.

## Verification

- Flutter: 75 tests passed; analyzer clean.
- Public case and data exporter: 15 tests passed.
- Ontology: 22 Node tests and 3 Python tests passed.
- Performance/transport: 40 tests passed.
- i18n audit and Ontology source/built verification passed.
- Release Flutter web build passed.
- Browser: unauthenticated HTML renders the full case; native disclosure
  panels and terminal selection links are checked. 390×844 embedded viewport
  reports document width 390 and zero overflowing visible content. A 320×844
  embedded viewport also reports width 320 and zero overflowing elements.
- X preview is captured from the same rendered source and stored as an actual
  JPEG (not a mislabeled PNG); metadata uses the dedicated public image.
- Public HTML + CSS: 10,762 gzip bytes before HTTP headers; excludes the brand
  logo and favicon. This is a payload measurement, not a measured improvement
  in production conversion, retention or load latency.

## Rollout / preservation

Only frontend/static files and test/documentation support change. AWS APIs,
auth policy, user data and historical valuation methods remain unchanged.
Publish through Vercel after pushing `trunk`; verify both custom domains point
to the same deployment, the case returns HTML anonymously, the preview image
has `image/jpeg`, and eight concurrent `/api/health` calls retain the backend
readiness contract. Existing private API access must still reject anonymous
requests. Never claim marketing success from a technical release.

## Video recommendation

Use a 10–15 second clip to show price versus model value, then the assumptions
and countercase, ending on the public case URL. The clip is acquisition
creative, not a substitute for inspectable evidence. No video or X post is
published by this change, and no new advertising spend is authorized.
