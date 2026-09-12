# Redesigned frontend production compatibility — 2026-09-12

Status: implementation and local regression checks passed. This record is not a
production deployment or database migration attestation.

## Why the completed UI did not appear in production

The redesigned workspace is compiled behind `INVESTMENT_WORKFLOW_ENABLED`.
The production Flutter build wrapper previously did not forward this definition,
and the prior account-security release did not include its 38 Dart part files.
Enabling a backend environment variable alone cannot change an existing Flutter
JavaScript artifact.

## Changes

- `scripts/flutter-build.sh` forwards `INVESTMENT_WORKFLOW_ENABLED` or
  `VITE_INVESTMENT_WORKFLOW_ENABLED` as an exact boolean Dart definition. It
  remains off by default until the matching backend and data migration are ready.
- Production builds refuse an auth-development bypass. Existing Supabase
  authentication, owner-only Admin presentation and server-side authorization
  remain unchanged.
- The workspace exposes sign-out and the existing standalone Ontology route on
  desktop and mobile. The legacy account, research and Admin screens expose a
  Workspace return control when the new application is enabled.
- Production sessions display `Historical point-in-time data`, not the local
  preview label. Actual local-development sessions remain explicitly labelled.
- A browser navigation revision restores the requested workspace even when Back
  returns to its original URL. It first awaits worksheet autosave, or the
  existing explicit leave/discard confirmation on failure. Account transitions
  retain the existing identity epoch invalidation and discard prior account
  widget state immediately.
- Explicit legacy Guru navigation now keeps `view=guru` in the URL when the
  default root route is the redesigned Home page.
- Desktop navigation spacing keeps the additional owner-only Admin entry usable
  at 1280×720. Mobile language and sign-out controls remain visible at 390×844.
- Untouched strategy date ranges use the earlier of the workspace date and the
  verified catalog market-data cutoff. A bilingual notice explains the selected
  latest session before a run; a Saturday visit therefore does not request data
  after Friday. Manual ranges, restored rules and completed results are not
  automatically shortened. Historical workspace cutoffs remain historical.
- A nonvisual AuthGate identity marker identifies the actual compiled workflow
  branch. The build wrapper rejects missing, ambiguous or opposite markers and
  writes `thesisforge-build.json` with the verified boolean and main JavaScript
  SHA-256. No configuration values, credentials or account data enter this file.
  Verify the SHA against the served `main.dart.js`; metadata alone is not proof.

## Route compatibility

| Entry | Result with workspace enabled |
| --- | --- |
| `/` | Redesigned Home |
| `?view=home`, `discover`, `research`, `book`, `strategies` | Corresponding redesigned workspace |
| `?view=portfolio` | Existing authenticated broker connection/sync screen |
| `?view=valuation&valuation=ISRG` | Existing public-case-to-terminal research target; contains the redesigned research bridge |
| `?view=guru` | Explicit legacy full simulation terminal |
| `?view=admin` | Existing owner-only Admin; unauthorized sessions cannot request Admin data |
| `?mode=dbmf` or `/dbmf/...` | Existing Ontology replacement route |

The redesigned Portfolio analytics screen is `view=book`; it deliberately uses
the existing `view=portfolio` connection screen for linked-account management.
No account identifiers, portfolio amounts or credentials are placed in browser
storage by this change. The existing privacy toggle stores only a boolean.

## Release closure

Include `lib/main.dart` and every `investment_*.dart` file referenced by its
`part` declarations (38), plus the existing local changes to
`lib/browser_location_web.dart`, `lib/browser_location_stub.dart` and
`lib/stock_research.dart`. Include the build wrapper,
`scripts/verify-workflow-artifact.mjs` and the new focused tests, including
`test/investment_strategy_dates_test.dart`.
The existing `pubspec.yaml` ResearchSerif font addition is unused by this source
closure and is not required for this rollout.

Do not publish local preview credentials or database files. The frontend must
use the real authenticated `/api/investment/*` backend. Backend activation and
fresh production user-data preservation checks are separate prerequisites.

## Checks

- Build-wrapper and artifact tests: 9/9 pass, including isolated-output
  preservation, exact compiled-branch verification, metadata hashes, definition
  propagation, strict boolean validation and production bypass denial.
- Targeted Flutter tests with the workflow definition enabled: 106/106 pass.
- Main-worktree Flutter suite before final navigation hardening: 561/561 pass.
- Final clean release-clone Flutter suite with the workflow enabled: 564/564
  pass after marker and strategy-date fixes. The clone deliberately excludes
  unrelated main-worktree test changes.
- Exact pending-autosave/browser-Back regression and compatibility suite: 8/8
  pass. Five additional strategy-date tests cover weekend defaults, historical
  cutoffs, asynchronous metadata and preservation of manually selected dates.
- `flutter analyze` on main and the final clean release clone: no issues.
- `git diff --check` for changed tracked frontend/build files: pass.
- `audit:i18n`: pass; `verify:ontology-module`: pass; `test:ontology`: 3 Python
  and 22 Node tests pass; `test:research`: 15/15 pass and generated page current.
- `test:performance`: 47/47 pass with local loopback access. The static avatar
  gate now recognizes the shared URL resolver and positive cache revision suffix.
  This is a functional/static gate, not a fresh production p95 benchmark.
- Two real isolated Flutter web builds proved that only the active workflow
  marker survives compilation, once with `true` and once with `false`. Both
  passed artifact verification. These outputs predate the final weekend-date
  patch and are verification artifacts, not the final production build.

Widget checks include bilingual 1280×720 and 390×844 layouts, Admin isolation,
portfolio request isolation, legacy navigation, sign-out availability and
browser-route restoration. Actual browser verification against the deployed
authenticated backend is still required; these local checks do not certify
live data completeness, network performance or a successful release.
