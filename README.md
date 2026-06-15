# Guru Intelligence Executive Summary

Flutter Web frontend plus Node/Express backend for the Guru, DBMF, and Valuation research terminal.

## Local Development

```bash
npm install
flutter pub get
npm run dev
```

The Flutter web client runs on `http://127.0.0.1:5174` and the API runs on `http://127.0.0.1:8787`.
Local development uses `AUTH_DEV_BYPASS=true` and sends `Bearer local-dev-token`.

## Deployment Contract

Frontend is owned by Vercel. AWS Elastic Beanstalk is backend/API only.
Read [docs/deployment-contract.md](docs/deployment-contract.md) and [AGENTS.md](AGENTS.md) before changing deployment, DNS, or CI.

## iOS / App Store Preparation

The current codebase is Flutter Web first and does not yet include an `ios/`
platform folder. Before building the App Store version, follow:

- [docs/ios-app-store-readiness.md](docs/ios-app-store-readiness.md)
- [docs/ios-product-design-brief.md](docs/ios-product-design-brief.md)
- [docs/ios-asset-inventory.md](docs/ios-asset-inventory.md)

## Frontend Build

```bash
npm run build
```

Vercel builds the Flutter web frontend with `scripts/vercel-install.sh` and `scripts/vercel-build.sh`, serves `dist/`, and proxies only `/api/*` to AWS.

## Backend Package

```bash
npm run package:aws
```

AWS packages the Node/Express API and runtime database only. It does not include `dist/` by default; use `INCLUDE_FRONTEND_DIST=1` only for an explicit emergency fallback.

GitHub keeps source only. Runtime market, SEC, valuation, and SQLite data stay on the backend/AWS package path and are ignored by Git.
