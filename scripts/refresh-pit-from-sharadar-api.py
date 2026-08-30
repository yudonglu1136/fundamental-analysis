#!/usr/bin/env python3
"""Incrementally refresh PIT fundamentals and prices from the paid API."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import sqlite3
import sys
import time
from pathlib import Path


DEFAULT_JANSEN_PROJECT = Path(
    os.environ.get(
        "JANSEN_PROJECT_ROOT",
        Path.home() / "Documents/jansen_us_firm_replication",
    )
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, required=True)
    parser.add_argument("--target-db", type=Path, required=True)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("server/config/sp500-valuation-universe.json"),
    )
    parser.add_argument("--jansen-project", type=Path, default=DEFAULT_JANSEN_PROJECT)
    parser.add_argument("--fundamentals-from", default="2026-08-01")
    parser.add_argument("--prices-from", default="2026-08-20")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--fx-cache", type=Path, default=None)
    return parser.parse_args()


def load_builder_module():
    path = Path(__file__).with_name("build-pit-valuation-source.py")
    spec = importlib.util.spec_from_file_location("build_pit_valuation_source", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def normalized_rows(client, table: str, params: dict) -> list[dict]:
    _status, payload, _headers = client.get_json(table, {**params, "format": "json"})
    rows = client._extract_rows(payload)
    columns, _schema = client._extract_columns(payload, rows)
    return [dict(zip(columns, row)) if isinstance(row, list) else row for row in rows]


def chunks(values: list[str], size: int):
    for index in range(0, len(values), size):
        yield values[index : index + size]


def parse_date(value):
    return dt.date.fromisoformat(str(value)[:10]) if value else None


def normalize_fundamental_row(row: dict) -> dict:
    normalized = dict(row)
    normalized["datekey"] = parse_date(row.get("date"))
    for key in ("calendardate", "reportperiod", "lastupdated"):
        normalized[key] = parse_date(row.get(key))
    return normalized


def main() -> None:
    args = parse_args()
    sys.path.insert(0, str(args.jansen_project))
    from modern_us.sharadar import SharadarClient

    builder = load_builder_module()
    client = SharadarClient(retries=3, timeout_seconds=120, backoff_seconds=5)
    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat()

    with sqlite3.connect(args.source_db) as source:
        source.execute(
            """
            CREATE TABLE IF NOT EXISTS pit_api_fundamentals_raw (
              source_ticker TEXT NOT NULL,
              dimension TEXT NOT NULL,
              fiscal_period TEXT NOT NULL,
              available_at TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              fetched_at TEXT NOT NULL,
              PRIMARY KEY (source_ticker, dimension, fiscal_period, available_at)
            )
            """
        )
        coverage = source.execute(
            """
            SELECT ticker, source_ticker FROM pit_financial_coverage
            WHERE status IN ('covered', 'annual_only') AND source_ticker IS NOT NULL
            ORDER BY source_ticker, ticker
            """
        ).fetchall()
        ui_by_source: dict[str, list[str]] = {}
        for ui_ticker, source_ticker in coverage:
            ui_by_source.setdefault(str(source_ticker).upper(), []).append(str(ui_ticker).upper())

        api_rows: list[dict] = []
        source_tickers = sorted(ui_by_source)
        for batch in chunks(source_tickers, args.batch_size):
            rows = normalized_rows(
                client,
                "fundamentals",
                {
                    "ticker": ",".join(batch),
                    "dimension": "ARQ,ART",
                    "date.gte": args.fundamentals_from,
                },
            )
            api_rows.extend(normalize_fundamental_row(row) for row in rows)
            time.sleep(0.1)

        api_dates = sorted(row["datekey"] for row in api_rows if row.get("datekey"))
        if api_dates:
            fx_rate_book = builder.rate_book_for_range(
                api_dates[0],
                api_dates[-1],
                cache_path=args.fx_cache or builder.DEFAULT_CACHE_PATH,
            )
            builder.replace_sqlite_rates(source, fx_rate_book, fetched_at)
        else:
            fx_rate_book = builder.FxRateBook.from_connection(source)

        new_periods = 0
        latest_available_at = None
        for row in api_rows:
            source_ticker = str(row.get("ticker") or "").upper()
            fiscal_period = str(row.get("fiscalperiod") or "")
            dimension = str(row.get("dimension") or "")
            available_at = row.get("datekey")
            if (
                source_ticker not in ui_by_source
                or dimension not in {"ARQ", "ART"}
                or not fiscal_period
                or available_at is None
            ):
                continue
            available_text = available_at.isoformat()
            latest_available_at = max(latest_available_at or available_text, available_text)
            raw_payload = {
                key: value.isoformat() if isinstance(value, dt.date) else value
                for key, value in row.items()
            }
            source.execute(
                "INSERT OR IGNORE INTO pit_api_fundamentals_raw VALUES (?,?,?,?,?,?)",
                (
                    source_ticker,
                    dimension,
                    fiscal_period,
                    available_text,
                    json.dumps(raw_payload, separators=(",", ":")),
                    fetched_at,
                ),
            )
            for ui_ticker in ui_by_source[source_ticker]:
                period = builder.build_period(
                    ui_ticker,
                    source_ticker,
                    row,
                    args.target_db,
                    fx_rate_book=fx_rate_book,
                )
                inserted = source.execute(
                    """
                    INSERT OR IGNORE INTO pit_financial_periods (
                      ticker, source_ticker, fiscal_period, fiscal_year, fiscal_quarter,
                      dimension, available_at, report_period, currency, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ui_ticker,
                        source_ticker,
                        f"{period['fiscalYear']}-{period['fiscalQuarter']}",
                        period["fiscalYear"],
                        period["fiscalQuarter"],
                        period["sourceDimension"],
                        period["asOfDate"],
                        period["periodEndDate"],
                        period["financialStatementCurrency"],
                        json.dumps(period, separators=(",", ":")),
                    ),
                ).rowcount
                new_periods += inserted

        for ui_ticker, _source_ticker in coverage:
            arq, art, first_at, last_at = source.execute(
                """
                SELECT
                  SUM(dimension='ARQ'), SUM(dimension='ART'),
                  MIN(available_at), MAX(available_at)
                FROM pit_financial_periods WHERE ticker=?
                """,
                (ui_ticker,),
            ).fetchone()
            source.execute(
                """
                UPDATE pit_financial_coverage
                SET status=?, arq_periods=?, art_periods=?,
                    first_available_at=?, last_available_at=?
                WHERE ticker=?
                """,
                ("covered" if arq else "annual_only", arq or 0, art or 0, first_at, last_at, ui_ticker),
            )
        source.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?,?)",
            ("paid_api_refresh", fetched_at),
        )
        source.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?,?)",
            ("paid_api_latest_financial_available_at", latest_available_at or "none"),
        )
        source.commit()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    canonical_by_source = {
        str(company.get("priceTicker") or company["ticker"]).upper(): str(company["ticker"]).upper()
        for company in manifest["companies"]
    }
    price_rows: list[dict] = []
    for batch in chunks(sorted(canonical_by_source), args.batch_size):
        price_rows.extend(
            normalized_rows(
                client,
                "stocks",
                {"ticker": ",".join(batch), "date.gte": args.prices_from},
            )
        )
        time.sleep(0.1)
    with sqlite3.connect(args.target_db) as target:
        target.executemany(
            """
            INSERT INTO price_points (
              symbol, date, open, high, low, close, volume, source, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sharadar-paid-api-split-adjusted', ?)
            ON CONFLICT(symbol, date) DO UPDATE SET
              open=excluded.open, high=excluded.high, low=excluded.low,
              close=excluded.close, volume=excluded.volume,
              source=excluded.source, updated_at=excluded.updated_at
            """,
            [
                (
                    canonical_by_source[str(row["ticker"]).upper()],
                    str(row["date"])[:10],
                    row.get("open"),
                    row.get("high"),
                    row.get("low"),
                    row.get("close"),
                    row.get("volume"),
                    fetched_at,
                )
                for row in price_rows
                if str(row.get("ticker") or "").upper() in canonical_by_source
                and row.get("date")
                and row.get("close") is not None
                and float(row["close"]) > 0
            ],
        )
        target.commit()

    print(
        json.dumps(
            {
                "sourceDb": str(args.source_db),
                "targetDb": str(args.target_db),
                "paidApiFundamentalRows": len(api_rows),
                "newPitPeriods": new_periods,
                "latestFinancialAvailableAt": latest_available_at,
                "paidApiPriceRows": len(price_rows),
                "latestPriceDate": max((str(row.get("date"))[:10] for row in price_rows), default=None),
                "apiKeyPrinted": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
