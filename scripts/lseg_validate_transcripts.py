#!/usr/bin/env python3
"""Validate staged / parsed / extracted LSEG transcript research outputs."""

from __future__ import annotations

import json
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPT_ROOT = REPO_ROOT / "data" / "local" / "lseg" / "transcripts"
RAW_USER_UPLOADED = TRANSCRIPT_ROOT / "raw" / "user_uploaded"
CURATED_ROOT = TRANSCRIPT_ROOT / "curated"
EXTRACTED_ROOT = TRANSCRIPT_ROOT / "extracted"
LOGS_ROOT = TRANSCRIPT_ROOT / "logs"
SQLITE_PATH = TRANSCRIPT_ROOT / "lseg_transcripts.sqlite"

INVENTORY_PATH = CURATED_ROOT / "source_file_inventory.json"
METADATA_PATH = CURATED_ROOT / "transcript_metadata.json"
JSONL_PATH = CURATED_ROOT / "transcripts.jsonl"
EXTRACTION_WARNINGS_PATH = EXTRACTED_ROOT / "extraction_warnings.json"
VALIDATION_SUMMARY_PATH = LOGS_ROOT / "validation_summary.json"

EXTRACTION_FILES = {
    "management_commentary": EXTRACTED_ROOT / "management_commentary.json",
    "guidance_mentions": EXTRACTED_ROOT / "guidance_mentions.json",
    "kpi_mentions": EXTRACTED_ROOT / "kpi_mentions.json",
    "risk_mentions": EXTRACTED_ROOT / "risk_mentions.json",
    "capital_allocation_mentions": EXTRACTED_ROOT / "capital_allocation_mentions.json",
    "segment_mentions": EXTRACTED_ROOT / "segment_mentions.json",
    "qa_topics": EXTRACTED_ROOT / "qa_topics.json",
    "thesis_signals": EXTRACTED_ROOT / "thesis_signals.json",
    "transcript_event_summaries": EXTRACTED_ROOT / "transcript_event_summaries.json",
}

REQUIRED_EXTRACTION_FIELDS = {
    "transcriptId",
    "eventDate",
    "sourcePath",
    "section",
    "confidence",
    "dataQualityTag",
    "sourceType",
}

RISK_CONCENTRATION_THRESHOLD = 0.45


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_json(path: Path) -> dict[str, Any]:
    assert_true(path.exists(), f"Missing required file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    assert_true(path.exists(), f"Missing required file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def sqlite_count(table: str) -> int:
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    value = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return int(value)


def sqlite_payload_rows(table: str) -> list[dict[str, Any]]:
    conn = sqlite3.connect(SQLITE_PATH)
    cur = conn.cursor()
    rows = [json.loads(row[0]) for row in cur.execute(f"SELECT payloadJson FROM {table}").fetchall()]
    conn.close()
    return rows


def sqlite_transcript_ids_from_payload(table: str) -> set[str | None]:
    return {row.get("transcriptId") for row in sqlite_payload_rows(table)}


def validate_extraction_item(
    item: dict[str, Any],
    *,
    collection_name: str,
    metadata_ids: set[str],
) -> None:
    for field in REQUIRED_EXTRACTION_FIELDS:
        assert_true(item.get(field) is not None, f"{collection_name} item missing required field: {field}.")
    assert_true(item["transcriptId"] in metadata_ids, f"{collection_name} item has orphan transcriptId: {item['transcriptId']}.")
    if item.get("suggestedModelMapping") == "valuationAssumption":
        assert_true(item.get("needsHumanReview") is True, "valuationAssumption mappings must require human review.")


def main() -> None:
    inventory = load_json(INVENTORY_PATH)["records"]
    metadata = load_json(METADATA_PATH)["records"]
    sections = load_jsonl(JSONL_PATH)
    extraction_warnings = load_json(EXTRACTION_WARNINGS_PATH)
    extraction_payloads = {name: load_json(path)["items"] for name, path in EXTRACTION_FILES.items()}

    validation_warnings: list[str] = []

    if RAW_USER_UPLOADED.exists():
        staged_files = sorted(path for path in RAW_USER_UPLOADED.iterdir() if path.is_file())
    else:
        staged_files = []
        validation_warnings.append(
            "Transcript raw/user_uploaded directory is missing in this checkout; raw transcript parity checks were skipped."
        )
    staged_paths = {str(path) for path in staged_files}
    inventory_paths = {row["stagedPath"] for row in inventory if row.get("stagedPath")}

    assert_true(staged_paths <= inventory_paths, "Every staged transcript must appear in source_file_inventory.json.")

    metadata_ids = {row["transcriptId"] for row in metadata}
    assert_true(all(row.get("transcriptId") for row in metadata), "Every transcript metadata row must have transcriptId.")

    referenced_clean_text_paths: set[str] = set()
    for row in metadata:
        clean_text_path = Path(row["cleanTextPath"])
        referenced_clean_text_paths.add(str(clean_text_path))
        assert_true(clean_text_path.exists(), f"Clean text file is missing for {row['transcriptId']}.")
        clean_text = clean_text_path.read_text(encoding="utf-8").strip()
        assert_true(len(clean_text) > 0, f"Clean transcript text is empty for {row['transcriptId']}.")

        if row["qualityTag"] != "CompanyDisclosure":
            assert_true(
                row["source"] != "company_ir",
                f"Non-IR transcript should not be mislabeled as company IR for {row['transcriptId']}.",
            )
        if row["source"] in {"manual_upload", "stockanalysis", "seeking_alpha", "manual_exports"}:
            assert_true(
                row["qualityTag"] != "CompanyDisclosure",
                f"Third-party/manual transcript must not be marked CompanyDisclosure for {row['transcriptId']}.",
            )

        if not row.get("eventDate") or not row.get("fiscalPeriod"):
            assert_true(
                any("Missing event date" in warning or "Missing fiscal period" in warning for warning in row["warnings"]),
                f"Missing event metadata must surface a warning for {row['transcriptId']}.",
            )

        if row.get("qaBoundaryConfidence") in {"low", "none"}:
            validation_warnings.append(
                f"{row['transcriptId']}: Q&A boundary confidence is {row.get('qaBoundaryConfidence')}."
            )

    clean_text_dir_files = {str(path) for path in (CURATED_ROOT / "clean_text").glob("*.txt")}
    unreferenced_clean_text = sorted(clean_text_dir_files - referenced_clean_text_paths)
    if unreferenced_clean_text:
        validation_warnings.append(
            f"Found {len(unreferenced_clean_text)} clean_text artifacts not referenced by transcript metadata."
        )

    for record in sections:
        assert_true(record["transcriptId"] in metadata_ids, "Every section row must map to a known transcript.")
        assert_true(record.get("sourcePath"), "Every section row must have sourcePath.")
        assert_true(record.get("text"), "Every section row must have text.")

    for name, items in extraction_payloads.items():
        if name == "transcript_event_summaries":
            for item in items:
                assert_true(item.get("transcriptId"), "transcript_event_summaries item missing transcriptId.")
                assert_true(item.get("transcriptId") in metadata_ids, "transcript_event_summaries item has orphan transcriptId.")
                assert_true(item.get("sourcePath"), "transcript_event_summaries item missing sourcePath.")
                assert_true(item.get("eventDate"), "transcript_event_summaries item missing eventDate.")
            continue
        for item in items:
            validate_extraction_item(item, collection_name=name, metadata_ids=metadata_ids)

    guidance_mentions = extraction_payloads["guidance_mentions"]
    for item in guidance_mentions:
        assert_true(item.get("guidanceType"), "Every guidance mention must include guidanceType.")
        if item.get("numericGuidanceCandidate"):
            assert_true(item.get("supportingQuoteShort"), "Numeric guidance items must include supporting quotes.")
        if item.get("guidanceType") == "explicit_company_guidance":
            assert_true(item.get("needsHumanReview") is True, "explicit_company_guidance rows must require human review.")
            assert_true(item.get("speaker"), "explicit_company_guidance rows must include speaker.")
            assert_true(item.get("eventDate"), "explicit_company_guidance rows must include eventDate.")
            assert_true(item.get("speakerRole") == "management", "explicit_company_guidance must come from management speaker rows.")

    risk_mentions = extraction_payloads["risk_mentions"]
    if risk_mentions:
        risk_counts = Counter(item.get("subtopic") or item.get("topic") for item in risk_mentions)
        top_risk, top_count = risk_counts.most_common(1)[0]
        top_share = top_count / len(risk_mentions)
        if top_share > RISK_CONCENTRATION_THRESHOLD:
            validation_warnings.append(
                f"Risk extraction concentration warning: {top_risk} accounts for {top_share:.1%} of all risk mentions."
            )

    if SQLITE_PATH.exists():
        assert_true(sqlite_count("transcripts") == len(metadata), "SQLite transcripts row count must match transcript metadata count.")
        assert_true(sqlite_count("transcript_sections") == len(sections), "SQLite section row count must match JSONL section count.")

        for table_name, items in extraction_payloads.items():
            sqlite_table = table_name
            if sqlite_table == "transcript_event_summaries":
                continue
            assert_true(
                sqlite_count(sqlite_table) == len(items),
                f"SQLite {sqlite_table} row count must match JSON count.",
            )
            sqlite_ids = sqlite_transcript_ids_from_payload(sqlite_table)
            orphan_ids = sorted(str(tid) for tid in sqlite_ids if tid is not None and tid not in metadata_ids)
            assert_true(not orphan_ids, f"SQLite {sqlite_table} contains orphan transcriptIds: {orphan_ids}.")

        # JSON/JSONL/SQLite cross-checks for key extraction tables
        for key in [
            "management_commentary",
            "guidance_mentions",
            "kpi_mentions",
            "risk_mentions",
            "capital_allocation_mentions",
            "segment_mentions",
            "qa_topics",
            "thesis_signals",
        ]:
            sqlite_rows = sqlite_payload_rows(key)
            assert_true(len(sqlite_rows) == len(extraction_payloads[key]), f"{key} JSON count must match SQLite count.")
        assert_true(
            sqlite_count("extraction_warnings") == len(extraction_warnings["items"]),
            "extraction_warnings JSON count must match SQLite count.",
        )
    else:
        validation_warnings.append(
            "Transcript SQLite database is missing in this checkout; SQLite parity checks were skipped."
        )

    summary = {
        "validatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "stagedTranscriptCount": len(staged_files),
        "inventoryCount": len(inventory),
        "parsedTranscriptCount": len(metadata),
        "sectionCount": len(sections),
        "extractionCounts": {name: len(items) for name, items in extraction_payloads.items()},
        "warningCount": len(extraction_warnings["items"]),
        "validationWarningCount": len(validation_warnings),
        "validationWarnings": validation_warnings,
        "status": "passed",
    }
    VALIDATION_SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
