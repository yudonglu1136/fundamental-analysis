#!/usr/bin/env python3
"""Build a distributable Guru CUSIP-to-provider-ticker security master.

Inputs are an official-SEC manifest produced by
``build-guru-sec-cusip-manifest.mjs`` and exact ID_CUSIP/ID_CINS results from
the OpenFIGI API. The application database and paid vendor files are
intentionally not accepted as inputs.

Resolution is conservative:

* only an exact CUSIP query is used;
* only OpenFIGI's US composite equity record is eligible;
* more than one distinct US identity is ambiguous and remains unresolved;
* the selected ticker must resolve at the configured public price provider and
  its issuer name must reconcile to the OpenFIGI identity;
* all missing, ambiguous, or failed identities remain explicit and fail closed.

Response caches make the operation resumable and allow byte-for-byte
deterministic rebuilds without repeatedly calling public APIs.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable


OPENFIGI_MAPPING_URL = "https://api.openfigi.com/v3/mapping"
OPENFIGI_DOCS_URL = "https://www.openfigi.com/api/documentation"
OPENFIGI_BENEFITS_URL = "https://www.openfigi.com/about/benefits"
OPENFIGI_TERMS_URL = "https://www.openfigi.com/docs/terms-of-service"
YAHOO_SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark"
USER_AGENT = "Mozilla/5.0 ThesisForge security-master-builder/1.0"
SEC_SOURCE_POLICY = "direct_official_sec_submissions_and_archive_documents_no_derived_cache"
SEC_HOLDING_SELECTION_POLICY = (
    "top_60_common_long_shares_excluding_explicit_non_common_titles_"
    "by_reported_value_per_filing"
)
VALID_CUSIP = re.compile(r"^[0-9A-Z]{8,9}$")
VALID_TICKER = re.compile(r"^[A-Z0-9][A-Z0-9./-]{0,19}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sec-manifest", type=Path, required=True)
    parser.add_argument(
        "--sec-manifest-reference",
        default="",
        help=(
            "Packaged runtime path recorded in the artifact. Use a repository-relative "
            "path when the input manifest is built in a temporary directory."
        ),
    )
    parser.add_argument("--openfigi-cache", type=Path, required=True)
    parser.add_argument("--yahoo-cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--openfigi-api-key-env", default="OPENFIGI_API_KEY")
    parser.add_argument("--openfigi-batch-size", type=int)
    parser.add_argument("--openfigi-delay-seconds", type=float)
    parser.add_argument("--yahoo-batch-size", type=int, default=20)
    parser.add_argument("--yahoo-delay-seconds", type=float, default=0.35)
    parser.add_argument("--seed-openfigi-jobs", type=Path)
    parser.add_argument("--seed-openfigi-results", type=Path)
    parser.add_argument("--offline", action="store_true")
    return parser.parse_args()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def read_json(path: Path, *, label: str) -> Any:
    if not path.is_file():
        raise SystemExit(f"{label} is missing: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"{label} is unreadable or corrupt: {path}: {error}") from error


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def validate_generated_at(value: str) -> str:
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError as error:
        raise SystemExit("--generated-at must be a valid fixed ISO timestamp") from error
    if parsed.tzinfo is None:
        raise SystemExit("--generated-at must include a timezone")
    parsed_utc = parsed.astimezone(dt.timezone.utc)
    if parsed_utc > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
        raise SystemExit("--generated-at cannot be more than five minutes in the future")
    return parsed_utc.isoformat().replace("+00:00", "Z")


def validate_sec_manifest(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise SystemExit("SEC CUSIP manifest schemaVersion must be 1")
    if payload.get("sourcePolicy") != SEC_SOURCE_POLICY:
        raise SystemExit(
            "SEC CUSIP manifest must come directly from official SEC sources; "
            "derived snapshot/backtest caches are rejected"
        )
    if payload.get("holdingSelectionPolicy") != SEC_HOLDING_SELECTION_POLICY:
        raise SystemExit(
            "SEC CUSIP manifest holding selection does not match the audited top-60 common-long engine scope"
        )
    records = {
        "managers": payload.get("managers"),
        "filings": payload.get("filings"),
        "cusips": payload.get("cusips"),
    }
    expected_hash = str(payload.get("recordsSha256") or "")
    actual_hash = sha256_json(records)
    if not re.fullmatch(r"[0-9a-f]{64}", expected_hash) or expected_hash != actual_hash:
        raise SystemExit(
            f"SEC CUSIP manifest records hash mismatch: expected={expected_hash or 'missing'} "
            f"actual={actual_hash}"
        )
    cusips = records["cusips"]
    if not isinstance(cusips, list) or not cusips:
        raise SystemExit("SEC CUSIP manifest has no observed CUSIPs")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in cusips:
        cusip = str(raw.get("cusip") or "").strip().upper() if isinstance(raw, dict) else ""
        if not VALID_CUSIP.fullmatch(cusip):
            raise SystemExit(f"SEC CUSIP manifest contains an invalid CUSIP: {cusip!r}")
        if cusip in seen:
            raise SystemExit(f"SEC CUSIP manifest contains duplicate CUSIP {cusip}")
        seen.add(cusip)
        normalized.append({
            "cusip": cusip,
            "managerIds": sorted({str(item) for item in raw.get("managerIds", []) if item}),
            "issuerNames": sorted({str(item).strip() for item in raw.get("issuerNames", []) if str(item).strip()}),
            "titles": sorted({str(item).strip() for item in raw.get("titles", []) if str(item).strip()}),
            "observationCount": int(raw.get("observationCount") or 0),
            "maxSelectedWeightPpm": int(raw.get("maxSelectedWeightPpm") or 0),
            "firstReportDate": str(raw.get("firstReportDate") or ""),
            "lastReportDate": str(raw.get("lastReportDate") or ""),
        })
    return sorted(normalized, key=lambda row: row["cusip"])


def load_cache(path: Path, kind: str) -> dict[str, Any]:
    if not path.exists():
        return {"schemaVersion": 1, "kind": kind, "responses": {}, "requestIdTypes": {}}
    payload = read_json(path, label=f"{kind} response cache")
    if payload.get("schemaVersion") != 1 or payload.get("kind") != kind:
        raise SystemExit(f"Unexpected {kind} response-cache schema: {path}")
    if not isinstance(payload.get("responses"), dict):
        raise SystemExit(f"Corrupt {kind} response cache (responses must be an object): {path}")
    if kind == "openfigi_mapping":
        request_types = payload.setdefault("requestIdTypes", {})
        if not isinstance(request_types, dict):
            raise SystemExit(f"Corrupt {kind} response cache (requestIdTypes must be an object): {path}")
        # Cache schema v1 originally omitted the request type. Numeric CUSIPs
        # were necessarily sent as ID_CUSIP; letter-prefixed CINS values are
        # intentionally not inferred and must be re-queried as ID_CINS.
        for identifier in payload["responses"]:
            if identifier[:1].isdigit() and identifier not in request_types:
                request_types[identifier] = "ID_CUSIP"
    return payload


def openfigi_id_type(identifier: str) -> str:
    return "ID_CUSIP" if identifier[:1].isdigit() else "ID_CINS"


def request_json(url: str, *, body: Any | None = None, headers: dict[str, str] | None = None,
                 retries: int = 5) -> Any:
    data = None if body is None else canonical_json(body).encode("utf-8")
    request_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})}
    if data is not None:
        request_headers["Content-Type"] = "application/json"
    for attempt in range(retries):
        request = urllib.request.Request(url, data=data, headers=request_headers,
                                         method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            retriable = error.code in {429, 500, 502, 503, 504}
            if not retriable or attempt + 1 >= retries:
                detail = error.read().decode("utf-8", errors="replace")[:500]
                raise RuntimeError(f"HTTP {error.code} from {url}: {detail}") from error
            if error.code == 429:
                retry_after = error.headers.get("Retry-After", "60")
                try:
                    delay = max(1.0, float(retry_after))
                except ValueError:
                    delay = 60.0
            else:
                delay = min(30.0, 2.0 ** attempt)
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt + 1 >= retries:
                raise RuntimeError(f"Request failed for {url}: {error}") from error
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def seed_openfigi_cache(cache: dict[str, Any], jobs_path: Path | None,
                        results_path: Path | None) -> None:
    if not jobs_path and not results_path:
        return
    if not jobs_path or not results_path:
        raise SystemExit("--seed-openfigi-jobs and --seed-openfigi-results must be supplied together")
    jobs = read_json(jobs_path, label="seed OpenFIGI jobs")
    results = read_json(results_path, label="seed OpenFIGI results")
    if not isinstance(jobs, list) or not isinstance(results, list) or len(jobs) != len(results):
        raise SystemExit("seed OpenFIGI jobs/results must be equal-length arrays")
    for job, result in zip(jobs, results, strict=True):
        cusip = str(job.get("idValue") or "").strip().upper()
        id_type = openfigi_id_type(cusip)
        if (VALID_CUSIP.fullmatch(cusip) and job.get("idType") == id_type and
                cache.get("requestIdTypes", {}).get(cusip) != id_type):
            cache["responses"][cusip] = result
            cache.setdefault("requestIdTypes", {})[cusip] = id_type


def fetch_openfigi(cusips: list[str], cache: dict[str, Any], *, api_key: str,
                   batch_size: int, delay_seconds: float, offline: bool,
                   cache_path: Path) -> None:
    request_types = cache.setdefault("requestIdTypes", {})
    missing = [
        cusip for cusip in cusips
        if cusip not in cache["responses"] or request_types.get(cusip) != openfigi_id_type(cusip)
    ]
    if missing and offline:
        raise SystemExit(
            f"OpenFIGI cache is incomplete in offline mode: {len(missing)} missing; "
            f"first={','.join(missing[:10])}"
        )
    headers = {"X-OPENFIGI-APIKEY": api_key} if api_key else {}
    for offset in range(0, len(missing), batch_size):
        batch = missing[offset:offset + batch_size]
        jobs = [{"idType": openfigi_id_type(cusip), "idValue": cusip, "marketSecDes": "Equity"}
                for cusip in batch]
        result = request_json(OPENFIGI_MAPPING_URL, body=jobs, headers=headers)
        if not isinstance(result, list) or len(result) != len(batch):
            raise RuntimeError(
                f"OpenFIGI response length mismatch: requested={len(batch)} "
                f"received={len(result) if isinstance(result, list) else 'non-array'}"
            )
        for cusip, response in zip(batch, result, strict=True):
            cache["responses"][cusip] = response
            request_types[cusip] = openfigi_id_type(cusip)
        write_json(cache_path, cache)
        if offset + batch_size < len(missing):
            time.sleep(delay_seconds)


def provider_ticker(openfigi_ticker: str) -> str:
    value = openfigi_ticker.strip().upper().replace("/", ".")
    return value if VALID_TICKER.fullmatch(value) else ""


def summarize_candidate(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "figi": str(raw.get("figi") or ""),
        "compositeFigi": str(raw.get("compositeFIGI") or ""),
        "shareClassFigi": str(raw.get("shareClassFIGI") or ""),
        "ticker": str(raw.get("ticker") or "").strip().upper(),
        "name": str(raw.get("name") or "").strip(),
        "exchangeCode": str(raw.get("exchCode") or "").strip().upper(),
        "marketSector": str(raw.get("marketSector") or "").strip(),
        "securityType": str(raw.get("securityType") or "").strip(),
        "securityType2": str(raw.get("securityType2") or "").strip(),
    }


def eligible_us_candidates(response: Any) -> list[dict[str, Any]]:
    raw_rows = response.get("data", []) if isinstance(response, dict) else []
    eligible = []
    for raw in raw_rows if isinstance(raw_rows, list) else []:
        candidate = summarize_candidate(raw)
        if candidate["exchangeCode"] != "US" or candidate["marketSector"].lower() != "equity":
            continue
        if not provider_ticker(candidate["ticker"]):
            continue
        eligible.append(candidate)
    unique: dict[tuple[str, ...], dict[str, Any]] = {}
    for row in eligible:
        identity = (
            row["compositeFigi"] or row["figi"],
            row["shareClassFigi"],
            row["ticker"],
            row["name"],
            row["securityType2"],
        )
        unique[identity] = row
    return sorted(unique.values(), key=lambda row: (
        row["compositeFigi"], row["shareClassFigi"], row["ticker"],
        row["name"], row["figi"]
    ))


def normalized_openfigi_audit_responses(responses: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for cusip, response in sorted(responses.items()):
        raw_rows = response.get("data", []) if isinstance(response, dict) else []
        candidates = [summarize_candidate(row) for row in raw_rows if isinstance(row, dict)]
        candidates.sort(key=canonical_json)
        normalized[cusip] = {
            "data": candidates,
            "error": str(response.get("error") or "") if isinstance(response, dict) else "invalid_response",
        }
    return normalized


CORPORATE_STOP_WORDS = {
    "A", "B", "ADR", "ADS", "AND", "CLASS", "CL", "CO", "COMMON", "CORP",
    "CORPORATION", "DEL", "INC", "LTD", "LIMITED", "LP", "NEW", "NV", "ORD",
    "PLC", "SA", "SAB", "SE", "SH", "SHS", "STOCK", "THE", "TR", "TRUST",
}
TOKEN_ALIASES = {
    "BK": "BANK", "BANCORP": "BANK", "COS": "COMPANIES", "ENTMT": "ENTERTAINMENT",
    "HLDG": "HOLDINGS", "HLDGS": "HOLDINGS", "INTL": "INTERNATIONAL",
    "MFG": "MANUFACTURING", "MGMT": "MANAGEMENT", "TECHN": "TECHNOLOGIES",
}


def name_tokens(value: str) -> set[str]:
    tokens = re.findall(r"[A-Z0-9]+", value.upper())
    normalized = (TOKEN_ALIASES.get(token, token) for token in tokens)
    return {token for token in normalized if token not in CORPORATE_STOP_WORDS and len(token) > 1}


def names_reconcile(openfigi_name: str, provider_names: Iterable[str]) -> bool:
    expected = name_tokens(openfigi_name)
    if not expected:
        return False
    for name in provider_names:
        observed = name_tokens(name)
        if not observed:
            continue
        intersection = expected & observed
        overlap = len(intersection) / min(len(expected), len(observed))
        if overlap >= 0.5 and (len(intersection) >= 2 or min(len(expected), len(observed)) == 1):
            return True
    return False


def yahoo_symbol(ticker: str) -> str:
    return ticker.replace(".", "-")


def load_yahoo_batch(symbols: list[str]) -> dict[str, Any]:
    query = urllib.parse.urlencode({
        "symbols": ",".join(symbols),
        "range": "max",
        "interval": "1mo",
    })
    payload = request_json(f"{YAHOO_SPARK_URL}?{query}")
    result = payload.get("spark", {}).get("result", []) if isinstance(payload, dict) else []
    return {str(row.get("symbol") or "").upper(): row for row in result if isinstance(row, dict)}


def compact_yahoo_response(symbol: str, row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {"status": "not_found", "symbol": symbol}
    response = (row.get("response") or [{}])[0]
    meta = response.get("meta") or {}
    timestamps = sorted({int(value) for value in response.get("timestamp", []) if value})
    return {
        "status": "available" if timestamps else "no_price_points",
        "symbol": str(meta.get("symbol") or symbol).upper(),
        "longName": str(meta.get("longName") or ""),
        "shortName": str(meta.get("shortName") or ""),
        "instrumentType": str(meta.get("instrumentType") or ""),
        "exchangeName": str(meta.get("exchangeName") or ""),
        "firstTradeDate": int(meta.get("firstTradeDate") or 0),
        "firstObservedDate": dt.datetime.fromtimestamp(timestamps[0], dt.timezone.utc).date().isoformat()
        if timestamps else None,
        "lastObservedDate": dt.datetime.fromtimestamp(timestamps[-1], dt.timezone.utc).date().isoformat()
        if timestamps else None,
    }


def fetch_yahoo(candidates: dict[str, dict[str, Any]], cache: dict[str, Any], *,
                batch_size: int, delay_seconds: float, offline: bool,
                cache_path: Path) -> None:
    symbols = sorted({yahoo_symbol(provider_ticker(row["candidate"]["ticker"]))
                      for row in candidates.values()})
    missing = [symbol for symbol in symbols if symbol not in cache["responses"]]
    if missing and offline:
        raise SystemExit(
            f"Yahoo provider cache is incomplete in offline mode: {len(missing)} missing; "
            f"first={','.join(missing[:10])}"
        )
    for offset in range(0, len(missing), batch_size):
        batch = missing[offset:offset + batch_size]
        rows = load_yahoo_batch(batch)
        for symbol in batch:
            cache["responses"][symbol] = compact_yahoo_response(symbol, rows.get(symbol))
        write_json(cache_path, cache)
        if offset + batch_size < len(missing):
            time.sleep(delay_seconds)


def date_with_days(value: str, days: int) -> dt.date:
    return dt.date.fromisoformat(value) + dt.timedelta(days=days)


def provider_validation_reason(observation: dict[str, Any], candidate: dict[str, Any],
                               provider: dict[str, Any]) -> str:
    if provider.get("status") != "available":
        return "provider_price_unavailable"
    expected_symbol = yahoo_symbol(provider_ticker(candidate["ticker"]))
    if str(provider.get("symbol") or "").upper() != expected_symbol:
        return "provider_symbol_mismatch"
    if str(provider.get("instrumentType") or "").upper() not in {"EQUITY", "ETF", "MUTUALFUND"}:
        return "provider_instrument_type_mismatch"
    if not names_reconcile(candidate["name"], [provider.get("longName", ""), provider.get("shortName", "")]):
        return "provider_identity_name_mismatch"
    first_observed = provider.get("firstObservedDate")
    last_observed = provider.get("lastObservedDate")
    if not first_observed or not last_observed:
        return "provider_price_unavailable"
    if dt.date.fromisoformat(first_observed) > date_with_days(observation["lastReportDate"], 125):
        return "provider_history_starts_after_observed_holding"
    if dt.date.fromisoformat(last_observed) < date_with_days(observation["firstReportDate"], -125):
        return "provider_history_ends_before_observed_holding"
    return ""


def public_provider_validation(provider: dict[str, Any], *, identity_match: bool) -> dict[str, Any]:
    """Keep mutable provider descriptions in the untracked cache, not the artifact."""
    return {
        "provider": "Yahoo Finance chart/spark",
        "status": str(provider.get("status") or "unknown"),
        "symbol": str(provider.get("symbol") or ""),
        "instrumentType": str(provider.get("instrumentType") or ""),
        "firstObservedDate": provider.get("firstObservedDate"),
        "lastObservedDate": provider.get("lastObservedDate"),
        "identityNameMatch": identity_match,
    }


def build_payload(sec_manifest: dict[str, Any], observations: list[dict[str, Any]],
                  openfigi_cache: dict[str, Any], yahoo_cache: dict[str, Any],
                  generated_at: str, sec_manifest_path: str) -> dict[str, Any]:
    uniquely_mapped: dict[str, dict[str, Any]] = {}
    unresolved: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []

    for observation in observations:
        cusip = observation["cusip"]
        response = openfigi_cache["responses"].get(cusip)
        candidates = eligible_us_candidates(response)
        if not candidates:
            response_error = response.get("error") if isinstance(response, dict) else None
            unresolved.append({
                "cusip": cusip,
                "reason": "openfigi_no_unique_us_equity" if not response_error else "openfigi_error",
                "detail": str(response_error or "") or None,
                "managerIds": observation["managerIds"],
                "maxSelectedWeightPpm": observation["maxSelectedWeightPpm"],
            })
            continue
        identities = {
            (row["compositeFigi"] or row["figi"], row["shareClassFigi"], row["ticker"])
            for row in candidates
        }
        if len(identities) != 1:
            ambiguous.append({
                "cusip": cusip,
                "reason": "multiple_openfigi_us_equity_identities",
                "managerIds": observation["managerIds"],
                "maxSelectedWeightPpm": observation["maxSelectedWeightPpm"],
                "candidates": [{
                    "securityId": row["compositeFigi"] or row["figi"],
                    "ticker": row["ticker"],
                    "name": row["name"],
                    "securityType2": row["securityType2"],
                } for row in candidates],
            })
            continue
        uniquely_mapped[cusip] = {"observation": observation, "candidate": candidates[0]}

    securities: list[dict[str, Any]] = []
    for cusip, item in sorted(uniquely_mapped.items()):
        observation = item["observation"]
        candidate = item["candidate"]
        ticker = provider_ticker(candidate["ticker"])
        provider = yahoo_cache["responses"].get(yahoo_symbol(ticker), {})
        failure = provider_validation_reason(observation, candidate, provider)
        if failure:
            unresolved.append({
                "cusip": cusip,
                "reason": failure,
                "managerIds": observation["managerIds"],
                "maxSelectedWeightPpm": observation["maxSelectedWeightPpm"],
                "openFigiSecurityId": candidate["compositeFigi"] or candidate["figi"],
                "openFigiTicker": candidate["ticker"],
                "providerValidation": public_provider_validation(provider, identity_match=False),
            })
            continue
        securities.append({
            "cusip": cusip,
            "securityId": candidate["compositeFigi"] or candidate["figi"],
            "ticker": ticker,
            "openFigiTicker": candidate["ticker"],
            "name": candidate["name"],
            "compositeFigi": candidate["compositeFigi"],
            "shareClassFigi": candidate["shareClassFigi"],
            "securityType2": candidate["securityType2"],
            "exchangeCode": candidate["exchangeCode"],
            "firstReportDate": observation["firstReportDate"],
            "lastReportDate": observation["lastReportDate"],
            "providerValidation": public_provider_validation(provider, identity_match=True),
        })

    securities.sort(key=lambda row: row["cusip"])
    unresolved.sort(key=lambda row: row["cusip"])
    ambiguous.sort(key=lambda row: row["cusip"])
    records = {"securities": securities, "unresolved": unresolved, "ambiguous": ambiguous}
    selection = {
        "observedCusips": len(observations),
        "openFigiUniqueUsEquities": len(uniquely_mapped),
        "resolvedCusips": len(securities),
        "unresolvedCusips": len(unresolved),
        "ambiguousCusips": len(ambiguous),
    }
    if sum(selection[key] for key in ("resolvedCusips", "unresolvedCusips", "ambiguousCusips")) != len(observations):
        raise AssertionError("security-master partition does not reconcile to SEC observations")
    relevant_openfigi_responses = {
        row["cusip"]: openfigi_cache["responses"].get(row["cusip"])
        for row in observations
    }
    relevant_yahoo_symbols = sorted({
        yahoo_symbol(provider_ticker(item["candidate"]["ticker"]))
        for item in uniquely_mapped.values()
    })
    relevant_yahoo_responses = {
        symbol: yahoo_cache["responses"].get(symbol)
        for symbol in relevant_yahoo_symbols
    }
    return {
        "schemaVersion": 2,
        "generatedAt": generated_at,
        "matchingPolicy": (
            "exact_numeric_cusip_or_letter_prefixed_cins_to_single_openfigi_us_equity_then_"
            "yahoo_symbol_name_and_history_validation"
        ),
        "source": {
            "identifierProvider": "OpenFIGI",
            "identifierApiUrl": OPENFIGI_MAPPING_URL,
            "identifierDocumentationUrl": OPENFIGI_DOCS_URL,
            "identifierOpenDataBenefitsUrl": OPENFIGI_BENEFITS_URL,
            "identifierTermsUrl": OPENFIGI_TERMS_URL,
            "identifierLicense": "public-domain dedication / MIT open-data standard",
            "identifierUseNote": (
                "OpenFIGI's official terms dedicate FIGI identifiers to the public domain and its "
                "official materials describe the identifier and associated metadata as open data. "
                "Third-party input identifiers remain subject to their own terms."
            ),
            "holdingProvider": "U.S. Securities and Exchange Commission",
            "holdingManifestPath": sec_manifest_path,
            "holdingManifestPolicy": sec_manifest["sourcePolicy"],
            "holdingSelectionPolicy": sec_manifest["holdingSelectionPolicy"],
            "holdingManifestRecordsSha256": sec_manifest["recordsSha256"],
            "holdingManifestGeneratedAt": sec_manifest.get("generatedAt"),
            "thirdPartyIdentifierNotice": (
                "CUSIP strings are transcribed only from cited public SEC information tables as lookup keys; "
                "this artifact is not a CUSIP master database. Review any applicable third-party identifier terms."
            ),
            "providerValidation": "Yahoo Finance chart/spark metadata and observed monthly history",
            "openFigiResponseSha256": sha256_json(
                normalized_openfigi_audit_responses(relevant_openfigi_responses)
            ),
            "providerValidationResponseSha256": sha256_json(relevant_yahoo_responses),
        },
        "selection": selection,
        "recordsSha256": sha256_json(records),
        **records,
    }


def main() -> None:
    args = parse_args()
    generated_at = validate_generated_at(args.generated_at)
    sec_manifest = read_json(args.sec_manifest, label="official SEC CUSIP manifest")
    observations = validate_sec_manifest(sec_manifest)
    openfigi_cache = load_cache(args.openfigi_cache, "openfigi_mapping")
    yahoo_cache = load_cache(args.yahoo_cache, "yahoo_provider_validation")
    seed_openfigi_cache(openfigi_cache, args.seed_openfigi_jobs, args.seed_openfigi_results)
    write_json(args.openfigi_cache, openfigi_cache)

    api_key = os.environ.get(args.openfigi_api_key_env, "").strip()
    batch_size = args.openfigi_batch_size or (100 if api_key else 10)
    if batch_size < 1 or batch_size > (100 if api_key else 10):
        raise SystemExit("OpenFIGI batch size exceeds the documented authenticated/anonymous limit")
    delay_seconds = args.openfigi_delay_seconds
    if delay_seconds is None:
        delay_seconds = 0.35 if api_key else 2.5
    fetch_openfigi(
        [row["cusip"] for row in observations], openfigi_cache,
        api_key=api_key, batch_size=batch_size, delay_seconds=delay_seconds,
        offline=args.offline, cache_path=args.openfigi_cache,
    )

    pre_candidates: dict[str, dict[str, Any]] = {}
    for observation in observations:
        candidates = eligible_us_candidates(openfigi_cache["responses"].get(observation["cusip"]))
        identities = {
            (row["compositeFigi"] or row["figi"], row["shareClassFigi"], row["ticker"])
            for row in candidates
        }
        if len(identities) == 1:
            pre_candidates[observation["cusip"]] = {
                "observation": observation,
                "candidate": candidates[0],
            }
    fetch_yahoo(
        pre_candidates, yahoo_cache, batch_size=args.yahoo_batch_size,
        delay_seconds=args.yahoo_delay_seconds, offline=args.offline,
        cache_path=args.yahoo_cache,
    )

    manifest_reference = args.sec_manifest_reference.strip() or args.sec_manifest.as_posix()
    if Path(manifest_reference).is_absolute():
        raise SystemExit(
            "--sec-manifest-reference must be a packaged repository-relative path; "
            "absolute build-machine paths are not distributable"
        )

    payload = build_payload(
        sec_manifest, observations, openfigi_cache, yahoo_cache, generated_at,
        manifest_reference,
    )
    write_json(args.output, payload)
    print(canonical_json({
        "output": str(args.output.resolve()),
        **payload["selection"],
        "recordsSha256": payload["recordsSha256"],
    }))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted; response caches were preserved for a resumable run.", file=sys.stderr)
        raise SystemExit(130)
