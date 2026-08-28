#!/usr/bin/env bash
set -euo pipefail

runtime_db="${SQLITE_DB_PATH:-/var/app/data/guru-analysis.sqlite}"
runtime_dir="$(dirname "${runtime_db}")"
artifact="${PIT_MIGRATION_ARTIFACT:-/var/app/current/server/data/valuation-pit-migration.sqlite.gz}"
expected_sha256="7d24f6a14a62be4826f6b724b5fb714e42dc75af6309df5d5294227df3b24bac"
backup_dir="${PIT_BACKUP_DIR:-${runtime_dir}/backups}"
portfolio_dir="${PIT_PORTFOLIO_DIR:-${runtime_dir}/user-portfolios}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_db="${backup_dir}/guru-analysis-pre-pit-${timestamp}.sqlite"
backup_gz="${backup_db}.gz"
migration_db="${runtime_dir}/.valuation-pit-migration-${timestamp}.sqlite"
log_file="${PIT_LOG_FILE:-/var/log/pit-valuation-migration.log}"
backup_bucket="${PIT_BACKUP_BUCKET:-guru-analysis-dashboard-eb-378477120101-us-east-1}"

exec > >(tee -a "${log_file}") 2>&1

echo "PIT valuation migration started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "runtime_db=${runtime_db}"

if [ ! -f "${runtime_db}" ]; then
  echo "error: runtime database is missing"
  exit 1
fi
if [ ! -f "${artifact}" ]; then
  echo "error: PIT migration artifact is missing"
  exit 1
fi

actual_sha256="$(sha256sum "${artifact}" | awk '{print $1}')"
if [ "${actual_sha256}" != "${expected_sha256}" ]; then
  echo "error: migration artifact checksum mismatch: ${actual_sha256}"
  exit 1
fi

mkdir -p "${backup_dir}"

python3 - "${runtime_db}" "${backup_db}" <<'PY'
import sqlite3
import sys

source_path, backup_path = sys.argv[1:3]
# A normal connection is required when the runtime DB uses WAL and SQLite needs
# to create/read its sidecar files before taking a consistent online backup.
source = sqlite3.connect(source_path, timeout=120)
backup = sqlite3.connect(backup_path, timeout=120)
try:
    source.backup(backup)
    result = backup.execute("PRAGMA integrity_check").fetchone()[0]
    if result != "ok":
        raise RuntimeError(f"backup integrity check failed: {result}")
finally:
    backup.close()
    source.close()
print(f"consistent SQLite backup created: {backup_path}")
PY

gzip -9 "${backup_db}"
echo "compressed backup created: ${backup_gz}"

if [ "${PIT_SKIP_S3_BACKUP:-0}" = "1" ]; then
  echo "S3 backup upload skipped by PIT_SKIP_S3_BACKUP"
elif command -v aws >/dev/null 2>&1; then
  if aws s3 cp "${backup_gz}" "s3://${backup_bucket}/database-backups/$(basename "${backup_gz}")"; then
    echo "backup uploaded to S3"
  else
    echo "warning: S3 backup upload failed; local backup and the pre-deploy EBS snapshot remain available"
  fi
else
  echo "warning: AWS CLI unavailable; keeping the local compressed backup"
fi

gzip -dc "${artifact}" > "${migration_db}"

python3 - "${runtime_db}" "${migration_db}" "${portfolio_dir}" <<'PY'
import json
import os
import sqlite3
import sys

runtime_path, migration_path, portfolio_dir = sys.argv[1:4]
replace_tables = (
    "valuation_pit_source_metadata",
    "valuation_pit_financials",
    "valuation_pit_guidance",
    "valuation_pit_model_runs",
    "valuation_ticker_snapshots",
    "valuation_snapshots",
)
expected_counts = {
    "valuation_pit_source_metadata": 18,
    "valuation_pit_financials": 15894,
    "valuation_pit_guidance": 18418,
    "valuation_pit_model_runs": 7612,
    "valuation_ticker_snapshots": 141,
    "valuation_snapshots": 1,
}


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def table_counts(connection, excluded=()):
    excluded = set(excluded)
    names = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM main.sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        if row[0] not in excluded
    ]
    return {
        name: connection.execute(
            f"SELECT COUNT(*) FROM main.{quote_identifier(name)}"
        ).fetchone()[0]
        for name in names
    }


def portfolio_inventory(root):
    count = 0
    size = 0
    if os.path.isdir(root):
        for directory, _, files in os.walk(root):
            for filename in files:
                path = os.path.join(directory, filename)
                try:
                    size += os.path.getsize(path)
                    count += 1
                except OSError:
                    pass
    return {"files": count, "bytes": size}


migration = sqlite3.connect(f"file:{migration_path}?mode=ro", uri=True, timeout=120)
try:
    integrity = migration.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"migration artifact integrity check failed: {integrity}")
    source_counts = {
        table: migration.execute(
            f"SELECT COUNT(*) FROM {quote_identifier(table)}"
        ).fetchone()[0]
        for table in replace_tables
    }
    if source_counts != expected_counts:
        raise RuntimeError(
            f"migration artifact count mismatch: {source_counts} != {expected_counts}"
        )
finally:
    migration.close()

connection = sqlite3.connect(runtime_path, timeout=180)
connection.execute("PRAGMA busy_timeout=180000")
before_nonvaluation = table_counts(connection, replace_tables)
before_portfolios = portfolio_inventory(portfolio_dir)
print("non-valuation counts before=" + json.dumps(before_nonvaluation, sort_keys=True))
print("portfolio inventory before=" + json.dumps(before_portfolios, sort_keys=True))

try:
    connection.execute("ATTACH DATABASE ? AS migration", (migration_path,))
    connection.execute("BEGIN IMMEDIATE")

    for table in replace_tables:
        table_sql = connection.execute(
            "SELECT sql FROM migration.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if not table_sql or not table_sql[0]:
            raise RuntimeError(f"missing source schema for {table}")
        connection.execute(f"DROP TABLE IF EXISTS main.{quote_identifier(table)}")
        connection.execute(table_sql[0])
        columns = [
            row[1]
            for row in connection.execute(
                f"PRAGMA migration.table_info({quote_identifier(table)})"
            )
        ]
        column_sql = ", ".join(quote_identifier(column) for column in columns)
        connection.execute(
            f"INSERT INTO main.{quote_identifier(table)} ({column_sql}) "
            f"SELECT {column_sql} FROM migration.{quote_identifier(table)}"
        )

    connection.execute(
        "CREATE INDEX idx_valuation_pit_financials_ticker_available "
        "ON valuation_pit_financials (ticker, available_at)"
    )
    connection.execute(
        "CREATE INDEX idx_valuation_pit_guidance_ticker_period "
        "ON valuation_pit_guidance (ticker, fiscal_period, observed_at)"
    )
    connection.execute(
        "CREATE INDEX idx_valuation_pit_model_runs_ticker_asof "
        "ON valuation_pit_model_runs (ticker, as_of_date)"
    )

    after_counts = {
        table: connection.execute(
            f"SELECT COUNT(*) FROM main.{quote_identifier(table)}"
        ).fetchone()[0]
        for table in replace_tables
    }
    if after_counts != expected_counts:
        raise RuntimeError(
            f"installed valuation count mismatch: {after_counts} != {expected_counts}"
        )

    after_nonvaluation = table_counts(connection, replace_tables)
    if after_nonvaluation != before_nonvaluation:
        raise RuntimeError(
            "non-valuation tables changed during migration: "
            + json.dumps(
                {"before": before_nonvaluation, "after": after_nonvaluation},
                sort_keys=True,
            )
        )

    quick_check = connection.execute("PRAGMA quick_check").fetchone()[0]
    if quick_check != "ok":
        raise RuntimeError(f"runtime quick_check failed before commit: {quick_check}")
    connection.commit()
except Exception:
    connection.rollback()
    raise
finally:
    connection.close()

after_portfolios = portfolio_inventory(portfolio_dir)
if after_portfolios != before_portfolios:
    raise RuntimeError(
        f"portfolio files changed: {before_portfolios} != {after_portfolios}"
    )

verification = sqlite3.connect(f"file:{runtime_path}?mode=ro", uri=True, timeout=120)
try:
    integrity = verification.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"runtime integrity check failed after commit: {integrity}")
finally:
    verification.close()

print("installed valuation counts=" + json.dumps(expected_counts, sort_keys=True))
print("non-valuation tables preserved=true")
print("portfolio inventory preserved=" + json.dumps(after_portfolios, sort_keys=True))
PY

python3 - "${migration_db}" <<'PY'
import os
import sys

path = sys.argv[1]
if os.path.exists(path):
    os.unlink(path)
PY

chown webapp:webapp "${runtime_db}" "${backup_gz}" || true
chmod 600 "${runtime_db}" "${backup_gz}" || true

echo "PIT valuation migration completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
