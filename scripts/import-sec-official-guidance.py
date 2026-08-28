#!/usr/bin/env python3
"""Import issuer-approved PIT guidance from official SEC result filings.

This is the fallback for foreign issuers whose earnings-call transcript pages
are unavailable. Filing dates, rather than report periods or later revisions,
are the point-in-time availability boundary.
"""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
DEFAULT_TARGET_DB = Path("server/data/guru-analysis.sqlite")
DEFAULT_MANIFEST = Path("server/config/sp500-valuation-universe.json")
SEC_USER_AGENT = "Guru Intelligence data engineering luyudong1136@gmail.com"
IMPORT_VERSION = "official-sec-guidance-v3-2026-08-28"
SEC_REQUEST_DELAY_SECONDS = 0.36
ISSUERS = {
    "CCEP": {"cik": "0001650107", "start": "2016-01-01"},
    "DGE.L": {"cik": "0000835403", "start": "2010-01-01"},
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
    parser.add_argument("--target-db", type=Path, default=DEFAULT_TARGET_DB)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/pit-official-sec-guidance"))
    parser.add_argument("--workers", type=int, default=3)
    return parser.parse_args()


def normalize_cik(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return digits.zfill(10) if digits else None


def issuer_targets(source_db: Path, target_db: Path, manifest_path: Path):
    cik_by_ticker = {
        ticker: config["cik"] for ticker, config in ISSUERS.items()
    }
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for company in manifest.get("companies") or []:
            cik = normalize_cik(company.get("cik"))
            if cik:
                cik_by_ticker[str(company["ticker"]).upper()] = cik
    if target_db.exists():
        with sqlite3.connect(target_db) as connection:
            for ticker, payload_json in connection.execute(
                "SELECT ticker, payload_json FROM valuation_ticker_snapshots"
            ):
                payload = json.loads(payload_json)
                cik = normalize_cik(
                    payload.get("cik")
                    or ((payload.get("dataQuality") or {}).get("secCompanyFacts") or {}).get("cik")
                )
                if cik:
                    cik_by_ticker[str(ticker).upper()] = cik
    with sqlite3.connect(source_db) as connection:
        rows = connection.execute(
            """
            SELECT coverage.ticker, coverage.status
            FROM pit_guidance_coverage AS coverage
            WHERE coverage.status IN (
              'missing_transcripts',
              'no_explicit_guidance',
              'official_guidance_review_incomplete'
            ) OR EXISTS (
              SELECT 1 FROM pit_guidance_events AS events
              WHERE events.ticker = coverage.ticker
                AND events.source_type = 'official_issuer_sec_filing'
            )
            ORDER BY coverage.ticker
            """
        ).fetchall()
    targets = {}
    for ticker, _status in rows:
        ticker = str(ticker).upper()
        cik = cik_by_ticker.get(ticker)
        if cik:
            targets[ticker] = {"cik": cik, "start": ISSUERS.get(ticker, {}).get("start", "2010-01-01")}
    return targets


def get_json(session: requests.Session, url: str, cache: Path):
    if cache.exists():
        return json.loads(cache.read_text())
    response = session.get(url, timeout=20)
    response.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(response.text)
    time.sleep(SEC_REQUEST_DELAY_SECONDS)
    return response.json()


def get_text(session: requests.Session, url: str, cache: Path):
    if cache.exists():
        return cache.read_text(errors="replace")
    response = session.get(url, timeout=20)
    response.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(response.text)
    time.sleep(SEC_REQUEST_DELAY_SECONDS)
    return response.text


def filing_rows(records: dict, start_date: str):
    for index, form in enumerate(records["form"]):
        filing_date = records["filingDate"][index]
        primary = records["primaryDocument"][index]
        items = (records.get("items") or [""] * len(records["form"]))[index]
        if form not in {"6-K", "8-K"} or filing_date < start_date:
            continue
        if form == "8-K" and not re.search(r"(?:^|,|\s)(?:2\.02|7\.01)(?:$|,|\s)", items or ""):
            continue
        if form == "6-K" and (not RESULT_DOCUMENT.search(primary) or EXCLUDED_DOCUMENT.search(primary)):
            continue
        yield {
            "accession": records["accessionNumber"][index],
            "filing_date": filing_date,
            "report_date": records["reportDate"][index],
            "primary": primary,
            "form": form,
            "items": items,
        }


def submission_record_sets(session, submission: dict, cache_dir: Path):
    yield submission["filings"]["recent"]
    for row in submission["filings"].get("files") or []:
        name = row.get("name")
        if not name:
            continue
        yield get_json(
            session,
            f"https://data.sec.gov/submissions/{name}",
            cache_dir / "submission-archives" / name,
        )


def accession_documents(
    session,
    cik: str,
    filing: dict,
    cache_dir: Path,
    document_errors: list[dict] | None = None,
):
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
        try:
            yield name, f"{base}/{name}", get_text(
                session, f"{base}/{name}", cache_dir / accession / name
            )
        except Exception as error:
            if document_errors is not None:
                document_errors.append({
                    "accession": filing["accession"],
                    "document": name,
                    "error": str(error),
                })


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


def build_session():
    session = requests.Session()
    session.headers.update({"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=1,
                connect=1,
                read=1,
                backoff_factor=1.0,
                status_forcelist=(429, 500, 502, 503, 504),
                allowed_methods=("GET",),
            )
        ),
    )
    return session


def scan_issuer(ticker: str, config: dict, cache_dir: Path):
    session = build_session()
    events = []
    filing_count = 0
    filing_errors = 0
    access_errors = []
    periods = set()
    seen_accessions = set()
    try:
        cik = config["cik"]
        try:
            submission = get_json(
                session,
                f"https://data.sec.gov/submissions/CIK{cik}.json",
                cache_dir / ticker / "submission.json",
            )
        except Exception as error:
            return ticker, [], {
                "filings": 0,
                "filingErrors": 1,
                "periods": 0,
                "submissionError": str(error),
            }
        record_sets = [submission["filings"]["recent"]]
        for archive in submission["filings"].get("files") or []:
            name = archive.get("name")
            if not name:
                continue
            try:
                record_sets.append(get_json(
                    session,
                    f"https://data.sec.gov/submissions/{name}",
                    cache_dir / ticker / "submission-archives" / name,
                ))
            except Exception:
                filing_errors += 1
                access_errors.append({
                    "archive": name,
                    "error": "Submission archive could not be read.",
                })
        for records in record_sets:
            for filing in filing_rows(records, config["start"]):
                if filing["accession"] in seen_accessions:
                    continue
                seen_accessions.add(filing["accession"])
                filing_count += 1
                document_errors = []
                try:
                    documents = list(accession_documents(
                        session,
                        cik,
                        filing,
                        cache_dir / ticker,
                        document_errors,
                    ))
                except Exception as error:
                    filing_errors += 1
                    access_errors.append({
                        "accession": filing["accession"],
                        "document": "index.json",
                        "error": str(error),
                    })
                    continue
                access_errors.extend(document_errors)
                if not documents and document_errors:
                    filing_errors += 1
                for document_name, source_url, html in documents:
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
        return ticker, events, {
            "filings": filing_count,
            "filingErrors": filing_errors,
            "accessErrors": access_errors,
            "periods": len(periods),
        }
    finally:
        session.close()


def align_events_to_financial_periods(source_db: Path, events: list[dict]) -> list[dict]:
    """Attach filing guidance to the nearest issuer financial release.

    Filing headings can mention a future quarter and are therefore not a safe
    fiscal-period key.  The issuer's first-visible financial date is the PIT
    boundary and provides the stable quarter assignment.
    """

    by_ticker: dict[str, list[tuple[dt.date, str]]] = collections.defaultdict(list)
    with sqlite3.connect(source_db) as connection:
        for ticker, fiscal_period, available_at in connection.execute(
            """
            SELECT ticker, fiscal_period, MIN(available_at)
            FROM pit_financial_periods
            GROUP BY ticker, fiscal_period
            ORDER BY ticker, MIN(available_at)
            """
        ):
            try:
                by_ticker[str(ticker).upper()].append(
                    (dt.date.fromisoformat(str(available_at)), str(fiscal_period))
                )
            except (TypeError, ValueError):
                continue

    aligned = []
    for event in events:
        try:
            observed = dt.date.fromisoformat(str(event["observed_at"]))
        except (KeyError, TypeError, ValueError):
            aligned.append(event)
            continue
        candidates = by_ticker.get(str(event.get("ticker", "")).upper(), [])
        nearest = min(candidates, key=lambda item: abs((item[0] - observed).days), default=None)
        if nearest and abs((nearest[0] - observed).days) <= 45:
            event = {**event, "fiscal_period": nearest[1]}
            event["id"] = hashlib.sha256(
                "|".join(
                    str(event.get(key) or "")
                    for key in (
                        "ticker",
                        "fiscal_period",
                        "observed_at",
                        "metric_name",
                        "evidence_excerpt",
                    )
                ).encode()
            ).hexdigest()[:24]
            payload = {
                key: value for key, value in event.items() if key != "payload_json"
            }
            event["payload_json"] = json.dumps(payload, separators=(",", ":"))
        aligned.append(event)
    return aligned


def main():
    args = parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    events = []
    coverage = {}

    issuers = issuer_targets(args.source_db, args.target_db, args.manifest)
    workers = max(1, min(args.workers, 3))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(scan_issuer, ticker, config, args.cache_dir): ticker
            for ticker, config in issuers.items()
        }
        for future in concurrent.futures.as_completed(futures):
            ticker, issuer_events, issuer_coverage = future.result()
            events.extend(issuer_events)
            coverage[ticker] = issuer_coverage
            print(
                f"{ticker}: {issuer_coverage['filings']} filings, "
                f"{len(issuer_events)} guidance events, "
                f"{issuer_coverage['filingErrors']} access errors",
                file=sys.stderr,
                flush=True,
            )

    events = align_events_to_financial_periods(args.source_db, events)

    with sqlite3.connect(args.source_db) as connection:
        ensure_schema(connection)
        placeholders = ",".join("?" for _ in issuers)
        if placeholders:
            connection.execute(
                f"""
                DELETE FROM pit_guidance_events
                WHERE source_type='official_issuer_sec_filing'
                  AND ticker IN ({placeholders})
                """,
                tuple(issuers),
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
        for ticker in issuers:
            official_count = connection.execute(
                """
                SELECT COUNT(*)
                FROM pit_guidance_events
                WHERE ticker=? AND source_type='official_issuer_sec_filing'
                """,
                (ticker,),
            ).fetchone()[0]
            count, periods = connection.execute(
                """
                SELECT COUNT(*), COUNT(DISTINCT fiscal_period)
                FROM pit_guidance_events
                WHERE ticker=?
                """,
                (ticker,),
            ).fetchone()
            if count:
                status = "covered_official_filing" if official_count else "covered"
                connection.execute(
                    """
                    UPDATE pit_guidance_coverage
                    SET guidance_periods=?, guidance_events=?, status=?, note=?
                    WHERE ticker=?
                    """,
                    (
                        periods, count, status,
                        "Event-visible transcript and/or official issuer filing guidance; observed filing/call date is the PIT boundary.",
                        ticker,
                    ),
                )
            else:
                filing_errors = coverage.get(ticker, {}).get("filingErrors", 0)
                status = (
                    "official_guidance_review_incomplete"
                    if filing_errors
                    else "no_quantified_official_guidance"
                )
                note = (
                    f"Official filing review had {filing_errors} document access errors; guidance coverage is incomplete."
                    if filing_errors
                    else "Official issuer filings reviewed; no quantified group-level guidance suitable for the valuation model."
                )
                connection.execute(
                    """
                    UPDATE pit_guidance_coverage
                    SET guidance_periods=0, guidance_events=0, status=?, note=?
                    WHERE ticker=?
                    """,
                    (
                        status,
                        note,
                        ticker,
                    ),
                )
        connection.execute(
            """
            UPDATE pit_guidance_coverage
            SET guidance_periods = (
                  SELECT COUNT(DISTINCT events.fiscal_period)
                  FROM pit_guidance_events AS events
                  WHERE events.ticker = pit_guidance_coverage.ticker
                ),
                guidance_events = (
                  SELECT COUNT(*)
                  FROM pit_guidance_events AS events
                  WHERE events.ticker = pit_guidance_coverage.ticker
                ),
                status = CASE
                  WHEN EXISTS (
                    SELECT 1 FROM pit_guidance_events AS events
                    WHERE events.ticker = pit_guidance_coverage.ticker
                      AND events.source_type IN (
                        'official_issuer_sec_filing',
                        'official_uk_company_filing'
                      )
                  ) THEN 'covered_official_filing'
                  WHEN EXISTS (
                    SELECT 1 FROM pit_guidance_events AS events
                    WHERE events.ticker = pit_guidance_coverage.ticker
                  ) THEN 'covered'
                  ELSE status
                END
            """
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
