# Deployment Contract

Guru Intelligence is split into a Vercel frontend and an AWS backend.

## Source Of Truth

| Layer | Owner | Notes |
| --- | --- | --- |
| Frontend | Vercel | Builds Flutter Web into `dist/` and serves the product UI. |
| API backend | AWS Elastic Beanstalk | Runs `server/index.js` and owns SQLite/runtime data. |
| Ontology read service | AWS Lightsail | Runs `server/ontologyServer.js`; EB verifies it through the dedicated public metadata probe. |
| Public app domain | Vercel DNS + Vercel deployment | `www.thesisforge.tech` must not point to Lightsail. |
| API path | Vercel proxy | Guru/Valuation routes go to EB; Ontology routes go to the Lightsail read service. |

## DNS Rules

Keep these rules intact:

- `www.thesisforge.tech` -> Vercel frontend.
- `thesisforge.tech` -> Vercel frontend or redirect to `www`.
- `api.thesisforge.tech` remains the separate Lightsail Ontology read service.
- `backend.thesisforge.tech` points to the existing EB instance's Elastic IP; Caddy terminates HTTPS on that instance.
- Do not create `A` records for `www` or apex pointing to the Lightsail IP.

If `dig +short www.thesisforge.tech A` returns the Lightsail IP, the frontend is no longer on Vercel and the deployment contract is broken.

## Vercel Project

Project: `fundamental-analysis`

Vercel builds the Flutter app with:

```bash
bash scripts/vercel-install.sh
bash scripts/vercel-build.sh
```

`vercel.json` serves static frontend files from `dist/`, then routes only `/api/*` to the AWS backend through `api/proxy.js`.

Required production env vars:

```bash
VITE_SUPABASE_URL=<supabase project url>
VITE_SUPABASE_ANON_KEY=<browser publishable key>
VITE_AUTH_DEV_BYPASS=false
VITE_AUTH_PROVIDER=supabase
AWS_API_ORIGIN=https://backend.thesisforge.tech
ONTOLOGY_API_ORIGIN=https://api.thesisforge.tech
VITE_INVESTMENT_WORKFLOW_ENABLED=true
```

`api/proxy.js` keeps a single browser-facing `/api/*` contract while routing
Ontology paths to the Lightsail read service and existing Guru, Portfolio,
Valuation, and Admin paths to the established Elastic Beanstalk service. Both
origin variables have checked-in fallbacks, but setting them in Vercel makes
the runtime contract explicit.

The public proxy and EB nginx deliberately reject the case-insensitive
`/api/internal/*` namespace before reading the request body or forwarding
`Authorization`. The application proxy requires HTTPS in production. The EB
CNAME still supports legacy HTTP diagnostics, but bearer credentials must use
`backend.thesisforge.tech`. Release and maintenance calls carrying
`INTERNAL_CRON_SECRET` remain restricted to the EB instance's Node listener
on `127.0.0.1`; HTTPS does not expose or authorize internal routes.

Backend TLS uses the existing instance, EIP and security group, not an additional
load balancer. `THESISFORGE_BACKEND_TLS_ENABLED=true` enables the pinned Caddy
postdeploy installer; certificate renewal is automatic. Preserve the original
port-80 nginx service and the separate Ontology host.

AWS backend production env must also include both frontend origins:

```bash
API_ALLOWED_ORIGINS=https://www.thesisforge.tech,https://thesisforge.tech
ONTOLOGY_HEALTH_URL=https://api.thesisforge.tech/ontology-health
```

Do not omit the `www` origin. Stale or diagnostic frontend builds may call the AWS API directly, and Express will return an HTML 500 for a disallowed CORS origin before the JSON API handler runs.

`ONTOLOGY_HEALTH_URL` is explicit delegation, not an optional fallback. Caddy
must route the exact public path `/ontology-health` to the Ontology service's
local `/health` endpoint before this variable is enabled. EB accepts the
delegated module only when the response identifies `ontology-api` and carries a
non-empty, schema-v2, internally consistent snapshot manifest. A timeout,
wrong service, malformed metadata, or non-HTTPS production URL fails closed;
EB never falls back to a bundled local snapshot after delegation is configured.

## Frontend Deploy

Preferred path:

```bash
git push origin HEAD:trunk
```

Then verify the Vercel production deployment.

After Vercel finishes, verify both custom domains resolve to the latest deployment:

```bash
npm exec -- vercel inspect https://www.thesisforge.tech --scope yudonglu1136s-projects
npm exec -- vercel inspect https://thesisforge.tech --scope yudonglu1136s-projects
```

If `www` points to an older deployment, move it explicitly:

```bash
npm exec -- vercel alias set <latest-deployment>.vercel.app www.thesisforge.tech --scope yudonglu1136s-projects
```

Manual production deploy:

```bash
npm exec -- vercel pull --yes --environment=production --scope yudonglu1136s-projects
npm exec -- vercel build --prod --scope yudonglu1136s-projects
npm exec -- vercel deploy --prebuilt --prod --scope yudonglu1136s-projects
```

Verification:

```bash
curl -I https://www.thesisforge.tech/
curl https://www.thesisforge.tech/api/health
curl -s https://www.thesisforge.tech/main.dart.js | rg 'supabase.co'
```

Expected:

- `server: Vercel` for the app shell.
- `/api/health` returns JSON from the AWS backend. HTTP 200 with `status: healthy`
  is green. HTTP 200 with `status: stale`, `ok: true`, and `degraded: true` is
  explicit but still serviceable. HTTP 503 is reserved for `unknown` or `failed`
  readiness: a missing/empty database, a missing/unreadable required table, an
  unverifiable delegated Ontology service, invalid source dates, or data beyond
  the module's failure cadence.
- Inspect `status`, `ok`, `degraded`, and every entry in `modules[]`. Data modules
  expose `freshness.basis`, `cadence`, `sourceAsOf`, `observedAt`, `ageHours`,
  `warningHours`, and `failedHours`. `observedAt` is ingestion/export time and
  never cosmetically refreshes `sourceAsOf`.
- `main.dart.js` contains the Supabase project URL.

Public readiness uses economic dates and source-specific cadence:

| Module | Economic freshness source | Stale after | Failed after |
| --- | --- | ---: | ---: |
| Guru dashboard | Latest disclosed filing date | 100 days | 130 days |
| Guru simulations | Latest completed filing-window end date | 100 days | 130 days |
| Valuation | Latest point-in-time model `asOfDate` | 45 days | 120 days |
| Market prices | Latest stored market date | 5 days | 12 days |
| Ontology | Older of `financial_as_of` and `decision_latest` | 45 days | 120 days |

The quarterly thresholds cover filing and issuer-event cadence. The market
threshold includes a weekend/holiday buffer. The conservative Ontology date
prevents a new export timestamp from hiding an old required input family.

## Backend Deploy

AWS is backend/API only. Package and deploy EB without frontend `dist/`:

```bash
bash scripts/package-aws-backend.sh <version>
```

Production must set `SQLITE_DB_PATH` to the intended persistent runtime database.
When Ontology is deployed separately, production must also set the verified
delegation URL:

```text
ONTOLOGY_HEALTH_URL=https://api.thesisforge.tech/ontology-health
```

Deploy and verify the Caddy `/ontology-health` route before setting this value;
otherwise `/api/health` correctly returns HTTP 503.

Normal startup must not seed or overwrite that database from the database bundled
inside the deployment package. Keep these variables unset or explicitly `false`:

```text
SYNC_BUNDLED_VALUATION_SNAPSHOTS=false
SYNC_BUNDLED_GURU_BACKTESTS=false
SYNC_BUNDLED_DIVIDEND_CALENDAR=false
SYNC_BUNDLED_PODCAST_INSIGHTS=false
```

Each bundled sync runs only when its variable is exactly `true`. Use that value
only for a controlled, backed-up, one-time seed/migration with an audited bundle;
restore it to `false` before normal production traffic. Pointing
`SQLITE_DB_PATH` at an existing database never authorizes bundled data mutation;
a missing custom path creates an empty migrated schema rather than copying the
packaged database implicitly.

Use the emergency frontend fallback only if Vercel is unavailable and the user explicitly asks for it:

```bash
INCLUDE_FRONTEND_DIST=1 bash scripts/package-aws-backend.sh <version>
```

Do not make the fallback the normal path.

## Redesigned investment workspace compatibility

The redesigned frontend must only be enabled after its backend is ready.
EB cannot combine an application version update and environment configuration
update in one operation. Deploy the clean published backend first with the
workflow disabled, wait for Ready, then add the verified release environment
below and wait for Ready again. Only then set the Vercel workflow flag to the
literal string `true`, pull the production configuration, build and verify the
compiled workflow marker before publishing. An empty environment value is false.
The workflow flag is non-secret build configuration: use a plain/encrypted
exportable value, not a sensitive (non-exportable) environment record for a
local prebuilt deployment. Verify the pulled literal and the compiled marker;
a successful environment-update command alone is not sufficient.

```text
INVESTMENT_WORKFLOW_ENABLED=true
INVESTMENT_SOURCE_DB_PATH=/var/app/data/investment-releases/redesign-20260912-v1/research.sqlite
STRATEGY_DATA_DB_PATH=/var/app/data/investment-releases/redesign-20260912-v1/strategy.sqlite
STRATEGY_COMPOSITION_PRICE_DB_PATH=/var/app/data/investment-releases/redesign-20260912-v1/composition.sqlite
INVESTMENT_DB_PATH=/var/app/data/user-portfolios/investment.sqlite
INVESTMENT_RELEASE_MANIFEST_PATH=/var/app/data/investment-releases/redesign-20260912-v1/manifest.json
INVESTMENT_RELEASE_ID=redesign-20260912-v1
THESISFORGE_BACKEND_TLS_ENABLED=true
```

The installer creates an immutable, root-owned public-data directory. Full
SQLite integrity/foreign-key checks and private-table exclusion are completed
at the producer and bound to each exact file's SHA-256 and size. AWS verifies
those hashes and bounded table/header/journal checks without repeating large
full scans on the live disk; the manifest records both verification locations.
Never replace `SQLITE_DB_PATH`, copy a local
portfolio database to AWS, change the existing portfolio encryption/HMAC keys,
or enable a production local-owner override. User scenarios use a separate
persistent journal keyed by the verified Supabase UUID; existing IBKR account
connections and encrypted reports remain in their original stores.

Take and restore-test the encrypted user-data backup and an encrypted EBS
rollback copy before activation. Rollback changes code/flags, not live user
data. Keep the investment journal, including edits made after deployment.
Legacy links and the original broker connection screen remain available.

This public-source migration does not refresh issuer financial APIs or certify
Guru study curves. Current-method/security-master cache validation must keep
incompatible or unavailable study results unavailable, not reuse earlier
curves or weaken public readiness checks.

## Atomic Guru 13F refresh

The atomic 13F refresh always persists full-detail audit artifacts. A normal
manager requires a strict `ready` row. The only structural non-public exception
is the exact audited Nelson Peltz / 2026 Q2 / JHG rollover: the transaction may
commit snapshots and exposures only together with a strict
`insufficient_data` row and its generation-linked, independently audited
`proxy_ready` row. The job and manager result remain `degraded`, never
`success` or `refreshed`; all other proxy cases fail and roll back the bundle.

## One-time Guru price repair

Normal releases leave every `GURU_PRICE_REPAIR_*` variable unset. For an
audited curve restoration, create a private gzip JSON artifact outside Git and
bind it to all of the following before deploying:

- its compressed SHA-256 and private `s3://.../guru-price-repairs/` URI;
- the current production root volume;
- a fresh completed snapshot of that volume and a completed encrypted copy;
- the exact release ID, strict/proxy method versions, security-master version,
  and explicit `{guruId, years, expectedStatus}` targets.

Temporarily grant the EB instance role `s3:GetObject` only for that exact object,
plus `ec2:DescribeSnapshots` and `ec2:DescribeInstances` (the EC2 Describe APIs
require a `*` resource). Tag the encrypted rollback copy with both the release ID
and `GuruPriceRepairSourceSnapshot=<source snapshot id>`. The postdeploy hook
validates the running instance's actual root volume, release tags, owners, source
snapshot lineage, encryption and hashes, makes a consistent SQLite backup,
and sends the artifact only to the loopback release route. It then waits for
both 5Y and 10Y current-generation refreshes. A release succeeds and writes its
`.done` marker only when public health re-audits every enabled-manager/window row
derived from `server/gurus.js` as displayable. Any non-2xx response,
old/in-flight generation, identity mismatch, or incomplete coverage fails the
deployment.

The release route writes every missing price group, its child ledgers, and one
artifact-level ledger keyed by `recordsSha256` in a single `BEGIN IMMEDIATE`
transaction. A later-group conflict rolls back the entire artifact; an exact
retry reuses the bound batch ledger before recomputing the required curves.

After production verification, delete the private artifact and revoke its
temporary read policy. Retain the encrypted rollback snapshot, non-price
manifest, SQLite audit ledger, install report and full-population acceptance
report.
