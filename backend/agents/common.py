from __future__ import annotations

from datetime import date, datetime
import re
from typing import Any


DEFAULT_REFERENCE_DATE = date(2026, 4, 7)


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def line_for(text: str, phrase: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if phrase.lower() in stripped.lower():
            return stripped
    return None


def capture(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else ""


def preview_text(text: str, length: int = 160) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= length:
        return normalized
    return f"{normalized[:length].rstrip()}..."


def parse_reference_date(business_state: dict[str, Any]) -> date:
    candidate = (
        business_state.get("reference_date")
        or business_state.get("generated_at")
        or business_state.get("as_of")
    )
    if not candidate:
        return DEFAULT_REFERENCE_DATE
    if isinstance(candidate, str):
        try:
            return datetime.fromisoformat(candidate.replace("Z", "+00:00")).date()
        except ValueError:
            pass
        try:
            return date.fromisoformat(candidate[:10])
        except ValueError:
            return DEFAULT_REFERENCE_DATE
    return DEFAULT_REFERENCE_DATE


def days_overdue(due_date_text: str, reference_date: date) -> int:
    try:
        due_date = date.fromisoformat(due_date_text)
    except ValueError:
        return 0
    return max(0, (reference_date - due_date).days)


def detect_document_kind(document: dict[str, Any]) -> str:
    text = f"{document.get('name', '')}\n{document.get('text', '')}".lower()
    if "invoice" in text:
        return "invoice"
    if "subject:" in text or "from:" in text or "re:" in text:
        return "email"
    if "note" in text or "playbook" in text or "sop" in text:
        return "note"
    return "doc"


def normalize_document(raw: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "id": raw.get("id") or f"doc-{index + 1}",
        "name": raw.get("name") or raw.get("title") or f"document-{index + 1}.txt",
        "text": raw.get("text") or raw.get("content") or "",
        "origin": raw.get("origin") or "business_state",
        "kind": raw.get("kind") or detect_document_kind(raw),
    }


def get_documents(business_state: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(business_state.get("documents"), list):
        return [
            normalize_document(document, index)
            for index, document in enumerate(business_state["documents"])
        ]

    documents: list[dict[str, Any]] = []
    for collection_key, fallback_kind in (("emails", "email"), ("invoices", "invoice"), ("notes", "note")):
        for index, item in enumerate(business_state.get(collection_key, [])):
            document = normalize_document(item, len(documents) + index)
            document["kind"] = document.get("kind") or fallback_kind
            documents.append(document)
    return documents


def register_receipt(
    receipts: list[dict[str, Any]],
    *,
    source_document: dict[str, Any],
    title: str,
    excerpt: str,
    receipt_type: str,
) -> dict[str, Any]:
    stable_key = slugify(f"{source_document['id']}-{title}-{excerpt[:48]}")
    receipt = {
        "id": f"receipt-{stable_key}",
        "title": title,
        "source_id": source_document["id"],
        "source_name": source_document["name"],
        "source_type": receipt_type,
        "excerpt": excerpt,
    }
    receipts.append(receipt)
    return receipt


def get_playbook_rules(
    business_state: dict[str, Any],
    receipts: list[dict[str, Any]],
) -> dict[str, dict[str, Any] | None]:
    rules = {
        "same_day_update": None,
        "partial_ship": None,
        "supplier_escalation": None,
        "reminder_cadence": None,
        "sensitive_account": None,
    }
    for document in get_documents(business_state):
        if document["kind"] != "note":
            continue
        text = document["text"]
        if line := line_for(text, "slips by more than 48 hours"):
            rules["same_day_update"] = register_receipt(
                receipts,
                source_document=document,
                title="Delay rule",
                excerpt=line,
                receipt_type="note",
            )
        if line := line_for(text, "partial ship"):
            rules["partial_ship"] = register_receipt(
                receipts,
                source_document=document,
                title="Partial shipment rule",
                excerpt=line,
                receipt_type="note",
            )
        if line := line_for(text, "Call Northline supplier"):
            rules["supplier_escalation"] = register_receipt(
                receipts,
                source_document=document,
                title="Supplier escalation rule",
                excerpt=line,
                receipt_type="note",
            )
        if line := line_for(text, "Payment reminder cadence"):
            rules["reminder_cadence"] = register_receipt(
                receipts,
                source_document=document,
                title="Reminder cadence",
                excerpt=line,
                receipt_type="note",
            )
        if line := line_for(text, "account is sensitive"):
            rules["sensitive_account"] = register_receipt(
                receipts,
                source_document=document,
                title="Sensitive account note",
                excerpt=line,
                receipt_type="note",
            )
    return rules


def merge_receipts(*receipt_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for group in receipt_groups:
        for receipt in group:
            merged.setdefault(receipt["id"], receipt)
    return list(merged.values())
