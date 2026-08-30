#!/usr/bin/env python3
"""Build a deterministic, valuation-only production migration artifact."""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import shutil
import sqlite3
import tempfile
from pathlib import Path


VALUATION_TABLES = (
    "valuation_pit_source_metadata",
    "valuation_pit_financials",
    "valuation_pit_guidance",
    "valuation_pit_model_runs",
    "valuation_pit_price_observations",
    "valuation_ticker_snapshots",
    "valuation_snapshots",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--release-audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path)
    return parser.parse_args()


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def table_order(connection: sqlite3.Connection, table: str) -> str:
    columns = connection.execute(
        f"PRAGMA table_info({quote_identifier(table)})"
    ).fetchall()
    primary = [row[1] for row in sorted(columns, key=lambda row: row[5]) if row[5]]
    return ", ".join(quote_identifier(column) for column in primary) or "rowid"


def copy_table(
    source: sqlite3.Connection, target: sqlite3.Connection, table: str
) -> int:
    schema = source.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not schema or not schema[0]:
        raise RuntimeError(f"Missing valuation table: {table}")
    target.execute(schema[0])
    columns = [
        row[1]
        for row in source.execute(
            f"PRAGMA table_info({quote_identifier(table)})"
        ).fetchall()
    ]
    column_sql = ", ".join(quote_identifier(column) for column in columns)
    placeholders = ", ".join("?" for _ in columns)
    cursor = source.execute(
        f"SELECT {column_sql} FROM {quote_identifier(table)} "
        f"ORDER BY {table_order(source, table)}"
    )
    insert = f"INSERT INTO {quote_identifier(table)} ({column_sql}) VALUES ({placeholders})"
    copied = 0
    while rows := cursor.fetchmany(2000):
        target.executemany(insert, rows)
        copied += len(rows)
    return copied


def main() -> None:
    args = parse_args()
    audit = json.loads(args.release_audit.read_text(encoding="utf-8"))
    if audit.get("status") != "pass":
        raise RuntimeError("Release audit did not pass")
    expected_counts = {
        table: int((audit.get("valuationCounts") or {}).get(table, -1))
        for table in VALUATION_TABLES
    }
    if any(count < 0 for count in expected_counts.values()):
        raise RuntimeError("Release audit is missing valuation table counts")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = args.manifest or Path(
        str(args.output).removesuffix(".sqlite.gz") + ".manifest.json"
    )
    with tempfile.TemporaryDirectory(prefix="pit-migration-") as directory:
        sqlite_path = Path(directory) / "valuation-pit-migration.sqlite"
        source = sqlite3.connect(f"file:{args.database.resolve()}?mode=ro", uri=True)
        target = sqlite3.connect(sqlite_path)
        try:
            if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Candidate database integrity check failed")
            target.execute("PRAGMA journal_mode=OFF")
            target.execute("PRAGMA synchronous=OFF")
            actual_counts = {
                table: copy_table(source, target, table) for table in VALUATION_TABLES
            }
            for table in VALUATION_TABLES:
                indexes = source.execute(
                    "SELECT sql FROM sqlite_master "
                    "WHERE type='index' AND tbl_name=? AND sql IS NOT NULL ORDER BY name",
                    (table,),
                ).fetchall()
                for (statement,) in indexes:
                    target.execute(statement)
            target.commit()
            if actual_counts != expected_counts:
                raise RuntimeError(
                    f"Candidate counts differ from audit: {actual_counts} != {expected_counts}"
                )
            if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Migration database integrity check failed")
            model_version_row = target.execute(
                "SELECT value FROM valuation_pit_source_metadata WHERE key='model_version'"
            ).fetchone()
            model_version = model_version_row[0] if model_version_row else None
        finally:
            target.close()
            source.close()

        with sqlite_path.open("rb") as source_file, args.output.open("wb") as raw_output:
            with gzip.GzipFile(fileobj=raw_output, mode="wb", filename="", mtime=0) as compressed:
                shutil.copyfileobj(source_file, compressed, length=1024 * 1024)

    manifest = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "artifact": args.output.name,
        "artifactSha256": sha256(args.output),
        "artifactBytes": args.output.stat().st_size,
        "modelVersion": model_version,
        "valuationCounts": expected_counts,
        "releaseAudit": {
            "status": audit["status"],
            "modelSignature": audit.get("modelSignature"),
            "snapshotSignature": audit.get("snapshotSignature"),
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "manifest": str(manifest_path), **manifest}, indent=2))


if __name__ == "__main__":
    main()
