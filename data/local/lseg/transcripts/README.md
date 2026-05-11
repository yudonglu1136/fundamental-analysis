# LSEG Transcript Research Store

This directory holds a local transcript research database for London Stock Exchange Group (`LSEG.L`).

## Directory Structure

- `raw/`
  - `user_uploaded/`: staged copies of transcript files discovered in the repo
  - `company_ir/`: reserved for future verified IR-source transcripts
  - `stockanalysis/`: reserved for future StockAnalysis transcripts
  - `seeking_alpha/`: reserved for future Seeking Alpha transcripts
  - `manual_exports/`: reserved for future manually exported transcripts
- `curated/`
  - `source_file_inventory.json`: inventory of discovered transcript files and staging metadata
  - `transcript_metadata.json`: one metadata record per parsed transcript
  - `transcripts.jsonl`: normalized transcript sections / utterances
  - `clean_text/`: normalized per-transcript plain-text files
- `extracted/`
  - `management_commentary.json`
  - `guidance_mentions.json`
  - `kpi_mentions.json`
  - `risk_mentions.json`
  - `capital_allocation_mentions.json`
  - `segment_mentions.json`
  - `qa_topics.json`
  - `thesis_signals.json`
  - `transcript_event_summaries.json`
  - `extraction_warnings.json`
- `logs/`
  - `parse_run_summary.json`
  - `validation_summary.json`
- `lseg_transcripts.sqlite`

## How To Add New Transcripts

1. Put the original transcript files anywhere inside the repo if you want the discovery pass to find them automatically.
2. Supported formats:
   - `.txt`
   - `.md`
   - `.html`
   - `.pdf`
   - `.docx`
   - `.json`
   - `.csv`
3. Do not delete or move the original files. The parser copies likely transcript files into `raw/user_uploaded/`.

## How To Parse

From the repo root:

```bash
python scripts/lseg_parse_transcripts.py
```

If Python dependencies are missing, install them locally:

```bash
python -m pip install --target .pythonlibs pypdf python-docx beautifulsoup4 lxml
```

## How To Validate

```bash
python scripts/lseg_validate_transcripts.py
```

## Source / Provenance Rules

- Uploaded transcripts are treated as `ManualUpload` unless their original publisher is verified.
- Third-party transcripts can contain errors and should not be treated as official company disclosure.
- Only transcripts verified as coming from LSEG IR should be labeled `CompanyDisclosure`.
- If event date, fiscal period, event type, or source cannot be inferred confidently, the parser records warnings instead of guessing.

## How Extracted Insights Should Be Used

- The extracted JSON files are a research layer, not a direct valuation input.
- Extracted guidance, KPI mentions, risk flags, and thesis signals should be **human reviewed** before any mapping into:
  - `guidance.ts`
  - `forecastAnchors.ts`
  - `strategicOptionality.ts`
  - validation warnings
- Extracted transcript commentary should not automatically update valuation assumptions.
- Any future valuation-assumption mapping should preserve a supporting quote and manual approval trail.

## Manual Review Workflow

1. Run parse + validation.
2. Review:
   - `curated/transcript_metadata.json`
   - `extracted/guidance_mentions.json`
   - `extracted/kpi_mentions.json`
   - `extracted/risk_mentions.json`
   - `extracted/thesis_signals.json`
3. Mark which extracted items are:
   - research notes only
   - KPI monitors
   - guidance candidates
   - risk warnings
   - strategic optionality inputs
4. Only after human review should any transcript insight be mapped into the LSEG model data layer.
