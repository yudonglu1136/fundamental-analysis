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

## Build

```bash
npm run build
npm run package:aws
```

GitHub keeps source only. Runtime market, SEC, valuation, and SQLite data stay on the backend/AWS package path and are ignored by Git.
