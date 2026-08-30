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
import os
import re
import sqlite3
from pathlib import Path


DEFAULT_TRANSCRIPT_ROOT = Path(
    os.environ.get(
        "PIT_EARNINGS_TRANSCRIPT_ROOT",
        Path.home() / "Documents/youtube_transcript_db/earnings_transcripts",
    )
)
DEFAULT_TARGET_DB = Path("server/data/guru-analysis.sqlite")
DEFAULT_SOURCE_DB = Path("server/data/valuation-pit-source.sqlite")
EXTRACTION_VERSION = "pit-guidance-rules-v17-structural-binding-2026-08-30"

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
    r"(?:the |our )?(?:high end of |low end of )?(?:the |our )?"
    r"(?:prior |previous )?(?:guidance|outlook)\b|"
    r"\b(?:came in|was|were|delivered|recorded|generated).*\b(?:guidance|expectation)\b|"
    r"\bguidance (?:we )?(?:provided|gave|issued) (?:last|in the prior)|"
    r"\b(?:projections?|guidance) we gave\b|"
    r"\bmet\b[^.]{0,100}\b(?:guidance|outlook)\b|"
    r"\b(?:last|prior|previous) (?:year|quarter)\b[^.]{0,100}\b(?:was|were|had|included|represented|contributed)\b",
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
SHARED_SCALE_RANGE_RE = re.compile(
    r"(?:(?P<left_direction>down|negative|minus|up|positive|plus)\s+)?"
    r"(?P<left_currency>US\$|\$|£|€)?\s*(?P<left>\d[\d,]*(?:\.\d+)?)\s*"
    r"(?P<connector>to|through|[-–—])\s*"
    r"(?:(?P<right_direction>down|negative|minus|up|positive|plus)\s+)?"
    r"(?P<right_currency>US\$|\$|£|€)?\s*(?P<right>\d[\d,]*(?:\.\d+)?)\s*"
    r"(?P<scale>billion|million|thousand|bn|mm|mn|m)\b",
    re.I,
)
PERCENT_RE = re.compile(r"(?<![\w.])(?P<value>\d+(?:\.\d+)?)\s*%")
PLUS_MINUS_RE = re.compile(
    r"(?:Â\s*)?±|\+/\-|\+\s+or\s+-|plus\s+or\s+minus",
    re.I,
)
NON_GUIDANCE_AMOUNT_OWNER_RE = re.compile(
    r"\b(?:costs?|expenses?|savings?|charges?|synergies?|tax expense|"
    r"depreciation and amortization|depreciation|amortization|d\s*&\s*a|"
    r"general and administrative|g\s*&\s*a|freight|foreign exchange|fx|currency headwind|"
    r"debt|dividends?|shareholder returns?|returns? to shareholders?|"
    r"diluted share count|share count|shares|share repurchases?|cash balance|cash on hand|"
    r"available borrowings|liquidity)\b",
    re.I,
)
HISTORICAL_AMOUNT_LEAD_RE = re.compile(
    r"\b(?:came in(?: at)?|grew to|increased to|decreased to|declined to|rose to|"
    r"fell to|reached)\b"
    r"[^,.;]{0,100}?(?:approximately|about|roughly|around|nearly|over|more than|"
    r"less than|at least|of|at|to)?\s*$|"
    r"\b(?:we|they|it|the company|the business|the segment)\s+"
    r"(?:delivered|reported|recorded|generated|achieved)\b[^,.;]{0,100}"
    r"(?:approximately|about|roughly|around|nearly|over|more than|less than|"
    r"at least|of|at|to)?\s*$|"
    r"\b(?:we|the company|the business)\s+closed\b[^,.;]{0,100}\b(?:with|at|of)\s*$|"
    r"\brecord\s+(?:revenue|revenues|sales|earnings|income|cash flow)\s+of\s*$|"
    r"\b(?:net loss|net income|revenue|revenues|sales|operating income|operating profit|"
    r"free cash flow)\b[^,.;]{0,100}\b(?:was|were)\s*$",
    re.I,
)
HISTORICAL_ACRONYM_AMOUNT_LEAD_RE = re.compile(
    r"\b[A-Z][A-Z0-9&.-]{1,9}\s+(?:delivered|reported|recorded|generated|achieved)\b"
    r"[^,.;]{0,100}(?:approximately|about|roughly|around|nearly|over|more than|"
    r"less than|at least|of|at|to)?\s*$"
)
HISTORICAL_AMOUNT_TRAIL_RE = re.compile(
    r"^[^.;]{0,120}\b(?:we|the company|the business)?\s*"
    r"(?:delivered|reported|recorded|generated|achieved)\b",
    re.I,
)
HISTORICAL_COMPARISON_LEAD_RE = re.compile(
    r"\b(?:versus|compared (?:with|to)|relative to|from|what)\b[^.;]{0,120}$",
    re.I,
)
STRICT_FORWARD_VALUE_RE = re.compile(
    r"\bwe\b[^.;]{0,80}\b(?:expect|anticipate|forecast|project|target|intend|plan)\b|"
    r"\b(?:is|are) expected to\b|"
    r"\b(?:raise|raised|raising|lower|lowered|lowering|reaffirm|reaffirmed|"
    r"reaffirming|update|updated|updating|maintain|maintained|maintaining)\b"
    r"[^.;]{0,80}\bguidance\b|"
    r"\b(?:target|goal|plan) of\b",
    re.I,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transcript-root", type=Path, default=DEFAULT_TRANSCRIPT_ROOT)
    parser.add_argument("--target-db", type=Path, default=DEFAULT_TARGET_DB)
    parser.add_argument("--source-db", type=Path, default=DEFAULT_SOURCE_DB)
    return parser.parse_args()


def target_tickers(db_path: Path, source_db_path: Path) -> list[tuple[str, str]]:
    if source_db_path.exists():
        with sqlite3.connect(source_db_path) as connection:
            has_coverage = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='pit_financial_coverage'"
            ).fetchone()
            if has_coverage:
                return [
                    (str(row[0]).upper(), str(row[1] or row[0]).upper())
                    for row in connection.execute(
                        """
                        SELECT ticker, source_ticker
                        FROM pit_financial_coverage
                        WHERE status IN ('covered', 'annual_only')
                        ORDER BY ticker
                        """
                    )
                ]
    with sqlite3.connect(db_path) as connection:
        return [
            (str(row[0]).upper(), SOURCE_ALIASES.get(str(row[0]).upper(), str(row[0]).upper()))
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
    ("operating_cash_flow_guidance", re.compile(r"operating cash flow|cash from operations", re.I)),
    ("capex_guidance", re.compile(r"capital expenditure|capital spending|capital investments?|\bcapex\b", re.I)),
    ("gross_margin", re.compile(r"gross margin", re.I)),
    ("operating_margin", re.compile(r"operating margin", re.I)),
    ("ebitda_guidance", re.compile(r"(?:adjusted )?ebitda", re.I)),
    ("operating_income_guidance", re.compile(r"operating income|income from operations|operating profit|(?:adjusted )?\bebit\b", re.I)),
    ("net_income_guidance", re.compile(r"(?:adjusted )?net income", re.I)),
    ("eps_guidance", re.compile(r"earnings per share|\beps\b", re.I)),
    ("revenue_guidance", re.compile(r"revenue|sales", re.I)),
    ("backlog_guidance", re.compile(r"remaining performance obligation|\brpo\b|backlog|bookings|billings|\barr\b", re.I)),
)


def metric_names(sentence: str) -> list[tuple[str, int]]:
    matches = []
    for name, pattern in METRIC_PATTERNS:
        for match in pattern.finditer(sentence):
            matches.append((name, match.start()))
    return sorted(matches, key=lambda item: item[1])


ANNUAL_SCOPE_RE = re.compile(
    r"full[- ]year|fiscal year|this year|annual|for the year|"
    r"\bfy\s*(?:20)?\d{2}\b|"
    r"(?:outlook|guidance) for (?:fiscal )?20\d{2}|for (?:fiscal )?20\d{2}",
    re.I,
)
QUARTER_SCOPE_RE = re.compile(
    r"\bq[1-4](?:\s+(?:fy|fiscal year)\s*(?:20)?\d{2})?\b|"
    r"\b(?:first|second|third|fourth)\s+quarter"
    r"(?:\s+of\s+(?:(?:fiscal|calendar)\s+year\s+|fy\s*)?20\d{2})?\b|"
    r"\b(?:january|february|march|april|may|june|july|august|september|"
    r"october|november|december)\s+quarter\b|"
    r"\bnext quarter\b|\bfor the quarter\b",
    re.I,
)
MULTI_YEAR_SCOPE_RE = re.compile(
    r"\bby (?:the end of )?20\d{2}\b|\bthrough 20\d{2}\b|"
    r"\bover the (?:next )?(?:two|three|four|five|six|seven|eight|nine|ten|\d+)[ -]years?\b|"
    r"\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)[ -]year (?:target|plan|period)\b|"
    r"\b(?:annualized )?(?:revenue|sales) run rate\b|\b(?:revenue|sales) cagr\b|"
    r"\brevenue stream by 20\d{2}\b",
    re.I,
)
REVENUE_SUBSET_RE = re.compile(
    r"\b(?:commercial|government|international|segment|services?|subscription|product|"
    r"software|semiconductor|data[ -]center|cloud|advertising|digital|licen[cs]e|"
    r"maintenance|aftermarket|consumer|enterprise|domestic|overseas|regional|"
    r"systemwide|same[- ]store|comparable[- ]store|professional services?|"
    r"installed base management|systems?|other|packaging|china|dram|foundry(?: logic)?|"
    r"retail(?: long-term care)?|\d{2,4}g)\s+"
    r"(?:revenue|revenues|sales)\b|"
    r"\brevenue from (?:these|the) contracts\b|\bannual recurring revenue\b|\barr\b",
    re.I,
)
REVENUE_NON_COMPANY_RE = re.compile(
    r"\b(?:asset|property|land|home|portfolio) sales\b|"
    r"\b(?:addressable|global|industry|nand|semiconductor) market\b[^.]{0,100}\brevenue\b|"
    r"\bmarket (?:revenue|revenues|sales)\b|\b(?:revenue|sales) (?:stream|opportunity|pool)\b|"
    r"\b(?:annualized )?(?:revenue|sales) run rate\b|"
    r"\b(?:capital expenditures?|capital spending|capex)\b[^.]{0,100}"
    r"\b\d+(?:\.\d+)?%\s+of\s+(?:total\s+)?revenue\b",
    re.I,
)
REVENUE_DELTA_RE = re.compile(
    r"\b(?:incremental|additional|acquisition-related)\s+(?:revenue|revenues|sales)\b|"
    r"\b(?:lose|lost|forgo|forego)\s+(?:revenue|revenues|sales)\b|"
    r"\b(?:revenue|revenues|sales)[ -](?:related )?(?:impact|headwind|benefit|contribution)s?\b|"
    r"\bcontribut(?:e|es|ed|ing)\b[^.]{0,100}\b(?:revenue|revenues|sales)\b|"
    r"\b(?:contribute|add|reduce|increase|decrease|impact)\b[^.]{0,90}"
    r"\b(?:revenue|revenues|sales)\b[^.]{0,40}\b(?:by|of|from)\b|"
    r"\b(?:impact|effect)s?\b[^.]{0,100}\b(?:on|to)\s+(?:reported\s+)?"
    r"(?:revenue|revenues|sales)\b|"
    r"\b(?:fx|foreign exchange|currency)\b.{0,120}?\b(?:impact|headwind|benefit)s?\b"
    r".{0,80}?\b(?:in|on|to)\s+(?:reported\s+)?(?:revenue|revenues|sales)\b",
    re.I,
)
REVENUE_ACRONYM_SUBSET_RE = re.compile(
    r"\b(?P<name>[A-Z]{2,8})\s+(?:revenue|revenues|sales)\b"
)
REVENUE_STRONG_TOTAL_RE = re.compile(
    r"\b(?:total company|company|consolidated)\s+(?:revenue|revenues|sales)\b",
    re.I,
)
REVENUE_WEAK_TOTAL_RE = re.compile(
    r"\b(?:total|net)\s+(?:revenue|revenues|sales)\b",
    re.I,
)
GUIDANCE_COMPANY_TOTAL_RE = re.compile(
    r"\b(?:total(?: company)?|consolidated|enterprise|aggregate company|company-wide)\b|"
    r"\bcompany\s+(?:adjusted\s+)?(?:operating income|operating profit|free cash flow|fcf)\b",
    re.I,
)


def nearest_subject_match(sentence: str, metric_position: int,
                          candidates: list[tuple[str, re.Pattern, int, bool]],
                          max_distance: int = 140) -> tuple[str, str] | None:
    """Return the closest subject marker for one metric occurrence.

    Transcript sentences often contain both a company-wide guide and a segment
    guide.  Whole-sentence precedence therefore mislabels one of them.  Direct
    phrases such as ``total revenue`` or ``data center revenue`` receive a small
    specificity advantage only after distance to the selected occurrence.
    """
    ranked = []
    for subject, pattern, specificity, require_overlap in candidates:
        for match in pattern.finditer(sentence):
            overlaps = match.start() <= metric_position < match.end()
            if require_overlap and not overlaps:
                continue
            if overlaps:
                distance = 0
            else:
                distance = min(
                    abs(metric_position - match.start()),
                    abs(metric_position - match.end()),
                )
            if distance <= max_distance:
                ranked.append((distance, specificity, subject, match.group(0)))
    if not ranked:
        return None
    _, _, subject, evidence = min(ranked, key=lambda item: (item[0], item[1]))
    return subject, evidence
GUIDANCE_SUBSET_RE = re.compile(
    r"\b(?:segment|division|business unit|business area)\b|"
    r"\b(?:our|the|reporting|business) segments\b|"
    r"\bfrom (?:our |the )?discontinued operations?\b",
    re.I,
)
GUIDANCE_NON_PERIODIC_RE = re.compile(
    r"\b(?:cumulative|aggregate(?! company))\b[^.]{0,80}\b(?:cash flow|fcf)\b|"
    r"\bfinancial capacity\b|\b(?:cost )?savings?\b|\bshare repurchases?\b|"
    r"\b(?:increase|decrease|improve|reduce|lower|impact|change|raise|raising|add)\b"
    r"[^.]{0,120}\b(?:operating income|operating profits?|free cash flow|fcf|ebit)\b"
    r"[^.]{0,35}\bby\b|"
    r"\b(?:operating income|operating profits?|free cash flow|fcf|ebit)\b"
    r"[^.]{0,80}\b(?:increase|decrease|improve|reduce|lower|impact|change|add)\b"
    r"[^.]{0,35}\bby\b|"
    r"\b(?:operating income|operating profits?) guarantees?\b|"
    r"\b(?:incremental|additional)\s+(?:operating income|operating profits?|free cash flow|fcf|ebit)\b|"
    r"\b(?:raise|raising|increase|decrease|reduce|add)\b[^.]{0,100}\bby\b"
    r"[^.]{0,100}\b(?:operating income|operating profits?|free cash flow|fcf|ebit)\b",
    re.I,
)
GUIDANCE_DRIVER_IMPACT_RE = re.compile(
    r"\b(?:impact|effect)s?\b[^.]{0,100}\b(?:on|to)\s+(?:reported\s+)?"
    r"(?:revenue|revenues|sales|ebit|ebitda|operating income|operating profits?|"
    r"free cash flow|fcf)\b(?:\s+and\s+(?:ebit|ebitda|operating income|"
    r"operating profits?|free cash flow|fcf))?",
    re.I,
)
GUIDANCE_LEVEL_REVISION_RE = re.compile(
    r"\b(?:increase|increasing|raise|raising|raised|decrease|decreasing|lower|"
    r"lowering|lowered)\b[^.;]{0,100}\b(?:revenue|revenues|sales|free cash flow|"
    r"fcf|operating income|operating profit|ebit|ebitda|capex|capital expenditures?)\b"
    r"[^.;]{0,80}\bby\b[^.;]{0,70}\bto\b",
    re.I,
)


def nearest_scope(sentence: str, positions: list[int]) -> tuple[str | None, str | None]:
    """Classify scope using the marker nearest the selected metric value.

    A sentence can contain both a full-year amount and a later quarterly amount.
    Whole-sentence scope detection therefore assigns the wrong horizon; the selected
    value position is the point of reference instead.
    """
    if not positions:
        return None, None
    target = sum(positions) / len(positions)
    candidates = []
    quarter_matches = list(QUARTER_SCOPE_RE.finditer(sentence))
    for scope, pattern in (
        ("quarter", QUARTER_SCOPE_RE),
        ("full_year", ANNUAL_SCOPE_RE),
        ("multi_year_target", MULTI_YEAR_SCOPE_RE),
    ):
        for match in pattern.finditer(sentence):
            if scope == "full_year" and any(
                match.start() < quarter.end() and match.end() > quarter.start()
                for quarter in quarter_matches
            ):
                continue
            center = (match.start() + match.end()) / 2
            priority = {"quarter": 0, "full_year": 1, "multi_year_target": 2}[scope]
            candidates.append((abs(center - target), priority, scope, match.group(0)))
    if not candidates:
        return None, None
    distance, _, scope, evidence = min(candidates, key=lambda item: (item[0], item[1]))
    if distance > 220:
        return None, None
    return scope, evidence


def revenue_guidance_subject(sentence: str, metric_position: int) -> tuple[str, str]:
    """Classify the specific revenue occurrence, not the full sentence."""
    start = max(0, metric_position - 140)
    end = min(len(sentence), metric_position + 90)
    local = sentence[start:end]
    driver_impact = nearest_subject_match(
        sentence,
        metric_position,
        [("non_company_or_non_periodic", GUIDANCE_DRIVER_IMPACT_RE, 0, True)],
    )
    if driver_impact:
        return driver_impact
    direct = nearest_subject_match(
        sentence,
        metric_position,
        [
            ("non_company_or_non_periodic", REVENUE_NON_COMPANY_RE, 0, True),
            ("segment_or_subset", REVENUE_SUBSET_RE, 0, True),
            ("non_company_or_non_periodic", REVENUE_DELTA_RE, 1, True),
            ("company_total", REVENUE_STRONG_TOTAL_RE, 0, True),
        ],
    )
    if direct:
        return direct
    nearby_segment = nearest_subject_match(
        sentence,
        metric_position,
        [("segment_or_subset", GUIDANCE_SUBSET_RE, 0, False)],
    )
    if nearby_segment:
        return nearby_segment
    weak_company_total = nearest_subject_match(
        sentence,
        metric_position,
        [("company_total", REVENUE_WEAK_TOTAL_RE, 0, True)],
    )
    if weak_company_total:
        return weak_company_total
    acronym_subset = REVENUE_ACRONYM_SUBSET_RE.search(local)
    if acronym_subset and acronym_subset.group("name") not in {"FY", "GAAP", "IFRS"}:
        return "segment_or_subset", acronym_subset.group(0)
    return "company_total_or_unspecified", local.strip()


def classify_guidance_subject(sentence: str, metric: str, metric_position: int) -> tuple[str, str]:
    if metric == "revenue_guidance":
        return revenue_guidance_subject(sentence, metric_position)
    start = max(0, metric_position - 140)
    end = min(len(sentence), metric_position + 160)
    local = sentence[start:end]
    driver_impact = nearest_subject_match(
        sentence,
        metric_position,
        [("non_company_or_non_periodic", GUIDANCE_DRIVER_IMPACT_RE, 0, True)],
    )
    if driver_impact:
        return driver_impact
    level_revision = next(
        (
            match for match in GUIDANCE_LEVEL_REVISION_RE.finditer(sentence)
            if match.start() <= metric_position < match.end()
        ),
        None,
    )
    non_periodic = GUIDANCE_NON_PERIODIC_RE.search(sentence) if not level_revision else None
    if non_periodic:
        return "non_company_or_non_periodic", non_periodic.group(0)
    direct = nearest_subject_match(
        sentence,
        metric_position,
        [
            ("segment_or_subset", GUIDANCE_SUBSET_RE, 0, False),
            ("segment_or_subset", REVENUE_SUBSET_RE, 1, False),
            ("company_total", GUIDANCE_COMPANY_TOTAL_RE, 0, False),
        ],
    )
    if direct:
        return direct
    return "company_total_or_unspecified", local.strip()


def amount_values(sentence: str):
    sentence = sentence.replace("Â±", " ±")
    values = []
    shared_range_spans = []
    for match in SHARED_SCALE_RANGE_RE.finditer(sentence):
        left_number = float(match.group("left").replace(",", ""))
        if (
            not match.group("left_currency")
            and left_number.is_integer()
            and 1900 <= left_number <= 2100
        ):
            # ``fiscal year 2025 to $1.4 billion`` is a date followed by an
            # amount, not a 2025-to-1.4 monetary range with a shared scale.
            continue
        scale = match.group("scale").lower()
        multiplier = 1000.0 if scale in {"billion", "bn"} else 1.0
        if scale == "thousand":
            multiplier = 0.001
        symbol = match.group("left_currency") or match.group("right_currency") or ""
        currency = {"£": "GBP", "€": "EUR"}.get(symbol, "USD" if "$" in symbol else None)
        left_sign = -1 if (match.group("left_direction") or "").lower() in {"down", "negative", "minus"} else 1
        right_sign = -1 if (match.group("right_direction") or "").lower() in {"down", "negative", "minus"} else 1
        left_start = (
            match.start("left_direction")
            if match.group("left_direction")
            else match.start("left_currency") if match.group("left_currency") else match.start("left")
        )
        right_start = (
            match.start("right_direction")
            if match.group("right_direction")
            else match.start("right_currency") if match.group("right_currency") else match.start("right")
        )
        values.extend([
            {
                "value": left_sign * left_number * multiplier,
                "currency": currency,
                "text": sentence[left_start:match.end("left")].strip(),
                "position": left_start,
                "end": match.end("left"),
            },
            {
                "value": right_sign * float(match.group("right").replace(",", "")) * multiplier,
                "currency": currency,
                "text": sentence[right_start:match.end()].strip(),
                "position": right_start,
                "end": match.end(),
            },
        ])
        shared_range_spans.append((match.start(), match.end()))
    for match in AMOUNT_RE.finditer(sentence):
        if any(start <= match.start() and match.end() <= end for start, end in shared_range_spans):
            continue
        raw = float(match.group("value").replace(",", ""))
        scale = match.group("scale").lower()
        multiplier = 1000.0 if scale in {"billion", "bn"} else 1.0
        if scale == "thousand":
            multiplier = 0.001
        symbol = match.group("currency") or ""
        currency = {"£": "GBP", "€": "EUR"}.get(symbol, "USD" if "$" in symbol else None)
        direction = sentence[max(0, match.start() - 18):match.start()]
        sign = -1 if re.search(r"\b(?:down|negative|minus)\s*$", direction, re.I) else 1
        values.append({
            "value": sign * raw * multiplier,
            "currency": currency,
            "text": match.group(0).strip(),
            "position": match.start(),
            "end": match.end(),
        })
    return sorted(values, key=lambda value: value["position"])


def percentage_values(sentence: str):
    sentence = sentence.replace("Â±", " ±")
    return [
        {"value": float(match.group("value")), "position": match.start(), "end": match.end()}
        for match in PERCENT_RE.finditer(sentence)
    ]


def is_historical_actual_amount(value: dict, sentence: str) -> bool:
    """Return true when a quoted amount is an actual or comparison base.

    Calls often combine an actual and a forward guide in one sentence.  The
    sentence-level forward-language gate is therefore insufficient: each
    amount must be classified in its own local clause before metric binding.
    """
    position = int(value.get("position", 0))
    end = int(value.get("end", position))
    left = sentence[max(0, position - 180):position]
    right = sentence[end:min(len(sentence), end + 140)]
    if HISTORICAL_AMOUNT_LEAD_RE.search(left) or HISTORICAL_ACRONYM_AMOUNT_LEAD_RE.search(left):
        return True
    if HISTORICAL_COMPARISON_LEAD_RE.search(left) and HISTORICAL_AMOUNT_TRAIL_RE.search(right):
        return True
    if HISTORICAL_COMPARISON_LEAD_RE.search(left) and re.search(
        r"\b(?:last|prior|previous)\s+(?:year|quarter|period)\b",
        right,
        re.I,
    ):
        return True
    if re.search(r"\bachieving\b[^.;]{0,100}$", left, re.I):
        local = sentence[max(0, position - 220):min(len(sentence), end + 120)]
        if not STRICT_FORWARD_VALUE_RE.search(local):
            return True
    return False


def non_guidance_owned_amount_positions(values: list[dict], sentence: str) -> set[int]:
    """Identify amounts owned by costs, savings, shares, or liquidity.

    The owner can precede an amount (``costs of $20 million``) or follow an
    explicit range (``$50-$60 million in underutilization costs``).  In the
    latter form both endpoints must be excluded from the company metric.
    """
    ordered = sorted(values, key=lambda value: value["position"])
    excluded: set[int] = set()
    for owner in NON_GUIDANCE_AMOUNT_OWNER_RE.finditer(sentence):
        prior = [value for value in ordered if value.get("end", value["position"]) <= owner.start()]
        if not prior:
            continue
        right = prior[-1]
        connector = sentence[right.get("end", right["position"]):owner.start()]
        if not re.fullmatch(
            r"\s*(?:(?:of|in|for|from|to)\s+(?:[A-Za-z-]+\s+){0,6}|"
            r"between(?:\s+(?:our|the))?|related to|associated with)?\s*",
            connector,
            re.I,
        ):
            continue
        excluded.add(int(right["position"]))
        if len(prior) < 2:
            continue
        left = prior[-2]
        between = sentence[left.get("end", left["position"]):right["position"]]
        prefix = sentence[max(0, left["position"] - 80):left["position"]]
        explicit_range = bool(
            re.search(r"\b(?:to|through)\b|[-–—]", between, re.I)
            or (
                re.search(r"\band\b", between, re.I)
                and re.search(r"\bbetween\b|\brange(?:d)?(?:\s+of)?\b", prefix, re.I)
            )
        )
        if explicit_range and owner.start() - left.get("end", left["position"]) <= 140:
            excluded.add(int(left["position"]))
    return excluded


def preceding_non_guidance_owner_positions(values: list[dict], sentence: str) -> list[int]:
    """Return owner markers that directly introduce a following amount.

    Merely mentioning an excluded expense is not enough.  For example, the
    amount in ``operating income, which excludes expense, to be $300m`` still
    belongs to operating income because the comma closes the expense phrase.
    """
    ordered = sorted(values, key=lambda value: value["position"])
    positions = []
    for owner in NON_GUIDANCE_AMOUNT_OWNER_RE.finditer(sentence):
        following = [value for value in ordered if value["position"] >= owner.end()]
        if not following:
            continue
        value = following[0]
        connector = sentence[owner.end():value["position"]]
        if len(connector) > 100 or re.search(r"[,.;]", connector):
            continue
        direct_quantity = re.fullmatch(
            r"\s*(?:(?:of|at|to|between|in(?: a)? range(?: of)?|was|were|is|are|"
            r"will be|to be|expected to be|projected to be|forecast to be)\s+)?"
            r"(?:(?:approximately|about|roughly|around|north of|over|under)\s+)?",
            connector,
            re.I,
        )
        dated_repurchase_total = (
            re.search(r"share repurchases?", owner.group(0), re.I)
            and re.search(r"\bto\s*$", connector, re.I)
        )
        if not direct_quantity and not dated_repurchase_total:
            continue
        positions.append(owner.start())
    return positions


def direct_following_metric_owner(value: dict, metric_positions: list[int],
                                  sentence: str) -> int | None:
    following = [position for position in metric_positions if position > value["position"]]
    if not following:
        return None
    nearest = min(following)
    connector = sentence[value.get("end", value["position"]):nearest]
    if len(connector) > 45:
        return None
    if re.fullmatch(
        r"\s*(?:(?:of|in|for|from|as)\s+)?(?:approximately\s+)?",
        connector,
        re.I,
    ):
        return nearest
    return None


def values_owned_by_metric(values: list[dict], metric_position: int,
                           all_metrics: list[tuple[str, int]],
                           value_kind: str = "amount",
                           sentence: str = "") -> list[dict]:
    if value_kind == "amount":
        historical_positions = {
            int(value["position"])
            for value in values
            if is_historical_actual_amount(value, sentence)
        }
        non_guidance_positions = non_guidance_owned_amount_positions(values, sentence)
        values = [
            value for value in values
            if int(value["position"]) not in historical_positions | non_guidance_positions
        ]
        ineligible = {"gross_margin", "operating_margin", "eps_guidance"}
        eligible_metrics = sorted(
            ((name, position) for name, position in all_metrics if name not in ineligible),
            key=lambda item: item[1],
        )
    else:
        eligible_metrics = sorted(all_metrics, key=lambda item: item[1])
    eligible_positions = [position for _, position in eligible_metrics]
    owner_only_positions = (
        preceding_non_guidance_owner_positions(values, sentence)
        if value_kind == "amount"
        else []
    )
    all_metric_positions = sorted(set(eligible_positions + owner_only_positions)) or sorted(
        position for _, position in all_metrics
    )
    ordered_values = sorted(values, key=lambda value: value["position"])
    first_value_position = ordered_values[0]["position"] if ordered_values else None
    leading_metrics = [
        (name, position)
        for name, position in eligible_metrics
        if first_value_position is not None and position < first_value_position
    ]
    leading_positions = [position for _, position in leading_metrics]
    simple_parallel_values = (
        len(ordered_values) >= 2
        and all(
            re.fullmatch(
                r"\s*,?\s*(?:and\s+)?",
                sentence[left.get("end", left["position"]):right["position"]],
                re.I,
            )
            for left, right in zip(ordered_values, ordered_values[1:])
        )
    )
    if (
        metric_position in leading_positions
        and len(ordered_values) == len(leading_positions)
        and len(leading_positions) >= 2
        and len({name for name, _ in leading_metrics}) == len(leading_metrics)
        and leading_positions
        and (simple_parallel_values or re.search(r"\brespectively\b", sentence, re.I))
    ):
        # A later clause can mention a driver such as ``sales conversion``.
        # It must not break the explicit ``EBITDA and operating income are X
        # and Y, respectively`` pairing established before the first value.
        return [ordered_values[leading_positions.index(metric_position)]]
    range_owner_overrides: dict[int, int] = {}
    for left, right in zip(ordered_values, ordered_values[1:]):
        if not explicit_range_pair(left, right, sentence):
            continue
        owner = direct_following_metric_owner(right, all_metric_positions, sentence)
        if owner is None:
            preceding = [
                position for position in all_metric_positions
                if position <= left["position"]
            ]
            owner = max(preceding) if preceding else None
        if owner is not None:
            range_owner_overrides[int(left["position"])] = owner
            range_owner_overrides[int(right["position"])] = owner
    owned = []
    for value in values:
        override = range_owner_overrides.get(int(value["position"]))
        if override is not None:
            if override == metric_position:
                owned.append(value)
            continue
        preceding = [position for position in all_metric_positions if position <= value["position"]]
        nearest_preceding = max(preceding) if preceding else None
        following_owner = direct_following_metric_owner(value, all_metric_positions, sentence)
        if following_owner is not None:
            nearest = following_owner
        elif nearest_preceding is not None and value["position"] - nearest_preceding <= 160:
            nearest = nearest_preceding
        else:
            nearest = min(all_metric_positions, key=lambda position: abs(position - value["position"]))
        if nearest == metric_position:
            owned.append(value)
    return sorted(owned, key=lambda value: value["position"])


def plus_minus_center(values: list[dict], sentence: str,
                      metric_position: int | None = None) -> dict | None:
    """Return the quoted center in ``center +/- tolerance`` disclosures.

    The tolerance is not a second endpoint. Averaging both numbers turns
    ``$1.5 billion +/- $50 million`` into $775 million, so the center must be
    selected before ordinary range averaging.
    """
    normalized_sentence = sentence.replace("Â±", " ±")
    candidates = []
    for marker in PLUS_MINUS_RE.finditer(normalized_sentence):
        preceding = [value for value in values if value["position"] < marker.start()]
        if not preceding:
            continue
        center = max(preceding, key=lambda value: value["position"])
        between = normalized_sentence[center.get("end", center["position"]):marker.start()]
        if re.fullmatch(r"[\s,;:()]*", between):
            candidates.append(center)
    if not candidates:
        return None
    if metric_position is None:
        return candidates[0]
    return min(candidates, key=lambda value: abs(value["position"] - metric_position))


def revision_target_value(values: list[dict], sentence: str,
                          metric_position: int) -> dict | None:
    """Select the new level in ``raise by X to Y`` disclosures."""
    ordered = sorted(values, key=lambda value: value["position"])
    candidates = []
    for left, right in zip(ordered, ordered[1:]):
        connector = sentence[left.get("end", left["position"]):right["position"]]
        connector = re.sub(
            rf"(?:{RANGE_CURRENCY_TOKEN})\s*$",
            "",
            connector,
            flags=re.I,
        )
        if not re.fullmatch(
            rf"\s*to\s+(?:{RANGE_QUALIFIER}\s+)?",
            connector,
            re.I,
        ):
            continue
        prefix = sentence[max(0, left["position"] - 180):left["position"]]
        if not re.search(
            r"\b(?:increase|increasing|raise|raising|raised|decrease|decreasing|"
            r"lower|lowering|lowered)\b[^.;]{0,140}\bby\s*$",
            prefix,
            re.I,
        ):
            continue
        candidates.append((left, right))
    if not candidates:
        return None
    _, target = min(
        candidates,
        key=lambda pair: abs(pair[0]["position"] - metric_position),
    )
    return target


RANGE_CURRENCY_TOKEN = r"(?:USD|GBP|EUR|JPY|CNY|RMB|CAD|AUD|CHF|US\$|[$£€])"
RANGE_QUALIFIER = r"(?:about|approximately|roughly|around|nearly)"


def explicit_range_pair(left: dict, right: dict, sentence: str) -> bool:
    """Return true only when adjacent values are explicit endpoints."""
    between = sentence[left.get("end", left["position"]):right["position"]]
    prefix = sentence[max(0, left["position"] - 120):left["position"]]
    normalized = re.sub(
        rf"(?:{RANGE_CURRENCY_TOKEN})\s*$",
        "",
        between,
        flags=re.I,
    )
    if re.fullmatch(
        r"\s*[-–—]\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?",
        normalized,
        re.I,
    ):
        return True
    if re.fullmatch(
        r"\s*(?:to|through)\s*(?:(?:up|down|positive|negative|plus|minus)\s+)?",
        normalized,
        re.I,
    ):
        if not re.search(r"\bfrom\s*$", prefix, re.I):
            return True
        return bool(re.search(r"\b(?:range|guidance)\b[^.;]{0,60}\bfrom\s*$", prefix, re.I))
    if re.fullmatch(r"\s*(?:,?\s*and)\s*", normalized, re.I):
        introduced = re.search(
            rf"(?:\bbetween|\brange(?:d)?(?:\s+of)?)\s+"
            rf"(?:{RANGE_QUALIFIER}\s+)?(?:{RANGE_CURRENCY_TOKEN}\s*)?$",
            prefix,
            re.I,
        )
        if introduced:
            return True
    low_end = re.search(
        rf"\blow end\b[^.;]{{0,50}}\b(?:to|at|of)\s*"
        rf"(?:{RANGE_QUALIFIER}\s+)?(?:{RANGE_CURRENCY_TOKEN}\s*)?$",
        prefix,
        re.I,
    )
    high_end = re.fullmatch(
        r"\s*,?\s*(?:and\s+)?(?:(?:maintain|maintaining|keep|keeping|raise|raising|"
        r"lower|lowering|leave|leaving)\s+)?(?:the\s+|our\s+)?high end\b"
        r"[^.;]{0,35}\b(?:at|to|of)\s*",
        normalized,
        re.I,
    )
    return bool(low_end and high_end)


def explicit_range_values(values: list[dict], sentence: str,
                          metric_position: int) -> list[dict] | None:
    """Return two endpoints only when the text explicitly describes a range.

    Multiple monetary values joined by ``versus`` or ordinary prose are not a
    range and must never be averaged.  In those cases the value nearest the
    metric owns the guidance observation.
    """
    ordered = sorted(values, key=lambda value: value["position"])
    pairs = [
        (left, right)
        for left, right in zip(ordered, ordered[1:])
        if explicit_range_pair(left, right, sentence)
    ]
    if not pairs:
        return None
    return list(min(
        pairs,
        key=lambda pair: abs(
            ((pair[0]["position"] + pair[1]["position"]) / 2) - metric_position
        ),
    ))


def selected_guidance_values(values: list[dict], sentence: str,
                             metric_position: int) -> list[dict]:
    revised_level = revision_target_value(values, sentence, metric_position)
    if revised_level:
        return [revised_level]
    center = plus_minus_center(values, sentence, metric_position)
    if center:
        return [center]
    explicit_range = explicit_range_values(values, sentence, metric_position)
    if explicit_range:
        return explicit_range
    return [min(values, key=lambda value: abs(value["position"] - metric_position))]


def extract_event(ticker: str, period: str, observed_at: str, source_url: str,
                  file_path: Path, speaker: str, sentence: str, metric: str,
                  metric_position: int, all_metrics: list[tuple[str, int]]) -> dict:
    amounts = values_owned_by_metric(
        amount_values(sentence), metric_position, all_metrics, "amount", sentence
    )
    percentages = values_owned_by_metric(
        percentage_values(sentence), metric_position, all_metrics, "percentage", sentence
    )
    amount = None
    currency = None
    unit = None
    margin_pct = None
    growth_yoy = None
    value_text = sentence
    selected_values = []

    if amounts and metric not in {"gross_margin", "operating_margin", "eps_guidance"}:
        selected_amounts = selected_guidance_values(amounts, sentence, metric_position)
        selected_values = selected_amounts
        amount = sum(item["value"] for item in selected_amounts) / len(selected_amounts)
        currency = next((item["currency"] for item in selected_amounts if item["currency"]), None)
        unit = f"{currency or 'reported'} millions"
    if metric in {"gross_margin", "operating_margin"} and percentages:
        selected_percentages = selected_guidance_values(percentages, sentence, metric_position)
        selected_values = selected_percentages
        margin_pct = sum(item["value"] for item in selected_percentages) / len(selected_percentages)
    if metric == "revenue_guidance" and percentages and re.search(
        r"grow|growth|increase|up (?:approximately|about|roughly)?", sentence, re.I
    ):
        selected_percentages = selected_guidance_values(percentages, sentence, metric_position)
        if not selected_values:
            selected_values = selected_percentages
        growth_yoy = sum(item["value"] for item in selected_percentages) / len(selected_percentages)

    scope_positions = [metric_position] + [item["position"] for item in selected_values]
    guidance_scope, guidance_scope_evidence = nearest_scope(sentence, scope_positions)
    guidance_subject, guidance_subject_evidence = classify_guidance_subject(
        sentence, metric, metric_position
    )

    explicit = bool(re.search(r"\bguidance\b|\boutlook\b|we (?:expect|anticipate|forecast|project)", sentence, re.I))
    confidence = 0.94 if explicit and (amounts or percentages) else 0.84 if amounts or percentages else 0.72
    digest = hashlib.sha256(
        f"{ticker}|{period}|{observed_at}|{speaker}|{metric}|{metric_position}|{sentence}".encode()
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
        "guidance_scope": guidance_scope,
        "guidance_scope_evidence": guidance_scope_evidence,
        "guidance_subject": guidance_subject,
        "guidance_subject_evidence": guidance_subject_evidence,
        "metric_position": metric_position,
        "selected_values": selected_values,
    }


def deduplicate_sentence_events(events: list[dict]) -> list[dict]:
    """Remove repeated metric words without weighting the model by word count."""
    metrics_with_values = {
        event.get("metric_name")
        for event in events
        if any(event.get(field) is not None for field in ("amount", "growth_yoy", "margin_pct"))
    }
    unique = []
    seen = set()
    for event in events:
        if (
            event.get("metric_name") in metrics_with_values
            and all(event.get(field) is None for field in ("amount", "growth_yoy", "margin_pct"))
        ):
            continue
        key = (
            event.get("metric_name"),
            event.get("amount"),
            event.get("currency"),
            event.get("growth_yoy"),
            event.get("margin_pct"),
            event.get("guidance_scope"),
            event.get("guidance_subject"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(event)
    return unique


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
            sentence_events = []
            for metric, position in metrics:
                sentence_events.append(
                    extract_event(
                        ticker, period, observed_at, source_url, file_path, speaker,
                        sentence, metric, position, metrics
                    )
                )
            events.extend(deduplicate_sentence_events(sentence_events))
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
    targets = target_tickers(args.target_db, args.source_db)
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
        for ui_ticker, source_ticker in targets:
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
