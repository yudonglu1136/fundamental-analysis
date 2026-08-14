# Ontology Deployment

Guru Intelligence replaces the former DBMF product tab with the US Market
Ontology. The public application remains split between Vercel and AWS Elastic
Beanstalk.

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

The exporter covers fixed dashboards, monthly decision snapshots, all market
groups and value-chain stages, company detail for the current 5,865-company
universe, and historical AI and market timelines. A manifest and SHA-256 digest
are written next to the database.

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

Deploy the resulting zip to the `guru-analysis-api-prod` Elastic Beanstalk
environment. The Node process serves the original Ontology API contract from
`server/ontologyClient.js`; no Python or DuckDB runtime is required on AWS.

## Deploy frontend

Build and deploy the Flutter web app through Vercel. The full explorer is copied
to `/ontology/`, while the Flutter `Ontology` tab provides the compact decision
dashboard. `/api/*` continues to proxy to AWS.

## Production checks

Authenticated checks:

```text
GET /api/ontology/health
GET /api/ontology/overview
GET /api/market/home
GET /api/decision/snapshot?as_of=2026-08-01&limit=5
```

Browser checks:

```text
https://www.thesisforge.tech/?view=ontology
https://www.thesisforge.tech/ontology/
```
