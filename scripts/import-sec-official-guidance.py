#!/usr/bin/env python3
"""Import issuer-approved PIT guidance from official SEC result filings.

This is the fallback for foreign issuers whose earnings-call transcript pages
are unavailable. Filing dates, rather than report periods or later revisions,
are the point-in-time availability boundary.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
SEC_USER_AGENT = "Guru Intelligence data engineering luyudong1136@gmail.com"
IMPORT_VERSION = "official-sec-guidance-v2-2026-08-27"
ISSUERS = {
    "CCEP": {"cik": "0001650107", "start": "2016-01-01"},
    "FER": {"cik": "0001468522", "start": "2024-01-01"},
}
RESULT_DOCUMENT = re.compile(
    r"result|trading|update|half|interim|financial|annual|quarter|q[1-4]|prelim|ex99",
    re.I,
)
EXCLUDED_DOCUMENT = re.compile(
    r"weekly|monthly|share|repurchase|dividend|pdmr|earningsreleasedate|announcement",
    re.I,
)
GUIDANCE_ANCHOR = re.compile(r"\b(guidance|outlook|forecast)\b", re.I)
DISCLAIMER = re.compile(
    r"forward-looking statements|actual results (?:could|may) differ|risks and uncertainties",
    re.I,
)
FORWARD = re.compile(
    r"\b(reaffirm|expect|forecast|project|target|anticipat|guidance|outlook|"
    r"will be|is expected|are expected)\b",
    re.I,
)
NUMBER = re.compile(
    r"(?:(?:US\$|[$£€])\s*\d[\d,.]*(?:\s*(?:billion|million|bn|mm|mn|m))?|"
    r"\d[\d,.]*\s*(?:%|billion|million|bn|mm|mn|m)\b)",
    re.I,
)
HISTORICAL_ACTUAL = re.compile(
    r"\b(reached|recorded|reported|generated|increased|decreased|declined|rose|"
    r"came in|performance|results|year to date|ytd|versus|vs\.)\b",
    re.I,
)
HISTORICAL_GUIDANCE = re.compile(
    r"ahead of (?:prior |previous )?guidance|above (?:prior |previous )?guidance|"
    r"compared (?:with|to) (?:prior |previous )?guidance",
    re.I,
)
GUIDANCE_TABLE_VALUE = re.compile(
    r"growth of|at least|approximately|~|between|\brange\b|\d(?:\.\d+)?\s*%\s*(?:to|[-–])|"
    r"unchanged|including leases|payout ratio|on track for .* target",
    re.I,
)
METRICS = (
    ("free_cash_flow_guidance", re.compile(r"free cash flow|\bfcf\b", re.I)),
    ("capex_guidance", re.compile(r"capital expenditure|\bcapex\b", re.I)),
    ("gross_margin", re.compile(r"gross margin", re.I)),
    ("operating_margin", re.compile(r"operating margin", re.I)),
    ("operating_income_guidance", re.compile(r"operating profit|operating income", re.I)),
    ("eps_guidance", re.compile(r"earnings per share|\beps\b", re.I)),
    ("revenue_guidance", re.compile(r"revenue|net sales", re.I)),
    ("ebitda_guidance", re.compile(r"\bebitda\b", re.I)),
)
AMOUNT = re.compile(
    r"(?P<currency>US\$|[$£€])?\s*(?P<value>\d[\d,]*(?:\.\d+)?)\s*"
    r"(?P<scale>billion|million|bn|mm|mn|m)\b",
    re.I,
)
PERCENT = re.compile(
    r"(?<![\w.])(?P<value>\d+(?:\.\d+)?)\s*(?:%|percent\b)", re.I
)
PERCENT_RANGE = re.compile(
    r"(?<![\w.])(?P<low>\d+(?:\.\d+)?)\s*(?:%|percent\b)?\s*"
    r"(?:to|[-–]|and)\s*(?P<high>\d+(?:\.\d+)?)\s*(?:%|percent\b)",
    re.I,
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/pit-official-sec-guidance"))
    return parser.parse_args()


def get_json(session: requests.Session, url: str, cache: Path):
    if cache.exists():
        return json.loads(cache.read_text())
    response = session.get(url, timeout=45)
    response.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(response.text)
    time.sleep(0.12)
    return response.json()


def get_text(session: requests.Session, url: str, cache: Path):
    if cache.exists():
        return cache.read_text(errors="replace")
    response = session.get(url, timeout=45)
    response.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(response.text)
    time.sleep(0.12)
    return response.text


def filing_rows(submission: dict, start_date: str):
    recent = submission["filings"]["recent"]
    for index, form in enumerate(recent["form"]):
        filing_date = recent["filingDate"][index]
        primary = recent["primaryDocument"][index]
        if form != "6-K" or filing_date < start_date:
            continue
        if not RESULT_DOCUMENT.search(primary) or EXCLUDED_DOCUMENT.search(primary):
            continue
        yield {
            "accession": recent["accessionNumber"][index],
            "filing_date": filing_date,
            "report_date": recent["reportDate"][index],
            "primary": primary,
        }


def accession_documents(session, cik: str, filing: dict, cache_dir: Path):
    accession = filing["accession"].replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession}"
    index = get_json(session, f"{base}/index.json", cache_dir / accession / "index.json")
    names = [item["name"] for item in index["directory"]["item"]]
    candidates = []
    for name in names:
        if not name.lower().endswith((".htm", ".html", ".txt")):
            continue
        if name == filing["primary"] or RESULT_DOCUMENT.search(name):
            candidates.append(name)
    for name in dict.fromkeys(candidates):
        yield name, f"{base}/{name}", get_text(
            session, f"{base}/{name}", cache_dir / accession / name
        )


def clean_lines(html: str):
    soup = BeautifulSoup(html, "html.parser")
    for node in soup(["script", "style"]):
        node.decompose()
    lines = []
    for raw_line in soup.get_text("\n").splitlines():
        for fragment in re.split(r"[•●▪]", raw_line):
            line = re.sub(r"\s+", " ", fragment).strip(" \t")
            if line:
                lines.append(line)
    return lines


def fiscal_period(lines: list[str], filing: dict):
    heading = " ".join(lines[:180])
    report_date = filing["report_date"] or filing["filing_date"]
    year = int(report_date[:4])
    primary = filing["primary"]
    primary_quarter = re.search(r"q([1-4])(?:[-_ ]?)(20\d{2})", primary, re.I)
    if primary_quarter:
        return f"Q{primary_quarter.group(1)}{primary_quarter.group(2)}"
    year_first_quarter = re.search(r"(20\d{2}).*?q([1-4])", primary, re.I)
    if year_first_quarter:
        return f"Q{year_first_quarter.group(2)}{year_first_quarter.group(1)}"
    if re.search(r"half[-_ ]?year|interim|\bh1\b", primary, re.I):
        return f"Q2{year}"
    patterns = (
        ("Q1", r"\b(?:q1|first quarter|1st quarter)\b"),
        ("Q2", r"\b(?:q2|second quarter|2nd quarter|half[- ]year|first half|h1)\b"),
        ("Q3", r"\b(?:q3|third quarter|3rd quarter)\b"),
        ("Q4", r"\b(?:q4|fourth quarter|4th quarter|full[- ]year|fy\s*\d{2,4})\b"),
    )
    for quarter, pattern in patterns:
        match = re.search(pattern, heading, re.I)
        if match:
            return f"{quarter}{year}"
    month = int(report_date[5:7])
    quarter = min(4, (month - 1) // 3 + 1)
    return f"Q{quarter}{year}"


def metric_values(text: str, metric: str):
    metric_pattern = dict(METRICS)[metric]
    metric_match = metric_pattern.search(text)
    if not metric_match:
        return None, None, None, None
    metric_position = metric_match.start()
    metric_end = metric_match.end()
    next_metric_positions = []
    for other_metric, other_pattern in METRICS:
        if other_metric == metric:
            continue
        other_match = other_pattern.search(text, metric_end)
        if other_match:
            next_metric_positions.append(other_match.start())
    segment_end = min(next_metric_positions, default=len(text))
    sentence_separator = re.search(r"[.;](?:\s|$)", text[metric_end:segment_end])
    if sentence_separator:
        segment_end = min(segment_end, metric_end + sentence_separator.start())
    segment = text[metric_position:segment_end]
    local_metric_position = 0
    amounts = []
    for match in AMOUNT.finditer(segment):
        value = float(match.group("value").replace(",", ""))
        scale = match.group("scale").lower()
        if scale in {"billion", "bn"}:
            value *= 1000
        symbol = match.group("currency") or ""
        currency = {"£": "GBP", "€": "EUR"}.get(symbol, "USD" if "$" in symbol else None)
        amounts.append((value, currency, match.start(), match.end()))
    percentages = [
        (float(match.group("value")), match.start()) for match in PERCENT.finditer(segment)
    ]
    amounts.sort(key=lambda item: abs(item[2] - local_metric_position))
    percentages.sort(key=lambda item: abs(item[1] - local_metric_position))
    selected_amounts = amounts[:1]
    selected_percentages = percentages[:1]
    if len(amounts) >= 2:
        first, second = sorted(amounts[:2], key=lambda item: item[2])
        connector = segment[first[3]:second[2]]
        if re.fullmatch(r"\s*(?:to|[-–]|and)\s*", connector, re.I):
            selected_amounts = [first, second]
    percent_range = PERCENT_RANGE.search(segment)
    if percent_range:
        selected_percentages = [
            (float(percent_range.group("low")), percent_range.start("low")),
            (float(percent_range.group("high")), percent_range.start("high")),
        ]
    elif len(percentages) >= 2:
        first, second = sorted(percentages[:2], key=lambda item: item[1])
        first_match = next(
            (match for match in PERCENT.finditer(segment) if match.start() == first[1]),
            None,
        )
        if first_match:
            connector = segment[first_match.end():second[1]]
            if re.fullmatch(r"\s*(?:to|[-–]|and)\s*", connector, re.I):
                selected_percentages = [first, second]
    amount = (
        sum(value for value, _, _, _ in selected_amounts) / len(selected_amounts)
        if selected_amounts else None
    )
    currency = next((currency for _, currency, _, _ in selected_amounts if currency), None)
    margin = sum(value for value, _ in selected_percentages) / len(selected_percentages) if selected_percentages and metric in {
        "gross_margin", "operating_margin"
    } else None
    growth = sum(value for value, _ in selected_percentages) / len(selected_percentages) if selected_percentages and metric in {
        "revenue_guidance", "operating_income_guidance", "ebitda_guidance"
    } else None
    return amount, currency, margin, growth


def guidance_lines(lines: list[str], ticker: str):
    accepted = {}
    guidance_until = -1
    for index, line in enumerate(lines):
        if DISCLAIMER.search(line):
            guidance_until = -1
            continue
        if GUIDANCE_ANCHOR.search(line) and len(line) < 500:
            guidance_until = index + 30
        candidate = line
        if index and len(lines[index - 1]) <= 100:
            previous_metrics = [pattern for _, pattern in METRICS if pattern.search(lines[index - 1])]
            if previous_metrics and not NUMBER.search(lines[index - 1]):
                candidate = f"{lines[index - 1]} {line}"
        initial_metrics = [(name, pattern) for name, pattern in METRICS if pattern.search(candidate)]
        if initial_metrics and not NUMBER.search(candidate):
            candidate = " ".join(lines[index:min(len(lines), index + 2)])
        if len(candidate) > 500:
            continue
        metrics = [(name, pattern) for name, pattern in METRICS if pattern.search(candidate)]
        if any(name == "capex_guidance" for name, _ in metrics) and re.search(
            r"cap(?:ex|ital expenditure).*?% of revenue", candidate, re.I
        ):
            metrics = [(name, pattern) for name, pattern in metrics if name != "revenue_guidance"]
        if not metrics or not NUMBER.search(candidate):
            continue
        forward_positions = [match.start() for match in FORWARD.finditer(candidate)]
        metric_positions = [pattern.search(candidate).start() for _, pattern in metrics]
        explicit = bool(
            GUIDANCE_ANCHOR.search(candidate)
            or any(abs(forward - metric) <= 180 for forward in forward_positions for metric in metric_positions)
        )
        compact_table_value = (
            index <= guidance_until
            and len(candidate) <= 260
            and bool(GUIDANCE_TABLE_VALUE.search(candidate))
        )
        if ticker == "FER" and not re.search(r"\b(guidance|outlook|forecast|target)\b", candidate, re.I):
            continue
        if HISTORICAL_GUIDANCE.search(candidate):
            continue
        if "share buyback" in candidate.lower() and not GUIDANCE_ANCHOR.search(candidate):
            continue
        if not explicit and not compact_table_value:
            continue
        if HISTORICAL_ACTUAL.search(candidate) and not explicit:
            continue
        excerpt = (
            f"Full-year guidance: {candidate}"
            if compact_table_value and not explicit
            else candidate
        )
        for metric, _ in metrics:
            accepted[(metric, excerpt)] = (metric, excerpt)
    return list(accepted.values())


def ensure_schema(connection):
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS pit_guidance_events (
          id TEXT PRIMARY KEY, ticker TEXT NOT NULL, fiscal_period TEXT NOT NULL,
          observed_at TEXT NOT NULL, metric_name TEXT NOT NULL,
          actual_or_guidance TEXT NOT NULL, amount REAL, unit TEXT, currency TEXT,
          growth_yoy REAL, growth_qoq REAL, margin_pct REAL, value_text TEXT,
          quality_status TEXT NOT NULL, extraction_confidence REAL NOT NULL,
          speaker TEXT, source_url TEXT NOT NULL, evidence_excerpt TEXT NOT NULL,
          source_file TEXT NOT NULL, source_type TEXT NOT NULL,
          extraction_version TEXT NOT NULL, payload_json TEXT NOT NULL
        );
        """
    )


def main():
    args = parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=5,
                connect=5,
                read=5,
                backoff_factor=1.0,
                status_forcelist=(429, 500, 502, 503, 504),
                allowed_methods=("GET",),
            )
        ),
    )
    events = []
    coverage = {}

    for ticker, config in ISSUERS.items():
        cik = config["cik"]
        submission = get_json(
            session,
            f"https://data.sec.gov/submissions/CIK{cik}.json",
            args.cache_dir / ticker / "submission.json",
        )
        filing_count = 0
        periods = set()
        for filing in filing_rows(submission, config["start"]):
            filing_count += 1
            for document_name, source_url, html in accession_documents(
                session, cik, filing, args.cache_dir / ticker
            ):
                lines = clean_lines(html)
                period = fiscal_period(lines, filing)
                for metric, excerpt in guidance_lines(lines, ticker):
                    amount, currency, margin, growth = metric_values(excerpt, metric)
                    digest = hashlib.sha256(
                        f"{ticker}|{period}|{filing['filing_date']}|{metric}|{excerpt}".encode()
                    ).hexdigest()[:24]
                    payload = {
                        "id": digest,
                        "ticker": ticker,
                        "fiscal_period": period,
                        "observed_at": filing["filing_date"],
                        "metric_name": metric,
                        "actual_or_guidance": "guidance",
                        "amount": amount,
                        "unit": f"{currency or 'reported'} millions" if amount is not None else None,
                        "currency": currency,
                        "growth_yoy": growth,
                        "growth_qoq": None,
                        "margin_pct": margin,
                        "value_text": excerpt,
                        "quality_status": "clear",
                        "extraction_confidence": 0.96,
                        "speaker": "Issuer management / investor relations filing",
                        "source_url": source_url,
                        "evidence_excerpt": excerpt,
                        "source_file": f"SEC:{filing['accession']}:{document_name}",
                        "source_type": "official_issuer_sec_filing",
                        "extraction_version": IMPORT_VERSION,
                    }
                    payload["payload_json"] = json.dumps(payload, separators=(",", ":"))
                    events.append(payload)
                    periods.add(period)
        coverage[ticker] = {"filings": filing_count, "periods": len(periods)}

    with sqlite3.connect(args.source_db) as connection:
        ensure_schema(connection)
        connection.execute(
            "DELETE FROM pit_guidance_events WHERE source_type='official_issuer_sec_filing'"
        )
        for event in events:
            connection.execute(
                """
                INSERT OR REPLACE INTO pit_guidance_events (
                  id, ticker, fiscal_period, observed_at, metric_name,
                  actual_or_guidance, amount, unit, currency, growth_yoy,
                  growth_qoq, margin_pct, value_text, quality_status,
                  extraction_confidence, speaker, source_url, evidence_excerpt,
                  source_file, source_type, extraction_version, payload_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    event["id"], event["ticker"], event["fiscal_period"],
                    event["observed_at"], event["metric_name"],
                    event["actual_or_guidance"], event["amount"], event["unit"],
                    event["currency"], event["growth_yoy"], event["growth_qoq"],
                    event["margin_pct"], event["value_text"], event["quality_status"],
                    event["extraction_confidence"], event["speaker"],
                    event["source_url"], event["evidence_excerpt"],
                    event["source_file"], event["source_type"],
                    event["extraction_version"], event["payload_json"],
                ),
            )
        for ticker in ISSUERS:
            count, periods = connection.execute(
                """
                SELECT COUNT(*), COUNT(DISTINCT fiscal_period)
                FROM pit_guidance_events
                WHERE ticker=? AND source_type='official_issuer_sec_filing'
                """,
                (ticker,),
            ).fetchone()
            if count:
                connection.execute(
                    """
                    UPDATE pit_guidance_coverage
                    SET guidance_periods=?, guidance_events=?, status=?, note=?
                    WHERE ticker=?
                    """,
                    (
                        periods, count, "covered_official_filing",
                        "Official issuer SEC result filings; filing date is PIT boundary.",
                        ticker,
                    ),
                )
            else:
                connection.execute(
                    """
                    UPDATE pit_guidance_coverage
                    SET guidance_periods=0, guidance_events=0, status=?, note=?
                    WHERE ticker=?
                    """,
                    (
                        "no_quantified_official_guidance",
                        "Official issuer filings reviewed; no quantified group-level guidance suitable for the valuation model.",
                        ticker,
                    ),
                )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            ("official_sec_guidance_version", IMPORT_VERSION),
        )
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata (key,value) VALUES (?,?)",
            ("official_sec_guidance_imported_at", dt.datetime.now(dt.timezone.utc).isoformat()),
        )
        connection.commit()

    print(json.dumps({
        "events": len(events),
        "coverage": coverage,
        "sourceDb": str(args.source_db),
        "version": IMPORT_VERSION,
    }, indent=2))


if __name__ == "__main__":
    main()
