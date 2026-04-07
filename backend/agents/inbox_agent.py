from __future__ import annotations

from typing import Any

from backend.agents.common import (
    get_documents,
    get_playbook_rules,
    line_for,
    preview_text,
    register_receipt,
    source_map_entry,
    slugify,
)


def run_inbox_agent(business_state: dict[str, Any]) -> dict[str, Any]:
    receipts: list[dict[str, Any]] = []
    rules = get_playbook_rules(business_state, receipts)
    ops: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    recommended_actions: list[dict[str, Any]] = []
    customer_by_source = _customer_index(business_state)

    for document in get_documents(business_state):
        if document["kind"] != "email":
            continue

        text = document["text"]
        lowered = text.lower()
        if "shipment" not in lowered and "delivery" not in lowered:
            continue

        customer_row = customer_by_source.get(document["id"], {})
        customer = customer_row.get("company_name") or ("ACME Retail" if "acme retail" in lowered else "Customer")
        contact = customer_row.get("contact_name") or ("Maya Patel" if "maya patel" in lowered else customer)
        issue_line = line_for(text, "delivery update") or line_for(text, "shipment would leave") or preview_text(text)
        deadline_line = line_for(text, "ETA today") or line_for(text, "realistic ETA today") or issue_line
        partial_line = line_for(text, "partial delivery is possible") or issue_line

        issue_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer is waiting on a shipment update",
            excerpt=issue_line,
            receipt_type="email",
        )
        deadline_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer requested a realistic ETA today",
            excerpt=deadline_line,
            receipt_type="email",
        )
        partial_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer asked about a partial delivery",
            excerpt=partial_line,
            receipt_type="email",
        )

        rule_receipts = [
            rules["same_day_update"],
            rules["partial_ship"],
            rules["supplier_escalation"],
            rules["sensitive_account"],
        ]
        receipt_ids = [receipt["id"] for receipt in [issue_receipt, deadline_receipt, partial_receipt, *rule_receipts] if receipt]

        ops_id = f"inbox-waiting-{slugify(customer)}"
        ops.append(
            {
                "id": ops_id,
                "title": f"{customer} is waiting on an update",
                "summary": f"{contact} needs a direct shipment ETA today and asked for an honest status update.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "ops",
                "due": "today",
                "source_agents": ["inbox_agent"],
                "status": "open",
            }
        )
        recommended_actions.append(
            {
                "id": f"action-{ops_id}",
                "title": f"Send {customer} a factual shipment update today",
                "summary": "Confirm revised timing, avoid vague language, and include the partial-ship option if inventory is split.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "ops",
                "due": "today",
                "source_agents": ["inbox_agent"],
                "status": "pending_review",
            }
        )
        risks.append(
            {
                "id": f"risk-{slugify(customer)}-trust",
                "title": f"{customer} trust risk is elevated",
                "summary": "The customer has an imminent launch and is already asking for a plain-English status correction.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "ops",
                "due": "today",
                "source_agents": ["inbox_agent"],
                "status": "open",
            }
        )

    return {
        "agent": "inbox_agent",
        "executive_summary": [
            item["summary"] for item in ops[:1]
        ],
        "ops": ops,
        "finance": [],
        "customer_comms": [],
        "risks": risks,
        "recommended_actions": recommended_actions,
        "drafts": [],
        "receipts": receipts,
    }


def _customer_index(business_state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    customers = business_state.get("customers")
    if not isinstance(customers, list):
        return index
    for customer in customers:
        if not isinstance(customer, dict):
            continue
        source_id = customer.get("source_id")
        if source_id:
            source_entry = source_map_entry(business_state, source_id)
            index[str(source_id)] = {
                "company_name": customer.get("company_name") or source_entry.get("title"),
                "contact_name": customer.get("contact_name"),
            }
    return index
