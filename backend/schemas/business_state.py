"""Typed contract for the shared business_state payload."""

from typing import Dict, List, Literal, Optional, TypedDict


SourceType = Literal["email", "invoice", "note"]


class CustomerRecord(TypedDict):
    source_id: str
    company_name: Optional[str]
    contact_name: Optional[str]
    contact_email: Optional[str]
    status: Optional[str]


class InvoiceRecord(TypedDict):
    source_id: str
    company_name: Optional[str]
    invoice_number: Optional[str]
    amount: Optional[float]
    currency: Optional[str]
    due_date: Optional[str]
    status: str


class OpenIssueRecord(TypedDict):
    source_id: str
    company_name: Optional[str]
    issue_type: str
    status: str
    summary: str


class CommitmentRecord(TypedDict):
    source_id: str
    commitment: str
    trigger: Optional[str]
    due_hint: Optional[str]


class SOPRecord(TypedDict):
    source_id: str
    title: str
    summary: str


class EventRecord(TypedDict):
    source_id: str
    event_type: str
    title: str
    event_date: Optional[str]


class UnknownRecord(TypedDict):
    source_id: str
    field_name: str
    reason: str


class SourceMapEntry(TypedDict):
    source_type: SourceType
    title: str
    snippet: str
    date: Optional[str]


class BusinessState(TypedDict):
    customers: List[CustomerRecord]
    invoices: List[InvoiceRecord]
    open_issues: List[OpenIssueRecord]
    commitments: List[CommitmentRecord]
    sops: List[SOPRecord]
    events: List[EventRecord]
    unknowns: List[UnknownRecord]
    source_map: Dict[str, SourceMapEntry]


def empty_business_state() -> BusinessState:
    return {
        "customers": [],
        "invoices": [],
        "open_issues": [],
        "commitments": [],
        "sops": [],
        "events": [],
        "unknowns": [],
        "source_map": {},
    }


def merge_business_state(base: BusinessState, incoming: BusinessState) -> BusinessState:
    base["customers"].extend(incoming["customers"])
    base["invoices"].extend(incoming["invoices"])
    base["open_issues"].extend(incoming["open_issues"])
    base["commitments"].extend(incoming["commitments"])
    base["sops"].extend(incoming["sops"])
    base["events"].extend(incoming["events"])
    base["unknowns"].extend(incoming["unknowns"])
    base["source_map"].update(incoming["source_map"])
    return base


def compact_text(text: str, limit: int = 220) -> str:
    snippet = " ".join(text.split())
    if len(snippet) <= limit:
        return snippet
    return snippet[: limit - 3].rstrip() + "..."
