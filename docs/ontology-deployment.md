# Ontology Deployment

Guru Intelligence replaces the former DBMF product tab with the US Market
Ontology. The public application is split between Vercel and the AWS Lightsail
API host.

## Data boundary

- Sharadar source files and the 17 GB research database remain local.
- GitHub contains code and the standalone UI only.
- `scripts/export-ontology-snapshot.py` reads the local PIT API and creates a
  compressed, read-only SQLite publication snapshot.
- The snapshot contains API responses, not API keys or raw Sharadar tables.
- Production endpoints remain behind the existing Supabase bearer-token
  middleware.

## Refresh the UI

```bash
npm run sync:ontology-ui
```

The source defaults to
`~/Documents/jansen_us_firm_replication/ai_ontology/frontend`. Override it with
`--source` when needed.

## Build the publication snapshot

Start the local Ontology API, then run:

```bash
python3 scripts/export-ontology-snapshot.py \
  --source http://127.0.0.1:8766 \
  --output server/data/ontology-snapshot.sqlite
```

The exporter covers the strategy catalog, daily strategy research payloads,
monthly portfolio snapshots, fixed dashboards, monthly decision snapshots, all
market groups and value-chain stages, company detail for the current
5,867-company universe, and historical AI and market timelines. A manifest and
SHA-256 digest are written next to the database. Strategy exports include
`ontology-soft-overlay-6m`, `ontology-rules-6m`, and
`integrated-ml-ontology`, including daily NAV, realized trades, annual
attribution, and month-end portfolio replay snapshots.

## Publish data privately

```bash
bash scripts/publish-ontology-snapshot.sh \
  server/data/ontology-snapshot.sqlite
```

The script uploads an immutable release and a `latest` pointer to the private
Elastic Beanstalk S3 bucket with server-side encryption. Do not make this bucket
public.

## Package AWS backend

```bash
INCLUDE_ONTOLOGY_SNAPSHOT=1 \
ONTOLOGY_SNAPSHOT_PATH=server/data/ontology-snapshot.sqlite \
bash scripts/package-aws-backend.sh <version-label>
```

Deploy the resulting zip to a versioned directory below
`/home/ubuntu/ontology-api/releases`. Start `server/ontologyServer.js` with
Node 24 on `127.0.0.1:8791`; no Python or DuckDB runtime is required on AWS.
The Caddy configuration in `ops/caddy/Caddyfile` routes Ontology API paths to
this service and leaves the existing Guru API on `127.0.0.1:8787` unchanged.
It also routes the exact unauthenticated `/ontology-health` path to the service's
`/health` metadata endpoint. That probe exposes only
`publicOntologySnapshotInfo`; all research payload routes remain authenticated.
Elastic Beanstalk must set:

```text
ONTOLOGY_HEALTH_URL=https://api.thesisforge.tech/ontology-health
```

Deploy and verify the Caddy route before enabling this setting. EB validates
the remote service identity, schema version, response counts, byte counts, and
required economic source dates. Delegation is fail-closed and never silently
falls back to a local snapshot.

## Deploy frontend

Build and deploy the Flutter web app through Vercel. The full explorer is copied
to `/ontology/`, while the Flutter `Ontology` tab provides the compact decision
dashboard. `/api/*` continues to proxy to AWS.

## Production checks

Unauthenticated service-identity check:

```text
GET https://api.thesisforge.tech/ontology-health
```

The response must identify `service: ontology-api`, report a non-empty valid
snapshot, and include `manifest.financial_as_of` plus
`manifest.decision_latest`. Public platform `/api/health` evaluates the older
of those two economic dates; `manifest.generated_at` is observation metadata,
not a freshness reset.

Authenticated checks:

```text
GET /api/ontology/health
GET /api/ontology/overview
GET /api/strategies
GET /api/strategies/ontology-soft-overlay-6m
GET /api/strategies/ontology-soft-overlay-6m/snapshot?period=evaluation_2018_2026&as_of=2026-08-13
GET /api/strategies/integrated-ml-ontology
GET /api/strategies/integrated-ml-ontology/snapshot?period=evaluation_2018_2026&as_of=2026-08-13
GET /api/market/home
GET /api/decision/snapshot?as_of=2026-08-01&limit=5
```

Browser checks:

```text
https://www.thesisforge.tech/?view=ontology
https://www.thesisforge.tech/ontology/
```
