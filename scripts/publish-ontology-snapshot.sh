#!/usr/bin/env bash
set -euo pipefail

snapshot_path="${1:-server/data/ontology-snapshot.sqlite}"
bucket="${ONTOLOGY_S3_BUCKET:-guru-analysis-dashboard-eb-378477120101-us-east-1}"
prefix="${ONTOLOGY_S3_PREFIX:-ontology}"
region="${AWS_REGION:-us-east-1}"

if [ ! -f "$snapshot_path" ]; then
  echo "error: ontology snapshot not found: $snapshot_path" >&2
  exit 1
fi

manifest_path="${snapshot_path}.manifest.json"
if [ ! -f "$manifest_path" ]; then
  echo "error: ontology manifest not found: $manifest_path" >&2
  exit 1
fi

sha="$(shasum -a 256 "$snapshot_path" | awk '{print $1}')"
version="$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
release_uri="s3://${bucket}/${prefix}/releases/${version}"

aws s3 cp "$snapshot_path" "${release_uri}/ontology-snapshot.sqlite" \
  --region "$region" --sse AES256 --only-show-errors
aws s3 cp "$manifest_path" "${release_uri}/manifest.json" \
  --region "$region" --sse AES256 --content-type application/json --only-show-errors
aws s3 cp "$snapshot_path" "s3://${bucket}/${prefix}/latest/ontology-snapshot.sqlite" \
  --region "$region" --sse AES256 --only-show-errors
aws s3 cp "$manifest_path" "s3://${bucket}/${prefix}/latest/manifest.json" \
  --region "$region" --sse AES256 --content-type application/json --only-show-errors

printf '%s\n' "$release_uri"
