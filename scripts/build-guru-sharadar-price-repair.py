#!/usr/bin/env python3
"""Build an unbound, private Guru price-repair artifact from Sharadar SEP.

The builder is deliberately read-only with respect to the application database.
It verifies the paid source archive against its download manifest, extracts only
the explicitly planned holding intervals, sorts the vendor rows, and intersects
them with the candidate database's stored SPY sessions. Missing source sessions
are never filled: they split the emitted series and remain visible in buildAudit.

The output contains licensed price rows. It must live outside the repository and
must be release-bound with ``bind-guru-price-repair-release.mjs`` before use by
the production audited-import route.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import sqlite3
import stat
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


ARTIFACT_KIND = "guru_price_series_repair_batch"
PLAN_KIND = "guru_sharadar_price_repair_plan"
PROVIDER = "sharadar-sep"
MAX_SERIES = 64
MAX_ROWS_PER_SERIES = 5_000
MAX_TOTAL_ROWS = 20_000
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,15}$")
GURU_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet-dir", type=Path, required=True)
    parser.add_argument("--download-manifest", type=Path, required=True)
    parser.add_argument(
        "--source-archive",
        type=Path,
        help="Defaults to the manifest directory plus the prices file_name.",
    )
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument(
        "--allow-missing-spy-sessions",
        action="store_true",
        help=(
            "Emit separate exact runs when a planned active interval lacks a vendor row. "
            "Without this explicit flag, any missing planned SPY session fails closed."
        ),
    )
    return parser.parse_args(argv)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path, label: str) -> Any:
    if not path.is_file():
        raise RuntimeError(f"{label} is missing: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"{label} is unreadable or corrupt: {path}: {error}") from error


def parse_date(value: Any, label: str) -> dt.date:
    normalized = str(value or "").strip()
    if not DATE_PATTERN.fullmatch(normalized):
        raise RuntimeError(f"{label} must use YYYY-MM-DD.")
    try:
        parsed = dt.date.fromisoformat(normalized)
    except ValueError as error:
        raise RuntimeError(f"{label} is not a valid calendar date: {normalized}") from error
    return parsed


def parse_generated_at(value: str) -> str:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise RuntimeError("--generated-at must be a fixed ISO timestamp.") from error
    if parsed.tzinfo is None:
        raise RuntimeError("--generated-at must include a timezone.")
    parsed = parsed.astimezone(dt.timezone.utc)
    if parsed > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
        raise RuntimeError("--generated-at may not be more than five minutes in the future.")
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def safe_private_output_path(path: Path) -> Path:
    repository = Path(__file__).resolve().parents[1]
    resolved = path.expanduser().resolve()
    if is_relative_to(resolved, repository):
        raise RuntimeError(
            "Licensed price artifacts must be written outside the Git repository."
        )
    if resolved.exists():
        raise RuntimeError(f"Refusing to overwrite an existing private artifact: {resolved}")
    resolved.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    return resolved


def write_private_json(path: Path, payload: Any) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, ensure_ascii=False, separators=(",", ":"))
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except BaseException:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def validate_source_manifest(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get("files"), list):
        raise RuntimeError("Sharadar download manifest has an invalid schema.")
    candidates = [
        row for row in payload["files"]
        if isinstance(row, dict) and row.get("logical_name") == "prices"
    ]
    if len(candidates) != 1:
        raise RuntimeError("Sharadar download manifest must contain exactly one prices entry.")
    source = candidates[0]
    expected_hash = str(source.get("sha256") or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
        raise RuntimeError("Sharadar prices manifest entry lacks a valid SHA-256.")
    file_name = str(source.get("file_name") or "").strip()
    if not file_name or Path(file_name).name != file_name:
        raise RuntimeError("Sharadar prices manifest entry has an unsafe file_name.")
    file_size = source.get("file_size")
    if not isinstance(file_size, int) or file_size < 1:
        raise RuntimeError("Sharadar prices manifest entry lacks a valid file size.")
    downloaded_at = str(source.get("download_timestamp") or "").strip()
    try:
        timestamp = dt.datetime.fromisoformat(downloaded_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise RuntimeError("Sharadar prices manifest entry has an invalid timestamp.") from error
    if timestamp.tzinfo is None:
        raise RuntimeError("Sharadar prices manifest timestamp must include a timezone.")
    return {
        "fileName": file_name,
        "fileSize": file_size,
        "sha256": expected_hash,
        "downloadedAt": timestamp.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def validate_source_archive(path: Path, source: dict[str, Any]) -> None:
    if not path.is_file():
        raise RuntimeError(f"Sharadar prices source archive is missing: {path}")
    actual_size = path.stat().st_size
    if actual_size != source["fileSize"]:
        raise RuntimeError(
            f"Sharadar prices source archive size mismatch: expected={source['fileSize']} "
            f"actual={actual_size}"
        )
    actual_hash = sha256_file(path)
    if actual_hash != source["sha256"]:
        raise RuntimeError(
            f"Sharadar prices source archive hash mismatch: expected={source['sha256']} "
            f"actual={actual_hash}"
        )


def normalize_guru_ids(value: Any, label: str) -> list[str]:
    if not isinstance(value, list):
        raise RuntimeError(f"{label} must be an array.")
    normalized = sorted({str(item or "").strip() for item in value if str(item or "").strip()})
    if not normalized or len(normalized) > 5:
        raise RuntimeError(f"{label} must contain one to five unique Guru ids.")
    invalid = [item for item in normalized if not GURU_ID_PATTERN.fullmatch(item)]
    if invalid:
        raise RuntimeError(f"{label} contains invalid Guru ids: {', '.join(invalid)}")
    return normalized


def validate_refresh_target_contract(
    raw: Any,
    refresh_targets: list[dict[str, Any]],
) -> dict[str, Any]:
    if not isinstance(raw, dict) or raw.get("mode") != "explicit_per_guru_window" or \
            raw.get("targetManifestSchemaVersion") != 2:
        raise RuntimeError(
            "Price-repair plan requires an explicit per-Guru/window refresh-target contract."
        )
    target_manifest_hash = str(raw.get("targetManifestSha256") or "").strip().lower()
    refresh_targets_hash = str(raw.get("refreshTargetsSha256") or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", target_manifest_hash) or \
            not re.fullmatch(r"[a-f0-9]{64}", refresh_targets_hash):
        raise RuntimeError("Price-repair refresh-target contract has an invalid source hash.")
    actual_targets_hash = sha256_json(refresh_targets)
    if refresh_targets_hash != actual_targets_hash:
        raise RuntimeError("Price-repair refresh-target contract hash does not match its targets.")
    allowed_statuses = raw.get("allowedExpectedStatuses")
    required_windows = raw.get("requiredWindows")
    target_count = raw.get("targetCount")
    proxy_targets = raw.get("proxyTargets")
    expected_proxy_targets = [
        target for target in refresh_targets if target["expectedStatus"] == "proxy_ready"
    ]
    if allowed_statuses != ["ready", "proxy_ready"] or required_windows != [5, 10] or \
            target_count != len(refresh_targets) or proxy_targets != expected_proxy_targets:
        raise RuntimeError("Price-repair refresh-target contract metadata is inconsistent.")
    return {
        "mode": "explicit_per_guru_window",
        "targetManifestSchemaVersion": 2,
        "targetManifestSha256": target_manifest_hash,
        "refreshTargetsSha256": refresh_targets_hash,
        "allowedExpectedStatuses": allowed_statuses,
        "requiredWindows": required_windows,
        "targetCount": target_count,
        "proxyTargets": proxy_targets,
    }


def validate_plan(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or \
            payload.get("kind") != PLAN_KIND:
        raise RuntimeError(f"Price-repair plan must use schemaVersion 1 and kind {PLAN_KIND!r}.")
    raw_series = payload.get("series")
    if not isinstance(raw_series, list) or not raw_series or len(raw_series) > MAX_SERIES:
        raise RuntimeError(f"Price-repair plan must contain 1-{MAX_SERIES} series requests.")
    series = []
    for index, raw in enumerate(raw_series):
        if not isinstance(raw, dict):
            raise RuntimeError(f"Plan series {index} must be an object.")
        symbol = str(raw.get("symbol") or "").strip().upper()
        if not SYMBOL_PATTERN.fullmatch(symbol) or symbol == "SPY":
            raise RuntimeError(f"Plan series {index} has an invalid or reserved symbol.")
        start = parse_date(raw.get("startDate"), f"Plan series {symbol} startDate")
        end = parse_date(raw.get("endDate"), f"Plan series {symbol} endDate")
        if start > end:
            raise RuntimeError(f"Plan series {symbol} starts after it ends.")
        series.append({
            "symbol": symbol,
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "affectedGuruIds": normalize_guru_ids(
                raw.get("affectedGuruIds"), f"Plan series {symbol} affectedGuruIds"
            ),
        })

    raw_targets = payload.get("refreshTargets")
    if not isinstance(raw_targets, list) or not raw_targets:
        raise RuntimeError("Price-repair plan requires explicit refreshTargets.")
    targets = []
    target_keys: set[tuple[str, int]] = set()
    target_windows: dict[str, set[int]] = defaultdict(set)
    for index, raw in enumerate(raw_targets):
        if not isinstance(raw, dict):
            raise RuntimeError(f"Refresh target {index} must be an object.")
        guru_id = str(raw.get("guruId") or "").strip()
        years = raw.get("years")
        expected_status = str(raw.get("expectedStatus") or "").strip().lower()
        if not GURU_ID_PATTERN.fullmatch(guru_id) or years not in {5, 10} or \
                expected_status not in {"ready", "proxy_ready"}:
            raise RuntimeError(f"Refresh target {index} is invalid.")
        key = (guru_id, years)
        if key in target_keys:
            raise RuntimeError(f"Duplicate refresh target: {guru_id}:{years}.")
        target_keys.add(key)
        target_windows[guru_id].add(years)
        targets.append({"guruId": guru_id, "years": years, "expectedStatus": expected_status})
    incomplete_target_gurus = sorted(
        guru_id for guru_id, windows in target_windows.items() if windows != {5, 10}
    )
    if incomplete_target_gurus:
        raise RuntimeError(
            "Refresh targets must explicitly declare both 5Y and 10Y for: "
            f"{', '.join(incomplete_target_gurus)}."
        )
    affected = {guru_id for item in series for guru_id in item["affectedGuruIds"]}
    target_gurus = {item["guruId"] for item in targets}
    untargeted = sorted(affected - target_gurus)
    if untargeted:
        raise RuntimeError(f"Planned series lack refresh targets for: {', '.join(untargeted)}.")

    generated_from = payload.get("generatedFrom")
    if not isinstance(generated_from, dict):
        raise RuntimeError("Price-repair plan requires generatedFrom audit metadata.")
    refresh_target_contract = validate_refresh_target_contract(
        generated_from.get("refreshTargetContract"), targets
    )

    raw_expectations = payload.get("expectations")
    if not isinstance(raw_expectations, dict):
        raise RuntimeError("Price-repair plan requires release expectations.")
    expectations = {
        "strictMethodVersion": str(raw_expectations.get("strictMethodVersion") or "").strip(),
        "proxyMethodVersion": str(raw_expectations.get("proxyMethodVersion") or "").strip(),
        "securityMasterVersion": str(raw_expectations.get("securityMasterVersion") or "").strip(),
        "expectedDisplayableRows": raw_expectations.get("expectedDisplayableRows"),
    }
    if not all(expectations[key] for key in (
        "strictMethodVersion", "proxyMethodVersion", "securityMasterVersion"
    )) or not isinstance(expectations["expectedDisplayableRows"], int) or \
            expectations["expectedDisplayableRows"] < 1:
        raise RuntimeError("Price-repair plan expectations are incomplete.")
    return {
        "series": series,
        "refreshTargets": targets,
        "refreshTargetContract": refresh_target_contract,
        "expectations": expectations,
    }


def read_spy_sessions(database: Path, start: str, end: str) -> list[str]:
    resolved = database.expanduser().resolve()
    if not resolved.is_file():
        raise RuntimeError(f"Candidate database is missing: {resolved}")
    wal_path = Path(f"{resolved}-wal")
    if wal_path.exists() and wal_path.stat().st_size:
        raise RuntimeError(
            "Candidate database has a non-empty WAL; supply a consistent offline SQLite "
            "backup so immutable read-only mode cannot miss committed SPY sessions."
        )
    rows = None
    final_error = None
    for attempt in range(5):
        connection = None
        try:
            connection = sqlite3.connect(
                f"{resolved.as_uri()}?mode=ro&immutable=1", uri=True, timeout=60
            )
            connection.execute("PRAGMA query_only = ON")
            rows = connection.execute(
                """
                SELECT date
                FROM price_points
                WHERE symbol = 'SPY' AND date >= ? AND date <= ?
                ORDER BY date ASC
                """,
                (start, end),
            ).fetchall()
            break
        except sqlite3.Error as error:
            final_error = error
            if attempt < 4:
                time.sleep(0.2 * (attempt + 1))
        finally:
            if connection is not None:
                connection.close()
    if rows is None:
        raise RuntimeError(
            f"Candidate database cannot supply SPY sessions: {final_error}"
        ) from final_error
    dates = [str(row[0]) for row in rows]
    if not dates:
        raise RuntimeError("Candidate database has no SPY sessions in the planned interval.")
    if dates != sorted(set(dates)) or any(not DATE_PATTERN.fullmatch(date) for date in dates):
        raise RuntimeError("Candidate database returned invalid or duplicate SPY sessions.")
    return dates


def relevant_parquet_files(root: Path, years: set[int]) -> list[Path]:
    if not root.is_dir():
        raise RuntimeError(f"Sharadar prices Parquet directory is missing: {root}")
    files = sorted(
        path.resolve()
        for year in sorted(years)
        for path in (root / f"year={year}").glob("*.parquet")
    )
    absent = [year for year in sorted(years) if not any(
        f"year={year}" in path.parts for path in files
    )]
    if absent:
        raise RuntimeError(f"Sharadar Parquet partitions are missing for years: {absent}")
    if not files:
        raise RuntimeError("No relevant Sharadar Parquet files were found.")
    return files


def parquet_fingerprint(root: Path, files: Iterable[Path]) -> tuple[str, list[dict[str, Any]]]:
    records = []
    resolved_root = root.resolve()
    for path in files:
        records.append({
            "path": path.relative_to(resolved_root).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    return sha256_json(records), records


def load_vendor_rows(
    parquet_root: Path,
    plan_series: list[dict[str, Any]],
    start: str,
    end: str,
    years: set[int],
) -> dict[str, dict[str, dict[str, Any]]]:
    try:
        import pyarrow.dataset as ds
    except ImportError as error:
        raise RuntimeError(
            "pyarrow is required for the local Sharadar extraction workflow."
        ) from error
    symbols = {item["symbol"] for item in plan_series}
    intervals_by_symbol: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for item in plan_series:
        intervals_by_symbol[item["symbol"]].append((item["startDate"], item["endDate"]))
    dataset = ds.dataset(parquet_root, format="parquet", partitioning="hive")
    required = {"ticker", "date", "open", "high", "low", "close", "volume", "closeadj"}
    missing_columns = sorted(required - set(dataset.schema.names))
    if missing_columns:
        raise RuntimeError(f"Sharadar prices Parquet is missing columns: {missing_columns}")
    filter_expression = ds.field("ticker").isin(sorted(symbols))
    if "year" in dataset.schema.names:
        filter_expression = filter_expression & ds.field("year").isin(sorted(years))
    table = dataset.to_table(columns=sorted(required), filter=filter_expression)
    by_symbol: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for source in table.to_pylist():
        symbol = str(source.get("ticker") or "").strip().upper()
        if symbol not in symbols:
            continue
        raw_date = source.get("date")
        if isinstance(raw_date, dt.datetime):
            raw_date = raw_date.date()
        if not isinstance(raw_date, dt.date):
            raise RuntimeError(f"Sharadar {symbol} contains an invalid date: {raw_date!r}")
        date = raw_date.isoformat()
        if date < start or date > end:
            continue
        if not any(
            interval_start <= date <= interval_end
            for interval_start, interval_end in intervals_by_symbol[symbol]
        ):
            continue
        if date in by_symbol[symbol]:
            raise RuntimeError(f"Sharadar prices contain duplicate {symbol} date {date}.")
        values: dict[str, float] = {}
        for source_name, output_name in (
            ("open", "open"),
            ("high", "high"),
            ("low", "low"),
            ("close", "close"),
            ("closeadj", "adjustedClose"),
        ):
            value = source.get(source_name)
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or \
                    float(value) <= 0 or float(value) > 10_000_000:
                raise RuntimeError(f"Sharadar {symbol} {date} has invalid {source_name}.")
            values[output_name] = float(value)
        raw_volume = source.get("volume")
        if not isinstance(raw_volume, (int, float)) or not math.isfinite(float(raw_volume)):
            raise RuntimeError(f"Sharadar {symbol} {date} has invalid volume.")
        volume = int(raw_volume)
        if float(raw_volume) != volume or volume < 0 or volume > 100_000_000_000:
            raise RuntimeError(f"Sharadar {symbol} {date} has non-integral or invalid volume.")
        if values["high"] < max(values["open"], values["close"], values["low"]) or \
                values["low"] > min(values["open"], values["close"], values["high"]):
            raise RuntimeError(f"Sharadar {symbol} {date} has inconsistent OHLC values.")
        by_symbol[symbol][date] = {"date": date, **values, "volume": volume}
    absent = sorted(symbols - set(by_symbol))
    if absent:
        raise RuntimeError(f"Sharadar prices have no planned rows for: {', '.join(absent)}.")
    return by_symbol


def rows_sha256(rows: list[dict[str, Any]]) -> str:
    canonical = [{
        "date": row["date"],
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
        "adjustedClose": float(row["adjustedClose"]),
        "volume": int(row["volume"]),
    } for row in rows]
    return sha256_json(canonical)


def planned_gurus_for_date(requests: list[dict[str, Any]], date: str) -> list[str]:
    return sorted({
        guru_id
        for request in requests
        if request["startDate"] <= date <= request["endDate"]
        for guru_id in request["affectedGuruIds"]
    })


def build_series(
    plan_series: list[dict[str, Any]],
    spy_dates: list[str],
    vendor_rows: dict[str, dict[str, dict[str, Any]]],
    source_reference: str,
    allow_missing: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    requests_by_symbol: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for request in plan_series:
        requests_by_symbol[request["symbol"]].append(request)

    output: list[dict[str, Any]] = []
    coverage: list[dict[str, Any]] = []
    for symbol in sorted(requests_by_symbol):
        requests = requests_by_symbol[symbol]
        planned_dates = [
            date for date in spy_dates if any(
                request["startDate"] <= date <= request["endDate"] for request in requests
            )
        ]
        if not planned_dates:
            raise RuntimeError(f"No candidate SPY sessions fall inside the {symbol} plan.")
        available = vendor_rows[symbol]
        missing_dates = [date for date in planned_dates if date not in available]
        if missing_dates and not allow_missing:
            raise RuntimeError(
                f"Sharadar {symbol} misses {len(missing_dates)} planned SPY sessions; "
                f"first={missing_dates[:5]}. Recheck the active interval or use the explicit "
                "--allow-missing-spy-sessions split mode."
            )

        groups: list[tuple[list[str], list[dict[str, Any]]]] = []
        current_gurus: list[str] = []
        current_rows: list[dict[str, Any]] = []
        # Iterate the complete benchmark calendar, not only selected dates.
        # Otherwise two disjoint active intervals for the same manager could
        # be emitted as one apparently continuous series with an internal hole.
        for date in spy_dates:
            gurus = planned_gurus_for_date(requests, date)
            if not gurus:
                if current_rows:
                    groups.append((current_gurus, current_rows))
                current_gurus, current_rows = [], []
                continue
            row = available.get(date)
            if row is None:
                if current_rows:
                    groups.append((current_gurus, current_rows))
                current_gurus, current_rows = [], []
                continue
            if current_rows and (gurus != current_gurus or len(current_rows) >= MAX_ROWS_PER_SERIES):
                groups.append((current_gurus, current_rows))
                current_rows = []
            current_gurus = gurus
            current_rows.append(row)
        if current_rows:
            groups.append((current_gurus, current_rows))

        emitted_rows = 0
        for gurus, rows in groups:
            emitted_rows += len(rows)
            output.append({
                "symbol": symbol,
                "startDate": rows[0]["date"],
                "endDate": rows[-1]["date"],
                "provider": PROVIDER,
                "reason": "Restore exact adjusted prices for audited Guru active holding intervals.",
                "sourceReference": source_reference,
                "affectedGuruIds": gurus,
                "rows": rows,
                "rowsSha256": rows_sha256(rows),
            })
        coverage.append({
            "symbol": symbol,
            "requestedIntervals": sorted(
                [{
                    "startDate": item["startDate"],
                    "endDate": item["endDate"],
                    "affectedGuruIds": item["affectedGuruIds"],
                } for item in requests],
                key=lambda item: (item["startDate"], item["endDate"], item["affectedGuruIds"]),
            ),
            "plannedSpySessions": len(planned_dates),
            "emittedRows": emitted_rows,
            "missingSpySessions": len(missing_dates),
            "missingDates": missing_dates,
            "emittedGroups": len(groups),
            "firstEmittedDate": groups[0][1][0]["date"] if groups else None,
            "lastEmittedDate": groups[-1][1][-1]["date"] if groups else None,
        })
    if not output or len(output) > MAX_SERIES:
        raise RuntimeError(f"Extraction emitted an invalid series count: {len(output)}.")
    total_rows = sum(len(item["rows"]) for item in output)
    if total_rows > MAX_TOTAL_ROWS:
        raise RuntimeError(
            f"Extraction emitted {total_rows} rows, above the audited batch limit "
            f"of {MAX_TOTAL_ROWS}; narrow the active holding intervals."
        )
    return output, coverage


def build_artifact(options: argparse.Namespace) -> dict[str, Any]:
    generated_at = parse_generated_at(options.generated_at)
    plan_payload = read_json(options.plan, "Price-repair plan")
    plan = validate_plan(plan_payload)
    manifest_payload = read_json(options.download_manifest, "Sharadar download manifest")
    source = validate_source_manifest(manifest_payload)
    archive = (options.source_archive or options.download_manifest.parent / source["fileName"])
    archive = archive.expanduser().resolve()
    validate_source_archive(archive, source)

    all_start = min(item["startDate"] for item in plan["series"])
    all_end = max(item["endDate"] for item in plan["series"])
    spy_dates = read_spy_sessions(options.database, all_start, all_end)
    years = {
        year
        for item in plan["series"]
        for year in range(int(item["startDate"][:4]), int(item["endDate"][:4]) + 1)
    }
    parquet_files = relevant_parquet_files(options.parquet_dir.expanduser().resolve(), years)
    parquet_hash, parquet_records = parquet_fingerprint(options.parquet_dir, parquet_files)
    manifest_hash = sha256_file(options.download_manifest)
    source_reference = (
        f"Sharadar SEP archive={source['sha256']}; manifest={manifest_hash}; "
        f"parquet={parquet_hash}"
    )
    if len(source_reference) > 240:
        raise RuntimeError("Generated source reference exceeds the audited import limit.")
    vendor_rows = load_vendor_rows(
        options.parquet_dir.expanduser().resolve(), plan["series"], all_start, all_end, years
    )
    series, coverage = build_series(
        plan["series"], spy_dates, vendor_rows, source_reference,
        options.allow_missing_spy_sessions,
    )
    total_rows = sum(len(item["rows"]) for item in series)
    missing_sessions = sum(item["missingSpySessions"] for item in coverage)
    return {
        "schemaVersion": 1,
        "kind": ARTIFACT_KIND,
        "generatedAt": generated_at,
        "buildMode": "unbound_private_sharadar_active_intervals",
        "buildDisposition": (
            "complete" if missing_sessions == 0
            else "partial_exact_rows_with_known_source_gaps"
        ),
        "licenseNotice": "Contains licensed Sharadar SEP rows; never commit or publish this file.",
        "series": series,
        "refreshTargets": plan["refreshTargets"],
        "expectations": plan["expectations"],
        "release": {
            "releaseId": "",
            "sourceVolumeId": "",
            "sourceSnapshotId": "",
            "encryptedSnapshotId": "",
            "operator": "",
        },
        "recordsSha256": "",
        "buildAudit": {
            "selectionPolicy": (
                "explicit_active_holding_intervals_intersect_candidate_spy_sessions_"
                "sorted_no_fill_no_interpolation"
            ),
            "refreshTargetContract": plan["refreshTargetContract"],
            "source": {
                "provider": "Sharadar SEP",
                "archiveFileName": source["fileName"],
                "archiveBytes": source["fileSize"],
                "archiveSha256": source["sha256"],
                "downloadedAt": source["downloadedAt"],
                "downloadManifestSha256": manifest_hash,
                "parquetInputSha256": parquet_hash,
                "parquetFileCount": len(parquet_records),
                "parquetFiles": parquet_records,
                "adjustedCloseColumn": "closeadj",
            },
            "benchmark": {
                "symbol": "SPY",
                "firstSession": spy_dates[0],
                "lastSession": spy_dates[-1],
                "sessionCount": len(spy_dates),
                "sessionsSha256": sha256_json(spy_dates),
            },
            "seriesCoverage": coverage,
            "emittedSeries": len(series),
            "emittedRows": total_rows,
            "missingSpySessions": missing_sessions,
            "strictPriceCoverageEligible": missing_sessions == 0,
            "missingSessionPolicy": (
                "fail_closed" if missing_sessions == 0
                else "split_exact_runs_no_fill_no_interpolation_strict_curve_must_remain_unavailable"
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    os.umask(0o077)
    options = parse_args(argv)
    try:
        output = safe_private_output_path(options.output)
        artifact = build_artifact(options)
        write_private_json(output, artifact)
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    mode = stat.S_IMODE(output.stat().st_mode)
    print(canonical_json({
        "status": "built_unbound_private_artifact",
        "output": str(output),
        "mode": oct(mode),
        "series": len(artifact["series"]),
        "rows": artifact["buildAudit"]["emittedRows"],
        "missingSpySessions": artifact["buildAudit"]["missingSpySessions"],
        "sourceArchiveSha256": artifact["buildAudit"]["source"]["archiveSha256"],
        "parquetInputSha256": artifact["buildAudit"]["source"]["parquetInputSha256"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
