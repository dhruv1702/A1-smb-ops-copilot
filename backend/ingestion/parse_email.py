"""Deterministic parser for demo customer email inputs."""

import re
from typing import Optional, Tuple

from backend.schemas.business_state import BusinessState, compact_text, empty_business_state


EMAIL_HEADER_PATTERN = re.compile(r"^([A-Za-z-]+):\s*(.+)$", re.MULTILINE)
FROM_PATTERN = re.compile(r"^(?P<name>[^<]+?)\s*<(?P<email>[^>]+)>$")
DATE_PATTERN = re.compile(r"(\d{4}-\d{2}-\d{2})")
PO_PATTERN = re.compile(r"\bPO[- ]?\d+\b", re.IGNORECASE)


def parse_email(source_id: str, title: str, text: str) -> BusinessState:
    state = empty_business_state()
    headers = _extract_headers(text)
    subject = headers.get("subject") or title
    received_date = _extract_date(headers.get("received"))
    contact_name, contact_email = _extract_sender(headers.get("from"))
    company_name = _extract_company_name(text, contact_email)
    body = _extract_body(text)
    issue_type = _detect_issue_type(body)
    status = _detect_status(body)

    state["source_map"][source_id] = {
        "source_type": "email",
        "title": subject,
        "snippet": compact_text(body or text),
        "date": received_date,
    }

    state["customers"].append(
        {
            "source_id": source_id,
            "company_name": company_name,
            "contact_name": contact_name,
            "contact_email": contact_email,
            "status": status,
        }
    )

    if issue_type:
        state["open_issues"].append(
            {
                "source_id": source_id,
                "company_name": company_name,
                "issue_type": issue_type,
                "status": status or "open",
                "summary": _build_issue_summary(company_name, body),
            }
        )

    if received_date:
        state["events"].append(
            {
                "source_id": source_id,
                "event_type": "email_received",
                "title": "Customer email received",
                "event_date": received_date,
            }
        )
    else:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "date",
                "reason": "Email received date was not found in the headers.",
            }
        )

    if not company_name:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "company_name",
                "reason": "Could not identify the customer company from the email signature or sender.",
            }
        )

    if not contact_email:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "contact_email",
                "reason": "Sender email address was not found in the From header.",
            }
        )

    return state


def _extract_headers(text: str) -> dict:
    headers = {}
    for key, value in EMAIL_HEADER_PATTERN.findall(text):
        headers[key.lower()] = value.strip()
    return headers


def _extract_sender(raw_from: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not raw_from:
        return None, None

    match = FROM_PATTERN.match(raw_from.strip())
    if match:
        return match.group("name").strip(), match.group("email").strip().lower()
    return raw_from.strip(), None


def _extract_date(raw_value: Optional[str]) -> Optional[str]:
    if not raw_value:
        return None
    match = DATE_PATTERN.search(raw_value)
    return match.group(1) if match else None


def _extract_body(text: str) -> str:
    parts = text.split("\n\n", 1)
    if len(parts) == 2:
        return parts[1].strip()
    return text.strip()


def _extract_company_name(text: str, contact_email: Optional[str]) -> Optional[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in reversed(lines):
        if "@" in line or ":" in line:
            continue
        if "," in line:
            company_candidate = line.split(",", 1)[1].strip()
            if _looks_like_company(company_candidate):
                return company_candidate
        if _looks_like_company(line):
            return line

    if not contact_email or "@" not in contact_email:
        return None

    domain = contact_email.split("@", 1)[1].split(".", 1)[0]
    return domain.replace("-", " ").replace("_", " ").title()


def _looks_like_company(value: str) -> bool:
    if len(value.split()) < 2:
        return False
    lowered = value.lower()
    disallowed = ("thanks", "hi team", "operations manager")
    return not any(token in lowered for token in disallowed)


def _detect_issue_type(body: str) -> Optional[str]:
    lowered = body.lower()
    if any(token in lowered for token in ("shipment", "delivery")) and any(
        token in lowered for token in ("slip", "delay", "update", "eta")
    ):
        return "shipment_delay"
    if any(token in lowered for token in ("complaint", "issue", "problem")):
        return "customer_complaint"
    if any(token in lowered for token in ("waiting", "follow up", "reply")):
        return "customer_follow_up"
    return None


def _detect_status(body: str) -> Optional[str]:
    lowered = body.lower()
    if any(token in lowered for token in ("still do not have", "waiting", "need a realistic eta today", "today")):
        return "waiting"
    if "urgent" in lowered:
        return "urgent"
    return "open" if body else None


def _build_issue_summary(company_name: Optional[str], body: str) -> str:
    po_match = PO_PATTERN.search(body)
    base_name = company_name or "Customer"
    if po_match:
        return "%s is waiting on an update for %s." % (base_name, po_match.group(0).upper())
    return "%s is waiting on a shipment or delivery update." % base_name
