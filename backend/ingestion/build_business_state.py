"""Build the shared business_state object from normalized source documents."""

from dataclasses import dataclass
from datetime import date
import re
from typing import Iterable, Optional, Set

from backend.ingestion.parse_email import parse_email
from backend.ingestion.parse_invoice import parse_invoice
from backend.ingestion.parse_note import parse_note
from backend.ingestion.parse_with_llm import llm_parser_configured, parse_document_with_llm
from backend.schemas.business_state import BusinessState, empty_business_state, merge_business_state


@dataclass(frozen=True)
class SourceDocument:
    source_id: str
    source_type: str
    title: str
    text: str


SUPPORTED_SOURCE_TYPES = {"email", "invoice", "note"}
EMAIL_HEADER_PATTERN = re.compile(r"^(from|to|subject|date|received):\s+", re.IGNORECASE | re.MULTILINE)


def create_source_document(
    source_id: str,
    title: str,
    text: str,
    source_type: Optional[str] = None,
) -> SourceDocument:
    resolved_source_type = source_type or infer_source_type(title=title, text=text)
    if resolved_source_type not in SUPPORTED_SOURCE_TYPES:
        raise ValueError("Unsupported source_type: %s" % resolved_source_type)

    return SourceDocument(
        source_id=source_id,
        source_type=resolved_source_type,
        title=title,
        text=text,
    )


def infer_source_type(title: str, text: str) -> str:
    lowered_title = title.lower()
    lowered_text = text.lower()

    if "invoice" in lowered_title:
        return "invoice"
    if "invoice #" in lowered_text or ("amount due" in lowered_text and "due date" in lowered_text):
        return "invoice"

    if EMAIL_HEADER_PATTERN.search(text):
        return "email"
    if any(token in lowered_title for token in ("email", "follow up", "complaint")) and "@" in lowered_text:
        return "email"

    return "note"


def build_business_state(
    sources: Iterable[SourceDocument],
    reference_date: Optional[date] = None,
    allow_llm_fallback: bool = False,
) -> BusinessState:
    business_state = empty_business_state()
    seen_source_ids: Set[str] = set()

    for source in sources:
        if source.source_id in seen_source_ids:
            raise ValueError("Duplicate source_id found: %s" % source.source_id)
        seen_source_ids.add(source.source_id)

        parsed = _parse_source_document(source, reference_date)
        if allow_llm_fallback and llm_parser_configured() and needs_llm_fallback(source, parsed):
            try:
                parsed = parse_document_with_llm(
                    source.source_id,
                    source.title,
                    source.text,
                    source_type_hint=source.source_type,
                    reference_date=reference_date,
                )
            except Exception:
                pass

        merge_business_state(business_state, parsed)

    return business_state


def _parse_source_document(source: SourceDocument, reference_date: Optional[date]) -> BusinessState:
    if source.source_type == "email":
        return parse_email(source.source_id, source.title, source.text)
    if source.source_type == "invoice":
        return parse_invoice(source.source_id, source.title, source.text, reference_date=reference_date)
    if source.source_type == "note":
        return parse_note(source.source_id, source.title, source.text)
    raise ValueError("Unsupported source_type: %s" % source.source_type)


def needs_llm_fallback(source: SourceDocument, parsed: BusinessState) -> bool:
    if source.source_type == "invoice":
        if not parsed["invoices"]:
            return True
        critical_missing = {
            unknown["field_name"]
            for unknown in parsed["unknowns"]
            if unknown["source_id"] == source.source_id
        }
        return len(critical_missing.intersection({"invoice_number", "amount", "due_date", "company_name"})) >= 2

    if source.source_type == "email":
        has_signal = bool(parsed["customers"] or parsed["open_issues"] or parsed["events"])
        critical_missing = {
            unknown["field_name"]
            for unknown in parsed["unknowns"]
            if unknown["source_id"] == source.source_id
        }
        return (not has_signal) or len(critical_missing.intersection({"company_name", "contact_email", "date"})) >= 2

    if source.source_type == "note":
        return not (parsed["commitments"] or parsed["sops"])

    return False
