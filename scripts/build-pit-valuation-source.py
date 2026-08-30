#!/usr/bin/env python3
"""Build a compact, as-reported valuation source from Jansen Sharadar data.

Only the first ARQ/ART record visible for a fiscal period is retained. This is
deliberate: later restatements must not leak into the valuation made at the
original earnings event.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sqlite3
from pathlib import Path

import pyarrow.dataset as ds

try:
    from pit_fx_rates import (
        DEFAULT_CACHE_PATH,
        FxRateBook,
        IMPORT_VERSION as FX_IMPORT_VERSION,
        rate_book_for_range,
        replace_sqlite_rates,
    )
except ModuleNotFoundError:
    from scripts.pit_fx_rates import (
        DEFAULT_CACHE_PATH,
        FxRateBook,
        IMPORT_VERSION as FX_IMPORT_VERSION,
        rate_book_for_range,
        replace_sqlite_rates,
    )


DEFAULT_JANSEN_ROOT = Path(
    os.environ.get(
        "JANSEN_SHARADAR_ROOT",
        Path.home() / "Documents/jansen_us_firm_replication/data/sharadar/parquet",
    )
)
DEFAULT_TARGET_DB = Path("server/data/guru-analysis.sqlite")
DEFAULT_OUTPUT_DB = Path("server/data/valuation-pit-source.sqlite")
SOURCE_ALIASES = {
    "GOOG": "GOOGL",
    "DGE.L": "DEO",
}
DERIVED_TICKERS = {"RKLX"}
EXTERNAL_SOURCE_TICKERS = {"BA.L", "LSEG"}
LONDON_SOURCE_TICKERS = {"DGE.L"}
LONDON_USD_REPORTERS = {"AZN"}

SOURCE_COLUMNS = [
    "ticker",
    "dimension",
    "calendardate",
    "reportperiod",
    "fiscalperiod",
    "lastupdated",
    "assets",
    "assetsnc",
    "cashneq",
    "cashnequsd",
    "capex",
    "debt",
    "debtusd",
    "ebit",
    "ebitusd",
    "equity",
    "equityusd",
    "fcf",
    "fxusd",
    "gp",
    "marketcap",
    "ncfo",
    "netinc",
    "netinccmnusd",
    "opinc",
    "price",
    "revenue",
    "revenueusd",
    "sharefactor",
    "sharesbas",
    "shareswa",
    "shareswadil",
]
PIT_CUTOFF_FIELD_CANDIDATES = ("datekey", "date")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jansen-root", type=Path, default=DEFAULT_JANSEN_ROOT)
    parser.add_argument("--target-db", type=Path, default=DEFAULT_TARGET_DB)
    parser.add_argument("--output-db", type=Path, default=DEFAULT_OUTPUT_DB)
    parser.add_argument(
        "--sp500-universe",
        type=Path,
        help="Deduplicated S&P 500 manifest to union with existing tracked tickers.",
    )
    parser.add_argument("--start-date", default="2010-01-01")
    parser.add_argument("--fx-cache", type=Path, default=DEFAULT_CACHE_PATH)
    return parser.parse_args()


def iso(value) -> str | None:
    return value.isoformat() if value else None


def number(value):
    return float(value) if value is not None else None


def scaled(value, scale: float, divisor: float = 1_000_000):
    return number(value) * scale / divisor if value is not None else None


def source_fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted((root / "fundamentals").glob("year=*/data_0.parquet")):
        stat = path.stat()
        digest.update(f"{path.name}:{path.parent.name}:{stat.st_size}:{stat.st_mtime_ns}".encode())
    return digest.hexdigest()


def normalize_cik(value) -> str | None:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return digits.zfill(10) if digits else None


def snapshot_cik(payload: dict) -> str | None:
    cik = payload.get("cik") or (payload.get("dataQuality") or {}).get(
        "secCompanyFacts", {}
    ).get("cik")
    if not cik:
        for row in reversed(payload.get("history") or []):
            cik = (
                ((row.get("dataSnapshot") or {}).get("secCompanyFacts") or {}).get(
                    "cik"
                )
            )
            if cik:
                break
    return normalize_cik(cik)


def target_universe(db_path: Path, sp500_path: Path | None) -> list[dict]:
    with sqlite3.connect(db_path) as connection:
        snapshots = []
        for ticker, payload_json in connection.execute(
            "SELECT ticker, payload_json FROM valuation_ticker_snapshots ORDER BY ticker"
        ):
            payload = json.loads(payload_json)
            snapshots.append(
                {
                    "ticker": ticker.upper(),
                    "sourceTicker": SOURCE_ALIASES.get(ticker.upper(), ticker.upper()),
                    "cik": snapshot_cik(payload),
                    "membership": "tracked_extra",
                }
            )
    if sp500_path is None:
        return snapshots

    manifest = json.loads(sp500_path.read_text(encoding="utf-8"))
    companies = [
        {
            "ticker": str(row["ticker"]).upper(),
            "sourceTicker": str(row.get("sourceTicker") or row["ticker"]).upper(),
            "cik": normalize_cik(row.get("cik")),
            "membership": "sp500",
        }
        for row in manifest["companies"]
    ]
    sp500_ciks = {row["cik"] for row in companies if row["cik"]}
    sp500_tickers = {
        str(ticker).upper()
        for row in manifest["companies"]
        for ticker in [row["ticker"], *(row.get("aliases") or [])]
    }
    extras = [
        row
        for row in snapshots
        if row["ticker"] not in sp500_tickers
        and (row["cik"] is None or row["cik"] not in sp500_ciks)
    ]
    return sorted([*companies, *extras], key=lambda row: row["ticker"])


def first_visible_rows(table_rows: list[dict]) -> list[dict]:
    selected: dict[tuple[str, str], dict] = {}
    for row in table_rows:
        period = str(row.get("fiscalperiod") or "")
        dimension = str(row.get("dimension") or "")
        if not period or dimension not in {"ARQ", "ART"} or not row.get("datekey"):
            continue
        key = (period, dimension)
        current = selected.get(key)
        if current is None or row["datekey"] < current["datekey"]:
            selected[key] = row
    return sorted(selected.values(), key=lambda row: (row["datekey"], row["dimension"]))


def statement_conversion(
    ui_ticker: str, row: dict, fx_rate_book: FxRateBook | None
) -> dict:
    if ui_ticker in LONDON_SOURCE_TICKERS:
        return {
            "scale": 1.0,
            "sourceCurrency": "GBP",
            "modelCurrency": "GBP",
            "note": "Sharadar as-reported local currency; no FX conversion",
            "fxConversion": None,
        }
    if ui_ticker in LONDON_USD_REPORTERS:
        if fx_rate_book is None:
            raise RuntimeError("AZN PIT source construction requires official ECB FX rates")
        conversion = fx_rate_book.conversion("USD", "GBP", row["datekey"])
        return {
            "scale": conversion["conversionRate"],
            "sourceCurrency": "USD",
            "modelCurrency": "GBP",
            "note": "ECB PIT reference FX; GBP per USD at the nearest prior business day",
            "fxConversion": conversion,
        }
    return {
        "scale": 1.0,
        "sourceCurrency": "USD",
        "modelCurrency": "USD",
        "note": "Sharadar USD-normalized fundamentals; no FX conversion",
        "fxConversion": None,
    }


def metric_value(ui_ticker: str, row: dict, local_key: str, usd_key: str | None, currency_scale: float):
    if ui_ticker in LONDON_SOURCE_TICKERS:
        return scaled(row.get(local_key), currency_scale)
    if usd_key and row.get(usd_key) is not None:
        return scaled(row.get(usd_key), currency_scale)
    fxusd = number(row.get("fxusd")) or 1.0
    return scaled(row.get(local_key), currency_scale / fxusd)


def build_period(
    ui_ticker: str,
    source_ticker: str,
    row: dict,
    target_db: Path | None = None,
    fx_rate_book: FxRateBook | None = None,
) -> dict:
    fiscal_period = str(row["fiscalperiod"])
    fiscal_year, fiscal_quarter = fiscal_period.split("-", 1)
    conversion = statement_conversion(ui_ticker, row, fx_rate_book)
    currency_scale = conversion["scale"]
    currency = conversion["modelCurrency"]
    currency_note = conversion["note"]
    share_candidates = (
        ("sharesbas", row.get("sharesbas")),
        ("shareswadil", row.get("shareswadil")),
        ("shareswa", row.get("shareswa")),
    )
    share_basis, base_shares = next(
        ((name, value) for name, value in share_candidates if value is not None),
        (None, None),
    )
    provider_sharefactor = number(row.get("sharefactor")) or 1.0
    applied_sharefactor = 1.0 if ui_ticker in LONDON_SOURCE_TICKERS else provider_sharefactor
    effective_shares = (
        number(base_shares) * applied_sharefactor
        if base_shares is not None
        else None
    )
    share_count_policy = (
        "Period-end basic ordinary shares are the equity-value denominator for the London listing. "
        "The DEO provider sharefactor converts ordinary shares to US ADR equivalents and is deliberately excluded for DGE.L; "
        "diluted or weighted-average shares are fallback only and adjacent periods never imply a split."
        if ui_ticker in LONDON_SOURCE_TICKERS
        else "Period-end basic shares are the equity-value denominator; diluted or weighted-average shares are fallback only. "
        "Apply provider sharefactor once for the quoted security basis and never infer splits from adjacent-period changes."
    )

    cfo_m = metric_value(ui_ticker, row, "ncfo", None, currency_scale)
    capex_m = metric_value(ui_ticker, row, "capex", None, currency_scale)
    capex_m = abs(capex_m) if capex_m is not None else None
    source_common = {
        "filed": iso(row["datekey"]),
        "end": iso(row["reportperiod"]),
        "form": row["dimension"],
        "dimension": row["dimension"],
        "annualOnly": row["dimension"] == "ART",
        "sourceTicker": source_ticker,
        "dataset": "Jansen Sharadar SF1 as-reported",
    }
    sources = {
        key: {**source_common, "tag": tag}
        for key, tag in {
            "revenue_m": "revenue/revenueusd",
            "gross_profit_m": "gp",
            "operating_income_m": "opinc",
            "net_income_m": "netinc/netinccmnusd",
            "cfo_m": "ncfo",
            "capex_m": "capex",
            "shares_m": "sharesbas preferred, then shareswadil/shareswa fallback; x applicable quoted-security share factor",
            "equity_m": "equity/equityusd",
            "assets_m": "assets",
            "cash_m": "cashneq/cashnequsd",
            "debt_m": "debt/debtusd",
        }.items()
    }
    result = {
        "ticker": ui_ticker,
        "sourceTicker": source_ticker,
        "key": f"{fiscal_year}::{fiscal_quarter}",
        "fiscalYear": int(fiscal_year),
        "fiscalQuarter": fiscal_quarter,
        "label": f"FY{fiscal_year} {fiscal_quarter}",
        "asOfDate": iso(row["datekey"]),
        "periodEndDate": iso(row["reportperiod"]),
        "calendarDate": iso(row["calendardate"]),
        "financialStatementCurrency": currency,
        "sourceFinancialStatementCurrency": conversion["sourceCurrency"],
        "sourceDimension": row["dimension"],
        "revenue_m": metric_value(ui_ticker, row, "revenue", "revenueusd", currency_scale),
        "gross_profit_m": metric_value(ui_ticker, row, "gp", None, currency_scale),
        "operating_income_m": metric_value(ui_ticker, row, "opinc", None, currency_scale),
        "net_income_m": metric_value(ui_ticker, row, "netinc", "netinccmnusd", currency_scale),
        "cfo_m": cfo_m,
        "capex_m": capex_m,
        "fcf_after_capex_m": cfo_m - capex_m if cfo_m is not None and capex_m is not None else None,
        "shares_m": scaled(effective_shares, 1.0),
        "equity_m": metric_value(ui_ticker, row, "equity", "equityusd", currency_scale),
        "assets_m": metric_value(ui_ticker, row, "assets", None, currency_scale),
        "cash_m": metric_value(ui_ticker, row, "cashneq", "cashnequsd", currency_scale),
        "debt_m": metric_value(ui_ticker, row, "debt", "debtusd", currency_scale),
        "sourceRecord": {
            "dataset": "Jansen Sharadar SF1",
            "dimension": row["dimension"],
            "metricsAreTrailingTwelveMonths": row["dimension"] == "ART",
            "sourceTicker": source_ticker,
            "datekey": iso(row["datekey"]),
            "reportperiod": iso(row["reportperiod"]),
            "calendardate": iso(row["calendardate"]),
            "lastupdatedExcludedFromPitCutoff": iso(row.get("lastupdated")),
            "currency": currency,
            "sourceCurrency": conversion["sourceCurrency"],
            "modelCurrency": conversion["modelCurrency"],
            "currencyScale": currency_scale,
            "currencyScaleNote": currency_note,
            "fxConversion": conversion["fxConversion"],
            "rawProviderFxusd": number(row.get("fxusd")),
            "sharefactor": provider_sharefactor,
            "appliedShareFactor": applied_sharefactor,
            "shareCountBasis": share_basis,
            "shareCountPolicy": share_count_policy,
            "rawShareCounts": {
                "sharesbas": number(row.get("sharesbas")),
                "shareswadil": number(row.get("shareswadil")),
                "shareswa": number(row.get("shareswa")),
            },
            "selectionPolicy": "earliest datekey per ticker/fiscalperiod/dimension",
        },
        "sources": sources,
    }
    return result


def create_database(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()
    connection = sqlite3.connect(output_path)
    connection.executescript(
        """
        PRAGMA journal_mode = WAL;
        CREATE TABLE pit_source_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE pit_financial_periods (
          ticker TEXT NOT NULL,
          source_ticker TEXT NOT NULL,
          fiscal_period TEXT NOT NULL,
          fiscal_year INTEGER NOT NULL,
          fiscal_quarter TEXT NOT NULL,
          dimension TEXT NOT NULL,
          available_at TEXT NOT NULL,
          report_period TEXT,
          currency TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (ticker, fiscal_period, dimension)
        );
        CREATE INDEX idx_pit_financial_periods_ticker_available
          ON pit_financial_periods (ticker, available_at);
        CREATE TABLE pit_financial_coverage (
          ticker TEXT PRIMARY KEY,
          source_ticker TEXT,
          status TEXT NOT NULL,
          arq_periods INTEGER NOT NULL DEFAULT 0,
          art_periods INTEGER NOT NULL DEFAULT 0,
          first_available_at TEXT,
          last_available_at TEXT,
          note TEXT
        );
        CREATE TABLE pit_fx_reference_rates (
          currency TEXT NOT NULL,
          rate_date TEXT NOT NULL,
          units_per_eur REAL NOT NULL,
          source_url TEXT NOT NULL,
          extraction_version TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          PRIMARY KEY (currency, rate_date)
        );
        """
    )
    return connection


def main():
    args = parse_args()
    dataset = ds.dataset(args.jansen_root / "fundamentals", format="parquet", partitioning="hive")
    provider_pit_cutoff_field = next(
        (
            field
            for field in PIT_CUTOFF_FIELD_CANDIDATES
            if field in dataset.schema.names
        ),
        None,
    )
    if provider_pit_cutoff_field is None:
        raise RuntimeError(
            "Sharadar fundamentals is missing both supported PIT cutoff fields: "
            + ", ".join(PIT_CUTOFF_FIELD_CANDIDATES)
        )
    universe = target_universe(args.target_db, args.sp500_universe)
    tickers = [row["ticker"] for row in universe]
    source_by_ticker = {row["ticker"]: row["sourceTicker"] for row in universe}
    source_tickers = sorted(
        {
            source_by_ticker[ticker]
            for ticker in tickers
            if ticker not in DERIVED_TICKERS | EXTERNAL_SOURCE_TICKERS
        }
    )
    table = dataset.to_table(
        columns=[*SOURCE_COLUMNS, provider_pit_cutoff_field],
        filter=(ds.field("ticker").isin(source_tickers))
        & (ds.field("dimension").isin(["ARQ", "ART"]))
        & (ds.field(provider_pit_cutoff_field) >= dt.date.fromisoformat(args.start_date)),
    )
    by_source: dict[str, list[dict]] = {}
    for row in table.to_pylist():
        row["datekey"] = row.get(provider_pit_cutoff_field)
        by_source.setdefault(row["ticker"], []).append(row)

    fx_dates = sorted(
        row["datekey"]
        for ticker in LONDON_USD_REPORTERS
        for row in by_source.get(source_by_ticker.get(ticker, ticker), [])
        if row.get("datekey")
    )
    fx_rate_book = (
        rate_book_for_range(fx_dates[0], fx_dates[-1], cache_path=args.fx_cache)
        if fx_dates
        else FxRateBook([])
    )

    connection = create_database(args.output_db)
    coverage = []
    inserted = 0
    try:
        generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
        metadata = {
            "generated_at": generated_at,
            "source": "Jansen Sharadar SF1 as-reported ARQ/ART",
            "source_root": "paid Sharadar parquet export",
            "source_fingerprint": source_fingerprint(args.jansen_root),
            "start_date": args.start_date,
            "pit_cutoff_field": "datekey",
            "provider_pit_cutoff_field": provider_pit_cutoff_field,
            "revision_policy": "earliest datekey per fiscal period; lastupdated never used as cutoff",
            "share_count_policy": "Period-end basic shares preferred; diluted/weighted shares fallback only. Apply provider sharefactor once for the quoted security basis, except cross-listed local ordinary shares such as DGE.L where the US ADR factor is explicitly excluded. Never infer splits from adjacent periods.",
            "target_ticker_count": str(len(tickers)),
            "pit_fx_policy": "ECB daily reference rates; nearest prior business day at each financial availability date; no price-ratio or fixed-rate fallback",
            "pit_fx_import_version": FX_IMPORT_VERSION,
        }
        connection.executemany(
            "INSERT INTO pit_source_metadata (key, value) VALUES (?, ?)", metadata.items()
        )

        for ticker in tickers:
            source_ticker = source_by_ticker[ticker]
            if ticker in DERIVED_TICKERS:
                coverage.append((ticker, "RKLB", "derived", 0, 0, None, None, "Derived ETF; no issuer financial statement model."))
                continue
            if ticker in EXTERNAL_SOURCE_TICKERS:
                coverage.append((ticker, None, "external_required", 0, 0, None, None, "Not present in the US Sharadar package; official issuer filings required."))
                continue
            selected = first_visible_rows(by_source.get(source_ticker, []))
            periods = [
                build_period(
                    ticker,
                    source_ticker,
                    row,
                    args.target_db,
                    fx_rate_book=fx_rate_book,
                )
                for row in selected
            ]
            for period in periods:
                fiscal_period = f"{period['fiscalYear']}-{period['fiscalQuarter']}"
                connection.execute(
                    """
                    INSERT INTO pit_financial_periods (
                      ticker, source_ticker, fiscal_period, fiscal_year, fiscal_quarter,
                      dimension, available_at, report_period, currency, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ticker,
                        source_ticker,
                        fiscal_period,
                        period["fiscalYear"],
                        period["fiscalQuarter"],
                        period["sourceDimension"],
                        period["asOfDate"],
                        period["periodEndDate"],
                        period["financialStatementCurrency"],
                        json.dumps(period, separators=(",", ":")),
                    ),
                )
                inserted += 1
            arq = [period for period in periods if period["sourceDimension"] == "ARQ"]
            art = [period for period in periods if period["sourceDimension"] == "ART"]
            available = sorted(period["asOfDate"] for period in periods)
            status = "covered" if arq else "annual_only" if art else "missing"
            coverage.append(
                (
                    ticker,
                    source_ticker,
                    status,
                    len(arq),
                    len(art),
                    available[0] if available else None,
                    available[-1] if available else None,
                    "GOOG shares Alphabet issuer financials with GOOGL." if ticker == "GOOG" else None,
                )
            )
        connection.executemany(
            """
            INSERT INTO pit_financial_coverage (
              ticker, source_ticker, status, arq_periods, art_periods,
              first_available_at, last_available_at, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            coverage,
        )
        replace_sqlite_rates(connection, fx_rate_book, generated_at)
        connection.commit()
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        connection.close()

    status_counts: dict[str, int] = {}
    for row in coverage:
        status_counts[row[2]] = status_counts.get(row[2], 0) + 1
    print(
        json.dumps(
            {
                "output": str(args.output_db),
                "targetTickers": len(tickers),
                "financialRows": inserted,
                "statusCounts": status_counts,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
