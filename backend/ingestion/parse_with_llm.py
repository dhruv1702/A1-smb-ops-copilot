"""LLM-backed fallback parser for arbitrary document text."""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config import load_env
from backend.schemas.business_state import BusinessState, compact_text, empty_business_state


DEFAULT_MODEL = "gpt-4o-mini"
RESPONSES_API_URL = "https://api.openai.com/v1/responses"

LLM_EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "source_type": {"type": "string", "enum": ["email", "invoice", "note"]},
        "title": {"type": "string"},
        "snippet": {"type": "string"},
        "date": {"type": ["string", "null"]},
        "customers": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "company_name": {"type": ["string", "null"]},
                    "contact_name": {"type": ["string", "null"]},
                    "contact_email": {"type": ["string", "null"]},
                    "status": {"type": ["string", "null"]},
                },
                "required": ["company_name", "contact_name", "contact_email", "status"],
            },
        },
        "invoices": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "company_name": {"type": ["string", "null"]},
                    "invoice_number": {"type": ["string", "null"]},
                    "amount": {"type": ["number", "null"]},
                    "currency": {"type": ["string", "null"]},
                    "due_date": {"type": ["string", "null"]},
                    "status": {"type": "string"},
                },
                "required": [
                    "company_name",
                    "invoice_number",
                    "amount",
                    "currency",
                    "due_date",
                    "status",
                ],
            },
        },
        "open_issues": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "company_name": {"type": ["string", "null"]},
                    "issue_type": {"type": "string"},
                    "status": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["company_name", "issue_type", "status", "summary"],
            },
        },
        "commitments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "commitment": {"type": "string"},
                    "trigger": {"type": ["string", "null"]},
                    "due_hint": {"type": ["string", "null"]},
                },
                "required": ["commitment", "trigger", "due_hint"],
            },
        },
        "sops": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["title", "summary"],
            },
        },
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "event_type": {"type": "string"},
                    "title": {"type": "string"},
                    "event_date": {"type": ["string", "null"]},
                },
                "required": ["event_type", "title", "event_date"],
            },
        },
        "unknowns": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "field_name": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["field_name", "reason"],
            },
        },
    },
    "required": [
        "source_type",
        "title",
        "snippet",
        "date",
        "customers",
        "invoices",
        "open_issues",
        "commitments",
        "sops",
        "events",
        "unknowns",
    ],
}


def llm_parser_configured() -> bool:
    load_env()
    return bool(os.getenv("OPENAI_API_KEY"))


def parse_document_with_llm(
    source_id: str,
    title: str,
    text: str,
    *,
    source_type_hint: Optional[str] = None,
    reference_date: Optional[date] = None,
) -> BusinessState:
    load_env()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    payload = {
        "model": model,
        "instructions": (
            "You normalize one messy business document into a strict extraction object for an SMB ops copilot. "
            "Only extract facts that are explicit in the document. Do not invent fields. "
            "Pick source_type as email, invoice, or note. "
            "If a value is missing, use null or place it in unknowns. "
            "Keep snippets compact. Prefer deterministic field names and ISO dates when present."
        ),
        "input": "\n".join(
            [
                f"reference_date: {reference_date.isoformat() if reference_date else 'unknown'}",
                f"source_id: {source_id}",
                f"title: {title}",
                f"source_type_hint: {source_type_hint or 'unknown'}",
                "document_text:",
                text,
            ]
        ),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "business_state_document_extraction",
                "schema": LLM_EXTRACTION_SCHEMA,
                "strict": True,
            }
        },
    }

    request = Request(
        RESPONSES_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=90) as response:
            raw_response = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error: {exc.code} {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"OpenAI API request failed: {exc.reason}") from exc

    raw_output = _extract_output_text(raw_response)
    return _normalize_llm_output(
        json.loads(raw_output),
        source_id=source_id,
        fallback_title=title,
        original_text=text,
        source_type_hint=source_type_hint,
    )


def _extract_output_text(response_payload: dict[str, Any]) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output = response_payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for content_item in content:
                if not isinstance(content_item, dict):
                    continue
                text_value = content_item.get("text")
                if isinstance(text_value, str) and text_value.strip():
                    return text_value

    raise RuntimeError("OpenAI response did not include structured output text.")


def _normalize_llm_output(
    raw_output: dict[str, Any],
    *,
    source_id: str,
    fallback_title: str,
    original_text: str,
    source_type_hint: Optional[str],
) -> BusinessState:
    state = empty_business_state()
    source_type = raw_output.get("source_type")
    if source_type not in {"email", "invoice", "note"}:
        source_type = source_type_hint if source_type_hint in {"email", "invoice", "note"} else "note"

    state["source_map"][source_id] = {
        "source_type": source_type,
        "title": _string_or_fallback(raw_output.get("title"), fallback_title),
        "snippet": _string_or_fallback(raw_output.get("snippet"), compact_text(original_text)),
        "date": _optional_string(raw_output.get("date")),
    }

    for record in raw_output.get("customers", []):
        if not isinstance(record, dict):
            continue
        state["customers"].append(
            {
                "source_id": source_id,
                "company_name": _optional_string(record.get("company_name")),
                "contact_name": _optional_string(record.get("contact_name")),
                "contact_email": _optional_string(record.get("contact_email")),
                "status": _optional_string(record.get("status")),
            }
        )

    for record in raw_output.get("invoices", []):
        if not isinstance(record, dict):
            continue
        state["invoices"].append(
            {
                "source_id": source_id,
                "company_name": _optional_string(record.get("company_name")),
                "invoice_number": _optional_string(record.get("invoice_number")),
                "amount": _optional_number(record.get("amount")),
                "currency": _optional_string(record.get("currency")),
                "due_date": _optional_string(record.get("due_date")),
                "status": _string_or_fallback(record.get("status"), "unknown"),
            }
        )

    for record in raw_output.get("open_issues", []):
        if not isinstance(record, dict):
            continue
        state["open_issues"].append(
            {
                "source_id": source_id,
                "company_name": _optional_string(record.get("company_name")),
                "issue_type": _string_or_fallback(record.get("issue_type"), "document_attention"),
                "status": _string_or_fallback(record.get("status"), "open"),
                "summary": _string_or_fallback(record.get("summary"), "Document requires review."),
            }
        )

    for record in raw_output.get("commitments", []):
        if not isinstance(record, dict):
            continue
        commitment = _optional_string(record.get("commitment"))
        if not commitment:
            continue
        state["commitments"].append(
            {
                "source_id": source_id,
                "commitment": commitment,
                "trigger": _optional_string(record.get("trigger")),
                "due_hint": _optional_string(record.get("due_hint")),
            }
        )

    for record in raw_output.get("sops", []):
        if not isinstance(record, dict):
            continue
        summary = _optional_string(record.get("summary"))
        if not summary:
            continue
        state["sops"].append(
            {
                "source_id": source_id,
                "title": _string_or_fallback(record.get("title"), state["source_map"][source_id]["title"]),
                "summary": summary,
            }
        )

    for record in raw_output.get("events", []):
        if not isinstance(record, dict):
            continue
        state["events"].append(
            {
                "source_id": source_id,
                "event_type": _string_or_fallback(record.get("event_type"), "document_event"),
                "title": _string_or_fallback(record.get("title"), "Document event"),
                "event_date": _optional_string(record.get("event_date")),
            }
        )

    for record in raw_output.get("unknowns", []):
        if not isinstance(record, dict):
            continue
        field_name = _optional_string(record.get("field_name"))
        reason = _optional_string(record.get("reason"))
        if not field_name or not reason:
            continue
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": field_name,
                "reason": reason,
            }
        )

    return state


def _optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _string_or_fallback(value: Any, fallback: str) -> str:
    return _optional_string(value) or fallback


def _optional_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None
