"""Build the shared business_state object from normalized source documents."""

from dataclasses import dataclass
from datetime import date
import re
from typing import Iterable, Optional, Set

from backend.ingestion.parse_email import parse_email
from backend.ingestion.parse_invoice import parse_invoice
from backend.ingestion.parse_note import parse_note
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
    sources: Iterable[SourceDocument], reference_date: Optional[date] = None
) -> BusinessState:
    business_state = empty_business_state()
    seen_source_ids: Set[str] = set()

    for source in sources:
        if source.source_id in seen_source_ids:
            raise ValueError("Duplicate source_id found: %s" % source.source_id)
        seen_source_ids.add(source.source_id)

        if source.source_type == "email":
            parsed = parse_email(source.source_id, source.title, source.text)
        elif source.source_type == "invoice":
            parsed = parse_invoice(source.source_id, source.title, source.text, reference_date=reference_date)
        elif source.source_type == "note":
            parsed = parse_note(source.source_id, source.title, source.text)
        else:
            raise ValueError("Unsupported source_type: %s" % source.source_type)

        merge_business_state(business_state, parsed)

    return business_state
