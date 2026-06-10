#!/usr/bin/env bash
set -euo pipefail

version="${1:-$(git rev-parse --short HEAD)}"
zip_path="${AWS_PACKAGE_PATH:-/tmp/guru-dashboard-${version}.zip}"
db_path="${SQLITE_DB_PATH:-server/data/guru-analysis.sqlite}"

rm -f "$zip_path"
git archive --format=zip --output="$zip_path" HEAD

if [ -d dist ]; then
  zip -qr "$zip_path" dist
else
  echo "warning: dist/ is missing; run npm run build before packaging if AWS should serve frontend assets" >&2
fi

if [ -f "$db_path" ]; then
  if [ "$db_path" = "server/data/guru-analysis.sqlite" ]; then
    zip -q -u "$zip_path" "$db_path"
  else
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT
    mkdir -p "$tmp_dir/server/data"
    cp "$db_path" "$tmp_dir/server/data/guru-analysis.sqlite"
    (cd "$tmp_dir" && zip -q -u "$zip_path" server/data/guru-analysis.sqlite)
  fi
else
  echo "warning: SQLite DB not found at $db_path; AWS package will start with an empty local DB" >&2
fi

echo "$zip_path"
