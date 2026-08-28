#!/usr/bin/env python3
"""Seed S&P 500 metadata and split-adjusted paid price history into a DB copy."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
from pathlib import Path

import pyarrow.dataset as ds


DEFAULT_JANSEN_ROOT = Path(
    os.environ.get(
        "JANSEN_SHARADAR_ROOT",
        Path.home() / "Documents/jansen_us_firm_replication/data/sharadar/parquet",
    )
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("server/config/sp500-valuation-universe.json"),
    )
    parser.add_argument("--jansen-root", type=Path, default=DEFAULT_JANSEN_ROOT)
    parser.add_argument("--start-date", default="2010-01-01")
    return parser.parse_args()


def table_count(connection: sqlite3.Connection, table: str) -> int:
    return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def main() -> None:
    args = parse_args()
    if not args.database.exists():
        raise FileNotFoundError(args.database)
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    companies = manifest.get("companies") or []
    if len(companies) != 500:
        raise RuntimeError(f"Expected 500 issuer rows, found {len(companies)}")

    canonical_by_price_ticker = {
        str(company.get("priceTicker") or company["ticker"]).upper(): str(
            company["ticker"]
        ).upper()
        for company in companies
    }
    price_source_tickers = sorted(canonical_by_price_ticker)
    price_dataset = ds.dataset(
        args.jansen_root / "prices", format="parquet", partitioning="hive"
    )
    price_rows = price_dataset.to_table(
        columns=["ticker", "date", "open", "high", "low", "close", "volume"],
        filter=ds.field("ticker").isin(price_source_tickers)
        & (ds.field("date") >= dt.date.fromisoformat(args.start_date)),
    ).to_pylist()
    seen_price_sources = {str(row["ticker"]).upper() for row in price_rows}
    missing_price_sources = sorted(set(price_source_tickers) - seen_price_sources)
    if missing_price_sources:
        raise RuntimeError(f"Missing paid price history: {missing_price_sources}")

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
    connection = sqlite3.connect(args.database)
    connection.execute("PRAGMA foreign_keys = ON")
    protected_tables = [
        table
        for table in (
            "users",
            "user_portfolios",
            "portfolio_accounts",
            "portfolio_holdings",
            "guru_snapshots",
            "ontology_snapshots",
            "transcript_qa",
        )
        if connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
    ]
    protected_before = {table: table_count(connection, table) for table in protected_tables}
    inserted_snapshots = 0
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.executemany(
            """
            INSERT INTO price_points (
              symbol, date, open, high, low, close, volume, source, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'jansen-sharadar-sep-split-adjusted', ?)
            ON CONFLICT(symbol, date) DO UPDATE SET
              open=excluded.open,
              high=excluded.high,
              low=excluded.low,
              close=excluded.close,
              volume=excluded.volume,
              source=excluded.source,
              updated_at=excluded.updated_at
            """,
            [
                (
                    canonical_by_price_ticker[str(row["ticker"]).upper()],
                    row["date"].isoformat(),
                    row.get("open"),
                    row.get("high"),
                    row.get("low"),
                    row["close"],
                    row.get("volume"),
                    generated_at,
                )
                for row in price_rows
                if row.get("close") is not None and float(row["close"]) > 0
            ],
        )

        existing = {
            str(row[0]).upper()
            for row in connection.execute("SELECT ticker FROM valuation_ticker_snapshots")
        }
        for company in companies:
            ticker = str(company["ticker"]).upper()
            if ticker in existing:
                continue
            latest = connection.execute(
                """
                SELECT date, close, source FROM price_points
                WHERE symbol=? AND close > 0 ORDER BY date DESC LIMIT 1
                """,
                (ticker,),
            ).fetchone()
            snapshot = {
                "ticker": ticker,
                "key": ticker.lower(),
                "name": company.get("name") or ticker,
                "sector": company.get("sector") or "Public equity",
                "industry": company.get("industry"),
                "currency": company.get("currency") or "USD",
                "description": (
                    f"{company.get('name') or ticker} point-in-time valuation research."
                ),
                "cik": company.get("cik"),
                "cusip": company.get("cusip"),
                "aliases": company.get("aliases") or [],
                "valuationProfile": company.get("valuationProfile"),
                "sp500MembershipAsOf": manifest.get("asOf"),
                "priceHistory": [],
                "priceSource": latest[2] if latest else None,
                "latest": {
                    "latestPrice": latest[1] if latest else None,
                    "latestPriceDate": latest[0] if latest else None,
                    "latestPriceSource": latest[2] if latest else None,
                },
                "dataQuality": {
                    "pricePoints": 0,
                    "hasLivePriceSeries": False,
                    "universeSource": "official SPY holdings + Jansen Sharadar",
                },
            }
            connection.execute(
                """
                INSERT INTO valuation_ticker_snapshots (ticker, generated_at, payload_json)
                VALUES (?, ?, ?)
                """,
                (ticker, generated_at, json.dumps(snapshot, separators=(",", ":"))),
            )
            inserted_snapshots += 1
        connection.commit()
    except Exception:
        connection.rollback()
        raise

    protected_after = {table: table_count(connection, table) for table in protected_tables}
    if protected_before != protected_after:
        raise RuntimeError(
            f"Protected non-valuation table counts changed: {protected_before} -> {protected_after}"
        )
    coverage = connection.execute(
        """
        SELECT COUNT(DISTINCT symbol), MIN(date), MAX(date), COUNT(*)
        FROM price_points
        WHERE symbol IN ({}) AND date >= ? AND close > 0
        """.format(",".join("?" for _ in companies)),
        (*[company["ticker"] for company in companies], args.start_date),
    ).fetchone()
    snapshot_count = connection.execute(
        "SELECT COUNT(*) FROM valuation_ticker_snapshots"
    ).fetchone()[0]
    connection.close()
    print(
        json.dumps(
            {
                "database": str(args.database),
                "universeCompanies": len(companies),
                "paidPriceRowsRead": len(price_rows),
                "priceCoverage": {
                    "symbols": coverage[0],
                    "firstDate": coverage[1],
                    "lastDate": coverage[2],
                    "rows": coverage[3],
                },
                "newSnapshots": inserted_snapshots,
                "totalSnapshots": snapshot_count,
                "protectedTableCounts": protected_after,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
