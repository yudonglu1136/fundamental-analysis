#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import stat
import subprocess
import tempfile
import unittest
import datetime as dt
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


REPOSITORY = Path(__file__).resolve().parents[1]
BUILDER = REPOSITORY / "scripts/build-guru-sharadar-price-repair.py"
BINDER = REPOSITORY / "scripts/bind-guru-price-repair-release.mjs"
LOCAL_APPLIER = REPOSITORY / "scripts/apply-local-guru-price-repair.mjs"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


class SharadarPriceRepairBuilderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="guru-sharadar-builder-")
        self.root = Path(self.temporary.name)
        self.parquet = self.root / "parquet/prices"
        partition = self.parquet / "year=2022"
        partition.mkdir(parents=True)
        # Deliberately unsorted, with one planned SPY session absent. The
        # extractor must sort exact rows and expose the gap, never fill it.
        rows = [
            ("ZEN", "2022-01-07", 14.0, 15.0, 13.0, 14.5, 1400.0, 13.9),
            ("ZEN", "2022-01-03", 10.0, 11.0, 9.0, 10.5, 1000.0, 9.9),
            ("ZEN", "2022-01-06", 13.0, 14.0, 12.0, 13.5, 1300.0, 12.9),
            ("ZEN", "2022-01-04", 11.0, 12.0, 10.0, 11.5, 1100.0, 10.9),
        ]
        table = pa.table({
            "ticker": pa.array([row[0] for row in rows], type=pa.string()),
            "date": pa.array([dt.date.fromisoformat(row[1]) for row in rows], type=pa.date32()),
            "open": pa.array([row[2] for row in rows], type=pa.float64()),
            "high": pa.array([row[3] for row in rows], type=pa.float64()),
            "low": pa.array([row[4] for row in rows], type=pa.float64()),
            "close": pa.array([row[5] for row in rows], type=pa.float64()),
            "volume": pa.array([row[6] for row in rows], type=pa.float64()),
            "closeadj": pa.array([row[7] for row in rows], type=pa.float64()),
            "closeunadj": pa.array([row[5] for row in rows], type=pa.float64()),
            "lastupdated": pa.array([dt.date(2022, 2, 1)] * len(rows), type=pa.date32()),
        })
        pq.write_table(table, partition / "data_0.parquet")

        raw = self.root / "raw"
        raw.mkdir()
        self.archive = raw / "stocks.csv.zip"
        self.archive.write_bytes(b"exact fixture source archive\n")
        self.manifest = raw / "download_manifest.json"
        self.manifest.write_text(json.dumps({
            "generated_at": "2022-02-02T00:00:00+00:00",
            "files": [{
                "logical_name": "prices",
                "file_name": self.archive.name,
                "file_size": self.archive.stat().st_size,
                "sha256": sha256(self.archive),
                "download_timestamp": "2022-02-01T12:00:00+00:00",
            }],
        }), encoding="utf-8")

        self.database = self.root / "candidate.sqlite"
        connection = sqlite3.connect(self.database)
        connection.execute("""
            CREATE TABLE price_points (
                symbol TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL,
                high REAL,
                low REAL,
                close REAL NOT NULL,
                adjusted_close REAL,
                volume REAL,
                source TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (symbol, date)
            )
        """)
        connection.executemany(
            """
            INSERT INTO price_points(
                symbol, date, open, high, low, close, adjusted_close, volume, source, updated_at
            ) VALUES ('SPY', ?, 100, 101, 99, 100, 100, 1000000, 'fixture', '2022-02-02')
            """,
            [(date,) for date in (
                "2022-01-03", "2022-01-04", "2022-01-05", "2022-01-06", "2022-01-07"
            )],
        )
        connection.commit()
        connection.close()

        self.plan = self.root / "plan.json"
        refresh_targets = [
            {"guruId": "dan-loeb", "years": 5, "expectedStatus": "ready"},
            {"guruId": "dan-loeb", "years": 10, "expectedStatus": "ready"},
        ]
        self.plan.write_text(json.dumps({
            "schemaVersion": 1,
            "kind": "guru_sharadar_price_repair_plan",
            "generatedFrom": {
                "refreshTargetContract": {
                    "mode": "explicit_per_guru_window",
                    "targetManifestSchemaVersion": 2,
                    "targetManifestSha256": hashlib.sha256(
                        b"fixture-target-manifest"
                    ).hexdigest(),
                    "refreshTargetsSha256": hashlib.sha256(
                        json.dumps(
                            refresh_targets,
                            sort_keys=True,
                            separators=(",", ":"),
                        ).encode("utf-8")
                    ).hexdigest(),
                    "allowedExpectedStatuses": ["ready", "proxy_ready"],
                    "requiredWindows": [5, 10],
                    "targetCount": len(refresh_targets),
                    "proxyTargets": [],
                },
            },
            "series": [{
                "symbol": "zen",
                "startDate": "2022-01-03",
                "endDate": "2022-01-07",
                "affectedGuruIds": ["dan-loeb"],
            }],
            "refreshTargets": refresh_targets,
            "expectations": {
                "strictMethodVersion": "strict-fixture-v1",
                "proxyMethodVersion": "proxy-fixture-v1",
                "securityMasterVersion": "master-fixture-v1",
                "expectedDisplayableRows": 54,
            },
        }), encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def command(self, output: Path, *extra: str) -> list[str]:
        return [
            "python3", str(BUILDER),
            "--parquet-dir", str(self.parquet),
            "--download-manifest", str(self.manifest),
            "--source-archive", str(self.archive),
            "--database", str(self.database),
            "--plan", str(self.plan),
            "--output", str(output),
            "--generated-at", "2022-02-02T00:00:00Z",
            *extra,
        ]

    def run_builder(self, output: Path, *extra: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            self.command(output, *extra), cwd=REPOSITORY, text=True,
            capture_output=True, check=False,
        )

    def test_builds_sorted_exact_runs_and_binds_with_existing_release_flow(self) -> None:
        output = self.root / "private-unbound.json"
        result = self.run_builder(output, "--allow-missing-spy-sessions")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        artifact = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(artifact["buildMode"], "unbound_private_sharadar_active_intervals")
        self.assertEqual(
            artifact["buildDisposition"],
            "partial_exact_rows_with_known_source_gaps",
        )
        self.assertEqual(len(artifact["series"]), 2)
        self.assertEqual(
            [[row["date"] for row in series["rows"]] for series in artifact["series"]],
            [["2022-01-03", "2022-01-04"], ["2022-01-06", "2022-01-07"]],
        )
        self.assertEqual(artifact["series"][0]["rows"][0]["adjustedClose"], 9.9)
        self.assertEqual(artifact["buildAudit"]["missingSpySessions"], 1)
        self.assertFalse(artifact["buildAudit"]["strictPriceCoverageEligible"])
        self.assertEqual(
            artifact["buildAudit"]["refreshTargetContract"]["mode"],
            "explicit_per_guru_window",
        )
        self.assertEqual(
            artifact["buildAudit"]["refreshTargetContract"]["targetCount"], 2
        )
        self.assertEqual(
            artifact["buildAudit"]["seriesCoverage"][0]["missingDates"],
            ["2022-01-05"],
        )
        self.assertIn(sha256(self.archive), artifact["series"][0]["sourceReference"])

        bound = self.root / "private-bound.json"
        bind = subprocess.run([
            "node", str(BINDER),
            f"--input={output}",
            f"--output={bound}",
            "--release-id=guru-curves-local-fixture",
            "--source-volume-id=vol-12345678",
            "--source-snapshot-id=snap-12345678",
            "--encrypted-snapshot-id=snap-87654321",
            "--operator=local-candidate-test",
        ], cwd=REPOSITORY, text=True, capture_output=True, check=False)
        self.assertEqual(bind.returncode, 0, bind.stderr)
        bound_payload = json.loads(bound.read_text(encoding="utf-8"))
        self.assertRegex(bound_payload["recordsSha256"], r"^[a-f0-9]{64}$")
        self.assertEqual(bound_payload["release"]["releaseId"], "guru-curves-local-fixture")

        connection = sqlite3.connect(self.database)
        self.assertEqual(
            connection.execute("SELECT COUNT(*) FROM price_points").fetchone()[0], 5
        )
        connection.close()

    def test_fails_closed_on_missing_planned_session_without_explicit_split(self) -> None:
        output = self.root / "missing-fails.json"
        result = self.run_builder(output)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("misses 1 planned SPY sessions", result.stderr)
        self.assertFalse(output.exists())

    def test_rejects_unhashed_refresh_status_change(self) -> None:
        plan = json.loads(self.plan.read_text(encoding="utf-8"))
        plan["refreshTargets"][0]["expectedStatus"] = "proxy_ready"
        self.plan.write_text(json.dumps(plan), encoding="utf-8")
        output = self.root / "unhashed-status-change.json"
        result = self.run_builder(output, "--allow-missing-spy-sessions")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("contract hash does not match", result.stderr)
        self.assertFalse(output.exists())

    def test_rejects_incomplete_refresh_window_matrix(self) -> None:
        plan = json.loads(self.plan.read_text(encoding="utf-8"))
        plan["refreshTargets"].pop()
        self.plan.write_text(json.dumps(plan), encoding="utf-8")
        output = self.root / "incomplete-status-matrix.json"
        result = self.run_builder(output, "--allow-missing-spy-sessions")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("explicitly declare both 5Y and 10Y", result.stderr)
        self.assertFalse(output.exists())

    def test_disjoint_active_intervals_never_become_one_internally_gapped_series(self) -> None:
        plan = json.loads(self.plan.read_text(encoding="utf-8"))
        plan["series"] = [
            {
                "symbol": "ZEN",
                "startDate": "2022-01-03",
                "endDate": "2022-01-04",
                "affectedGuruIds": ["dan-loeb"],
            },
            {
                "symbol": "ZEN",
                "startDate": "2022-01-06",
                "endDate": "2022-01-07",
                "affectedGuruIds": ["dan-loeb"],
            },
        ]
        self.plan.write_text(json.dumps(plan), encoding="utf-8")
        output = self.root / "disjoint.json"
        result = self.run_builder(output)
        self.assertEqual(result.returncode, 0, result.stderr)
        artifact = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(
            [(row["startDate"], row["endDate"]) for row in artifact["series"]],
            [("2022-01-03", "2022-01-04"), ("2022-01-06", "2022-01-07")],
        )
        self.assertEqual(artifact["buildAudit"]["missingSpySessions"], 0)
        self.assertTrue(artifact["buildAudit"]["strictPriceCoverageEligible"])

    def test_explicit_local_candidate_mode_backs_up_and_uses_a_nonproduction_ledger(self) -> None:
        artifact = self.root / "local-unbound.json"
        result = self.run_builder(artifact, "--allow-missing-spy-sessions")
        self.assertEqual(result.returncode, 0, result.stderr)
        backup = self.root / "candidate-before.sqlite"
        report = self.root / "candidate-import-report.json"
        applied = subprocess.run([
            "node", str(LOCAL_APPLIER),
            f"--artifact={artifact}",
            f"--database={self.database}",
            f"--backup={backup}",
            f"--output={report}",
            "--release-id=guru-curves-local-candidate-fixture",
            "--operator=local-candidate/tester",
            "--apply=true",
            "--confirm=offline-candidate-write",
        ], cwd=REPOSITORY, text=True, capture_output=True, check=False)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(report.stat().st_mode), 0o600)
        report_payload = json.loads(report.read_text(encoding="utf-8"))
        self.assertTrue(report_payload["nonProduction"])
        self.assertEqual(
            report_payload["releaseId"], "guru-curves-local-candidate-fixture"
        )
        self.assertEqual(report_payload["importedRows"], 4)

        connection = sqlite3.connect(self.database)
        self.assertEqual(
            connection.execute("SELECT COUNT(*) FROM price_points WHERE symbol='ZEN'").fetchone()[0],
            4,
        )
        ledger = connection.execute(
            "SELECT release_id, operator, row_count, imported_row_count "
            "FROM price_series_import_batch_audits"
        ).fetchone()
        connection.close()
        self.assertEqual(ledger, (
            "guru-curves-local-candidate-fixture", "local-candidate/tester", 4, 4
        ))

    def test_rejects_manifest_hash_mismatch_and_repository_output(self) -> None:
        self.archive.write_bytes(b"tampered\n")
        output = self.root / "tampered.json"
        result = self.run_builder(output, "--allow-missing-spy-sessions")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source archive size mismatch", result.stderr)
        self.assertFalse(output.exists())

        # Restore exact bytes, then prove the licensed artifact cannot be
        # accidentally written into even a gitignored repository directory.
        self.archive.write_bytes(b"exact fixture source archive\n")
        repository_output = REPOSITORY / "output/private-price-fixture.json"
        repository_output.unlink(missing_ok=True)
        result = self.run_builder(repository_output, "--allow-missing-spy-sessions")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside the Git repository", result.stderr)
        self.assertFalse(repository_output.exists())


if __name__ == "__main__":
    unittest.main()
