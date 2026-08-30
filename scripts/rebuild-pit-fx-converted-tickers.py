#!/usr/bin/env python3
"""Rebuild cross-listed PIT financial rows with official event-date FX rates."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import sqlite3
from pathlib import Path

import pyarrow.dataset as ds


DEFAULT_JANSEN_ROOT = (
    Path.home() / "Documents/jansen_us_firm_replication/data/sharadar/parquet"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, required=True)
    parser.add_argument("--jansen-root", type=Path, default=DEFAULT_JANSEN_ROOT)
    parser.add_argument("--ticker", action="append", default=["AZN"])
    return parser.parse_args()


def load_builder():
    module_path = Path(__file__).with_name("build-pit-valuation-source.py")
    spec = importlib.util.spec_from_file_location("build_pit_valuation_source", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main() -> None:
    args = parse_args()
    builder = load_builder()
    requested = sorted({str(ticker).upper() for ticker in args.ticker})
    unsupported = sorted(set(requested) - builder.LONDON_USD_REPORTERS)
    if unsupported:
        raise RuntimeError(f"No audited cross-listing FX policy for: {unsupported}")

    dataset = ds.dataset(
        args.jansen_root / "fundamentals", format="parquet", partitioning="hive"
    )
    cutoff_field = next(
        (field for field in builder.PIT_CUTOFF_FIELD_CANDIDATES if field in dataset.schema.names),
        None,
    )
    if not cutoff_field:
        raise RuntimeError("Sharadar source has no supported PIT cutoff field")

    with sqlite3.connect(args.source_db) as connection:
        rate_book = builder.FxRateBook.from_connection(connection)
        start_date = connection.execute(
            "SELECT value FROM pit_source_metadata WHERE key='start_date'"
        ).fetchone()
        start_date = (start_date[0] if start_date else "2010-01-01")
        rebuilt = {}
        for ticker in requested:
            coverage = connection.execute(
                "SELECT source_ticker FROM pit_financial_coverage WHERE ticker=?",
                (ticker,),
            ).fetchone()
            if not coverage or not coverage[0]:
                raise RuntimeError(f"Missing financial coverage source ticker for {ticker}")
            source_ticker = str(coverage[0]).upper()
            table = dataset.to_table(
                columns=[*builder.SOURCE_COLUMNS, cutoff_field],
                filter=(ds.field("ticker") == source_ticker)
                & (ds.field("dimension").isin(["ARQ", "ART"]))
                & (ds.field(cutoff_field) >= dt.date.fromisoformat(start_date)),
            )
            rows = table.to_pylist()
            for row in rows:
                row["datekey"] = row.get(cutoff_field)
            selected = builder.first_visible_rows(rows)
            periods = [
                builder.build_period(
                    ticker,
                    source_ticker,
                    row,
                    fx_rate_book=rate_book,
                )
                for row in selected
            ]
            expected_count = connection.execute(
                "SELECT COUNT(*) FROM pit_financial_periods WHERE ticker=?", (ticker,)
            ).fetchone()[0]
            if len(periods) != expected_count:
                raise RuntimeError(
                    f"{ticker} rebuild row count changed: existing={expected_count}, rebuilt={len(periods)}"
                )
            connection.execute("DELETE FROM pit_financial_periods WHERE ticker=?", (ticker,))
            connection.executemany(
                """
                INSERT INTO pit_financial_periods (
                  ticker, source_ticker, fiscal_period, fiscal_year, fiscal_quarter,
                  dimension, available_at, report_period, currency, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        ticker,
                        source_ticker,
                        f"{period['fiscalYear']}-{period['fiscalQuarter']}",
                        period["fiscalYear"],
                        period["fiscalQuarter"],
                        period["sourceDimension"],
                        period["asOfDate"],
                        period["periodEndDate"],
                        period["financialStatementCurrency"],
                        json.dumps(period, separators=(",", ":")),
                    )
                    for period in periods
                ],
            )
            arq = sum(period["sourceDimension"] == "ARQ" for period in periods)
            art = sum(period["sourceDimension"] == "ART" for period in periods)
            dates = sorted(period["asOfDate"] for period in periods)
            connection.execute(
                """
                UPDATE pit_financial_coverage
                SET status=?, arq_periods=?, art_periods=?,
                    first_available_at=?, last_available_at=?, note=?
                WHERE ticker=?
                """,
                (
                    "covered" if arq else "annual_only",
                    arq,
                    art,
                    dates[0],
                    dates[-1],
                    "USD as-reported issuer financials converted to GBP at each PIT node using the nearest prior ECB daily reference rate.",
                    ticker,
                ),
            )
            rebuilt[ticker] = {"rows": len(periods), "arq": arq, "art": art}

        rebuilt_at = dt.datetime.now(dt.timezone.utc).isoformat()
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?,?)",
            ("cross_listing_fx_rebuilt_at", rebuilt_at),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?,?)",
            (
                "cross_listing_fx_policy",
                "USD as-reported financials converted to the local quote currency with nearest-prior ECB daily reference rates; no market-price ratio or fixed-rate fallback",
            ),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?,?)",
            (
                "pit_fx_policy",
                "ECB daily reference rates; nearest prior business day at each financial or guidance observation; no fallback",
            ),
        )
        connection.commit()
    print(json.dumps({"sourceDb": str(args.source_db), "rebuilt": rebuilt}, indent=2))


if __name__ == "__main__":
    main()
