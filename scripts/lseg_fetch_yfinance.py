#!/usr/bin/env python3
"""Fetch local Yahoo Finance snapshots for LSEG and selected peers.

This script is intentionally offline-to-local only:
- it fetches via yfinance in Python
- saves raw and curated files under data/local/lseg/yfinance
- does not wire anything into the valuation model yet
"""

from __future__ import annotations

import json
import logging
import math
import sys
import warnings as py_warnings
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = REPO_ROOT / "data" / "local" / "lseg" / "yfinance"
RAW_DIR = OUTPUT_ROOT / "raw"
CURATED_DIR = OUTPUT_ROOT / "curated"

LSEG_TICKER = "LSEG.L"
PEER_TICKERS = [
    "ICE",
    "CME",
    "SPGI",
    "MCO",
    "TRI",
    "RELX",
    "EXPN.L",
    "NDAQ",
    "DB1.DE",
    "ENX.PA",
]
ALL_TICKERS = [LSEG_TICKER, *PEER_TICKERS]

INSTALL_HINT = "pip install yfinance pandas pyarrow"


@dataclass
class WarningItem:
    id: str
    ticker: str
    field: str
    message: str
    severity: str = "medium"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    CURATED_DIR.mkdir(parents=True, exist_ok=True)


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return False


def make_provenance(
    *,
    dataset_id: str,
    ticker: str | None,
    quality_tag: str,
    source: str = "yfinance",
    source_type: str = "yahoo_finance_snapshot",
    fetched_at: str,
    currency: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    return {
        "datasetId": dataset_id,
        "source": source,
        "sourceType": source_type,
        "fetchedAt": fetched_at,
        "ticker": ticker,
        "currency": currency,
        "qualityTag": quality_tag,
        "notes": notes,
    }


def sanitize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else value
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    if isinstance(value, dict):
        return {str(k): sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [sanitize(v) for v in value]
    try:
        import pandas as pd  # type: ignore

        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if pd.isna(value):
            return None
    except Exception:
        pass
    if hasattr(value, "item"):
        try:
            return sanitize(value.item())
        except Exception:
            pass
    return str(value)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sanitize(payload), indent=2, sort_keys=False) + "\n", encoding="utf-8")


def write_dataframe_csv(path: Path, df: Any, provenance: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path)
    write_json(Path(f"{path}.meta.json"), {"provenance": provenance})


def safe_call(
    label: str,
    ticker: str,
    getter: Callable[[], Any],
    warnings: list[WarningItem],
    *,
    missing_ok: bool = True,
) -> Any:
    try:
        return getter()
    except Exception as exc:  # pragma: no cover - network/provider variability
        warnings.append(
            WarningItem(
                id=f"{ticker}-{label}-fetch-error",
                ticker=ticker,
                field=label,
                message=f"Failed to fetch {label}: {exc}",
                severity="medium" if missing_ok else "high",
            )
        )
        return None


def extract_currency(info: dict[str, Any], fast_info: dict[str, Any]) -> str | None:
    return sanitize(info.get("currency") or fast_info.get("currency"))


def extract_info_value(info: dict[str, Any], fast_info: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in info and not is_missing(info.get(key)):
            return sanitize(info.get(key))
        if key in fast_info and not is_missing(fast_info.get(key)):
            return sanitize(fast_info.get(key))
    return None


def frame_to_records(df: Any) -> list[dict[str, Any]] | None:
    if df is None:
        return None
    if getattr(df, "empty", False):
        return []
    try:
        normalized = df.transpose().reset_index().rename(columns={"index": "period"})
        return sanitize(normalized.to_dict(orient="records"))
    except Exception:
        try:
            return sanitize(df.reset_index().to_dict(orient="records"))
        except Exception:
            return None


def series_to_records(series: Any, value_name: str = "value") -> list[dict[str, Any]] | None:
    if series is None:
        return None
    try:
        if getattr(series, "empty", False):
            return []
        frame = series.reset_index()
        if len(frame.columns) >= 2:
            frame.columns = ["date", value_name]
        return sanitize(frame.to_dict(orient="records"))
    except Exception:
        return None


def latest_statement_row(df: Any) -> dict[str, Any] | None:
    records = frame_to_records(df)
    if not records:
        return None
    return records[0]


def fetch_ticker_bundle(symbol: str, fetched_at: str, warnings: list[WarningItem]) -> dict[str, Any]:
    import yfinance as yf  # type: ignore

    ticker = yf.Ticker(symbol)
    info = safe_call("info", symbol, lambda: ticker.info or {}, warnings) or {}
    fast_info_raw = safe_call("fast_info", symbol, lambda: ticker.fast_info, warnings) or {}
    try:
        fast_info = dict(fast_info_raw)
    except Exception:
        fast_info = sanitize(fast_info_raw) if isinstance(fast_info_raw, dict) else {}
    currency = extract_currency(info, fast_info if isinstance(fast_info, dict) else {})

    history = safe_call(
        "price_history",
        symbol,
        lambda: ticker.history(period="5y", interval="1d", auto_adjust=False, actions=True),
        warnings,
    )
    dividends = safe_call("dividends", symbol, lambda: ticker.dividends, warnings)
    shares_history = safe_call("shares_history", symbol, lambda: ticker.get_shares_full(start="2016-01-01"), warnings)

    income_stmt = safe_call("income_stmt", symbol, lambda: ticker.income_stmt, warnings)
    balance_sheet = safe_call("balance_sheet", symbol, lambda: ticker.balance_sheet, warnings)
    cashflow = safe_call("cashflow", symbol, lambda: ticker.cashflow, warnings)

    analyst_price_targets = safe_call(
        "analyst_price_targets",
        symbol,
        lambda: getattr(ticker, "analyst_price_targets"),
        warnings,
    )
    earnings_estimate = safe_call(
        "earnings_estimate",
        symbol,
        lambda: getattr(ticker, "earnings_estimate"),
        warnings,
    )
    revenue_estimate = safe_call(
        "revenue_estimate",
        symbol,
        lambda: getattr(ticker, "revenue_estimate"),
        warnings,
    )
    recommendations_summary = safe_call(
        "recommendations_summary",
        symbol,
        lambda: getattr(ticker, "recommendations_summary"),
        warnings,
    )

    key_fields = {
        "currency": currency,
        "currentPrice": extract_info_value(info, fast_info, "currentPrice", "lastPrice", "regularMarketPrice"),
        "marketCap": extract_info_value(info, fast_info, "marketCap"),
        "enterpriseValue": extract_info_value(info, fast_info, "enterpriseValue"),
        "trailingPE": extract_info_value(info, fast_info, "trailingPE"),
        "forwardPE": extract_info_value(info, fast_info, "forwardPE"),
        "enterpriseToEbitda": extract_info_value(info, fast_info, "enterpriseToEbitda"),
        "priceToSalesTrailing12Months": extract_info_value(info, fast_info, "priceToSalesTrailing12Months"),
        "dividendYield": extract_info_value(info, fast_info, "dividendYield"),
        "beta": extract_info_value(info, fast_info, "beta"),
        "sharesOutstanding": extract_info_value(info, fast_info, "sharesOutstanding"),
        "floatShares": extract_info_value(info, fast_info, "floatShares"),
    }

    for field, value in key_fields.items():
        if is_missing(value):
            warnings.append(
                WarningItem(
                    id=f"{symbol}-{field}-missing",
                    ticker=symbol,
                    field=field,
                    message=f"{field} is missing from yfinance snapshot.",
                    severity="low",
                )
            )

    return {
        "ticker": symbol,
        "currency": currency,
        "info": sanitize(info),
        "fast_info": sanitize(fast_info),
        "history": history,
        "dividends": dividends,
        "shares_history": shares_history,
        "income_stmt": income_stmt,
        "balance_sheet": balance_sheet,
        "cashflow": cashflow,
        "analyst_price_targets": sanitize(analyst_price_targets),
        "earnings_estimate": earnings_estimate,
        "revenue_estimate": revenue_estimate,
        "recommendations_summary": recommendations_summary,
        "key_fields": key_fields,
        "fetchedAt": fetched_at,
    }


def build_market_snapshot(lseg_bundle: dict[str, Any], warnings: list[WarningItem]) -> dict[str, Any]:
    info = lseg_bundle["info"] if isinstance(lseg_bundle["info"], dict) else {}
    fast_info = lseg_bundle["fast_info"] if isinstance(lseg_bundle["fast_info"], dict) else {}
    key_fields = lseg_bundle["key_fields"]

    snapshot = {
        "ticker": LSEG_TICKER,
        "currency": lseg_bundle.get("currency"),
        "currentPrice": key_fields.get("currentPrice"),
        "marketCap": key_fields.get("marketCap"),
        "enterpriseValue": key_fields.get("enterpriseValue"),
        "sharesOutstanding": key_fields.get("sharesOutstanding"),
        "beta": key_fields.get("beta"),
        "previousClose": extract_info_value(info, fast_info, "previousClose", "regularMarketPreviousClose"),
        "fiftyTwoWeekHigh": extract_info_value(info, fast_info, "fiftyTwoWeekHigh", "yearHigh"),
        "fiftyTwoWeekLow": extract_info_value(info, fast_info, "fiftyTwoWeekLow", "yearLow"),
    }

    for field, value in snapshot.items():
        if field in {"ticker", "currency"}:
            continue
        if is_missing(value):
            warnings.append(
                WarningItem(
                    id=f"{LSEG_TICKER}-{field}-snapshot-missing",
                    ticker=LSEG_TICKER,
                    field=field,
                    message=f"Curated market snapshot field {field} is missing.",
                    severity="low",
                )
            )
    return snapshot


def build_peer_multiples_snapshot(peer_bundles: list[dict[str, Any]], warnings: list[WarningItem]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for bundle in peer_bundles:
        row = {
            "ticker": bundle["ticker"],
            "currency": bundle.get("currency"),
            "marketCap": bundle["key_fields"].get("marketCap"),
            "enterpriseValue": bundle["key_fields"].get("enterpriseValue"),
            "trailingPE": bundle["key_fields"].get("trailingPE"),
            "forwardPE": bundle["key_fields"].get("forwardPE"),
            "enterpriseToEbitda": bundle["key_fields"].get("enterpriseToEbitda"),
            "priceToSalesTrailing12Months": bundle["key_fields"].get("priceToSalesTrailing12Months"),
            "dividendYield": bundle["key_fields"].get("dividendYield"),
            "beta": bundle["key_fields"].get("beta"),
        }
        if sum(value is not None for key, value in row.items() if key not in {"ticker", "currency"}) < 3:
            warnings.append(
                WarningItem(
                    id=f"{bundle['ticker']}-peer-snapshot-thin",
                    ticker=bundle["ticker"],
                    field="peer_multiples_snapshot",
                    message="Peer snapshot returned very sparse multiple data from yfinance.",
                    severity="medium",
                )
            )
        rows.append(row)
    return rows


def build_financial_statement_snapshot(lseg_bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "ticker": LSEG_TICKER,
        "currency": lseg_bundle.get("currency"),
        "latestIncomeStatement": latest_statement_row(lseg_bundle.get("income_stmt")),
        "latestBalanceSheet": latest_statement_row(lseg_bundle.get("balance_sheet")),
        "latestCashflow": latest_statement_row(lseg_bundle.get("cashflow")),
    }


def build_consensus_snapshot(lseg_bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "ticker": LSEG_TICKER,
        "currency": lseg_bundle.get("currency"),
        "analystPriceTargets": sanitize(lseg_bundle.get("analyst_price_targets")),
        "earningsEstimate": frame_to_records(lseg_bundle.get("earnings_estimate")),
        "revenueEstimate": frame_to_records(lseg_bundle.get("revenue_estimate")),
        "recommendationsSummary": frame_to_records(lseg_bundle.get("recommendations_summary")),
    }


def main() -> int:
    try:
        import pandas as pd  # type: ignore
        import yfinance as yf  # type: ignore  # noqa: F401
    except ImportError:
        print("Missing Python dependencies for yfinance ingestion.")
        print(f"Install with: {INSTALL_HINT}")
        return 1

    logging.getLogger("yfinance").setLevel(logging.CRITICAL)
    logging.getLogger("urllib3").setLevel(logging.CRITICAL)
    py_warnings.filterwarnings("ignore")

    ensure_dirs()
    fetched_at = now_iso()
    warnings: list[WarningItem] = []
    provenance_manifest: list[dict[str, Any]] = []
    saved_files: list[str] = []

    lseg_bundle = fetch_ticker_bundle(LSEG_TICKER, fetched_at, warnings)
    peer_bundles = [fetch_ticker_bundle(ticker, fetched_at, warnings) for ticker in PEER_TICKERS]

    def register_json(path: Path, payload: Any, provenance: dict[str, Any]) -> None:
        write_json(path, {"provenance": provenance, "data": payload})
        provenance_manifest.append({"file": str(path.relative_to(REPO_ROOT)), "provenance": provenance})
        saved_files.append(str(path.relative_to(REPO_ROOT)))

    def register_frame(path: Path, df: Any, provenance: dict[str, Any]) -> None:
        if df is None:
            df = pd.DataFrame()
            warnings.append(
                WarningItem(
                    id=f"{path.stem}-missing-frame",
                    ticker=LSEG_TICKER if "lseg" in path.name else "PEERS",
                    field=path.name,
                    message=f"No data returned for {path.name}.",
                    severity="medium",
                )
            )
        write_dataframe_csv(path, df, provenance)
        provenance_manifest.append({"file": str(path.relative_to(REPO_ROOT)), "provenance": provenance})
        provenance_manifest.append({"file": f"{path.relative_to(REPO_ROOT)}.meta.json", "provenance": provenance})
        saved_files.append(str(path.relative_to(REPO_ROOT)))
        saved_files.append(f"{path.relative_to(REPO_ROOT)}.meta.json")

    # Raw LSEG JSON snapshots
    register_json(
        RAW_DIR / "lseg_info.json",
        lseg_bundle["info"],
        make_provenance(dataset_id="lseg_info", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_json(
        RAW_DIR / "lseg_fast_info.json",
        lseg_bundle["fast_info"],
        make_provenance(dataset_id="lseg_fast_info", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_income_stmt.csv",
        lseg_bundle["income_stmt"],
        make_provenance(dataset_id="lseg_income_stmt", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_balance_sheet.csv",
        lseg_bundle["balance_sheet"],
        make_provenance(dataset_id="lseg_balance_sheet", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_cashflow.csv",
        lseg_bundle["cashflow"],
        make_provenance(dataset_id="lseg_cashflow", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_price_history.csv",
        lseg_bundle["history"],
        make_provenance(dataset_id="lseg_price_history", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_dividends.csv",
        lseg_bundle["dividends"].to_frame(name="dividend") if getattr(lseg_bundle["dividends"], "empty", False) is False and lseg_bundle["dividends"] is not None else lseg_bundle["dividends"],
        make_provenance(dataset_id="lseg_dividends", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_frame(
        RAW_DIR / "lseg_shares_history.csv",
        lseg_bundle["shares_history"].to_frame(name="sharesOutstanding") if getattr(lseg_bundle["shares_history"], "empty", False) is False and lseg_bundle["shares_history"] is not None else lseg_bundle["shares_history"],
        make_provenance(dataset_id="lseg_shares_history", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_json(
        RAW_DIR / "lseg_analyst_estimates.json",
        {
            "analystPriceTargets": lseg_bundle["analyst_price_targets"],
            "earningsEstimate": frame_to_records(lseg_bundle["earnings_estimate"]),
            "revenueEstimate": frame_to_records(lseg_bundle["revenue_estimate"]),
            "recommendationsSummary": frame_to_records(lseg_bundle["recommendations_summary"]),
        },
        make_provenance(
            dataset_id="lseg_analyst_estimates",
            ticker=LSEG_TICKER,
            quality_tag="Assumption",
            fetched_at=fetched_at,
            currency=lseg_bundle.get("currency"),
            notes="Yahoo Finance analyst/consensus style snapshot, not institutional consensus.",
        ),
    )

    # Raw peer datasets
    register_json(
        RAW_DIR / "peer_info.json",
        {
            "tickers": {
                bundle["ticker"]: {
                    "currency": bundle.get("currency"),
                    "info": bundle["info"],
                    "fastInfo": bundle["fast_info"],
                    "keyFields": bundle["key_fields"],
                }
                for bundle in peer_bundles
            }
        },
        make_provenance(
            dataset_id="peer_info",
            ticker="PEER_SET",
            quality_tag="Actual",
            fetched_at=fetched_at,
            notes="Peer multiple snapshot pulled from Yahoo Finance via yfinance.",
        ),
    )

    peer_price_frames = []
    peer_dividend_frames = []
    for bundle in peer_bundles:
        history = bundle["history"]
        if history is not None and not getattr(history, "empty", True):
            history = history.copy()
            history["ticker"] = bundle["ticker"]
            peer_price_frames.append(history.reset_index())
        dividends = bundle["dividends"]
        if dividends is not None and not getattr(dividends, "empty", True):
            dividend_frame = dividends.to_frame(name="dividend").reset_index()
            dividend_frame["ticker"] = bundle["ticker"]
            peer_dividend_frames.append(dividend_frame)

    peer_prices_df = pd.concat(peer_price_frames, ignore_index=True) if peer_price_frames else None
    peer_dividends_df = pd.concat(peer_dividend_frames, ignore_index=True) if peer_dividend_frames else None

    register_frame(
        RAW_DIR / "peer_prices.csv",
        peer_prices_df,
        make_provenance(dataset_id="peer_prices", ticker="PEER_SET", quality_tag="Actual", fetched_at=fetched_at),
    )
    register_frame(
        RAW_DIR / "peer_dividends.csv",
        peer_dividends_df,
        make_provenance(dataset_id="peer_dividends", ticker="PEER_SET", quality_tag="Actual", fetched_at=fetched_at),
    )

    # Curated snapshots
    market_snapshot = build_market_snapshot(lseg_bundle, warnings)
    peer_multiples_snapshot = build_peer_multiples_snapshot(peer_bundles, warnings)
    financial_statement_snapshot = build_financial_statement_snapshot(lseg_bundle)
    consensus_snapshot = build_consensus_snapshot(lseg_bundle)

    register_json(
        CURATED_DIR / "market_snapshot.json",
        market_snapshot,
        make_provenance(dataset_id="market_snapshot", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_json(
        CURATED_DIR / "peer_multiples_snapshot.json",
        peer_multiples_snapshot,
        make_provenance(dataset_id="peer_multiples_snapshot", ticker="PEER_SET", quality_tag="Derived", fetched_at=fetched_at),
    )
    register_json(
        CURATED_DIR / "financial_statement_snapshot.json",
        financial_statement_snapshot,
        make_provenance(dataset_id="financial_statement_snapshot", ticker=LSEG_TICKER, quality_tag="Actual", fetched_at=fetched_at, currency=lseg_bundle.get("currency")),
    )
    register_json(
        CURATED_DIR / "consensus_snapshot.json",
        consensus_snapshot,
        make_provenance(
            dataset_id="consensus_snapshot",
            ticker=LSEG_TICKER,
            quality_tag="Assumption",
            fetched_at=fetched_at,
            currency=lseg_bundle.get("currency"),
            notes="Yahoo Finance analyst/target/recommendation snapshot for research use only.",
        ),
    )
    register_json(
        CURATED_DIR / "provenance.json",
        provenance_manifest,
        make_provenance(dataset_id="provenance_manifest", ticker="LSEG_PIPELINE", quality_tag="Derived", fetched_at=fetched_at),
    )
    register_json(
        CURATED_DIR / "warnings.json",
        [asdict(item) for item in warnings],
        make_provenance(dataset_id="warnings", ticker="LSEG_PIPELINE", quality_tag="Derived", fetched_at=fetched_at),
    )

    summary = {
        "fetchedAt": fetched_at,
        "fetchedTickers": ALL_TICKERS,
        "missingFields": [asdict(item) for item in warnings if "missing" in item.id],
        "warnings": [asdict(item) for item in warnings],
        "savedFiles": saved_files,
    }
    print(json.dumps(sanitize(summary), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
