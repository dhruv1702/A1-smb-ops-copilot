"""Deterministic parser for invoice text and extracted PDF text."""

from datetime import date, datetime
import re
from typing import Optional, Tuple

from backend.schemas.business_state import BusinessState, compact_text, empty_business_state


INVOICE_NUMBER_PATTERN = re.compile(r"Invoice\s*#?\s*([A-Za-z0-9-]+)", re.IGNORECASE)
CUSTOMER_PATTERN = re.compile(r"Customer:\s*(.+)", re.IGNORECASE)
ISSUE_DATE_PATTERN = re.compile(r"Issue Date:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
DUE_DATE_PATTERN = re.compile(r"Due Date:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)
STATUS_PATTERN = re.compile(r"Status:\s*(.+)", re.IGNORECASE)
AMOUNT_PATTERN = re.compile(r"Amount Due:\s*([$€£])?\s*([\d,]+(?:\.\d{2})?)", re.IGNORECASE)


def parse_invoice(source_id: str, title: str, text: str, reference_date: Optional[date] = None) -> BusinessState:
    state = empty_business_state()

    invoice_number = _match_group(INVOICE_NUMBER_PATTERN, text)
    company_name = _match_group(CUSTOMER_PATTERN, text)
    issue_date = _match_group(ISSUE_DATE_PATTERN, text)
    due_date = _match_group(DUE_DATE_PATTERN, text)
    raw_status = _match_group(STATUS_PATTERN, text)
    currency_symbol, amount = _extract_amount(text)
    currency = _normalize_currency(currency_symbol)
    status = _normalize_status(raw_status, due_date, reference_date)

    state["source_map"][source_id] = {
        "source_type": "invoice",
        "title": title or "Invoice",
        "snippet": compact_text(text),
        "date": issue_date or due_date,
    }

    state["invoices"].append(
        {
            "source_id": source_id,
            "company_name": company_name,
            "invoice_number": invoice_number,
            "amount": amount,
            "currency": currency,
            "due_date": due_date,
            "status": status,
        }
    )

    if status in ("unpaid", "overdue"):
        state["open_issues"].append(
            {
                "source_id": source_id,
                "company_name": company_name,
                "issue_type": "invoice_collection",
                "status": status,
                "summary": _build_issue_summary(invoice_number, company_name, amount, due_date, reference_date, status),
            }
        )

    if issue_date:
        state["events"].append(
            {
                "source_id": source_id,
                "event_type": "invoice_issued",
                "title": "Invoice issued",
                "event_date": issue_date,
            }
        )
    else:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "issue_date",
                "reason": "Invoice issue date was not found.",
            }
        )

    if due_date:
        state["events"].append(
            {
                "source_id": source_id,
                "event_type": "invoice_due",
                "title": "Invoice due date",
                "event_date": due_date,
            }
        )
    else:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "due_date",
                "reason": "Invoice due date was not found.",
            }
        )

    if not company_name:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "company_name",
                "reason": "Invoice customer name was not found.",
            }
        )

    if not invoice_number:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "invoice_number",
                "reason": "Invoice number was not found.",
            }
        )

    if amount is None:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "amount",
                "reason": "Invoice amount due was not found.",
            }
        )

    return state


def _match_group(pattern: re.Pattern, text: str) -> Optional[str]:
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1).strip()


def _extract_amount(text: str) -> Tuple[Optional[str], Optional[float]]:
    match = AMOUNT_PATTERN.search(text)
    if not match:
        return None, None
    raw_symbol = match.group(1) or "$"
    raw_amount = match.group(2).replace(",", "")
    return raw_symbol, float(raw_amount)


def _normalize_currency(symbol: Optional[str]) -> Optional[str]:
    if symbol == "$":
        return "USD"
    if symbol == "€":
        return "EUR"
    if symbol == "£":
        return "GBP"
    return None


def _normalize_status(raw_status: Optional[str], due_date: Optional[str], reference_date: Optional[date]) -> str:
    lowered = (raw_status or "").strip().lower()
    if "paid" in lowered and "unpaid" not in lowered:
        return "paid"
    if "unpaid" in lowered or "open" in lowered:
        if due_date and reference_date:
            due = _parse_iso_date(due_date)
            if due and due < reference_date:
                return "overdue"
        return "unpaid"
    return "unknown"


def _build_issue_summary(
    invoice_number: Optional[str],
    company_name: Optional[str],
    amount: Optional[float],
    due_date: Optional[str],
    reference_date: Optional[date],
    status: str,
) -> str:
    company = company_name or "Customer"
    invoice = "Invoice #%s" % invoice_number if invoice_number else "Unknown invoice"
    amount_text = "unknown amount" if amount is None else "$%.2f" % amount

    if status == "overdue" and due_date and reference_date:
        due = _parse_iso_date(due_date)
        if due:
            overdue_days = (reference_date - due).days
            return "%s for %s is overdue by %s days (%s)." % (invoice, company, overdue_days, amount_text)

    if due_date:
        return "%s for %s is unpaid and due on %s (%s)." % (invoice, company, due_date, amount_text)
    return "%s for %s is unpaid (%s)." % (invoice, company, amount_text)


def _parse_iso_date(raw_value: str) -> Optional[date]:
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d").date()
    except ValueError:
        return None
