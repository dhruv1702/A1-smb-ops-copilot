from __future__ import annotations

from typing import Any

from backend.agents.common import (
    capture,
    days_overdue,
    get_documents,
    get_playbook_rules,
    line_for,
    parse_reference_date,
    register_receipt,
    slugify,
)


def run_finance_agent(business_state: dict[str, Any]) -> dict[str, Any]:
    receipts: list[dict[str, Any]] = []
    rules = get_playbook_rules(business_state, receipts)
    reference_date = parse_reference_date(business_state)
    finance: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    recommended_actions: list[dict[str, Any]] = []
    drafts: list[dict[str, Any]] = []

    for document in get_documents(business_state):
        if document["kind"] != "invoice":
            continue

        invoice_number = capture(document["text"], r"Invoice\s*#(\d+)")
        customer = capture(document["text"], r"Customer:\s*(.+)")
        due_date = capture(document["text"], r"Due Date:\s*(\d{4}-\d{2}-\d{2})")
        amount_due = capture(document["text"], r"Amount Due:\s*\$([\d,]+(?:\.\d{2})?)")
        if not all((invoice_number, customer, due_date, amount_due)):
            continue

        overdue_days = days_overdue(due_date, reference_date)
        amount_label = f"${amount_due}"
        due_receipt = register_receipt(
            receipts,
            source_document=document,
            title=f"Invoice #{invoice_number} due date",
            excerpt=line_for(document["text"], "Due Date") or f"Due Date: {due_date}",
            receipt_type="invoice",
        )
        amount_receipt = register_receipt(
            receipts,
            source_document=document,
            title=f"Invoice #{invoice_number} amount due",
            excerpt=line_for(document["text"], "Amount Due") or f"Amount Due: {amount_label}",
            receipt_type="invoice",
        )
        reminder_receipt = register_receipt(
            receipts,
            source_document=document,
            title=f"Invoice #{invoice_number} reminder status",
            excerpt=line_for(document["text"], "Reminder") or "Reminder not yet sent.",
            receipt_type="invoice",
        )
        receipt_ids = [
            receipt["id"]
            for receipt in (due_receipt, amount_receipt, reminder_receipt, rules["reminder_cadence"])
            if receipt
        ]

        finance_id = f"finance-overdue-{invoice_number}"
        finance.append(
            {
                "id": finance_id,
                "title": f"Invoice #{invoice_number} is {overdue_days} days overdue",
                "summary": f"{customer} still owes {amount_label} and no reminder has been sent.",
                "priority": 2,
                "receipt_ids": receipt_ids,
                "owner": "finance",
                "due": "today" if overdue_days >= 7 else None,
                "source_agents": ["finance_agent"],
                "status": "open",
            }
        )
        recommended_actions.append(
            {
                "id": f"action-{finance_id}",
                "title": f"Send payment follow-up for invoice #{invoice_number}",
                "summary": f"Collect a payment date from {customer} and restart collections cadence immediately.",
                "priority": 2,
                "receipt_ids": receipt_ids,
                "owner": "finance",
                "due": "today" if overdue_days >= 7 else None,
                "source_agents": ["finance_agent"],
                "status": "pending_review",
            }
        )
        risks.append(
            {
                "id": f"risk-ar-{slugify(customer)}-{invoice_number}",
                "title": f"{amount_label} is aging in receivables",
                "summary": f"Invoice #{invoice_number} is outside the first reminder window and cash collection is slipping.",
                "priority": 2,
                "receipt_ids": receipt_ids,
                "owner": "finance",
                "due": None,
                "source_agents": ["finance_agent"],
                "status": "open",
            }
        )
        drafts.append(
            {
                "id": f"draft-payment-reminder-{invoice_number}",
                "channel": "email",
                "subject": f"Payment reminder: Invoice #{invoice_number}",
                "body": "\n".join(
                    [
                        f"Hi {customer},",
                        "",
                        f"A quick reminder that invoice #{invoice_number} for {amount_label} was due on {due_date} and is now {overdue_days} days overdue.",
                        "Please reply with the payment date, or let us know if anything is blocking processing on your side.",
                        "",
                        "Thank you,",
                        "Accounts",
                    ]
                ),
                "tone": "firm and professional",
                "related_action_id": f"action-{finance_id}",
                "receipt_ids": receipt_ids,
            }
        )

    return {
        "agent": "finance_agent",
        "executive_summary": [
            item["summary"] for item in finance[:1]
        ],
        "ops": [],
        "finance": finance,
        "customer_comms": [],
        "risks": risks,
        "recommended_actions": recommended_actions,
        "drafts": drafts,
        "receipts": receipts,
    }
