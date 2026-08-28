#!/usr/bin/env python3
"""Extract point-in-time management guidance from downloaded earnings calls.

The extractor is deliberately conservative. It accepts only management/IR
sections, requires forward-looking language, rejects comparisons against old
guidance, and keeps the complete source sentence for auditability.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sqlite3
from pathlib import Path


DEFAULT_TRANSCRIPT_ROOT = Path(
    "/Users/yudonglu/Documents/youtube_transcript_db/earnings_transcripts"
)
DEFAULT_TARGET_DB = Path("server/data/guru-analysis.sqlite")
DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
EXTRACTION_VERSION = "pit-guidance-rules-v2-2026-08-27"

SOURCE_ALIASES = {
    "GOOG": "GOOGL",
}

MANAGEMENT_ROLE = re.compile(
    r"\b(ceo|chief executive|cfo|chief financial|coo|chief operating|president|"
    r"chair(?:man|woman)?|investor relations|\bvp\b|vice president|controller|"
    r"chief accounting|treasurer|general counsel|secretary|founder|co-founder)\b",
    re.I,
)
# Do not reject issuer names such as "Lam Research". Analyst blocks are
# identified by the actual role label, not by a generic company-name token.
EXCLUDED_SPEAKER = re.compile(
    r"\b(operator|analyst|research analyst|equity research|capital markets)\b", re.I
)
FORWARD_LANGUAGE = re.compile(
    r"\b(we (?:now |continue to |still )?(?:expect|anticipate|forecast|project|estimate|"
    r"target|intend|plan)|our (?:outlook|guidance|expectation|target) (?:is|for|remains|"
    r"calls for|continues to be)|guidance (?:is|for|range|remains|reflects|calls for)|"
    r"outlook (?:is|for|remains|calls for)|we are (?:raising|lowering|reaffirming|"
    r"maintaining|updating)|we (?:raise|lower|reaffirm|maintain|update)|"
    r"(?:revenue|sales|free cash flow|fcf|operating (?:income|profit|margin)|gross margin|"
    r"earnings per share|eps|capex|capital expenditure|backlog|bookings|arr|rpo) "
    r"(?:is|are) expected to|we expect .*? (?:to be|between|in the range)|"
    r"we (?:see|look for) .*? (?:growth|margin|revenue|sales|cash flow))\b",
    re.I,
)
HISTORICAL_GUIDANCE = re.compile(
    r"\b(above|below|exceed(?:ed|ing)?|beat|miss(?:ed)?|versus|compared (?:with|to)|"
    r"relative to|within|in line with|consistent with|narrower than|favorable to) "
    r"(?:the |our )?(?:high end of |low end of )?(?:prior |previous )?(?:guidance|outlook)\b|"
    r"\b(?:came in|was|were|delivered|recorded|generated).*\b(?:guidance|expectation)\b|"
    r"\bguidance (?:we )?(?:provided|gave|issued) (?:last|in the prior)|"
    r"\b(?:projections?|guidance) we gave\b",
    re.I,
)
DISCLAIMER = re.compile(
    r"forward-looking statements|actual results (?:could|may) (?:differ|vary)|"
    r"risks and uncertainties|do not undertake .* update",
    re.I,
)
AMOUNT_RE = re.compile(
    r"(?P<currency>US\$|\$|£|€)?\s*(?P<value>\d[\d,]*(?:\.\d+)?)\s*"
    r"(?P<scale>billion|million|thousand|bn|mm|mn|m)\b",
    re.I,
)
PERCENT_RE = re.compile(r"(?<![\w.])(?P<value>\d+(?:\.\d+)?)\s*%")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transcript-root", type=Path, default=DEFAULT_TRANSCRIPT_ROOT)
    parser.add_argument("--target-db", type=Path, default=DEFAULT_TARGET_DB)
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    return parser.parse_args()


def target_tickers(db_path: Path) -> list[str]:
    with sqlite3.connect(db_path) as connection:
        return [
            str(row[0]).upper()
            for row in connection.execute(
                "SELECT ticker FROM valuation_ticker_snapshots ORDER BY ticker"
            )
        ]


def parse_header(text: str) -> tuple[str | None, str | None, str | None]:
    lines = [line.strip() for line in text.splitlines()[:8] if line.strip()]
    period = None
    observed_at = None
    source_url = None
    for line in lines:
        match = re.search(r"Earnings Call:\s*(Q[1-4])\s*(20\d{2})", line, re.I)
        if match:
            period = f"{match.group(1).upper()}{match.group(2)}"
        if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", line):
            observed_at = line
        if line.startswith(("https://", "http://")):
            source_url = line
    return period, observed_at, source_url


def speaker_sections(text: str):
    body = re.split(r"\n---\s*\n", text)
    for block in body:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        speaker = lines[0]
        if not MANAGEMENT_ROLE.search(speaker) or EXCLUDED_SPEAKER.search(speaker):
            continue
        yield speaker, " ".join(lines[1:])


def sentences(text: str):
    for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9$£€])", text):
        sentence = re.sub(r"\s+", " ", sentence).strip()
        if 35 <= len(sentence) <= 900:
            yield sentence


METRIC_PATTERNS = (
    ("free_cash_flow_guidance", re.compile(r"free cash flow|\bfcf\b", re.I)),
    ("capex_guidance", re.compile(r"capital expenditure|\bcapex\b", re.I)),
    ("gross_margin", re.compile(r"gross margin", re.I)),
    ("operating_margin", re.compile(r"operating margin", re.I)),
    ("operating_income_guidance", re.compile(r"operating income|income from operations|operating profit", re.I)),
    ("eps_guidance", re.compile(r"earnings per share|\beps\b", re.I)),
    ("revenue_guidance", re.compile(r"revenue|(?:total|net|product) sales", re.I)),
    ("backlog_guidance", re.compile(r"remaining performance obligation|\brpo\b|backlog|bookings|\barr\b", re.I)),
)


def metric_names(sentence: str) -> list[tuple[str, int]]:
    matches = []
    for name, pattern in METRIC_PATTERNS:
        match = pattern.search(sentence)
        if match:
            matches.append((name, match.start()))
    return matches


def amount_values(sentence: str):
    values = []
    for match in AMOUNT_RE.finditer(sentence):
        raw = float(match.group("value").replace(",", ""))
        scale = match.group("scale").lower()
        multiplier = 1000.0 if scale in {"billion", "bn"} else 1.0
        if scale == "thousand":
            multiplier = 0.001
        symbol = match.group("currency") or ""
        currency = {"£": "GBP", "€": "EUR"}.get(symbol, "USD" if "$" in symbol else None)
        values.append({
            "value": raw * multiplier,
            "currency": currency,
            "text": match.group(0).strip(),
            "position": match.start(),
        })
    return values


def percentage_values(sentence: str):
    return [
        {"value": float(match.group("value")), "position": match.start()}
        for match in PERCENT_RE.finditer(sentence)
    ]


def values_owned_by_metric(values: list[dict], metric_position: int,
                           all_metric_positions: list[int]) -> list[dict]:
    owned = []
    for value in values:
        nearest = min(all_metric_positions, key=lambda position: abs(position - value["position"]))
        if nearest == metric_position:
            owned.append(value)
    return sorted(owned, key=lambda value: abs(value["position"] - metric_position))[:2]


def extract_event(ticker: str, period: str, observed_at: str, source_url: str,
                  file_path: Path, speaker: str, sentence: str, metric: str,
                  metric_position: int, all_metric_positions: list[int]) -> dict:
    amounts = values_owned_by_metric(amount_values(sentence), metric_position, all_metric_positions)
    percentages = values_owned_by_metric(percentage_values(sentence), metric_position, all_metric_positions)
    amount = None
    currency = None
    unit = None
    margin_pct = None
    growth_yoy = None
    value_text = sentence

    if amounts:
        amount = sum(item["value"] for item in amounts) / len(amounts)
        currency = next((item["currency"] for item in amounts if item["currency"]), None)
        unit = f"{currency or 'reported'} millions"
    if metric in {"gross_margin", "operating_margin"} and percentages:
        margin_pct = sum(item["value"] for item in percentages) / len(percentages)
    if metric == "revenue_guidance" and percentages and re.search(
        r"grow|growth|increase|up (?:approximately|about|roughly)?", sentence, re.I
    ):
        growth_yoy = sum(item["value"] for item in percentages) / len(percentages)

    explicit = bool(re.search(r"\bguidance\b|\boutlook\b|we (?:expect|anticipate|forecast|project)", sentence, re.I))
    confidence = 0.94 if explicit and (amounts or percentages) else 0.84 if amounts or percentages else 0.72
    digest = hashlib.sha256(
        f"{ticker}|{period}|{observed_at}|{speaker}|{metric}|{sentence}".encode()
    ).hexdigest()[:24]
    return {
        "id": digest,
        "ticker": ticker,
        "fiscal_period": period,
        "observed_at": observed_at,
        "metric_name": metric,
        "actual_or_guidance": "guidance",
        "amount": amount,
        "unit": unit,
        "currency": currency,
        "growth_yoy": growth_yoy,
        "growth_qoq": None,
        "margin_pct": margin_pct,
        "value_text": value_text,
        "quality_status": "clear" if amounts or percentages else "ambiguous",
        "extraction_confidence": confidence,
        "speaker": speaker,
        "source_url": source_url,
        "evidence_excerpt": sentence,
        "source_file": str(file_path),
        "source_type": "downloaded_online_earnings_transcript",
        "extraction_version": EXTRACTION_VERSION,
    }


def extract_file(ticker: str, file_path: Path) -> tuple[str | None, list[dict]]:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    period, observed_at, source_url = parse_header(text)
    if not period or not observed_at or not source_url:
        return period, []
    try:
        dt.date.fromisoformat(observed_at)
    except ValueError:
        return period, []
    events = []
    for speaker, section in speaker_sections(text):
        for sentence in sentences(section):
            if DISCLAIMER.search(sentence) or HISTORICAL_GUIDANCE.search(sentence):
                continue
            if not FORWARD_LANGUAGE.search(sentence):
                continue
            metrics = metric_names(sentence)
            if not metrics:
                continue
            positions = [position for _, position in metrics]
            for metric, position in metrics:
                events.append(
                    extract_event(
                        ticker, period, observed_at, source_url, file_path, speaker,
                        sentence, metric, position, positions
                    )
                )
    return period, events


def ensure_schema(connection: sqlite3.Connection):
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS pit_guidance_events (
          id TEXT PRIMARY KEY,
          ticker TEXT NOT NULL,
          fiscal_period TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          actual_or_guidance TEXT NOT NULL,
          amount REAL,
          unit TEXT,
          currency TEXT,
          growth_yoy REAL,
          growth_qoq REAL,
          margin_pct REAL,
          value_text TEXT,
          quality_status TEXT NOT NULL,
          extraction_confidence REAL NOT NULL,
          speaker TEXT,
          source_url TEXT NOT NULL,
          evidence_excerpt TEXT NOT NULL,
          source_file TEXT NOT NULL,
          source_type TEXT NOT NULL,
          extraction_version TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pit_guidance_events_ticker_period
          ON pit_guidance_events (ticker, fiscal_period, observed_at);
        CREATE TABLE IF NOT EXISTS pit_guidance_coverage (
          ticker TEXT PRIMARY KEY,
          transcript_files INTEGER NOT NULL,
          transcript_periods INTEGER NOT NULL,
          guidance_periods INTEGER NOT NULL,
          guidance_events INTEGER NOT NULL,
          status TEXT NOT NULL,
          note TEXT
        );
        """
    )


def main():
    args = parse_args()
    targets = target_tickers(args.target_db)
    args.source_db.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(args.source_db) as connection:
        ensure_schema(connection)
        connection.execute(
            "DELETE FROM pit_guidance_events "
            "WHERE source_type='downloaded_online_earnings_transcript'"
        )
        connection.execute("DELETE FROM pit_guidance_coverage")
        insert = connection.cursor()
        total_events = 0
        covered_periods = set()
        for ui_ticker in targets:
            source_ticker = SOURCE_ALIASES.get(ui_ticker, ui_ticker)
            directory = args.transcript_root / source_ticker
            files = sorted(directory.glob("*.txt")) if directory.exists() else []
            all_periods = set()
            event_periods = set()
            ticker_events = 0
            for file_path in files:
                period, events = extract_file(ui_ticker, file_path)
                if period:
                    all_periods.add(period)
                for event in events:
                    insert.execute(
                        """
                        INSERT OR REPLACE INTO pit_guidance_events (
                          id, ticker, fiscal_period, observed_at, metric_name,
                          actual_or_guidance, amount, unit, currency, growth_yoy,
                          growth_qoq, margin_pct, value_text, quality_status,
                          extraction_confidence, speaker, source_url,
                          evidence_excerpt, source_file, source_type,
                          extraction_version, payload_json
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        (
                            event["id"], event["ticker"], event["fiscal_period"],
                            event["observed_at"], event["metric_name"],
                            event["actual_or_guidance"], event["amount"], event["unit"],
                            event["currency"], event["growth_yoy"], event["growth_qoq"],
                            event["margin_pct"], event["value_text"],
                            event["quality_status"], event["extraction_confidence"],
                            event["speaker"], event["source_url"],
                            event["evidence_excerpt"], event["source_file"],
                            event["source_type"], event["extraction_version"],
                            json.dumps(event, separators=(",", ":")),
                        ),
                    )
                    event_periods.add(event["fiscal_period"])
                    covered_periods.add((ui_ticker, event["fiscal_period"]))
                    ticker_events += 1
                    total_events += 1
            if not files:
                status, note = "missing_transcripts", "No downloaded transcript directory."
            elif not ticker_events:
                status, note = "no_explicit_guidance", "Transcripts present; no forward management guidance passed conservative rules."
            else:
                status, note = "covered", "Management-only, event-dated transcript guidance."
            connection.execute(
                "INSERT INTO pit_guidance_coverage VALUES (?,?,?,?,?,?,?)",
                (ui_ticker, len(files), len(all_periods), len(event_periods), ticker_events, status, note),
            )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key, value) VALUES (?, ?)",
            ("guidance_extraction_version", EXTRACTION_VERSION),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key, value) VALUES (?, ?)",
            ("guidance_extracted_at", dt.datetime.now(dt.timezone.utc).isoformat()),
        )
        connection.commit()
        statuses = dict(connection.execute(
            "SELECT status, COUNT(*) FROM pit_guidance_coverage GROUP BY status"
        ))
    print(json.dumps({
        "tickers": len(targets),
        "events": total_events,
        "tickerPeriods": len(covered_periods),
        "coverage": statuses,
        "sourceDatabase": str(args.source_db),
        "extractionVersion": EXTRACTION_VERSION,
    }, indent=2))


if __name__ == "__main__":
    main()
