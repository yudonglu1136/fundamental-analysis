#!/usr/bin/env python3
"""Import ECB reference FX rates used by PIT valuation guidance normalization."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import sqlite3
from pathlib import Path

import requests


DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
ECB_BASE = "https://data-api.ecb.europa.eu/service/data/EXR"
IMPORT_VERSION = "ecb-reference-fx-v1-2026-08-27"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    return parser.parse_args()


def fetch_currency(currency: str, start: str, end: str):
    url = (
        f"{ECB_BASE}/D.{currency}.EUR.SP00.A"
        f"?startPeriod={start}&endPeriod={end}&format=csvdata"
    )
    response = requests.get(
        url,
        headers={"User-Agent": "Guru Intelligence data engineering luyudong1136@gmail.com"},
        timeout=60,
    )
    response.raise_for_status()
    rows = []
    for row in csv.DictReader(io.StringIO(response.text)):
        if not row.get("TIME_PERIOD") or not row.get("OBS_VALUE"):
            continue
        rows.append((row["TIME_PERIOD"], float(row["OBS_VALUE"]), url))
    if not rows:
        raise RuntimeError(f"ECB returned no {currency}/EUR rates for {start} through {end}")
    return rows


def main():
    args = parse_args()
    with sqlite3.connect(args.source_db) as connection:
        start, end = connection.execute(
            "SELECT MIN(observed_at), MAX(observed_at) FROM pit_guidance_events"
        ).fetchone()
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

        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS pit_fx_reference_rates (
              currency TEXT NOT NULL,
              rate_date TEXT NOT NULL,
              units_per_eur REAL NOT NULL,
              source_url TEXT NOT NULL,
              extraction_version TEXT NOT NULL,
              imported_at TEXT NOT NULL,
              PRIMARY KEY (currency, rate_date)
            );
            DELETE FROM pit_fx_reference_rates;
            """
        )
        imported_at = dt.datetime.now(dt.timezone.utc).isoformat()
        connection.execute(
            "INSERT INTO pit_fx_reference_rates VALUES (?,?,?,?,?,?)",
            ("EUR", start, 1.0, "ECB EUR reference base", IMPORT_VERSION, imported_at),
        )
        count = 1
        for currency in sorted(currencies - {"EUR"}):
            for rate_date, units_per_eur, url in fetch_currency(currency, start, end):
                connection.execute(
                    "INSERT INTO pit_fx_reference_rates VALUES (?,?,?,?,?,?)",
                    (currency, rate_date, units_per_eur, url, IMPORT_VERSION, imported_at),
                )
                count += 1
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            ("pit_fx_policy", "ECB daily reference rates; nearest prior date at guidance observation"),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            ("pit_fx_import_version", IMPORT_VERSION),
        )
        connection.commit()
    print({"rows": count, "currencies": sorted(currencies), "start": start, "end": end})


if __name__ == "__main__":
    main()
