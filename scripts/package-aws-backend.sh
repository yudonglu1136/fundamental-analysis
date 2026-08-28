#!/usr/bin/env bash
set -euo pipefail

version="${1:-$(git rev-parse --short HEAD)}"
zip_path="${AWS_PACKAGE_PATH:-/tmp/guru-dashboard-${version}.zip}"
db_path="${SQLITE_DB_PATH:-server/data/guru-analysis.sqlite}"
ontology_snapshot_path="${ONTOLOGY_SNAPSHOT_PATH:-server/data/ontology-snapshot.sqlite}"
pit_migration_path="${PIT_MIGRATION_PATH:-server/data/valuation-pit-migration.sqlite.gz}"
include_sqlite_db="${INCLUDE_SQLITE_DB:-0}"

rm -f "$zip_path"
git archive --format=zip --output="$zip_path" HEAD

if [ "${INCLUDE_FRONTEND_DIST:-0}" = "1" ]; then
  if [ -d dist ]; then
    zip -qr "$zip_path" dist
  else
    echo "warning: dist/ is missing; AWS package requested frontend fallback but no dist/ exists" >&2
  fi
fi

if [ "$include_sqlite_db" != "1" ]; then
  echo "info: skipping SQLite DB in AWS package; set INCLUDE_SQLITE_DB=1 to bundle a seed database" >&2
elif [ -f "$db_path" ]; then
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

if [ "${INCLUDE_ONTOLOGY_SNAPSHOT:-0}" = "1" ]; then
  if [ ! -f "$ontology_snapshot_path" ]; then
    echo "error: ontology snapshot not found at $ontology_snapshot_path" >&2
    exit 1
  fi
  tmp_ontology_dir="$(mktemp -d)"
  mkdir -p "$tmp_ontology_dir/server/data"
  cp "$ontology_snapshot_path" "$tmp_ontology_dir/server/data/ontology-snapshot.sqlite"
  if [ -f "${ontology_snapshot_path}.manifest.json" ]; then
    cp "${ontology_snapshot_path}.manifest.json" \
      "$tmp_ontology_dir/server/data/ontology-snapshot.sqlite.manifest.json"
  fi
  (cd "$tmp_ontology_dir" && zip -q -u "$zip_path" server/data/ontology-snapshot.sqlite*)
  rm -rf "$tmp_ontology_dir"
else
  echo "info: skipping ontology snapshot; set INCLUDE_ONTOLOGY_SNAPSHOT=1 for an Ontology release" >&2
fi

if [ "${INCLUDE_PIT_MIGRATION:-0}" = "1" ]; then
  if [ ! -f "$pit_migration_path" ]; then
    echo "error: PIT valuation migration artifact not found at $pit_migration_path" >&2
    exit 1
  fi
  tmp_pit_dir="$(mktemp -d)"
  mkdir -p "$tmp_pit_dir/server/data"
  cp "$pit_migration_path" "$tmp_pit_dir/server/data/valuation-pit-migration.sqlite.gz"
  if [ -f "${pit_migration_path%.sqlite.gz}.manifest.json" ]; then
    cp "${pit_migration_path%.sqlite.gz}.manifest.json" \
      "$tmp_pit_dir/server/data/valuation-pit-migration.manifest.json"
  fi
  (cd "$tmp_pit_dir" && zip -q -u "$zip_path" server/data/valuation-pit-migration.*)
else
  echo "info: skipping PIT valuation migration; set INCLUDE_PIT_MIGRATION=1 for a valuation release" >&2
fi

echo "$zip_path"
