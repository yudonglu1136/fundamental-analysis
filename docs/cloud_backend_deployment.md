# Cloud Backend Deployment

This backend is a long-running Node HTTP service backed by local per-ticker SQLite files under `data/local`.

## Recommended near-term path

Use a small VPS or a PaaS service with a persistent disk. Do not deploy this backend to serverless functions while it depends on local SQLite files.

The simplest current setup is:

1. Deploy the frontend to Vercel, Netlify, Cloudflare Pages, or another static host.
2. Deploy the API as a Node service on a server with persistent storage.
3. Copy the repository plus `data/local` to the server.
4. Point `VITE_API_BASE_URL` at the API HTTPS URL.

For this repository, a VPS is usually the least surprising option because `data/local` can stay in the repo path and the SQLite files persist across restarts.

## Runtime requirements

- Node.js 20 or newer
- npm
- Python 3, because the API uses Python's built-in `sqlite3` bridge in `apps/api/src/db/client.mjs`
- Persistent disk large enough for `data/local` plus growth
- HTTPS reverse proxy in production, such as Caddy, Nginx, or the platform's built-in proxy

## Production API environment

Set these on the backend host:

```bash
NODE_ENV=production
PORT=8787
API_HOST=0.0.0.0
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-production-supabase-jwt-secret
API_ALLOWED_ORIGINS=https://your-frontend-domain.com
API_AUTH_DEV_BYPASS=false
```

The service also accepts platform-provided `PORT`, which is required by many cloud hosts.

## Start command

```bash
npm ci
npm run api:start
```

Health check:

```bash
curl https://your-api-domain.com/api/health
```

## Frontend environment

Set these for the frontend deployment:

```bash
VITE_AUTH_PROVIDER=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-supabase-anon-key
VITE_API_BASE_URL=https://your-api-domain.com
VITE_AUTH_DEV_BYPASS=false
```

Before deploying, validate the production env:

```bash
npm run env:validate:production
```

## PaaS note

Render, Railway, and Fly.io can work if you attach persistent storage and ensure `data/local` is present on the mounted disk. The current codebase is not yet centralized around one `DATA_ROOT`, so a VPS or a mount/symlink that preserves the `data/local` path is the lowest-risk setup.

## What not to do yet

- Do not put the API on Vercel/Netlify serverless functions while SQLite remains local.
- Do not use `API_AUTH_DEV_BYPASS=true` in production.
- Do not redeploy in a way that wipes `data/local`.
- Do not expose the API without HTTPS and CORS restricted to the frontend origin.
