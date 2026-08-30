#!/usr/bin/env python3
"""Import ECB reference FX rates used by PIT valuation guidance normalization."""

from __future__ import annotations

import argparse
import datetime as dt
import sqlite3
from pathlib import Path

try:
    from pit_fx_rates import (
        DEFAULT_CACHE_PATH,
        IMPORT_VERSION,
        rate_book_for_range,
        replace_sqlite_rates,
    )
except ModuleNotFoundError:
    from scripts.pit_fx_rates import (
        DEFAULT_CACHE_PATH,
        IMPORT_VERSION,
        rate_book_for_range,
        replace_sqlite_rates,
    )


DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    parser.add_argument("--fx-cache", type=Path, default=DEFAULT_CACHE_PATH)
    return parser.parse_args()


def main():
    args = parse_args()
    with sqlite3.connect(args.source_db) as connection:
        start, end = connection.execute(
            """
            SELECT MIN(event_date), MAX(event_date) FROM (
              SELECT observed_at AS event_date FROM pit_guidance_events
              UNION ALL
              SELECT available_at AS event_date FROM pit_financial_periods
            )
            """
        ).fetchone()
        if not start or not end:
            raise RuntimeError("Cannot determine PIT financial/guidance FX date range")
        currencies = {
            str(row[0]).upper()
            for row in connection.execute(
                "SELECT DISTINCT currency FROM pit_guidance_events "
                "WHERE currency IS NOT NULL AND TRIM(currency)<>''"
            )
        }
        currencies.update(
            str(row[0]).upper()
            for row in connection.execute(
                "SELECT DISTINCT currency FROM pit_financial_periods "
                "WHERE currency IS NOT NULL AND TRIM(currency)<>''"
            )
        )
        unsupported = sorted(currencies - {"EUR", "USD", "GBP"})
        if unsupported:
            raise RuntimeError(f"Unsupported PIT guidance/model currencies: {unsupported}")

        currencies.update({"USD", "GBP"})
        rate_book = rate_book_for_range(
            start, end, currencies=currencies, cache_path=args.fx_cache
        )
        imported_at = dt.datetime.now(dt.timezone.utc).isoformat()
        count = replace_sqlite_rates(connection, rate_book, imported_at)
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            (
                "pit_fx_policy",
                "ECB daily reference rates; nearest prior business day at each financial or guidance observation; no fallback",
            ),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            ("pit_fx_import_version", IMPORT_VERSION),
        )
        connection.commit()
    print({"rows": count, "currencies": sorted(currencies), "start": start, "end": end})


if __name__ == "__main__":
    main()
