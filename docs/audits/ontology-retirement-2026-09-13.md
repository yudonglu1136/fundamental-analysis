# Ontology retirement — 2026-09-13

## Scope and cause

The redesigned investment workspace no longer uses the standalone Ontology module, but its legacy frontend assets, API proxy, independent service entry point and mandatory public health dependency remained in the release. The user explicitly requested removal.

This change retires only that standalone product and the earlier DBMF page/API aliases. Value Flow, Guru, valuation, portfolio, configurable strategies, CTA and the DBMF ETF remain. Archived financial/source material is retained.

## Compatibility

- Legacy page links resolve to Discover in the redesigned workspace, preserving language. A disabled-workflow compatibility build uses the supported Guru page.
- OAuth callbacks retain their existing processing; external return URLs are rejected.
- Old API families return HTTP 410 with `module_retired` and `Cache-Control: no-store`, before body parsing, authentication or upstream forwarding.
- Public readiness no longer probes Ontology; all remaining source-date, full Guru cache-matrix and worker/timeout failure checks remain enforced.
- Retired export/start/verify scripts and standalone static resources are removed.
- Historical v2 performance evidence is preserved. Active-module benchmark schema v3 is not falsely compared with v2.
- The old Lightsail Caddy configuration is distinct from current EB TLS configuration; never install it over the latter.

## Data safety

No schema change, table deletion, financial refresh, user-data migration or database transfer is part of this release. Production packaging must exclude all databases, migration artifacts, secrets and frontend fallback files. Existing immutable public-data releases and private user stores remain unchanged. Deleted source/assets remain recoverable from Git.

Main working-tree integration preserves unrelated local modifications, including additional strategy scripts, valuation-source rules and the unpublished database-index test.

## Validation

Test groups overlap and must not be summed into a unique total.

| Group | Result |
| --- | --- |
| Investment/Guru/portfolio/strategy/CTA/auth/transport/health regression | 200/200 passing across 16 files, isolated temporary databases |
| Proxy/packaging/retirement/performance-tool regression | 33/33 passing |
| Existing performance regression suite | 60/60 passing |
| Focused Flutter navigation/widget/CTA tests | 112 passing |
| Disabled-workflow compatibility tests | 87 passing |
| Full Flutter suite, workflow enabled | Passed |
| Flutter analyzer; i18n; static regression | Passed; 8 static tests |
| Production-like frontend build | Passed, real public auth config, auth bypass false |
| Caddy contract plus route predicate | 6 passing; real Caddy parser requires an operator-supplied binary |
| Whitespace/diff validation | Passed |

The validated local frontend bundle SHA-256 is `fd1cfe5b2f8dcabf94466aae4296b10e82d613494d733b193af354c19125afb1`. No old standalone assets or API calls remain; 42 Guru portraits and the public research page remain.

## Release status

These are pre-release checks, not proof of live deployment or a performance-optimization claim. Production acceptance must separately record the published commit, AWS application version, Vercel deployment, both app domains, retired-route 410 responses and current private-route protection. Any remaining public-health failure must be reported, not hidden by module retirement.
