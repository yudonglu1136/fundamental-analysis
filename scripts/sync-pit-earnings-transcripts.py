#!/usr/bin/env python3
"""Synchronize event-dated earnings-call transcripts for valuation tickers."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import re
import sqlite3
import threading
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


DEFAULT_ROOT = Path(
    os.environ.get(
        "PIT_EARNINGS_TRANSCRIPT_ROOT",
        Path.home() / "Documents/youtube_transcript_db/earnings_transcripts",
    )
)
DEFAULT_TARGET_DB = Path("server/data/guru-analysis.sqlite")
DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
BASE_URL = "https://stockanalysis.com"
SKIP_TICKERS = {"BA.L", "DGE.L", "LSEG", "RKLX", "SPCX"}
THREAD_STATE = threading.local()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--target-db", type=Path, default=DEFAULT_TARGET_DB)
    parser.add_argument(
        "--source-db",
        type=Path,
        default=DEFAULT_SOURCE_DB,
        help="PIT source database whose coverage table defines the full model universe.",
    )
    parser.add_argument("--tickers", nargs="*")
    parser.add_argument("--start-year", type=int, default=2010)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def session() -> requests.Session:
    current = getattr(THREAD_STATE, "session", None)
    if current is None:
        current = requests.Session()
        current.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/140 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Upgrade-Insecure-Requests": "1",
        })
        THREAD_STATE.session = current
    return current


def fetch(url: str) -> str:
    last_error = None
    for attempt in range(4):
        try:
            response = session().get(url, timeout=30)
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            if "text/html" not in response.headers.get("content-type", ""):
                raise RuntimeError(f"Unexpected content type: {response.headers.get('content-type')}")
            time.sleep(0.12)
            return response.text
        except Exception as error:  # retry network and transient edge failures
            last_error = error
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def targets(db_path: Path, source_db_path: Path) -> list[str]:
    if source_db_path.exists():
        with sqlite3.connect(source_db_path) as connection:
            has_coverage = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='pit_financial_coverage'"
            ).fetchone()
            if has_coverage:
                return sorted(
                    {
                        str(row[0] or row[1]).upper()
                        for row in connection.execute(
                            """
                            SELECT source_ticker, ticker
                            FROM pit_financial_coverage
                            WHERE status IN ('covered', 'annual_only')
                            """
                        )
                    }
                )
    with sqlite3.connect(db_path) as connection:
        return [
            str(row[0]).upper()
            for row in connection.execute(
                "SELECT ticker FROM valuation_ticker_snapshots ORDER BY ticker"
            )
        ]


def listing_urls(ticker: str, start_year: int) -> list[str]:
    symbol = ticker.lower()
    url = f"{BASE_URL}/stocks/{symbol}/transcripts/"
    html = fetch(url)
    candidates = set(re.findall(
        rf'href="(/stocks/{re.escape(symbol)}/transcripts/[^"/]*-q[1-4]-20\d{{2}}/)"',
        html,
        re.I,
    ))
    return sorted(
        urljoin(BASE_URL, path)
        for path in candidates
        if int(re.search(r"(20\d{2})/", path).group(1)) >= start_year
    )


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def transcript_payload(ticker: str, url: str) -> tuple[str, str]:
    soup = BeautifulSoup(fetch(url), "html.parser")
    heading = soup.find("h1", string=re.compile(r"Earnings Call", re.I))
    if heading is None:
        raise RuntimeError("Earnings-call heading missing")
    match = re.search(r"Earnings Call:\s*(Q[1-4])\s*(20\d{2})", clean(heading.get_text(" ")))
    if not match:
        raise RuntimeError("Fiscal period missing")
    period = f"{match.group(1).upper()}{match.group(2)}"
    date_node = heading.find_next("p")
    event_date = dt.datetime.strptime(clean(date_node.get_text(" ")), "%b %d, %Y").date().isoformat()
    article = soup.find(attrs={"role": "article", "aria-label": "Full transcript"})
    if article is None:
        raise RuntimeError("Full transcript article missing")
    sections = []
    for block in article.find_all("div", recursive=False):
        direct_divs = block.find_all("div", recursive=False)
        paragraphs = block.find_all("p", recursive=False)
        if not direct_divs or not paragraphs:
            continue
        speaker = clean(direct_divs[0].get_text(" "))
        role = clean(direct_divs[1].get_text(" ")) if len(direct_divs) > 1 else ""
        body = "\n\n".join(clean(node.get_text(" ")) for node in paragraphs if clean(node.get_text(" ")))
        if not speaker or not body:
            continue
        label = f"{speaker} — {role}" if role else speaker
        sections.append(f"{label}\n{body}")
    if not sections:
        raise RuntimeError("Transcript speaker sections missing")
    company = clean(soup.title.get_text(" ")).split(" Earnings Call")[0] if soup.title else ticker
    text = f"{company} ({ticker})\nEarnings Call: {period[:2]} {period[2:]}\n{event_date}\n{url}\n\n"
    text += "\n\n---\n\n".join(sections) + "\n"
    slug = url.rstrip("/").split("/")[-1]
    return f"earnings_{ticker}_{period}_{slug}.txt", text


def sync_ticker(ticker: str, root: Path, start_year: int, overwrite: bool) -> dict:
    if ticker in SKIP_TICKERS or "." in ticker:
        return {"ticker": ticker, "status": "external_or_derived", "discovered": 0, "downloaded": 0, "existing": 0}
    directory = root / ticker
    directory.mkdir(parents=True, exist_ok=True)
    try:
        urls = listing_urls(ticker, start_year)
    except Exception as error:
        return {"ticker": ticker, "status": "listing_error", "error": str(error), "discovered": 0, "downloaded": 0, "existing": 0}
    downloaded = 0
    existing = 0
    errors = []
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        known = list(directory.glob(f"*_{slug}.txt"))
        if known and not overwrite:
            existing += 1
            continue
        try:
            filename, text = transcript_payload(ticker, url)
            (directory / filename).write_text(text, encoding="utf-8")
            downloaded += 1
        except Exception as error:
            errors.append({"url": url, "error": str(error)})
    return {
        "ticker": ticker,
        "status": "complete" if not errors else "partial",
        "discovered": len(urls),
        "downloaded": downloaded,
        "existing": existing,
        "errors": errors[:5],
    }


def main():
    args = parse_args()
    wanted = (
        [ticker.upper() for ticker in args.tickers]
        if args.tickers
        else targets(args.target_db, args.source_db)
    )
    args.root.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(sync_ticker, ticker, args.root, args.start_year, args.overwrite): ticker
            for ticker in wanted
        }
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps(result, ensure_ascii=True), flush=True)
    summary = {
        "tickers": len(results),
        "discovered": sum(item.get("discovered", 0) for item in results),
        "downloaded": sum(item.get("downloaded", 0) for item in results),
        "existing": sum(item.get("existing", 0) for item in results),
        "status": {status: sum(item["status"] == status for item in results) for status in sorted({item["status"] for item in results})},
    }
    print(json.dumps({"summary": summary}, indent=2), flush=True)


if __name__ == "__main__":
    main()
