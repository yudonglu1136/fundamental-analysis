#!/usr/bin/env python3
"""Stage, parse, extract, and store LSEG transcript research artifacts.

This script is intentionally local-first and conservative:
- It never modifies valuation inputs.
- It preserves original files and copies likely transcripts into a staged raw folder.
- It treats uploaded / third-party transcripts as research snapshots, not official
  company disclosure, unless the source can be verified.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_PYTHONLIBS = REPO_ROOT / ".pythonlibs"
if LOCAL_PYTHONLIBS.exists():
    sys.path.insert(0, str(LOCAL_PYTHONLIBS))

try:
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover - graceful fallback
    BeautifulSoup = None

try:
    from docx import Document
except Exception:  # pragma: no cover - graceful fallback
    Document = None

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - graceful fallback
    PdfReader = None


TRANSCRIPT_ROOT = REPO_ROOT / "data" / "local" / "lseg" / "transcripts"
RAW_ROOT = TRANSCRIPT_ROOT / "raw"
CURATED_ROOT = TRANSCRIPT_ROOT / "curated"
EXTRACTED_ROOT = TRANSCRIPT_ROOT / "extracted"
LOGS_ROOT = TRANSCRIPT_ROOT / "logs"
RAW_USER_UPLOADED = RAW_ROOT / "user_uploaded"
RAW_COMPANY_IR = RAW_ROOT / "company_ir"
RAW_STOCKANALYSIS = RAW_ROOT / "stockanalysis"
RAW_SEEKING_ALPHA = RAW_ROOT / "seeking_alpha"
RAW_MANUAL_EXPORTS = RAW_ROOT / "manual_exports"
CLEAN_TEXT_ROOT = CURATED_ROOT / "clean_text"
SQLITE_PATH = TRANSCRIPT_ROOT / "lseg_transcripts.sqlite"

INVENTORY_PATH = CURATED_ROOT / "source_file_inventory.json"
METADATA_PATH = CURATED_ROOT / "transcript_metadata.json"
JSONL_PATH = CURATED_ROOT / "transcripts.jsonl"

MANAGEMENT_COMMENTARY_PATH = EXTRACTED_ROOT / "management_commentary.json"
GUIDANCE_MENTIONS_PATH = EXTRACTED_ROOT / "guidance_mentions.json"
KPI_MENTIONS_PATH = EXTRACTED_ROOT / "kpi_mentions.json"
RISK_MENTIONS_PATH = EXTRACTED_ROOT / "risk_mentions.json"
CAPITAL_ALLOCATION_PATH = EXTRACTED_ROOT / "capital_allocation_mentions.json"
SEGMENT_MENTIONS_PATH = EXTRACTED_ROOT / "segment_mentions.json"
QA_TOPICS_PATH = EXTRACTED_ROOT / "qa_topics.json"
THESIS_SIGNALS_PATH = EXTRACTED_ROOT / "thesis_signals.json"
EVENT_SUMMARIES_PATH = EXTRACTED_ROOT / "transcript_event_summaries.json"
EXTRACTION_WARNINGS_PATH = EXTRACTED_ROOT / "extraction_warnings.json"

PARSE_RUN_SUMMARY_PATH = LOGS_ROOT / "parse_run_summary.json"

SUPPORTED_EXTENSIONS = {".txt", ".md", ".html", ".htm", ".pdf", ".docx", ".json", ".csv"}
DISCOVERY_KEYWORDS = (
    "lseg",
    "london stock exchange group",
    "transcript",
    "earnings call",
    "trading update",
    "preliminary results",
    "interim results",
    "capital markets day",
    "innovation forum",
    "webcast",
    "prepared remarks",
    "q&a",
)
TRANSCRIPT_TEXT_MARKERS = (
    "presentation transcript",
    "analyst & investor call transcript",
    "question and answer session",
    "corporate participants",
    "conference call participants",
    "prepared remarks",
)
MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
MONTH_ALIASES = {
    "january": "jan",
    "february": "feb",
    "march": "mar",
    "april": "apr",
    "june": "jun",
    "july": "jul",
    "august": "aug",
    "september": "sep",
    "october": "oct",
    "november": "nov",
    "december": "dec",
}
KNOWN_MANAGEMENT = {
    "David Schwimmer",
    "Michel-Alain Proch",
    "Peregrine Riviere",
    "Anna Manz",
    "Martin Brand",
    "Daniel Maguire",
    "Andrea Remyn Stone",
}
KNOWN_MANAGEMENT_ALIASES = sorted(KNOWN_MANAGEMENT)


@dataclass
class InventoryRecord:
    originalPath: str
    stagedPath: str | None
    fileName: str
    fileExtension: str
    fileSize: int
    modifiedTime: str
    detectedCompany: str | None
    detectedTicker: str | None
    detectedEventDate: str | None
    detectedFiscalPeriod: str | None
    detectedEventType: str | None
    detectedSource: str | None
    confidence: str
    warnings: list[str]
    isDuplicate: bool = False
    duplicateOf: str | None = None
    sha256: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    for path in [
        RAW_USER_UPLOADED,
        RAW_COMPANY_IR,
        RAW_STOCKANALYSIS,
        RAW_SEEKING_ALPHA,
        RAW_MANUAL_EXPORTS,
        CURATED_ROOT,
        CLEAN_TEXT_ROOT,
        EXTRACTED_ROOT,
        LOGS_ROOT,
    ]:
        path.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sanitize_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")


def extract_date_token(token: str) -> str | None:
    match = re.search(
        r"(\d{1,2})(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)(\d{4})",
        token.lower(),
    )
    if not match:
        return None
    day, month_code, year = match.groups()
    month_code = MONTH_ALIASES.get(month_code, month_code)
    month = MONTH_MAP[month_code]
    return f"{int(year):04d}-{month:02d}-{int(day):02d}"


def parse_date_from_text(text: str) -> str | None:
    match = re.search(
        r"(?:\bMONDAY|\bTUESDAY|\bWEDNESDAY|\bTHURSDAY|\bFRIDAY|\bSATURDAY|\bSUNDAY)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    day, month_name, year = match.groups()
    month = datetime.strptime(month_name[:3].title(), "%b").month
    return f"{int(year):04d}-{month:02d}-{int(day):02d}"


def normalize_fiscal_period(label: str) -> str | None:
    label = label.strip().upper().replace(" ", "")
    match = re.match(r"(Q[1-4]|H1|H2|FY)(\d{2,4})", label)
    if not match:
        return None
    prefix, year = match.groups()
    year_int = int(year)
    if year_int < 100:
        year_int += 2000
    return f"{prefix} {year_int}"


def detect_fiscal_period(filename: str, title_text: str = "") -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    combined = f"{filename}\n{title_text}"
    candidates = []
    for pattern in [
        r"\b(Q[1-4])[\s_-]*(\d{2,4})\b",
        r"\b(H1|H2)[\s_-]*(\d{2,4})\b",
        r"\bFY[\s_-]*(\d{2,4})\b",
        r"\b(\d{4})\s+full year results\b",
        r"\b(\d{4})\s+preliminary results\b",
    ]:
        for match in re.finditer(pattern, combined, flags=re.IGNORECASE):
            groups = match.groups()
            if len(groups) == 2:
                candidates.append(normalize_fiscal_period("".join(groups)))
            elif len(groups) == 1:
                candidates.append(normalize_fiscal_period(f"FY{groups[0]}"))
    candidates = [c for c in candidates if c]
    if not candidates:
        return None, warnings
    unique = []
    for candidate in candidates:
        if candidate not in unique:
            unique.append(candidate)
    if len(unique) > 1:
        warnings.append(f"Multiple fiscal-period candidates detected: {', '.join(unique)}.")
    return unique[0], warnings


def detect_event_type(filename: str, title_text: str = "") -> str | None:
    combined = f"{filename} {title_text}".lower()
    if "capital markets day" in combined:
        return "capital_markets_day"
    if "innovation forum" in combined:
        return "innovation_forum"
    if re.search(r"\bfy[\s_-]*\d{2,4}\s+results\b", combined):
        return "preliminary_results"
    if "preliminary results" in combined or "full year results" in combined:
        return "preliminary_results"
    if "interim results" in combined or "h1" in combined:
        return "interim_results"
    if "trading update" in combined:
        return "trading_update"
    if "webcast" in combined:
        return "webcast"
    return None


def detect_source(path: Path) -> tuple[str, list[str]]:
    lowered = str(path).lower()
    warnings: list[str] = []
    if "company_ir" in lowered:
        return "company_ir", warnings
    if "stockanalysis" in lowered:
        return "stockanalysis", warnings
    if "seeking_alpha" in lowered:
        return "seeking_alpha", warnings
    if "manual_exports" in lowered:
        return "manual_exports", warnings
    warnings.append("Underlying transcript publisher not verified; treating as manual upload / external snapshot.")
    return "manual_upload", warnings


def likely_transcript_file(path: Path) -> bool:
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False
    lower_name = path.name.lower()
    if lower_name.startswith("lseg-") and "transcript" in lower_name:
        return True
    if "lseg" in lower_name and any(keyword in lower_name for keyword in ["trading-update", "interim-results", "preliminary-results", "capital-markets-day", "innovation-forum", "webcast"]):
        return True
    if any(lower_name.endswith(suffix) for suffix in [".md", ".txt", ".json", ".csv"]) and "transcript" not in lower_name:
        return False
    try:
        if path.stat().st_size > 8_000_000:
            return "lseg" in lower_name and "transcript" in lower_name
        with path.open("rb") as handle:
            head = handle.read(4096).decode("utf-8", "ignore").lower()
        return ("lseg" in head or "london stock exchange group" in head) and any(marker in head for marker in TRANSCRIPT_TEXT_MARKERS)
    except Exception:
        return False


def discover_transcripts() -> list[Path]:
    candidates: list[Path] = []
    excluded_roots = {
        TRANSCRIPT_ROOT.resolve(),
        (REPO_ROOT / "node_modules").resolve(),
        (REPO_ROOT / "dist").resolve(),
        (REPO_ROOT / ".git").resolve(),
        (REPO_ROOT / ".pythonlibs").resolve(),
    }
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        resolved = path.resolve()
        if any(str(resolved).startswith(str(excluded)) for excluded in excluded_roots):
            continue
        if likely_transcript_file(path):
            candidates.append(path)
    return sorted(
        candidates,
        key=lambda path: (
            1 if re.search(r"\(\d+\)", path.name) else 0,
            len(path.name),
            path.name.lower(),
        ),
    )


def read_pdf_text(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if PdfReader is None:
        warnings.append("pypdf is not installed; install with `python -m pip install pypdf`.")
        return [], warnings
    reader = PdfReader(str(path))
    pages: list[dict[str, Any]] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # pragma: no cover - rare parser edge case
            warnings.append(f"Failed to extract page {index}: {exc}")
            text = ""
        pages.append({"pageNumber": index, "text": text})
    if not any(page["text"].strip() for page in pages):
        warnings.append("PDF extracted no readable text.")
    return pages, warnings


def read_docx_text(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if Document is None:
        warnings.append("python-docx is not installed; install with `python -m pip install python-docx`.")
        return [], warnings
    document = Document(str(path))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    return [{"pageNumber": 1, "text": text}], warnings


def read_html_text(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if BeautifulSoup is None:
        warnings.append("beautifulsoup4 is not installed; install with `python -m pip install beautifulsoup4 lxml`.")
        return [], warnings
    html = path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n")
    return [{"pageNumber": 1, "text": unescape(text)}], warnings


def extract_text_from_json(value: Any) -> list[str]:
    texts: list[str] = []
    if isinstance(value, str):
        if len(value.split()) >= 5:
            texts.append(value)
        return texts
    if isinstance(value, list):
        for item in value:
            texts.extend(extract_text_from_json(item))
        return texts
    if isinstance(value, dict):
        prioritized_keys = ["text", "content", "body", "transcript", "remarks", "qa", "preparedRemarks"]
        for key in prioritized_keys:
            if key in value:
                texts.extend(extract_text_from_json(value[key]))
        for key, nested in value.items():
            if key not in prioritized_keys:
                texts.extend(extract_text_from_json(nested))
        return texts
    return texts


def read_json_text(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        warnings.append(f"JSON parse failed: {exc}")
        return [], warnings
    texts = extract_text_from_json(payload)
    if not texts:
        warnings.append("No transcript-like text fields found in JSON.")
        return [], warnings
    return [{"pageNumber": 1, "text": "\n\n".join(texts)}], warnings


def read_csv_text(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    rows: list[str] = []
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                parts = []
                for key, value in row.items():
                    if value and key and any(keyword in key.lower() for keyword in ["speaker", "text", "content", "section", "body"]):
                        parts.append(f"{key}: {value}")
                if parts:
                    rows.append(" | ".join(parts))
    except Exception as exc:
        warnings.append(f"CSV parse failed: {exc}")
        return [], warnings
    if not rows:
        warnings.append("No transcript-like text columns found in CSV.")
        return [], warnings
    return [{"pageNumber": 1, "text": "\n".join(rows)}], warnings


def extract_pages(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return [{"pageNumber": 1, "text": path.read_text(encoding="utf-8", errors="ignore")}], []
    if suffix in {".html", ".htm"}:
        return read_html_text(path)
    if suffix == ".pdf":
        return read_pdf_text(path)
    if suffix == ".docx":
        return read_docx_text(path)
    if suffix == ".json":
        return read_json_text(path)
    if suffix == ".csv":
        return read_csv_text(path)
    return [], [f"Unsupported extension: {suffix}"]


def clean_page_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = text.replace("\uf0b7", "•")
    text = re.sub(r"\r\n?", "\n", text)
    lines = [line.strip() for line in text.splitlines()]
    cleaned: list[str] = []
    for line in lines:
        if not line:
            cleaned.append("")
            continue
        if re.fullmatch(r"Page\s*\|?\s*\d+", line, flags=re.IGNORECASE):
            continue
        if re.fullmatch(r"\d+", line):
            continue
        line = re.sub(r"\s+", " ", line).strip()
        cleaned.append(line)
    text = "\n".join(cleaned)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def title_from_pages(pages: list[dict[str, Any]]) -> str:
    first_page = pages[0]["text"] if pages else ""
    lines = [line.strip() for line in clean_page_text(first_page).splitlines() if line.strip()]
    return "\n".join(lines[:8])


def parse_participants(text: str) -> tuple[dict[str, dict[str, str]], list[str], list[str]]:
    participants: dict[str, dict[str, str]] = {}
    observed_management: list[str] = []
    observed_analysts: list[str] = []
    section = None
    for line in text.splitlines():
        stripped = line.strip()
        upper = stripped.upper()
        if upper == "CORPORATE PARTICIPANTS":
            section = "management"
            continue
        if upper == "CONFERENCE CALL PARTICIPANTS":
            section = "analyst"
            continue
        if stripped in {"PRESENTATION", "QUESTION AND ANSWER SESSION", "Q&A", "QUESTIONS AND ANSWERS"}:
            section = None
        if section and stripped.startswith("•"):
            body = stripped.lstrip("•").strip()
            name = body
            detail = ""
            if " - " in body:
                name, detail = body.split(" - ", 1)
            info = {"name": name.strip(), "detail": detail.strip(), "role": section}
            participants[name.strip()] = info
            if section == "management":
                observed_management.append(name.strip())
            else:
                if name.strip().lower() != "operator":
                    observed_analysts.append(name.strip())
    return participants, observed_management, observed_analysts


def classify_speaker_role(speaker: str, section: str, participants: dict[str, dict[str, str]]) -> str:
    if speaker.lower() == "operator":
        return "operator"
    if speaker in participants:
        return participants[speaker]["role"]
    if speaker in KNOWN_MANAGEMENT:
        return "management"
    if section == "qa":
        if speaker == "Unknown":
            return "unknown"
        if re.search(r"\([^)]+\)", speaker):
            return "analyst"
        if re.fullmatch(r"[A-Z][A-Za-z.'’\\-]+(?: [A-Z][A-Za-z.'’\\-]+){1,4}", speaker):
            return "analyst"
        return "unknown"
    return "management" if speaker in KNOWN_MANAGEMENT else "unknown"


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text)
    return [part.strip() for part in parts if part.strip()]


def contains_term(text: str, term: str, *, whole_phrase: bool = False) -> bool:
    lowered = text.lower()
    escaped = re.escape(term.lower())
    if whole_phrase:
        pattern = rf"(?<![A-Za-z0-9]){escaped}(?![A-Za-z0-9])"
        return re.search(pattern, lowered) is not None
    return term.lower() in lowered


def is_numeric_like(text: str) -> bool:
    return re.search(
        r"(%|£|€|\$|basis points|bps|billion|million|"
        r"\b\d+(?:\.\d+)?\s*%\b|"
        r"\b\d+(?:\.\d+)?\s*(?:bp|bps)\b|"
        r"\b\d+(?:\.\d+)?\s*(?:million|billion)\b|"
        r"\baround\s+\d+(?:\.\d+)?|"
        r"\bbetween\s+\d+(?:\.\d+)?\s+(?:and|to)\s+\d+(?:\.\d+)?)",
        text,
        flags=re.IGNORECASE,
    ) is not None


def classify_guidance_type(sentence: str, speaker_role: str) -> str:
    lower = sentence.lower()
    has_forward_marker = any(marker in lower for marker in GUIDANCE_FORWARD_MARKERS)
    has_historical_period = any(marker in lower for marker in GUIDANCE_HISTORICAL_PERIOD_MARKERS) or re.search(
        r"\b(h1|h2|q1|q2|q3|q4|fy ?20\d{2}|fy ?\d{2})\b",
        lower,
        flags=re.IGNORECASE,
    )
    has_historical_verb = any(marker in lower for marker in GUIDANCE_HISTORICAL_VERBS)
    has_qualitative_marker = any(marker in lower for marker in GUIDANCE_QUALITATIVE_MARKERS)
    numeric_like = is_numeric_like(sentence)

    if speaker_role == "analyst":
        return "analyst_question_framing"
    if speaker_role not in {"management", "analyst"} and (has_forward_marker or has_historical_period or has_qualitative_marker):
        return "derived_interpretation"
    if has_forward_marker and numeric_like:
        return "explicit_company_guidance"
    if has_forward_marker and not numeric_like:
        return "qualitative_outlook"
    if (has_historical_period or has_historical_verb) and numeric_like:
        return "reported_historical_metric"
    if has_qualitative_marker:
        return "qualitative_outlook"
    return "unknown"


def guidance_mapping_for_type(guidance_type: str) -> str:
    if guidance_type == "explicit_company_guidance":
        return "guidance"
    if guidance_type in {"reported_historical_metric", "qualitative_outlook"}:
        return "monitoringKpi"
    return "none"


def assess_qa_boundary(clean_text: str, section_rows: list[dict[str, Any]]) -> tuple[str, list[str]]:
    warnings: list[str] = []
    lower = clean_text.lower()
    explicit_marker = any(
        marker in lower
        for marker in [
            "question and answer session",
            "questions and answers",
            "q&a",
            "open the line to questions",
            "conference call participants",
        ]
    )
    qa_rows = [row for row in section_rows if row["section"] == "qa"]
    qa_analyst_rows = [row for row in qa_rows if row["speakerRole"] == "analyst"]
    qa_management_rows = [row for row in qa_rows if row["speakerRole"] == "management"]

    if explicit_marker and qa_analyst_rows and qa_management_rows:
        return "high", warnings
    if explicit_marker and qa_rows:
        warnings.append("Q&A-like markers were found, but analyst / management parsing was only partially confident.")
        return "medium", warnings
    if qa_analyst_rows:
        warnings.append("Analyst-style Q&A rows were inferred without a strong explicit Q&A boundary marker.")
        return "low", warnings
    if explicit_marker:
        warnings.append("Q&A-like markers were found, but no Q&A rows were parsed confidently.")
        return "low", warnings
    return "none", warnings


def infer_title_metadata(title_text: str, filename: str) -> tuple[str | None, str | None, str | None, list[str], str]:
    warnings: list[str] = []
    filename_date = extract_date_token(filename)
    content_date = parse_date_from_text(title_text)
    event_date = content_date or filename_date
    if filename_date and content_date and filename_date != content_date:
        warnings.append(f"Filename date {filename_date} differs from title date {content_date}; using title date.")
        event_date = content_date

    filename_period, fp_warnings = detect_fiscal_period(filename)
    content_period, cp_warnings = detect_fiscal_period(title_text)
    warnings.extend(fp_warnings)
    warnings.extend(cp_warnings)
    fiscal_period = content_period or filename_period
    if filename_period and content_period and filename_period != content_period:
        warnings.append(f"Filename fiscal period {filename_period} differs from title fiscal period {content_period}; using title fiscal period.")
        fiscal_period = content_period

    filename_type = detect_event_type(filename)
    content_type = detect_event_type(title_text)
    event_type = content_type or filename_type
    if filename_type and content_type and filename_type != content_type:
        warnings.append(f"Filename event type {filename_type} differs from title event type {content_type}; using title event type.")
        event_type = content_type

    confidence = "high" if content_date and content_period and event_type else "medium"
    if not event_date or not fiscal_period or not event_type:
        confidence = "low"
        if not event_date:
            warnings.append("Event date could not be inferred confidently.")
        if not fiscal_period:
            warnings.append("Fiscal period could not be inferred confidently.")
        if not event_type:
            warnings.append("Event type could not be inferred confidently.")
    return event_date, fiscal_period, event_type, warnings, confidence


def make_transcript_id(event_date: str | None, fiscal_period: str | None, event_type: str | None, filename: str) -> str:
    base = "lseg"
    if fiscal_period:
        base += "_" + re.sub(r"[^a-z0-9]+", "_", fiscal_period.lower()).strip("_")
    if event_type:
        base += "_" + event_type
    if event_date:
        base += "_" + event_date
    else:
        base += "_" + sanitize_filename(Path(filename).stem.lower())
    return base


def build_clean_text(pages: list[dict[str, Any]]) -> str:
    blocks = []
    for page in pages:
        text = clean_page_text(page["text"])
        if not text:
            continue
        blocks.append(f"[[PAGE:{page['pageNumber']}]]\n{text}")
    return "\n\n".join(blocks).strip()


def split_transcript_sections(
    transcript_id: str,
    clean_text: str,
    participants: dict[str, dict[str, str]],
    staged_path: str,
    event_date: str | None,
    fiscal_period: str | None,
    event_type: str | None,
) -> list[dict[str, Any]]:
    lines = clean_text.splitlines()
    records: list[dict[str, Any]] = []
    current_section = "unknown"
    current_page = None
    current_speaker = None
    current_role = "unknown"
    current_lines: list[str] = []
    current_page_ref = None

    def flush() -> None:
        nonlocal current_speaker, current_role, current_lines, current_page_ref
        if not current_speaker and not current_lines:
            return
        text = re.sub(r"\s+", " ", " ".join(line.strip() for line in current_lines)).strip()
        if current_speaker and text:
            records.append(
                {
                    "transcriptId": transcript_id,
                    "eventDate": event_date,
                    "fiscalPeriod": fiscal_period,
                    "eventType": event_type,
                    "section": current_section,
                    "speaker": current_speaker,
                    "speakerRole": current_role,
                    "text": text,
                    "sequenceNumber": len(records) + 1,
                    "sourcePath": staged_path,
                    "quoteLocation": f"page:{current_page_ref};seq:{len(records) + 1}" if current_page_ref else f"seq:{len(records) + 1}",
                }
            )
        current_speaker = None
        current_role = "unknown"
        current_lines = []
        current_page_ref = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        page_match = re.match(r"\[\[PAGE:(\d+)]]", stripped)
        if page_match:
            current_page = int(page_match.group(1))
            continue

        upper = stripped.upper()
        if upper in {"CORPORATE PARTICIPANTS", "CONFERENCE CALL PARTICIPANTS"}:
            flush()
            current_section = "unknown"
            continue
        if upper in {"PRESENTATION", "PREPARED REMARKS"}:
            flush()
            current_section = "prepared_remarks"
            continue
        if "QUESTION AND ANSWER" in upper or upper in {"Q&A", "QUESTIONS AND ANSWERS"}:
            flush()
            current_section = "qa"
            continue
        if stripped.startswith("•"):
            continue

        speaker_match = re.match(r"^([A-Z][A-Za-z0-9 .,'’/&()\\-]+):\s*(.*)$", stripped)
        if speaker_match:
            flush()
            current_speaker = speaker_match.group(1).strip()
            current_role = classify_speaker_role(current_speaker, current_section, participants)
            current_page_ref = current_page
            remainder = speaker_match.group(2).strip()
            if remainder:
                current_lines.append(remainder)
            continue

        if stripped in {"Operator", "David Schwimmer", "Michel-Alain Proch", "Peregrine Riviere"}:
            flush()
            current_speaker = stripped
            current_role = classify_speaker_role(current_speaker, current_section, participants)
            current_page_ref = current_page
            continue

        if current_speaker:
            current_lines.append(stripped)
        elif current_section in {"prepared_remarks", "qa"}:
            current_speaker = "Unknown"
            current_role = "unknown"
            current_page_ref = current_page
            current_lines.append(stripped)

    flush()
    return records


def keyword_topic(
    text: str,
    mapping: dict[str, Iterable[str]],
    default: str = "general",
    *,
    whole_phrase: bool = False,
) -> tuple[str, str | None]:
    lower = text.lower()
    for topic, keywords in mapping.items():
        for keyword in keywords:
            if contains_term(lower, keyword, whole_phrase=whole_phrase):
                return topic, keyword
    return default, None


SEGMENT_KEYWORDS = {
    "Data & Analytics": ["data & analytics", "workspace", "data analytics", "desktop"],
    "FTSE Russell": ["ftse", "russell", "index", "indices", "benchmark"],
    "Risk Intelligence": ["risk intelligence", "world-check", "screening", "due diligence", "regulated"],
    "Capital Markets": ["capital markets", "tradeweb", "fixed income", "fxall", "dealers", "markets division"],
    "Post Trade": ["post trade", "lch", "swapclear", "forexclear", "clearing", "margin services", "acadia"],
    "Other / Corporate": ["corporate", "other", "cost savings", "group-wide"],
}

COMMENTARY_TOPICS = {
    "overall_strategy": ["strategy", "transform", "portfolio", "customer focus", "innovative products"],
    "ai_data_analytics": [" ai ", "artificial intelligence", "data platform", "cloud", "analytics"],
    "pricing": ["pricing", "price", "yield"],
    "cost_savings": ["cost savings", "synergy", "efficiency", "operating leverage"],
    "competitive_environment": ["competition", "bloomberg", "market data competition"],
    "customer_retention": ["retention", "renewal", "customer", "churn"],
}

GUIDANCE_TOPICS = {
    "revenue_growth": ["guidance", "growth", "organic", "revenue"],
    "margin": ["margin", "basis points", "operating leverage", "ebitda"],
    "free_cash_flow": ["free cash flow", "cash conversion", "fcf"],
    "capex": ["capex", "capital expenditure", "investment spend"],
    "tax": ["tax rate", "tax"],
    "buyback": ["buyback", "repurchase", "shareholder returns"],
    "dividend": ["dividend"],
    "medium_term_target": ["medium term", "target", "through 202", "longer term"],
}

KPI_TOPICS = {
    "revenue_growth": ["revenue growth", "income performance", "organic"],
    "recurring_revenue": ["recurring revenue", "subscription revenue", "annual subscription value", "asv"],
    "retention": ["retention", "gross retention", "net retention"],
    "workspace_usage": ["workspace", "desktop", "usage"],
    "post_trade_activity": ["swapclear", "lch", "post trade", "clearing"],
    "index_trends": ["ftse", "index", "etf", "benchmark"],
    "capital_markets_activity": ["tradeweb", "capital markets", "volatility", "rates", "fx", "volumes"],
    "synergies": ["synergy", "cost savings"],
    "data_platform_progress": ["cloud", "microsoft", "data platform", "analytics"],
}

RISK_TOPICS = {
    "market_data_competition": ["competition", "bloomberg", "pricing pressure"],
    "customer_churn": ["churn", "client loss", "retention pressure"],
    "regulatory_risk": ["regulatory", "regulation"],
    "post_trade_cyclicality": ["post trade", "volatility", "cyclical", "volume"],
    "capital_markets_weakness": ["capital markets weakness", "slower issuance", "weakness"],
    "integration_execution": ["integration", "execution", "migration"],
    "cost_inflation": ["inflation", "cost pressure", "investment spend"],
    "ai_capex": [
        "ai capex",
        "technology investment pressure",
        "higher investment spend",
        "infrastructure investment",
        "ai-related costs",
        "ai monetization risk",
        "data center cost",
        "cloud cost pressure",
        "artificial intelligence investment",
        "higher technology spend",
    ],
    "fx": ["foreign exchange", "fx", "currency"],
    "interest_rates": ["rates", "interest rates"],
    "leverage": ["leverage", "debt", "balance sheet"],
}

CAPITAL_ALLOCATION_TOPICS = {
    "buyback": ["buyback", "share repurchase"],
    "dividend": ["dividend"],
    "leverage_target": ["leverage", "debt target", "balance sheet"],
    "m_and_a": ["acquisition", "m&a", "bolt-on"],
    "capex_investment": ["capex", "investment", "technology spend"],
}

QA_TOPICS = {
    "guidance": ["guidance", "outlook", "target"],
    "margin": ["margin", "cost", "operating leverage"],
    "workspace": ["workspace", "desktop", "bloomberg"],
    "data_analytics": ["data", "analytics", "pricing"],
    "risk_intelligence": ["risk intelligence", "screening"],
    "ftse_russell": ["ftse", "russell", "index"],
    "capital_markets": ["tradeweb", "capital markets", "volumes", "fx", "rates"],
    "post_trade": ["post trade", "lch", "swapclear", "clearing"],
    "capital_allocation": ["buyback", "dividend", "leverage", "m&a"],
}

POSITIVE_SIGNAL_KEYWORDS = ["strong", "accelerat", "improv", "on track", "confidence", "good performance", "growth", "efficient"]
NEGATIVE_SIGNAL_KEYWORDS = ["pressure", "weaker", "slow", "headwind", "challenging", "decline", "erosion", "risk", "cost inflation"]
EVASIVE_KEYWORDS = ["too early", "not going to comment", "not in a position", "don't want to guide", "cannot comment", "won't comment"]
GUIDANCE_FORWARD_MARKERS = [
    "guidance",
    "outlook",
    "we expect",
    "we now expect",
    "we continue to expect",
    "for the full year",
    "for the rest of the year",
    "for the coming year",
    "full-year",
    "on track to deliver",
    "remain on track",
    "we are on track",
    "target",
    "targets",
    "through 202",
    "medium-term",
    "medium term",
    "next few years",
    "next year",
    "by year-end",
    "by the end of",
    "for h2",
]
GUIDANCE_HISTORICAL_PERIOD_MARKERS = [
    "in h1",
    "in h2",
    "in q1",
    "in q2",
    "in q3",
    "in q4",
    "for q1",
    "for q2",
    "for q3",
    "for q4",
    "for the first half",
    "for the second half",
    "for the quarter",
    "this quarter",
    "first half",
    "second half",
    "first quarter",
    "second quarter",
    "third quarter",
    "fourth quarter",
    "in 2024",
    "in 2025",
    "in 2026",
    "for 2024",
    "for 2025",
]
GUIDANCE_HISTORICAL_VERBS = [
    "delivered",
    "grew",
    "was up",
    "were up",
    "increased",
    "bought back",
    "returned",
    "saw",
    "recorded",
]
GUIDANCE_QUALITATIVE_MARKERS = [
    "momentum",
    "confident",
    "confidence",
    "strong growth",
    "good growth",
    "good momentum",
    "encouraged",
    "committed to",
    "pathway to",
]


def build_source_type(source: str | None) -> str:
    if source == "company_ir":
        return "company_ir"
    if source in {"stockanalysis", "seeking_alpha"}:
        return "third_party_transcript"
    if source in {"manual_upload", "manual_exports"}:
        return "transcript_manual_upload"
    return "unknown"


def build_common_item(
    transcript_meta: dict[str, Any],
    chunk: dict[str, Any],
    topic: str,
    subtopic: str | None,
    extracted_claim: str,
    supporting_quote: str,
    mapping: str,
    confidence: str,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "transcriptId": transcript_meta["transcriptId"],
        "eventDate": transcript_meta["eventDate"],
        "fiscalPeriod": transcript_meta["fiscalPeriod"],
        "eventType": transcript_meta["eventType"],
        "section": chunk["section"],
        "speaker": chunk["speaker"],
        "speakerRole": chunk["speakerRole"],
        "topic": topic,
        "subtopic": subtopic,
        "extractedClaim": extracted_claim,
        "supportingQuoteShort": supporting_quote[:500],
        "quoteLocation": chunk.get("quoteLocation"),
        "confidence": confidence,
        "dataQualityTag": "Derived",
        "sourceType": build_source_type(transcript_meta["source"]),
        "needsHumanReview": True,
        "suggestedModelMapping": mapping,
        "sourcePath": transcript_meta["stagedPath"],
        "warnings": warnings or [],
    }


def extract_guidance_mentions(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        for sentence in split_sentences(chunk["text"]):
            lower = sentence.lower()
            if not any(keyword in lower for keywords in GUIDANCE_TOPICS.values() for keyword in keywords):
                continue
            topic, matched = keyword_topic(sentence, GUIDANCE_TOPICS)
            guidance_type = classify_guidance_type(sentence, chunk["speakerRole"])
            if guidance_type == "unknown":
                continue
            mapping = guidance_mapping_for_type(guidance_type)
            warnings = []
            if guidance_type == "qualitative_outlook":
                warnings.append("Qualitative guidance language; do not convert to model inputs without human review.")
            if guidance_type == "reported_historical_metric":
                warnings.append("Reported historical metrics are tracked for research context only and should not be pushed into forecast anchors.")
            if guidance_type == "analyst_question_framing":
                warnings.append("Analyst framing is not company guidance unless management explicitly confirms it.")
            if guidance_type == "derived_interpretation":
                warnings.append("Speaker role or framing was not management-confirmed; treat as derived interpretation, not company guidance.")
            confidence = "high" if matched and guidance_type == "explicit_company_guidance" and chunk["speakerRole"] == "management" else "medium"
            if guidance_type in {"analyst_question_framing", "derived_interpretation"}:
                confidence = "low"
            items.append(
                {
                    **build_common_item(
                        transcript_meta,
                        chunk,
                        "guidance",
                        topic,
                        sentence,
                        sentence,
                        mapping,
                        confidence,
                        warnings,
                    ),
                    "guidanceType": guidance_type,
                    "numericGuidanceCandidate": is_numeric_like(sentence),
                }
            )
    return items


def extract_commentary(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        if chunk["speakerRole"] != "management":
            continue
        for sentence in split_sentences(chunk["text"]):
            topic, matched = keyword_topic(sentence, COMMENTARY_TOPICS, default="segment_commentary")
            segment, seg_match = keyword_topic(sentence, SEGMENT_KEYWORDS, default="Group-level")
            if matched or seg_match:
                items.append(
                    build_common_item(
                        transcript_meta,
                        chunk,
                        topic,
                        segment,
                        sentence,
                        sentence,
                        "none",
                        "medium" if matched or seg_match else "low",
                        [],
                    )
                )
    return items


def extract_kpi_mentions(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        for sentence in split_sentences(chunk["text"]):
            topic, matched = keyword_topic(sentence, KPI_TOPICS, default="kpi")
            if not matched:
                continue
            items.append(
                build_common_item(
                    transcript_meta,
                    chunk,
                    "kpi",
                    topic,
                    sentence,
                    sentence,
                    "monitoringKpi",
                    "medium",
                    [],
                )
            )
    return items


def extract_risk_mentions(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        for sentence in split_sentences(chunk["text"]):
            topic, matched = keyword_topic(sentence, RISK_TOPICS, default="risk", whole_phrase=True)
            if not matched:
                continue
            items.append(
                build_common_item(
                    transcript_meta,
                    chunk,
                    "risk",
                    topic,
                    sentence,
                    sentence,
                    "riskWarning",
                    "medium",
                    [],
                )
            )
    return items


def extract_capital_allocation_mentions(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        if chunk["speakerRole"] != "management":
            continue
        for sentence in split_sentences(chunk["text"]):
            topic, matched = keyword_topic(sentence, CAPITAL_ALLOCATION_TOPICS, default="capital_allocation")
            if not matched:
                continue
            mapping = "guidance" if topic in {"buyback", "dividend", "leverage_target"} else "strategicOptionality"
            items.append(
                build_common_item(
                    transcript_meta,
                    chunk,
                    "capital_allocation",
                    topic,
                    sentence,
                    sentence,
                    mapping,
                    "medium",
                    [],
                )
            )
    return items


def extract_segment_mentions(transcript_meta: dict[str, Any], chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        for sentence in split_sentences(chunk["text"]):
            segment, matched = keyword_topic(sentence, SEGMENT_KEYWORDS, default="Group-level")
            if not matched:
                continue
            items.append(
                build_common_item(
                    transcript_meta,
                    chunk,
                    "segment",
                    segment,
                    sentence,
                    sentence,
                    "segment",
                    "medium",
                    [],
                )
            )
    return items


def summarize_answer(answer_chunks: list[dict[str, Any]]) -> str:
    text = " ".join(chunk["text"] for chunk in answer_chunks if chunk["speakerRole"] == "management")
    sentences = split_sentences(text)
    return " ".join(sentences[:3])[:700]


def qa_answer_directness(answer_text: str) -> str:
    lower = answer_text.lower()
    if any(keyword in lower for keyword in EVASIVE_KEYWORDS):
        return "evasive"
    if len(answer_text.split()) < 25:
        return "partial"
    return "direct"


def extract_qa_topics(
    transcript_meta: dict[str, Any],
    chunks: list[dict[str, Any]],
    participants: dict[str, dict[str, str]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    in_qa = [chunk for chunk in chunks if chunk["section"] == "qa"]
    index = 0
    while index < len(in_qa):
        chunk = in_qa[index]
        if chunk["speakerRole"] != "analyst":
            index += 1
            continue
        answer_chunks: list[dict[str, Any]] = []
        lookahead = index + 1
        while lookahead < len(in_qa) and in_qa[lookahead]["speakerRole"] != "analyst":
            answer_chunks.append(in_qa[lookahead])
            lookahead += 1
        topic, _ = keyword_topic(chunk["text"], QA_TOPICS, default="general")
        answer_summary = summarize_answer(answer_chunks)
        analyst_detail = participants.get(chunk["speaker"], {})
        items.append(
            {
                **build_common_item(
                    transcript_meta,
                    chunk,
                    "qa_topic",
                    topic,
                    chunk["text"],
                    chunk["text"],
                    "monitoringKpi",
                    "medium",
                    [],
                ),
                "analystName": chunk["speaker"],
                "firm": analyst_detail.get("detail") or None,
                "questionTopic": topic,
                "managementAnswerSummary": answer_summary,
                "answerDirectness": qa_answer_directness(answer_summary) if answer_summary else "partial",
                "modelImplication": "monitoringKpi" if topic != "capital_allocation" else "guidance",
                "followUpNeeded": qa_answer_directness(answer_summary) != "direct",
            }
        )
        index = lookahead
    return items


def extract_thesis_signals(
    transcript_meta: dict[str, Any],
    chunks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        if chunk["speakerRole"] not in {"management", "analyst"}:
            continue
        for sentence in split_sentences(chunk["text"]):
            lower = sentence.lower()
            signal_type = None
            severity = "low"
            if any(keyword in lower for keyword in POSITIVE_SIGNAL_KEYWORDS):
                signal_type = "positiveSignal"
                severity = "medium"
            if any(keyword in lower for keyword in NEGATIVE_SIGNAL_KEYWORDS):
                signal_type = "negativeSignal"
                severity = "medium"
            if signal_type is None and any(keyword in lower for keyword in ["stable", "consistent", "as expected"]):
                signal_type = "neutralSignal"
            if signal_type is None:
                continue
            driver, _ = keyword_topic(sentence, KPI_TOPICS, default="group_valuation")
            items.append(
                {
                    **build_common_item(
                        transcript_meta,
                        chunk,
                        "thesis_signal",
                        driver,
                        sentence,
                        sentence,
                        "monitoringKpi" if signal_type != "negativeSignal" else "riskWarning",
                        "medium",
                        [],
                    ),
                    "signalType": signal_type,
                    "whatChangedVsPriorEvent": "not_assessed_in_p0",
                    "modelDriverImpacted": driver,
                    "severity": severity,
                }
            )
    return items


def build_event_summary(
    transcript_meta: dict[str, Any],
    commentary: list[dict[str, Any]],
    guidance: list[dict[str, Any]],
    kpis: list[dict[str, Any]],
    risks: list[dict[str, Any]],
    capital_allocation: list[dict[str, Any]],
    qa_topics: list[dict[str, Any]],
    thesis_signals: list[dict[str, Any]],
) -> dict[str, Any]:
    theme_counter = Counter(item["subtopic"] or item["topic"] for item in commentary + kpis + risks)
    top_themes = [theme for theme, _ in theme_counter.most_common(5)]
    return {
        "transcriptId": transcript_meta["transcriptId"],
        "eventDate": transcript_meta["eventDate"],
        "fiscalPeriod": transcript_meta["fiscalPeriod"],
        "eventType": transcript_meta["eventType"],
        "source": transcript_meta["source"],
        "sourcePath": transcript_meta["stagedPath"],
        "qualityTag": transcript_meta["qualityTag"],
        "confidence": transcript_meta["confidence"],
        "topThemes": top_themes,
        "guidanceMentionCount": len(guidance),
        "kpiMentionCount": len(kpis),
        "riskMentionCount": len(risks),
        "capitalAllocationMentionCount": len(capital_allocation),
        "qaTopicCount": len(qa_topics),
        "thesisSignalCount": len(thesis_signals),
        "qaBoundaryConfidence": transcript_meta.get("qaBoundaryConfidence"),
        "warnings": transcript_meta["warnings"],
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_sqlite(
    transcript_metadata: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    speakers: list[dict[str, Any]],
    management_commentary: list[dict[str, Any]],
    guidance_mentions: list[dict[str, Any]],
    kpi_mentions: list[dict[str, Any]],
    risk_mentions: list[dict[str, Any]],
    capital_allocation_mentions: list[dict[str, Any]],
    segment_mentions: list[dict[str, Any]],
    qa_topics: list[dict[str, Any]],
    thesis_signals: list[dict[str, Any]],
    extraction_warnings: list[dict[str, Any]],
) -> None:
    if SQLITE_PATH.exists():
        SQLITE_PATH.unlink()
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE transcripts (
          transcriptId TEXT PRIMARY KEY,
          eventDate TEXT,
          fiscalPeriod TEXT,
          eventType TEXT,
          source TEXT,
          qualityTag TEXT,
          confidence TEXT,
          originalPath TEXT,
          stagedPath TEXT,
          cleanTextPath TEXT,
          wordCount INTEGER,
          hasPreparedRemarks INTEGER,
          hasQA INTEGER,
          qaBoundaryConfidence TEXT,
          managementSpeakersJson TEXT,
          analystSpeakersJson TEXT,
          knownManagementAliasesJson TEXT,
          warningsJson TEXT
        );
        CREATE TABLE transcript_sections (
          transcriptId TEXT,
          sequenceNumber INTEGER,
          section TEXT,
          speaker TEXT,
          speakerRole TEXT,
          text TEXT,
          quoteLocation TEXT,
          sourcePath TEXT
        );
        CREATE TABLE speakers (
          transcriptId TEXT,
          speakerName TEXT,
          speakerRole TEXT,
          detail TEXT
        );
        CREATE TABLE management_commentary (payloadJson TEXT);
        CREATE TABLE guidance_mentions (payloadJson TEXT);
        CREATE TABLE kpi_mentions (payloadJson TEXT);
        CREATE TABLE risk_mentions (payloadJson TEXT);
        CREATE TABLE capital_allocation_mentions (payloadJson TEXT);
        CREATE TABLE segment_mentions (payloadJson TEXT);
        CREATE TABLE qa_topics (payloadJson TEXT);
        CREATE TABLE thesis_signals (payloadJson TEXT);
        CREATE TABLE extraction_warnings (payloadJson TEXT);
        """
    )

    for row in transcript_metadata:
        cur.execute(
            """
            INSERT INTO transcripts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["transcriptId"],
                row["eventDate"],
                row["fiscalPeriod"],
                row["eventType"],
                row["source"],
                row["qualityTag"],
                row["confidence"],
                row["originalPath"],
                row["stagedPath"],
                row["cleanTextPath"],
                row["wordCount"],
                int(bool(row["hasPreparedRemarks"])),
                int(bool(row["hasQA"])),
                row.get("qaBoundaryConfidence"),
                json.dumps(row["managementSpeakers"], ensure_ascii=False),
                json.dumps(row["analystSpeakers"], ensure_ascii=False),
                json.dumps(row.get("knownManagementAliasesForRoleClassification", []), ensure_ascii=False),
                json.dumps(row["warnings"], ensure_ascii=False),
            ),
        )
    for row in sections:
        cur.execute(
            """
            INSERT INTO transcript_sections VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["transcriptId"],
                row["sequenceNumber"],
                row["section"],
                row["speaker"],
                row["speakerRole"],
                row["text"],
                row["quoteLocation"],
                row["sourcePath"],
            ),
        )
    for row in speakers:
        cur.execute(
            """
            INSERT INTO speakers VALUES (?, ?, ?, ?)
            """,
            (row["transcriptId"], row["speakerName"], row["speakerRole"], row["detail"]),
        )

    table_rows = {
        "management_commentary": management_commentary,
        "guidance_mentions": guidance_mentions,
        "kpi_mentions": kpi_mentions,
        "risk_mentions": risk_mentions,
        "capital_allocation_mentions": capital_allocation_mentions,
        "segment_mentions": segment_mentions,
        "qa_topics": qa_topics,
        "thesis_signals": thesis_signals,
        "extraction_warnings": extraction_warnings,
    }
    for table, rows in table_rows.items():
        cur.executemany(
            f"INSERT INTO {table} VALUES (?)",
            [(json.dumps(row, ensure_ascii=False),) for row in rows],
        )

    conn.commit()
    conn.close()


def stage_files() -> tuple[list[InventoryRecord], list[Path]]:
    discovered = discover_transcripts()
    for existing in RAW_USER_UPLOADED.iterdir():
        if existing.is_file():
            existing.unlink()
    inventory: list[InventoryRecord] = []
    staged_unique_paths: list[Path] = []
    seen_hashes: dict[str, Path] = {}

    for path in discovered:
        stat = path.stat()
        file_hash = sha256_file(path)
        detected_source, source_warnings = detect_source(path)
        record = InventoryRecord(
            originalPath=str(path),
            stagedPath=None,
            fileName=path.name,
            fileExtension=path.suffix.lower(),
            fileSize=stat.st_size,
            modifiedTime=datetime.fromtimestamp(stat.st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            detectedCompany="London Stock Exchange Group",
            detectedTicker="LSEG.L",
            detectedEventDate=extract_date_token(path.name),
            detectedFiscalPeriod=detect_fiscal_period(path.name)[0],
            detectedEventType=detect_event_type(path.name),
            detectedSource=detected_source,
            confidence="medium",
            warnings=source_warnings.copy(),
            sha256=file_hash,
        )
        if file_hash in seen_hashes:
            canonical = seen_hashes[file_hash]
            record.isDuplicate = True
            record.duplicateOf = str(canonical)
            record.stagedPath = str(canonical)
            record.warnings.append("Duplicate transcript file detected; reusing previously staged copy.")
            inventory.append(record)
            continue

        staged_name = sanitize_filename(path.name)
        staged_path = RAW_USER_UPLOADED / staged_name
        shutil.copy2(path, staged_path)
        seen_hashes[file_hash] = staged_path
        staged_unique_paths.append(staged_path)
        record.stagedPath = str(staged_path)
        inventory.append(record)

    payload = {
        "generatedAt": iso_now(),
        "records": [row.to_dict() for row in inventory],
    }
    write_json(INVENTORY_PATH, payload)
    return inventory, staged_unique_paths


def parse_transcripts(inventory: list[InventoryRecord], staged_unique_paths: list[Path]) -> dict[str, Any]:
    inventory_by_staged = {row.stagedPath: row for row in inventory if row.stagedPath}
    seen_transcript_ids: set[str] = set()
    transcript_metadata: list[dict[str, Any]] = []
    transcript_sections: list[dict[str, Any]] = []
    speaker_rows: list[dict[str, Any]] = []
    management_commentary: list[dict[str, Any]] = []
    guidance_mentions: list[dict[str, Any]] = []
    kpi_mentions: list[dict[str, Any]] = []
    risk_mentions: list[dict[str, Any]] = []
    capital_allocation_mentions: list[dict[str, Any]] = []
    segment_mentions: list[dict[str, Any]] = []
    qa_topics: list[dict[str, Any]] = []
    thesis_signals: list[dict[str, Any]] = []
    event_summaries: list[dict[str, Any]] = []
    extraction_warnings: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for staged_path in staged_unique_paths:
        pages, page_warnings = extract_pages(staged_path)
        title_text = title_from_pages(pages)
        event_date, fiscal_period, event_type, title_warnings, confidence = infer_title_metadata(title_text, staged_path.name)
        inventory_row = inventory_by_staged.get(str(staged_path))
        warnings = (inventory_row.warnings if inventory_row else []).copy()
        warnings.extend(page_warnings)
        warnings.extend(title_warnings)
        source = inventory_row.detectedSource if inventory_row else "manual_upload"
        if source != "company_ir":
            warnings.append("Transcript source is not verified as company IR; treat as external research snapshot.")
        if not pages:
            skipped.append(
                {
                    "stagedPath": str(staged_path),
                    "reason": "No readable text extracted.",
                    "warnings": warnings,
                }
            )
            extraction_warnings.append(
                {
                    "transcriptId": None,
                    "sourcePath": str(staged_path),
                    "warningType": "parse_failure",
                    "message": "No readable text extracted.",
                    "severity": "high",
                }
            )
            continue

        clean_text = build_clean_text(pages)
        if not clean_text.strip():
            skipped.append(
                {
                    "stagedPath": str(staged_path),
                    "reason": "Clean text is empty after normalization.",
                    "warnings": warnings,
                }
            )
            extraction_warnings.append(
                {
                    "transcriptId": None,
                    "sourcePath": str(staged_path),
                    "warningType": "empty_clean_text",
                    "message": "Clean text is empty after normalization.",
                    "severity": "high",
                }
            )
            continue

        transcript_id = make_transcript_id(event_date, fiscal_period, event_type, staged_path.name)
        if transcript_id in seen_transcript_ids:
            skipped.append(
                {
                    "stagedPath": str(staged_path),
                    "reason": f"Duplicate transcript event id detected: {transcript_id}.",
                    "warnings": warnings + ["Duplicate transcript event detected after metadata inference; keeping the first parsed copy only."],
                }
            )
            extraction_warnings.append(
                {
                    "transcriptId": transcript_id,
                    "sourcePath": str(staged_path),
                    "warningType": "duplicate_event",
                    "message": "Duplicate transcript event detected after metadata inference; keeping the first parsed copy only.",
                    "severity": "medium",
                }
            )
            continue
        seen_transcript_ids.add(transcript_id)
        participants, observed_management_speakers, observed_analyst_speakers = parse_participants(clean_text)
        section_rows = split_transcript_sections(
            transcript_id,
            clean_text,
            participants,
            str(staged_path),
            event_date,
            fiscal_period,
            event_type,
        )
        qa_boundary_confidence, qa_boundary_warnings = assess_qa_boundary(clean_text, section_rows)
        warnings.extend(qa_boundary_warnings)
        has_qa = qa_boundary_confidence in {"high", "medium"}
        if not has_qa:
            warnings.append("No Q&A section detected confidently.")
            extraction_warnings.append(
                {
                    "transcriptId": transcript_id,
                    "sourcePath": str(staged_path),
                    "warningType": "qa_boundary_confidence",
                    "message": f"Q&A confidence is {qa_boundary_confidence}; do not assume analyst Q&A was fully captured.",
                    "severity": "medium" if qa_boundary_confidence == "low" else "low",
                }
            )
        if not event_date:
            warnings.append("Missing event date in parsed transcript metadata.")
        if not fiscal_period:
            warnings.append("Missing fiscal period in parsed transcript metadata.")

        clean_text_path = CLEAN_TEXT_ROOT / f"{transcript_id}.txt"
        clean_text_path.write_text(clean_text + "\n", encoding="utf-8")

        transcript_meta = {
            "transcriptId": transcript_id,
            "company": "London Stock Exchange Group",
            "ticker": "LSEG.L",
            "eventDate": event_date,
            "fiscalPeriod": fiscal_period,
            "eventType": event_type,
            "source": source,
            "originalPath": inventory_row.originalPath if inventory_row else None,
            "stagedPath": str(staged_path),
            "cleanTextPath": str(clean_text_path),
            "wordCount": len(clean_text.split()),
            "hasPreparedRemarks": any(row["section"] == "prepared_remarks" for row in section_rows),
            "hasQA": has_qa,
            "qaBoundaryConfidence": qa_boundary_confidence,
            "managementSpeakers": observed_management_speakers,
            "analystSpeakers": observed_analyst_speakers,
            "observedManagementSpeakers": observed_management_speakers,
            "observedAnalystSpeakers": observed_analyst_speakers,
            "knownManagementAliasesForRoleClassification": KNOWN_MANAGEMENT_ALIASES,
            "qualityTag": "ManualUpload" if source == "manual_upload" else ("CompanyDisclosure" if source == "company_ir" else "ExternalSnapshot"),
            "confidence": confidence,
            "warnings": sorted(set(warnings)),
        }
        transcript_metadata.append(transcript_meta)
        transcript_sections.extend(section_rows)

        for participant_name, detail in participants.items():
            speaker_rows.append(
                {
                    "transcriptId": transcript_id,
                    "speakerName": participant_name,
                    "speakerRole": detail.get("role", "unknown"),
                    "detail": detail.get("detail", ""),
                }
            )

        transcript_commentary = extract_commentary(transcript_meta, section_rows)
        transcript_guidance = extract_guidance_mentions(transcript_meta, section_rows)
        transcript_kpis = extract_kpi_mentions(transcript_meta, section_rows)
        transcript_risks = extract_risk_mentions(transcript_meta, section_rows)
        transcript_capalloc = extract_capital_allocation_mentions(transcript_meta, section_rows)
        transcript_segments = extract_segment_mentions(transcript_meta, section_rows)
        transcript_qa = extract_qa_topics(transcript_meta, section_rows, participants)
        transcript_signals = extract_thesis_signals(transcript_meta, section_rows)

        management_commentary.extend(transcript_commentary)
        guidance_mentions.extend(transcript_guidance)
        kpi_mentions.extend(transcript_kpis)
        risk_mentions.extend(transcript_risks)
        capital_allocation_mentions.extend(transcript_capalloc)
        segment_mentions.extend(transcript_segments)
        qa_topics.extend(transcript_qa)
        thesis_signals.extend(transcript_signals)

        if transcript_meta["qualityTag"] != "CompanyDisclosure":
            extraction_warnings.append(
                {
                    "transcriptId": transcript_id,
                    "sourcePath": str(staged_path),
                    "warningType": "source_verification",
                    "message": "Transcript source is not verified as company IR; extracted insights require human review.",
                    "severity": "medium",
                }
            )
        if not transcript_meta["eventDate"] or not transcript_meta["fiscalPeriod"]:
            extraction_warnings.append(
                {
                    "transcriptId": transcript_id,
                    "sourcePath": str(staged_path),
                    "warningType": "metadata_gap",
                    "message": "Transcript metadata is incomplete; event date or fiscal period is missing.",
                    "severity": "medium",
                }
            )

        event_summaries.append(
            build_event_summary(
                transcript_meta,
                transcript_commentary,
                transcript_guidance,
                transcript_kpis,
                transcript_risks,
                transcript_capalloc,
                transcript_qa,
                transcript_signals,
            )
        )

    if risk_mentions:
        risk_counts = Counter(item.get("subtopic") or item.get("topic") for item in risk_mentions)
        top_risk, top_count = risk_counts.most_common(1)[0]
        concentration = top_count / len(risk_mentions)
        if concentration > 0.45:
            extraction_warnings.append(
                {
                    "transcriptId": None,
                    "sourcePath": str(RISK_MENTIONS_PATH),
                    "warningType": "risk_category_concentration",
                    "message": f"Risk extraction is concentrated in {top_risk} at {concentration:.1%} of all risk mentions; review keyword precision.",
                    "severity": "medium",
                }
            )

    write_json(METADATA_PATH, {"generatedAt": iso_now(), "records": transcript_metadata})
    write_jsonl(JSONL_PATH, transcript_sections)

    write_json(MANAGEMENT_COMMENTARY_PATH, {"generatedAt": iso_now(), "items": management_commentary})
    write_json(GUIDANCE_MENTIONS_PATH, {"generatedAt": iso_now(), "items": guidance_mentions})
    write_json(KPI_MENTIONS_PATH, {"generatedAt": iso_now(), "items": kpi_mentions})
    write_json(RISK_MENTIONS_PATH, {"generatedAt": iso_now(), "items": risk_mentions})
    write_json(CAPITAL_ALLOCATION_PATH, {"generatedAt": iso_now(), "items": capital_allocation_mentions})
    write_json(SEGMENT_MENTIONS_PATH, {"generatedAt": iso_now(), "items": segment_mentions})
    write_json(QA_TOPICS_PATH, {"generatedAt": iso_now(), "items": qa_topics})
    write_json(THESIS_SIGNALS_PATH, {"generatedAt": iso_now(), "items": thesis_signals})
    write_json(EVENT_SUMMARIES_PATH, {"generatedAt": iso_now(), "items": event_summaries})
    write_json(EXTRACTION_WARNINGS_PATH, {"generatedAt": iso_now(), "items": extraction_warnings, "skipped": skipped})

    build_sqlite(
        transcript_metadata,
        transcript_sections,
        speaker_rows,
        management_commentary,
        guidance_mentions,
        kpi_mentions,
        risk_mentions,
        capital_allocation_mentions,
        segment_mentions,
        qa_topics,
        thesis_signals,
        extraction_warnings,
    )

    summary = {
        "generatedAt": iso_now(),
        "discoveredTranscriptCount": len(inventory),
        "uniqueStagedTranscriptCount": len(staged_unique_paths),
        "parsedTranscriptCount": len(transcript_metadata),
        "skippedTranscriptCount": len(skipped),
        "duplicateTranscriptCount": sum(1 for row in inventory if row.isDuplicate),
        "eventDates": [row["eventDate"] for row in transcript_metadata],
        "fiscalPeriods": [row["fiscalPeriod"] for row in transcript_metadata],
        "savedFiles": [
            str(INVENTORY_PATH),
            str(METADATA_PATH),
            str(JSONL_PATH),
            str(MANAGEMENT_COMMENTARY_PATH),
            str(GUIDANCE_MENTIONS_PATH),
            str(KPI_MENTIONS_PATH),
            str(RISK_MENTIONS_PATH),
            str(CAPITAL_ALLOCATION_PATH),
            str(SEGMENT_MENTIONS_PATH),
            str(QA_TOPICS_PATH),
            str(THESIS_SIGNALS_PATH),
            str(EVENT_SUMMARIES_PATH),
            str(EXTRACTION_WARNINGS_PATH),
            str(SQLITE_PATH),
        ],
        "warnings": extraction_warnings,
        "skipped": skipped,
    }
    write_json(PARSE_RUN_SUMMARY_PATH, summary)
    return summary


def main() -> None:
    ensure_dirs()
    inventory, staged_unique_paths = stage_files()
    summary = parse_transcripts(inventory, staged_unique_paths)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
