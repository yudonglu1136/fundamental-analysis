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
```

`AWS_API_ORIGIN` is optional because `api/proxy.js` has the current EB CNAME as a fallback, but setting it in Vercel makes the runtime contract explicit.

## Frontend Deploy

Preferred path:

```bash
git push origin HEAD:trunk
```

Then verify the Vercel production deployment.

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
- `/api/health` returns JSON from the AWS backend.
- `main.dart.js` contains the Supabase project URL.

## Backend Deploy

AWS is backend/API only. Package and deploy EB without frontend `dist/`:

```bash
bash scripts/package-aws-backend.sh <version>
```

Use the emergency frontend fallback only if Vercel is unavailable and the user explicitly asks for it:

```bash
INCLUDE_FRONTEND_DIST=1 bash scripts/package-aws-backend.sh <version>
```

Do not make the fallback the normal path.
