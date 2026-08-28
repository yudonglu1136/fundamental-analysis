#!/usr/bin/env python3
"""Add official UK issuer event-time financials to the PIT valuation source.

BAE Systems and LSEG do not publish US-style quarterly statements. Full-year
and half-year releases are converted to TTM observations. Q1/Q3 trading updates
carry the most recently disclosed TTM statement and add only guidance visible
on that event date. Every row records that distinction in sourceRecord.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader


SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
CACHE_DIR = Path("server/data/pit-official-cache")
BAE_ARCHIVE = "https://investors.baesystems.com/results-centre"
BAE_READER_ARCHIVE = f"https://r.jina.ai/{BAE_ARCHIVE}"
BAE_RESULT_SLUGS = {
    (2010, "half_year"): "bae-systems-half-year-results-2010",
    (2010, "full_year"): "bae-systems-full-year-results-2010",
    (2011, "half_year"): "half-year-results-2011",
    (2011, "full_year"): "2011-full-year-results",
    (2012, "half_year"): "half-year-results-2012",
    (2012, "full_year"): "2012-full-year-results",
    (2013, "half_year"): "2013-half-year-results",
    (2013, "full_year"): "2013-full-year-results",
    (2014, "half_year"): "2014-half-year-results",
    (2014, "full_year"): "2014-full-year-results",
    (2015, "half_year"): "bae-systems-announces-2015-half-year-results",
    (2015, "full_year"): "2015-full-year-results",
    (2016, "half_year"): "announcement-of-2016-half-year-results",
    (2016, "full_year"): "2016-financial-results",
    (2017, "half_year"): "announcement-of-2017-half-year-results",
    (2017, "full_year"): "2017-full-year-results",
    (2018, "half_year"): "announcement-of-2018-half-year-results",
    (2018, "full_year"): "2018-full-year-results",
    (2019, "half_year"): "announcement-of-2019-half-year-results",
    (2019, "full_year"): "2019-full-year-results",
}
LSEG_ARCHIVE = "https://www.lseg.com/en/investor-relations/financial-results"
GUIDANCE_EXTRACTOR = Path(__file__).with_name("extract-pit-management-guidance.py")
START_YEAR = 2010
USER_AGENT = "Mozilla/5.0 thesisforge-pit-valuation/1.0"


@dataclass(frozen=True)
class Event:
    ticker: str
    fiscal_year: int
    quarter: str
    event_date: str
    title: str
    source_url: str
    document_url: str | None
    kind: str


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, default=SOURCE_DB)
    parser.add_argument("--cache-dir", type=Path, default=CACHE_DIR)
    parser.add_argument("--start-year", type=int, default=START_YEAR)
    parser.add_argument("--refresh", action="store_true")
    return parser.parse_args()


def session() -> requests.Session:
    current = requests.Session()
    current.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9"})
    return current


HTTP = session()


def cached_text(url: str, cache_dir: Path, refresh: bool = False, suffix: str = ".txt") -> str:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache_dir / f"{key}{suffix}"
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8", errors="replace")
    last_error = None
    for attempt in range(5):
        try:
            if "r.jina.ai/" in url:
                response = requests.get(
                    url,
                    headers={"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9", "Connection": "close"},
                    timeout=35,
                )
            else:
                response = HTTP.get(url, timeout=35)
            if 400 <= response.status_code < 500 and response.status_code != 429:
                response.raise_for_status()
            response.raise_for_status()
            text = response.text
            if len(text.strip()) < 1_200:
                raise RuntimeError(f"short response ({len(text)} bytes)")
            path.write_text(text, encoding="utf-8")
            time.sleep(0.25)
            return text
        except Exception as error:
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def cached_pdf_text(url: str, cache_dir: Path, refresh: bool = False) -> str:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    text_path = cache_dir / f"{key}.txt"
    pdf_path = cache_dir / f"{key}.pdf"
    if text_path.exists() and not refresh:
        return text_path.read_text(encoding="utf-8", errors="replace")
    response = HTTP.get(url, timeout=180)
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise RuntimeError(f"Official document did not return PDF: {url}")
    pdf_path.write_bytes(response.content)
    reader = PdfReader(pdf_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if len(text.strip()) < 1_000:
        raise RuntimeError(f"Official PDF has no extractable text: {url}")
    text_path.write_text(text, encoding="utf-8")
    return text


def clean_markdown(text: str) -> str:
    value = re.sub(r"[*_`]", " ", text).replace("\u00a0", " ")
    return "\n".join(re.sub(r"[ \t]+", " ", line) for line in value.splitlines())


def amount_m(raw: str, scale: str | None = None) -> float:
    value = float(raw.replace(",", ""))
    return value * 1_000 if str(scale or "").lower() in {"bn", "billion"} else value


def first_amount(text: str, labels: list[str], allow_negative: bool = True) -> float | None:
    normalized = clean_markdown(text)
    for label in labels:
        line_pattern = re.compile(
            rf"(?im)^\s*(?:[-*•o|]\s*)?{label}(?:\s*\d+)?(?=[^\w]|$)(?P<tail>[^\n]{{0,240}})"
        )
        for line_match in line_pattern.finditer(normalized):
            tail = line_match.group("tail")
            amount_pattern = re.compile(
                r"£\s*(?P<open>\()?\s*(?P<value>[\d,]+(?:\.\d+)?)\s*"
                r"(?P<scale>bn|billion|m|million)?\s*(?P<close>\))?",
                re.I,
            )
            amounts = list(amount_pattern.finditer(tail))
            if not amounts:
                continue
            target = amounts[0]
            to_position = tail.lower().find(" to £")
            if to_position >= 0:
                target = next((item for item in amounts if item.start() >= to_position), amounts[-1])
            value = amount_m(target.group("value"), target.group("scale"))
            if allow_negative and (target.group("open") or target.group("close")):
                value *= -1
            return value
    return None


def first_inline_amount(text: str, labels: list[str], allow_negative: bool = True) -> float | None:
    """Read the earliest explicitly currency-denominated group headline."""
    normalized = clean_markdown(text)
    amount_pattern = re.compile(
        r"£\s*(?P<open>\()?\s*(?P<value>[\d,]+(?:\.\d+)?)\s*"
        r"(?P<scale>bn|billion|m|million)?\s*(?P<close>\))?",
        re.I,
    )
    for label in labels:
        for line in normalized.splitlines():
            label_match = re.search(label, line, re.I)
            if not label_match:
                continue
            tail = line[label_match.end():]
            amounts = list(amount_pattern.finditer(tail))
            if not amounts:
                continue
            target = amounts[0]
            to_position = tail.lower().find(" to £")
            if to_position >= 0:
                target = next((item for item in amounts if item.start() >= to_position), amounts[-1])
            value = amount_m(target.group("value"), target.group("scale"))
            if allow_negative and (target.group("open") or target.group("close")):
                value *= -1
            return value
    return None


def first_table_number(
    text: str,
    labels: list[str],
    allow_negative: bool = True,
    skip_leading_note: bool = False,
) -> float | None:
    """Read the current-period value from issuer tables that omit currency symbols."""
    normalized = clean_markdown(text)
    for label in labels:
        line_pattern = re.compile(
            rf"(?im)^\s*(?:[-*•o|]\s*)?{label}(?:\d+)?(?=[^\w]|$)(?P<tail>[^\n]{{0,240}})"
        )
        for line_match in line_pattern.finditer(normalized):
            tail = line_match.group("tail")
            value_matches = list(re.finditer(
                r"(?P<open>\()?\s*(?P<value>\d[\d,]*(?:\.\d+)?)(?P<close>\))?",
                tail,
            ))
            if not value_matches:
                continue
            value_matches = [
                match for match in value_matches
                if not re.search(r"[A-Za-z]", tail[:match.start()])
                and not re.match(r"\s*%", tail[match.end():])
            ]
            if not value_matches:
                continue
            value_match = value_matches[0]
            first_raw = value_match.group("value")
            looks_like_footnote = (
                len(value_matches) > 1
                and "." not in first_raw
                and "," not in first_raw
                and int(first_raw) <= 20
                and float(value_matches[1].group("value").replace(",", "")) >= 50
            )
            if len(value_matches) > 1 and (skip_leading_note or looks_like_footnote):
                value_match = value_matches[1]
            value = float(value_match.group("value").replace(",", ""))
            if allow_negative and (value_match.group("open") or value_match.group("close")):
                value *= -1
            return value
    return None


def first_percent_or_pence(text: str, labels: list[str]) -> float | None:
    normalized = clean_markdown(text)
    for label in labels:
        match = re.search(
            rf"(?im)^\s*(?:[-*•o|]\s*)?{label}(?:\s*\d+)?(?=[^\w]|$)(?P<tail>[^\n]{{0,160}})",
            normalized,
        )
        if match:
            values = re.findall(r"(\d+(?:\.\d+)?)\s*(?:p\b|pence\b)", match.group("tail"), re.I)
            if values:
                return float(values[-1])
    return None


def first_disclosed_number(
    text: str,
    labels: list[str],
    allow_negative: bool = True,
    prefer_inline: bool = True,
) -> float | None:
    """Respect metric-name priority before trying broader fallback labels."""
    for label in labels:
        value = first_inline_amount(text, [label], allow_negative) if prefer_inline else None
        if value is None:
            value = first_table_number(text, [label], allow_negative)
        if value is None:
            value = first_amount(text, [label], allow_negative)
        if value is not None:
            return value
    return None


def iso_date(value: str) -> str:
    normalized = value.strip()
    for pattern in ("%d %b %Y", "%d %B %Y"):
        try:
            return dt.datetime.strptime(normalized, pattern).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unsupported issuer date format: {value!r}")


def parse_bae_archive(cache_dir: Path, refresh: bool) -> list[Event]:
    markdown = cached_text(BAE_READER_ARCHIVE, cache_dir / "bae", refresh)
    events = []
    row_pattern = re.compile(
        r"^\|\s*(?P<date>\d{2}\s+[A-Za-z]+\s+20\d{2})\s*\|\s*(?P<title>[^|]+?)\s*\|\s*"
        r"(?:\[[^\]]+\]\((?P<url>https?://[^)]+)\))?",
        re.M,
    )
    for match in row_pattern.finditer(markdown):
        title = re.sub(r"\s+", " ", match.group("title")).strip()
        date = iso_date(match.group("date"))
        release_year = int(date[:4])
        named_year = re.search(r"\b(20\d{2})\b", title)
        fiscal_year = int(named_year.group(1)) if named_year else release_year
        lower = title.lower()
        if "preliminary" in lower:
            quarter, kind = "Q4", "full_year"
        elif "half year" in lower:
            quarter, kind = "Q2", "half_year"
        elif "trading" in lower or "interim management" in lower:
            quarter = "Q1" if int(date[5:7]) <= 6 else "Q3"
            kind = "trading_update"
        else:
            continue
        if fiscal_year < START_YEAR:
            continue
        events.append(Event("BA.L", fiscal_year, quarter, date, title, BAE_ARCHIVE, match.group("url"), kind))
    return dedupe_events(events)


def bae_article_text(year: int, kind: str, cache_dir: Path, refresh: bool) -> tuple[str, str]:
    period = "full" if kind == "full_year" else "half"
    slugs = (
        BAE_RESULT_SLUGS.get((year, kind)),
        f"{year}-{period}-year-results",
        f"{period}-year-results-{year}",
        f"bae-systems-{period}-year-results-{year}",
        f"{year}-{'preliminary-results' if kind == 'full_year' else 'interim-results'}",
        f"{'preliminary-results' if kind == 'full_year' else 'interim-results'}-{year}",
    )
    for slug in (value for value in dict.fromkeys(slugs) if value):
        for locale in ("en", "en-uk", "en-us", "en-sa"):
            source_url = f"https://www.baesystems.com/{locale}/article/{slug}"
            reader_url = f"https://r.jina.ai/{source_url}"
            try:
                text = cached_text(reader_url, cache_dir / "bae", refresh)
            except Exception:
                continue
            heading = " ".join(text.splitlines()[:20])
            period_heading = re.search(rf"(?i)\b{period}[- ]year\s+results\b", heading)
            if kind == "full_year":
                period_heading = period_heading or re.search(
                    r"(?i)\b(?:financial|preliminary)\s+results\b", heading
                )
            has_matching_heading = str(year) in heading and period_heading
            financial_text = clean_markdown(text)
            has_financials = re.search(r"(?i)\b(?:headline\s+)?sales\b", financial_text) and re.search(
                r"(?i)\bunderlying\s+(?:EBIT|EBITA|earnings before interest and tax)", financial_text
            )
            if has_matching_heading and "Published" in text and has_financials:
                return text, source_url
    raise RuntimeError(f"BAE official newsroom article missing for FY{year} {kind}")


def disclosed_change_pct(text: str, labels: list[str]) -> float | None:
    normalized = clean_markdown(text)
    for line in normalized.splitlines():
        if not any(re.search(label, line, re.I) for label in labels):
            continue
        patterns = (
            r"(?P<pct>\d+(?:\.\d+)?)\s*%\s*(?P<direction>increase|decrease)",
            r"(?P<direction>increased?|decreased?)\b[^%]{0,80}?(?:by\s+)?(?P<pct>\d+(?:\.\d+)?)\s*%",
            r"(?P<direction>up|down)\s+(?P<pct>\d+(?:\.\d+)?)\s*%",
        )
        for pattern in patterns:
            match = re.search(pattern, line, re.I)
            if match:
                direction = match.group("direction").lower()
                pct = float(match.group("pct"))
                return -pct if direction.startswith(("decrease", "down")) else pct
    return None


def parse_bae_actual(text: str, shares_m: float | None, prior_comparable: dict | None = None) -> dict:
    actual = re.split(r"(?im)^#{1,6}\s*(?:\d{4}\s+)?(?:group\s+)?guidance\b", text)[0]
    sales = first_amount(actual, [r"(?:Headline )?Sales"])
    op = first_amount(actual, [r"Underlying (?:earnings before interest and tax \()?EBIT\)?", r"Underlying EBITA"])
    fcf = first_amount(actual, [r"Free cash flow", r"Operating business cash flow"])
    net_debt = first_amount(actual, [r"Net debt(?: \(excluding lease liabilities\))?"])
    net_cash = first_amount(actual, [r"Net cash"])
    eps_p = first_percent_or_pence(actual, [r"Underlying (?:earnings per share|EPS)(?:\s*-\s*basic)?"])
    derivation = {}
    if sales is None and prior_comparable and prior_comparable.get("revenue_m") is not None:
        change = disclosed_change_pct(actual, [r"\bsales\b"])
        if change is not None:
            sales = prior_comparable["revenue_m"] * (1 + change / 100)
            derivation["revenue_m"] = f"Prior H1 x (1 + official disclosed {change:+.1f}% change)"
    if op is None and prior_comparable and prior_comparable.get("operating_income_m") is not None:
        change = disclosed_change_pct(actual, [r"underlying\s+EBIT", r"underlying\s+EBITA"])
        if change is not None:
            op = prior_comparable["operating_income_m"] * (1 + change / 100)
            derivation["operating_income_m"] = f"Prior H1 x (1 + official disclosed {change:+.1f}% change)"
    if sales is None or op is None:
        raise RuntimeError("BAE release did not expose sales and underlying EBIT")
    debt_m = abs(net_debt) if net_debt is not None else None
    cash_m = max(net_cash, 0.0) if net_cash is not None else None
    net_income = eps_p / 100 * shares_m if eps_p is not None and shares_m else None
    return {
        "revenue_m": sales,
        "gross_profit_m": None,
        "operating_income_m": op,
        "net_income_m": net_income,
        "cfo_m": fcf,
        "capex_m": None,
        "fcf_after_capex_m": fcf,
        "shares_m": shares_m,
        "equity_m": None,
        "assets_m": None,
        "cash_m": cash_m,
        "debt_m": debt_m,
        "_metric_derivation": derivation or None,
    }


def bae_share_capital(cache_dir: Path, refresh: bool) -> list[tuple[str, float]]:
    cache_path = cache_dir / "bae-share-capital.json"
    if cache_path.exists() and not refresh:
        return [(row[0], float(row[1])) for row in json.loads(cache_path.read_text())]
    rows: dict[str, float] = {}
    for page in range(1, 76):
        url = f"https://find-and-update.company-information.service.gov.uk/company/01470151/filing-history?page={page}"
        html = cached_text(url, cache_dir / "companies-house", refresh, ".html")
        soup = BeautifulSoup(html, "html.parser")
        for table_row in soup.select("tr"):
            text = re.sub(r"\s+", " ", table_row.get_text(" ", strip=True))
            match = re.search(
                r"Statement of capital (?:following an allotment of shares )?on "
                r"(?P<date>\d{1,2} [A-Za-z]+ 20\d{2}).*?GBP (?P<capital>[\d,]+(?:\.\d+)?)",
                text,
            )
            if not match:
                continue
            capital = float(match.group("capital").replace(",", ""))
            if not 50_000_000 <= capital <= 200_000_000:
                continue
            rows[dt.datetime.strptime(match.group("date"), "%d %B %Y").date().isoformat()] = capital / 0.025 / 1_000_000
    result = sorted(rows.items())
    cache_path.write_text(json.dumps(result, indent=2))
    return result


def value_at_or_before(rows: list[tuple[str, float]], date: str) -> float | None:
    values = [value for observed, value in rows if observed <= date]
    return values[-1] if values else None


def lseg_release_url(event_url: str, cache_dir: Path, refresh: bool) -> tuple[str, str, str]:
    html = cached_text(event_url, cache_dir / "lseg", refresh, ".html")
    soup = BeautifulSoup(html, "html.parser")
    title = re.sub(r"\s+", " ", (soup.find("h1") or soup.title).get_text(" ", strip=True))
    page_text = soup.get_text(" ", strip=True)
    date_match = re.search(r"\b(\d{1,2} [A-Z][a-z]+ 20\d{2})\b", page_text)
    if not date_match:
        raise RuntimeError(f"LSEG event date missing: {event_url}")
    release = None
    for anchor in soup.find_all("a", href=True):
        label = anchor.get_text(" ", strip=True).lower()
        href = urljoin(event_url, anchor["href"])
        if href.lower().endswith(".pdf") and ("release" in label or "/rns/" in href):
            release = href
            break
    if not release:
        raise RuntimeError(f"LSEG release PDF missing: {event_url}")
    return title, iso_date(date_match.group(1)), release


def date_from_url(url: str) -> str | None:
    match = re.search(r"(\d{2})([a-z]{3,9})(20\d{2})", url, re.I)
    if not match:
        return None
    for fmt in ("%d%b%Y", "%d%B%Y"):
        try:
            return dt.datetime.strptime("".join(match.groups()), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_lseg_archive(cache_dir: Path, refresh: bool) -> list[Event]:
    html = cached_text(LSEG_ARCHIVE, cache_dir / "lseg", refresh, ".html")
    soup = BeautifulSoup(html, "html.parser")
    events = []
    seen = set()
    for anchor in soup.find_all("a", href=True):
        href = urljoin(LSEG_ARCHIVE, anchor["href"])
        if href in seen or "/financial-results/" not in href:
            continue
        seen.add(href)
        if href.lower().endswith((".zip", ".mp3")) or any(part in href for part in ("/presentation/", "/conference-call", "/interim-report/")):
            continue
        try:
            if href.lower().endswith(".pdf"):
                lower = href.lower()
                if "/rns/" not in lower:
                    continue
                event_date = date_from_url(lower)
                title = href.rsplit("/", 1)[-1]
                document_url = href
            else:
                title, event_date, document_url = lseg_release_url(href, cache_dir, refresh)
        except Exception:
            continue
        if not event_date:
            continue
        lower = f"{title} {href}".lower()
        named_year = re.search(r"\b(20\d{2})\b", lower)
        release_year = int(event_date[:4])
        if "prelim" in lower:
            fiscal_year = int(named_year.group(1)) if named_year else release_year - 1
            quarter, kind = "Q4", "full_year"
        elif any(token in lower for token in ("h1", "interim-results", "interim results")):
            fiscal_year = int(named_year.group(1)) if named_year else release_year
            quarter, kind = "Q2", "half_year"
        elif any(token in lower for token in ("q1", "q3", "trading-update", "trading-statement", "interim-management")):
            fiscal_year = int(named_year.group(1)) if named_year else release_year
            if "q3" in lower:
                quarter = "Q3"
            elif "q1" in lower:
                quarter = "Q1"
            else:
                quarter = "Q1" if int(event_date[5:7]) <= 7 else "Q3"
            kind = "trading_update"
        else:
            continue
        if int(event_date[:4]) < START_YEAR:
            continue
        # LSEG used a 31 March year-end through FY2014. Q1-Q3 events before
        # that year-end belong to the fiscal year ending in the following
        # calendar year (for example, July 2010 is FY2011 Q1).
        if kind != "full_year" and event_date <= "2014-03-31":
            fiscal_year += 1
        if fiscal_year < START_YEAR:
            continue
        events.append(Event("LSEG", fiscal_year, quarter, event_date, title, href, document_url, kind))
    return dedupe_events(events)


def parse_lseg_actual(text: str) -> dict:
    actual = text
    revenue_labels = [
        r"Adjusted total income",
        r"Total income \(excluding (?:unrealised[^)]*|recoveries[^)]*)\)",
        r"Total (?:income|revenue) \(excl\.? recoveries\)",
        r"Total (?:income|revenue) excluding recoveries",
        r"Total income",
        r"Total revenue",
    ]
    op_labels = [r"Adjusted operating profit"]
    fcf_labels = [r"Equity free cash flow", r"Free cash flow"]
    debt_labels = [r"Operating net debt", r"Total net debt", r"Net debt"]
    revenue = first_disclosed_number(actual, revenue_labels)
    op = first_disclosed_number(actual, op_labels)
    fcf = first_disclosed_number(actual, fcf_labels, prefer_inline=False)
    net_debt = first_disclosed_number(actual, debt_labels)
    shares_match = re.search(
        r"weighted average number of (?:ordinary )?shares(?:\s*[–-]\s*million)?[^\n]{0,120}?"
        r"(?:is\s+)?([\d,]+(?:\.\d+)?)\s*(?:million)?",
        text,
        re.I,
    )
    eps_p = first_percent_or_pence(actual, [r"Adjusted basic earnings per share", r"Adjusted EPS"])
    if eps_p is None:
        eps_p = first_table_number(actual, [r"Adjusted basic earnings per share(?:\s*\(p\))?", r"Adjusted EPS"])
    shares_m = float(shares_match.group(1).replace(",", "")) if shares_match else None
    if revenue is None or op is None:
        raise RuntimeError("LSEG release did not expose total income and adjusted operating profit")
    return {
        "revenue_m": revenue,
        "gross_profit_m": None,
        "operating_income_m": op,
        "net_income_m": eps_p / 100 * shares_m if eps_p is not None and shares_m else None,
        "cfo_m": fcf,
        "capex_m": None,
        "fcf_after_capex_m": fcf,
        "shares_m": shares_m,
        "equity_m": None,
        "assets_m": None,
        "cash_m": None,
        "debt_m": abs(net_debt) if net_debt is not None else None,
        "_eps_p": eps_p,
    }


FLOW_KEYS = ("revenue_m", "gross_profit_m", "operating_income_m", "net_income_m", "cfo_m", "capex_m", "fcf_after_capex_m")


def ttm_from_half(current: dict, prior_full: dict | None, prior_half: dict | None) -> tuple[dict, str]:
    if prior_full and prior_half:
        result = copy.deepcopy(current)
        for key in FLOW_KEYS:
            values = (current.get(key), prior_full.get(key), prior_half.get(key))
            result[key] = values[0] + values[1] - values[2] if all(value is not None for value in values) else current.get(key)
        return result, "TTM = current H1 + prior FY - prior H1"
    result = copy.deepcopy(current)
    for key in FLOW_KEYS:
        result[key] = current[key] * 2 if current.get(key) is not None else None
    return result, "First available H1 annualized x2; no prior H1 existed in the requested history"


def source_payload(event: Event, metrics: dict, method: str, carried_from: dict | None = None) -> dict:
    fiscal_calendar_transition = event.ticker == "LSEG" and event.fiscal_year == 2014
    metric_source = {
        "filed": event.event_date,
        "end": f"{event.fiscal_year}-{('12-31' if event.quarter == 'Q4' else '06-30' if event.quarter == 'Q2' else '03-31' if event.quarter == 'Q1' else '09-30')}",
        "form": "Official issuer result / trading update",
        "dimension": "ART",
        "annualOnly": True,
        "sourceTicker": event.ticker,
        "dataset": "Official issuer PIT disclosures",
        "url": event.document_url or event.source_url,
    }
    payload = {
        "ticker": event.ticker,
        "sourceTicker": event.ticker,
        "key": f"{event.fiscal_year}::{event.quarter}",
        "fiscalYear": event.fiscal_year,
        "fiscalQuarter": event.quarter,
        "label": f"FY{event.fiscal_year} {event.quarter}",
        "asOfDate": event.event_date,
        "periodEndDate": metric_source["end"],
        "calendarDate": metric_source["end"],
        "financialStatementCurrency": "GBP",
        "sourceDimension": "ART",
        **{key: value for key, value in metrics.items() if not key.startswith("_")},
        "sourceRecord": {
            "dataset": "Official issuer PIT disclosures",
            "issuer": "BAE Systems plc" if event.ticker == "BA.L" else "London Stock Exchange Group plc",
            "eventTitle": event.title,
            "eventDate": event.event_date,
            "sourceUrl": event.source_url,
            "documentUrl": event.document_url,
            "metricsAreTrailingTwelveMonths": True,
            "ttmConstruction": method,
            "carriedForwardFinancialPeriod": carried_from,
            "selectionPolicy": "issuer-published value visible on event date; no later restatement",
            "metricDerivation": metrics.get("_metric_derivation"),
            "fiscalCalendarTransition": fiscal_calendar_transition,
            "fiscalCalendarNote": (
                "LSEG changed its financial year end from 31 March to 31 December in 2014; "
                "the transition period therefore does not follow a normal sequential quarter calendar."
                if fiscal_calendar_transition else None
            ),
        },
        "sources": {
            key: {**metric_source, "tag": key}
            for key, value in metrics.items()
            if value is not None and not key.startswith("_")
        },
    }
    return payload


def dedupe_events(events: list[Event]) -> list[Event]:
    selected: dict[tuple[str, int, str], Event] = {}
    priority = {"full_year": 3, "half_year": 3, "trading_update": 1}
    for event in sorted(events, key=lambda row: (row.event_date, priority[row.kind])):
        key = (event.ticker, event.fiscal_year, event.quarter)
        current = selected.get(key)
        if current is None or event.event_date > current.event_date or priority[event.kind] > priority[current.kind]:
            selected[key] = event
    return sorted(selected.values(), key=lambda row: row.event_date)


def guidance_module():
    spec = importlib.util.spec_from_file_location("pit_guidance_extractor", GUIDANCE_EXTRACTOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def guidance_events(module, event: Event, text: str) -> list[dict]:
    events = []
    clean = re.sub(r"\s+", " ", clean_markdown(text))
    speaker = "Official issuer results release — management guidance"
    for sentence in module.sentences(clean):
        if module.DISCLAIMER.search(sentence) or module.HISTORICAL_GUIDANCE.search(sentence):
            continue
        if not module.FORWARD_LANGUAGE.search(sentence):
            continue
        metrics = module.metric_names(sentence)
        positions = [position for _, position in metrics]
        for metric, position in metrics:
            row = module.extract_event(
                event.ticker,
                f"{event.quarter}{event.fiscal_year}",
                event.event_date,
                event.document_url or event.source_url,
                Path("official-issuer-release"),
                speaker,
                sentence,
                metric,
                position,
                positions,
            )
            row["source_type"] = "official_issuer_results_release"
            row["extraction_version"] = f"{module.EXTRACTION_VERSION}+official-uk-v1"
            row["payload_json"] = json.dumps(row, separators=(",", ":"))
            events.append(row)
    return events


def build_ticker_rows(events: list[Event], cache_dir: Path, refresh: bool, shares: list[tuple[str, float]] | None = None):
    actual_by_kind: dict[tuple[int, str], dict] = {}
    actual_text: dict[tuple[int, str], str] = {}
    event_sources: dict[tuple[int, str], str] = {}
    for event in events:
        if event.kind == "trading_update":
            if event.ticker == "LSEG" and event.document_url:
                try:
                    actual_text[(event.fiscal_year, event.quarter)] = cached_pdf_text(event.document_url, cache_dir / "lseg", refresh)
                except Exception:
                    pass
            continue
        print(
            json.dumps({
                "stage": "official_financial",
                "ticker": event.ticker,
                "fiscalYear": event.fiscal_year,
                "quarter": event.quarter,
                "eventDate": event.event_date,
            }),
            file=sys.stderr,
            flush=True,
        )
        if event.ticker == "BA.L":
            text, source_url = bae_article_text(event.fiscal_year, event.kind, cache_dir, refresh)
            metrics = parse_bae_actual(
                text,
                value_at_or_before(shares or [], event.event_date),
                actual_by_kind.get((event.fiscal_year - 1, "Q2")),
            )
            event_sources[(event.fiscal_year, event.quarter)] = source_url
        else:
            text = cached_pdf_text(event.document_url or event.source_url, cache_dir / "lseg", refresh)
            metrics = parse_lseg_actual(text)
            if metrics.get("shares_m") is None:
                previous_shares = next(
                    (
                        prior.get("shares_m")
                        for prior in reversed(list(actual_by_kind.values()))
                        if prior.get("shares_m") is not None
                    ),
                    None,
                )
                if previous_shares is not None:
                    metrics["shares_m"] = previous_shares
                    if metrics.get("net_income_m") is None and metrics.get("_eps_p") is not None:
                        metrics["net_income_m"] = metrics["_eps_p"] / 100 * previous_shares
                    derivation = dict(metrics.get("_metric_derivation") or {})
                    derivation["shares_m"] = (
                        "Carried latest issuer-disclosed weighted average shares; current release omitted the figure"
                    )
                    metrics["_metric_derivation"] = derivation
        actual_by_kind[(event.fiscal_year, event.quarter)] = metrics
        actual_text[(event.fiscal_year, event.quarter)] = text

    rows = []
    guidance = []
    latest_payload = None
    guidance_lib = guidance_module()
    for event in events:
        key = (event.fiscal_year, event.quarter)
        source_event = event
        if key in event_sources:
            source_event = Event(
                event.ticker, event.fiscal_year, event.quarter, event.event_date,
                event.title, event_sources[key], event.document_url, event.kind,
            )
        if event.kind == "full_year":
            metrics = actual_by_kind[key]
            method = "Issuer-published full-year metrics"
        elif event.kind == "half_year":
            prior_full_key = (event.fiscal_year - 1, "Q4")
            prior_half_key = (event.fiscal_year - 1, "Q2")
            metrics, method = ttm_from_half(
                actual_by_kind[key],
                actual_by_kind.get(prior_full_key),
                actual_by_kind.get(prior_half_key),
            )
        elif latest_payload:
            metrics = {metric: latest_payload.get(metric) for metric in FLOW_KEYS + ("shares_m", "equity_m", "assets_m", "cash_m", "debt_m")}
            method = "Carried latest disclosed TTM financials; current event contributes guidance only"
        else:
            continue
        carried = None if event.kind != "trading_update" else {
            "fiscalYear": latest_payload["fiscalYear"],
            "fiscalQuarter": latest_payload["fiscalQuarter"],
            "availableAt": latest_payload["asOfDate"],
        }
        payload = source_payload(source_event, metrics, method, carried)
        rows.append(payload)
        latest_payload = payload
        if key in actual_text:
            guidance.extend(guidance_events(guidance_lib, source_event, actual_text[key]))
    return rows, guidance


def insert_rows(connection: sqlite3.Connection, ticker: str, rows: list[dict], guidance: list[dict]):
    connection.execute("DELETE FROM pit_financial_periods WHERE ticker = ?", (ticker,))
    connection.execute("DELETE FROM pit_guidance_events WHERE ticker = ? AND source_type = 'official_issuer_results_release'", (ticker,))
    for payload in rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO pit_financial_periods (
              ticker, source_ticker, fiscal_period, fiscal_year, fiscal_quarter,
              dimension, available_at, report_period, currency, payload_json
            ) VALUES (?, ?, ?, ?, ?, 'ART', ?, ?, 'GBP', ?)
            """,
            (
                ticker, ticker, f"{payload['fiscalYear']}-{payload['fiscalQuarter']}",
                payload["fiscalYear"], payload["fiscalQuarter"], payload["asOfDate"],
                payload["periodEndDate"], json.dumps(payload, separators=(",", ":")),
            ),
        )
    for row in guidance:
        connection.execute(
            """
            INSERT OR REPLACE INTO pit_guidance_events (
              id, ticker, fiscal_period, observed_at, metric_name, actual_or_guidance,
              amount, unit, currency, growth_yoy, growth_qoq, margin_pct, value_text,
              quality_status, extraction_confidence, speaker, source_url,
              evidence_excerpt, source_file, source_type, extraction_version, payload_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                row["id"], row["ticker"], row["fiscal_period"], row["observed_at"], row["metric_name"],
                row["actual_or_guidance"], row["amount"], row["unit"], row["currency"], row["growth_yoy"],
                row["growth_qoq"], row["margin_pct"], row["value_text"], row["quality_status"],
                row["extraction_confidence"], row["speaker"], row["source_url"], row["evidence_excerpt"],
                row["source_file"], row["source_type"], row["extraction_version"], row["payload_json"],
            ),
        )
    guidance_periods = len({row["fiscal_period"] for row in guidance})
    connection.execute(
        """
        UPDATE pit_guidance_coverage
        SET guidance_periods=?, guidance_events=?, status=?, note=?
        WHERE ticker=?
        """,
        (
            guidance_periods,
            len(guidance),
            "covered_official_filing" if guidance else "no_quantified_official_guidance",
            (
                "Official issuer results releases; publication date is the PIT boundary."
                if guidance
                else "Official issuer releases reviewed; no quantified guidance suitable for the valuation model."
            ),
            ticker,
        ),
    )
    available = sorted(row["asOfDate"] for row in rows)
    connection.execute(
        """
        INSERT INTO pit_financial_coverage (
          ticker, source_ticker, status, arq_periods, art_periods,
          first_available_at, last_available_at, note
        ) VALUES (?, ?, 'annual_only', 0, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          source_ticker=excluded.source_ticker, status=excluded.status,
          arq_periods=excluded.arq_periods, art_periods=excluded.art_periods,
          first_available_at=excluded.first_available_at,
          last_available_at=excluded.last_available_at, note=excluded.note
        """,
        (
            ticker, ticker, len(rows), available[0] if available else None,
            available[-1] if available else None,
            "Official issuer FY/H1 metrics converted to TTM; Q1/Q3 carry latest TTM and add event-visible guidance.",
        ),
    )


def main():
    options = args()
    global START_YEAR
    START_YEAR = options.start_year
    bae_events = parse_bae_archive(options.cache_dir, options.refresh)
    lseg_events = parse_lseg_archive(options.cache_dir, options.refresh)
    shares = bae_share_capital(options.cache_dir, options.refresh)
    bae_rows, bae_guidance = build_ticker_rows(bae_events, options.cache_dir, options.refresh, shares)
    lseg_rows, lseg_guidance = build_ticker_rows(lseg_events, options.cache_dir, options.refresh)
    with sqlite3.connect(options.source_db) as connection:
        insert_rows(connection, "BA.L", bae_rows, bae_guidance)
        insert_rows(connection, "LSEG", lseg_rows, lseg_guidance)
        generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
        connection.execute("INSERT OR REPLACE INTO pit_source_metadata VALUES (?, ?)", ("official_uk_imported_at", generated_at))
        connection.execute(
            "INSERT OR REPLACE INTO pit_source_metadata VALUES (?, ?)",
            ("official_uk_policy", "BAE/LSEG FY+H1 TTM; Q1/Q3 carry latest financial base plus event guidance"),
        )
        connection.commit()
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(json.dumps({
        "sourceDb": str(options.source_db),
        "BA.L": {"events": len(bae_events), "financialRows": len(bae_rows), "guidanceRows": len(bae_guidance)},
        "LSEG": {"events": len(lseg_events), "financialRows": len(lseg_rows), "guidanceRows": len(lseg_guidance)},
    }, indent=2))


if __name__ == "__main__":
    main()
