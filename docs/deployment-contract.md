# Deployment Contract

Guru Intelligence is split into a Vercel frontend and an AWS backend.

## Source Of Truth

| Layer | Owner | Notes |
| --- | --- | --- |
| Frontend | Vercel | Builds Flutter Web into `dist/` and serves the product UI. |
| API backend | AWS Elastic Beanstalk | Runs `server/index.js` and owns SQLite/runtime data. |
| Public app domain | Vercel DNS + Vercel deployment | `www.thesisforge.tech` must not point to Lightsail. |
| API path | Vercel proxy | `/api/*` is proxied to Elastic Beanstalk by `api/proxy.js`. |

## DNS Rules

Keep these rules intact:

- `www.thesisforge.tech` -> Vercel frontend.
- `thesisforge.tech` -> Vercel frontend or redirect to `www`.
- `api.thesisforge.tech` may point to AWS for direct backend diagnostics.
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
AWS_API_ORIGIN=http://guru-analysis-api-prod-378477120101.us-east-1.elasticbeanstalk.com
ONTOLOGY_API_ORIGIN=https://api.thesisforge.tech
```

`api/proxy.js` keeps a single browser-facing `/api/*` contract while routing
Ontology paths to the Lightsail read service and existing Guru, Portfolio,
Valuation, and Admin paths to the established Elastic Beanstalk service. Both
origin variables have checked-in fallbacks, but setting them in Vercel makes
the runtime contract explicit.

AWS backend production env must also include both frontend origins:

```bash
API_ALLOWED_ORIGINS=https://www.thesisforge.tech,https://thesisforge.tech
```

Do not omit the `www` origin. Stale or diagnostic frontend builds may call the AWS API directly, and Express will return an HTML 500 for a disallowed CORS origin before the JSON API handler runs.

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
- `/api/health` returns JSON from the AWS backend. HTTP 200 means every required
  database, data, and Ontology module is current. HTTP 503 is an intentional
  fail-closed signal for a missing/empty database, a missing/unreadable required
  table, an unavailable Ontology snapshot, or stale core data.
- Inspect `status`, `ok`, and every entry in `modules[]`; each module exposes a
  `state` plus `freshness.latestAt`, `ageHours`, `warningHours`, and
  `failedHours`. A `stale`, `unknown`, or `failed` module is never green.
- `main.dart.js` contains the Supabase project URL.

## Backend Deploy

AWS is backend/API only. Package and deploy EB without frontend `dist/`:

```bash
bash scripts/package-aws-backend.sh <version>
```

Production must set `SQLITE_DB_PATH` to the intended persistent runtime database.
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
