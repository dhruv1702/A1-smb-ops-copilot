"""Build the shared business_state object from normalized source documents."""

from dataclasses import dataclass
from datetime import date
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
