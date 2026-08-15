#!/usr/bin/env python3
"""Export the local PIT ontology API into a compressed deployable SQLite read model."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


FIXED_ROUTES = {
    "strategies": "/api/strategies",
    "decision_overview": "/api/decision/overview",
    "market_home": "/api/market/home",
    "overview": "/api/overview",
    "graph": "/api/graph",
    "methodology": "/api/methodology",
    "timeline": "/api/timeline",
    "rankings_all": "/api/rankings?sort=heat_score&limit=200",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default="http://127.0.0.1:8766",
        help="Running local ontology API origin.",
    )
    parser.add_argument(
        "--output",
        default="server/data/ontology-snapshot.sqlite",
        help="Destination SQLite path.",
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--current-only",
        action="store_true",
        help="Skip historical timeline snapshots for a fast smoke-test export.",
    )
    return parser.parse_args()


def iso_date(value: Any) -> str:
    return str(value or "")[:10]


class SourceApi:
    def __init__(self, origin: str, retries: int = 4) -> None:
        self.origin = origin.rstrip("/")
        self.retries = retries

    def get(self, route: str) -> dict[str, Any]:
        url = f"{self.origin}{route}"
        last_error: Exception | None = None
        for attempt in range(self.retries):
            try:
                request = urllib.request.Request(
                    url,
                    headers={"accept": "application/json", "user-agent": "Guru-Ontology-Exporter/1.0"},
                )
                with urllib.request.urlopen(request, timeout=180) as response:
                    return json.loads(response.read())
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                last_error = error
                if attempt + 1 < self.retries:
                    time.sleep(0.5 * (2**attempt))
        raise RuntimeError(f"Failed to export {route}: {last_error}")


class SnapshotWriter:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            path.unlink()
        self.path = path
        self.connection = sqlite3.connect(path)
        self.connection.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE responses (
              route_key TEXT PRIMARY KEY,
              payload_gzip BLOB NOT NULL,
              json_bytes INTEGER NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )
        self.count = 0
        self.json_bytes = 0

    def put(self, key: str, payload: Any) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        compressed = gzip.compress(raw, compresslevel=6, mtime=0)
        self.connection.execute(
            "INSERT OR REPLACE INTO responses VALUES (?, ?, ?, ?)",
            (key, compressed, len(raw), datetime.now(timezone.utc).isoformat()),
        )
        self.count += 1
        self.json_bytes += len(raw)

    def set_metadata(self, key: str, value: Any) -> None:
        rendered = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        self.connection.execute(
            "INSERT OR REPLACE INTO metadata VALUES (?, ?)", (key, rendered)
        )

    def close(self) -> None:
        self.connection.commit()
        self.connection.execute("VACUUM")
        self.connection.close()


def parallel_fetch(
    api: SourceApi,
    tasks: Iterable[tuple[str, str]],
    workers: int,
    label: str,
) -> tuple[list[tuple[str, dict[str, Any]]], list[dict[str, str]]]:
    task_list = list(tasks)
    if not task_list:
        return [], []
    results: list[tuple[str, dict[str, Any]]] = []
    errors: list[dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {executor.submit(api.get, route): (key, route) for key, route in task_list}
        for index, future in enumerate(as_completed(futures), start=1):
            key, route = futures[future]
            try:
                results.append((key, future.result()))
            except Exception as error:  # Keep optional company records from aborting the export.
                errors.append({"key": key, "route": route, "error": str(error)})
            if index % 100 == 0 or index == len(task_list):
                print(f"[{label}] {index}/{len(task_list)}", flush=True)
    return results, errors


def paged_group_companies(
    api: SourceApi, group_id: str, *, stage: str | None = None
) -> dict[str, Any]:
    offset = 0
    rows: list[dict[str, Any]] = []
    base: dict[str, Any] = {}
    while True:
        parameters: dict[str, Any] = {
            "limit": 500,
            "offset": offset,
            "sort": "marketcap",
        }
        if stage:
            parameters["stage"] = stage
        query = urllib.parse.urlencode(parameters)
        payload = api.get(f"/api/market/groups/{urllib.parse.quote(group_id)}/companies?{query}")
        base = {key: value for key, value in payload.items() if key != "companies"}
        batch = payload.get("companies") or []
        rows.extend(batch)
        offset += len(batch)
        if not batch or offset >= int(payload.get("total") or 0):
            break
    return {**base, "offset": 0, "limit": len(rows), "companies": rows}


def unique_group_ids(market_home: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for section in ("market_groups", "themes", "sectors"):
        for group in market_home.get(section) or []:
            group_id = str(group.get("id") or "").strip()
            if group_id and group_id not in ids:
                ids.append(group_id)
    return ids


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    api = SourceApi(args.source)
    output = Path(args.output).expanduser().resolve()
    writer = SnapshotWriter(output)
    started_at = datetime.now(timezone.utc).isoformat()
    failures: list[dict[str, str]] = []

    print(f"Exporting ontology from {api.origin}", flush=True)
    fixed: dict[str, dict[str, Any]] = {}
    for key, route in FIXED_ROUTES.items():
        payload = api.get(route)
        fixed[key] = payload
        writer.put(f"fixed:{key}", payload)
        print(f"[fixed] {key}", flush=True)

    strategy_details: dict[str, dict[str, Any]] = {}
    strategy_snapshot_tasks: list[tuple[str, str]] = []
    for strategy in fixed["strategies"].get("strategies") or []:
        strategy_id = str(strategy.get("id") or "").strip()
        if not strategy_id:
            continue
        detail = api.get(f"/api/strategies/{urllib.parse.quote(strategy_id)}")
        strategy_details[strategy_id] = detail
        writer.put(f"strategy_detail:{strategy_id}", detail)
        for period, period_payload in (detail.get("periods") or {}).items():
            dates = [iso_date(value) for value in period_payload.get("snapshot_dates") or []]
            dates = [value for value in dates if value]
            if args.current_only and dates:
                dates = dates[-1:]
            for as_of in dates:
                query = urllib.parse.urlencode({"period": period, "as_of": as_of})
                strategy_snapshot_tasks.append(
                    (
                        f"strategy_snapshot:{strategy_id}:{period}:{as_of}",
                        f"/api/strategies/{urllib.parse.quote(strategy_id)}/snapshot?{query}",
                    )
                )
        print(f"[strategy] {strategy_id}", flush=True)
    strategy_results, strategy_errors = parallel_fetch(
        api, strategy_snapshot_tasks, min(args.workers, 4), "strategy snapshots"
    )
    failures.extend(strategy_errors)
    for key, payload in strategy_results:
        writer.put(key, payload)

    decision_dates = sorted(
        {iso_date(point.get("month")) for point in fixed["decision_overview"].get("timeline") or []}
        - {""}
    )
    decision_tasks = [
        (
            f"decision_snapshot:{as_of}",
            f"/api/decision/snapshot?{urllib.parse.urlencode({'as_of': as_of, 'limit': 200})}",
        )
        for as_of in decision_dates
    ]
    if args.current_only and decision_tasks:
        decision_tasks = decision_tasks[-1:]
    decision_results, decision_errors = parallel_fetch(
        api, decision_tasks, args.workers, "decision snapshots"
    )
    failures.extend(decision_errors)
    decision_tickers: set[str] = set()
    for key, payload in decision_results:
        writer.put(key, payload)
        decision_tickers.update(
            str(row.get("ticker") or "").upper()
            for row in payload.get("signals") or []
            if row.get("ticker")
        )
    for section in ("current_signals", "recent_signals", "holdings"):
        decision_tickers.update(
            str(row.get("ticker") or "").upper()
            for row in fixed["decision_overview"].get(section) or []
            if row.get("ticker")
        )

    group_ids = unique_group_ids(fixed["market_home"])
    group_details: dict[str, dict[str, Any]] = {}
    market_tickers: set[str] = set()
    for index, group_id in enumerate(group_ids, start=1):
        detail = api.get(f"/api/market/groups/{urllib.parse.quote(group_id)}")
        companies = paged_group_companies(api, group_id)
        group_details[group_id] = detail
        writer.put(f"market_group:{group_id}", detail)
        writer.put(f"market_group_companies:{group_id}", companies)
        for stage_row in detail.get("ontology", {}).get("stages") or []:
            stage_id = str(stage_row.get("stage_id") or "").strip()
            if not stage_id:
                continue
            stage_companies = paged_group_companies(api, group_id, stage=stage_id)
            writer.put(
                f"market_group_companies:{group_id}:stage:{stage_id}",
                stage_companies,
            )
        market_tickers.update(
            str(row.get("ticker") or "").upper()
            for row in companies.get("companies") or []
            if row.get("ticker")
        )
        print(f"[market groups] {index}/{len(group_ids)} {group_id}", flush=True)

    if not args.current_only:
        market_snapshot_tasks: list[tuple[str, str]] = []
        for group_id, detail in group_details.items():
            for point in detail.get("signal_timeline") or []:
                as_of = iso_date(point.get("as_of"))
                if as_of:
                    market_snapshot_tasks.append(
                        (
                            f"market_group_snapshot:{group_id}:{as_of}",
                            f"/api/market/groups/{urllib.parse.quote(group_id)}/snapshot?as_of={as_of}",
                        )
                    )
        market_results, market_errors = parallel_fetch(
            api, market_snapshot_tasks, min(args.workers, 4), "market snapshots"
        )
        failures.extend(market_errors)
        for key, payload in market_results:
            writer.put(key, payload)

    market_company_tasks = [
        (
            f"market_company:{ticker}",
            f"/api/market/companies/{urllib.parse.quote(ticker)}",
        )
        for ticker in sorted(market_tickers)
    ]
    market_company_results, market_company_errors = parallel_fetch(
        api, market_company_tasks, args.workers, "market companies"
    )
    failures.extend(market_company_errors)
    for key, payload in market_company_results:
        writer.put(key, payload)

    graph_tickers = {
        str(row.get("ticker") or "").upper()
        for row in fixed["graph"].get("companies") or []
        if row.get("ticker")
    }
    ai_company_tasks = [
        (f"company:{ticker}", f"/api/company/{urllib.parse.quote(ticker)}")
        for ticker in sorted(graph_tickers)
    ]
    ai_company_results, ai_company_errors = parallel_fetch(
        api, ai_company_tasks, args.workers, "AI companies"
    )
    failures.extend(ai_company_errors)
    for key, payload in ai_company_results:
        writer.put(key, payload)

    decision_company_tasks = [
        (
            f"decision_company:{ticker}",
            f"/api/decision/company/{urllib.parse.quote(ticker)}",
        )
        for ticker in sorted(decision_tickers)
    ]
    decision_company_results, decision_company_errors = parallel_fetch(
        api, decision_company_tasks, args.workers, "decision companies"
    )
    failures.extend(decision_company_errors)
    for key, payload in decision_company_results:
        writer.put(key, payload)

    if not args.current_only:
        ai_snapshot_tasks = [
            (
                f"snapshot:{iso_date(point.get('as_of'))}",
                f"/api/snapshot?as_of={iso_date(point.get('as_of'))}",
            )
            for point in fixed["timeline"].get("points") or []
            if iso_date(point.get("as_of"))
        ]
        ai_snapshot_results, ai_snapshot_errors = parallel_fetch(
            api, ai_snapshot_tasks, min(args.workers, 4), "AI snapshots"
        )
        failures.extend(ai_snapshot_errors)
        for key, payload in ai_snapshot_results:
            writer.put(key, payload)

    critical_failures = [
        failure
        for failure in failures
        if not failure["key"].startswith(("market_company:", "company:", "decision_company:"))
    ]
    manifest = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at,
        "source_origin": api.origin,
        "current_only": args.current_only,
        "responses": writer.count,
        "uncompressed_json_bytes": writer.json_bytes,
        "decision_dates": len(decision_dates),
        "strategies": len(strategy_details),
        "strategy_snapshots": len(strategy_results),
        "market_groups": len(group_ids),
        "market_companies": len(market_tickers),
        "decision_companies": len(decision_tickers),
        "ai_companies": len(graph_tickers),
        "failures": failures[:200],
        "failure_count": len(failures),
        "critical_failure_count": len(critical_failures),
        "financial_as_of": fixed["market_home"].get("metadata", {}).get("as_of"),
        "decision_latest": fixed["decision_overview"].get("stats", {}).get(
            "latest_information_date"
        ),
    }
    writer.set_metadata("manifest", manifest)
    writer.set_metadata("schema_version", "2")
    writer.close()

    digest = sha256(output)
    final_manifest = {**manifest, "sha256": digest, "bytes": output.stat().st_size}
    manifest_path = output.with_suffix(f"{output.suffix}.manifest.json")
    manifest_path.write_text(
        json.dumps(final_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(final_manifest, ensure_ascii=False, indent=2))
    if critical_failures:
        print("Critical snapshot routes failed; refusing a production-complete result.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
