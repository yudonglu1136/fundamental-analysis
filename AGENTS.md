# Agent Operating Contract

This repository is the Guru Intelligence product. Follow this deployment split unless the user explicitly changes the architecture.

## Deployment Ownership

- Frontend is deployed on Vercel.
- AWS Elastic Beanstalk is backend/API only.
- Browser traffic for `https://www.thesisforge.tech/` must resolve to Vercel, not Lightsail or Elastic Beanstalk.
- Vercel serves the Flutter web build from `dist/`.
- Vercel proxies only `/api/*` to the AWS Elastic Beanstalk API.
- Do not deploy the primary frontend by rsyncing `dist/` to Lightsail.
- Do not add DNS `A` records for `www.thesisforge.tech` or `thesisforge.tech` that point to the Lightsail IP.
- Keep `api.thesisforge.tech` or the EB CNAME available for backend diagnostics only.

## iOS / App Store Work

- The repository is Flutter Web first; do not assume an iOS platform shell exists.
- Before generating or implementing the native iOS app, read:
  - `docs/ios-app-store-readiness.md`
  - `docs/ios-product-design-brief.md`
  - `docs/ios-asset-inventory.md`
- The iOS app should preserve the same backend contract: authenticated API calls through the production HTTPS API contract, user-specific Supabase identity, and encrypted IBKR/Yodlee credentials stored only on the backend.
- Add Sign in with Apple, in-app account deletion, privacy disclosures, and a reviewer demo path before App Store submission.

## Required Vercel Production Env

The Vercel project `fundamental-analysis` must have these production env vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_DEV_BYPASS=false`
- `VITE_AUTH_PROVIDER=supabase`
- Optional serverless proxy override: `AWS_API_ORIGIN`

The Supabase key is browser-publishable. Never use or expose a Supabase service-role key in the frontend.

## Build And Deploy

For frontend changes:

1. Commit and push to GitHub `trunk`.
2. Deploy frontend through Vercel.
3. Verify `https://www.thesisforge.tech/` is served by Vercel.
4. Verify `https://www.thesisforge.tech/api/health` reaches AWS through the Vercel proxy.

For backend changes:

1. Deploy the Node/Express API to AWS Elastic Beanstalk.
2. Do not package Flutter `dist/` into AWS unless using the explicit emergency fallback:
   `INCLUDE_FRONTEND_DIST=1 bash scripts/package-aws-backend.sh`.

See `docs/deployment-contract.md` for the full runbook.
