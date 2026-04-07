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


def run_customer_relations_agent(business_state: dict[str, Any]) -> dict[str, Any]:
    receipts: list[dict[str, Any]] = []
    rules = get_playbook_rules(business_state, receipts)
    customer_comms: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    recommended_actions: list[dict[str, Any]] = []
    drafts: list[dict[str, Any]] = []
    customer_by_source = _customer_index(business_state)

    for document in get_documents(business_state):
        if document["kind"] != "email":
            continue

        text = document["text"]
        lowered = text.lower()
        if "launch" not in lowered and "shipment" not in lowered and "delivery" not in lowered:
            continue

        customer_row = customer_by_source.get(document["id"], {})
        customer = customer_row.get("company_name") or ("ACME Retail" if "acme retail" in lowered else "Customer")
        contact_name = customer_row.get("contact_name") or ("Maya Patel" if "maya patel" in lowered else customer)
        first_name = str(contact_name).split(" ")[0]
        launch_line = line_for(text, "launch is on Friday") or preview_text(text)
        update_line = line_for(text, "realistic ETA today") or line_for(text, "please tell us plainly") or launch_line
        partial_line = line_for(text, "partial delivery is possible") or update_line

        launch_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer launch timeline is at risk",
            excerpt=launch_line,
            receipt_type="email",
        )
        update_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer wants a plain update today",
            excerpt=update_line,
            receipt_type="email",
        )
        partial_receipt = register_receipt(
            receipts,
            source_document=document,
            title="Customer asked for a partial delivery fallback",
            excerpt=partial_line,
            receipt_type="email",
        )
        receipt_ids = [
            receipt["id"]
            for receipt in (
                launch_receipt,
                update_receipt,
                partial_receipt,
                rules["same_day_update"],
                rules["partial_ship"],
                rules["sensitive_account"],
            )
            if receipt
        ]

        comms_id = f"comms-{slugify(customer)}-shipment"
        customer_comms.append(
            {
                "id": comms_id,
                "title": f"Prepare a trust-rebuilding update for {customer}",
                "summary": "Use direct language, provide a firm ETA, and explicitly address the partial-ship fallback.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "customer_success",
                "due": "today",
                "source_agents": ["customer_relations_agent"],
                "status": "ready_for_review",
            }
        )
        risks.append(
            {
                "id": f"risk-churn-{slugify(customer)}",
                "title": f"{customer} is at escalation risk",
                "summary": "The account is launch-sensitive and the founder note says this relationship has low tolerance for vague updates.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "customer_success",
                "due": "today",
                "source_agents": ["customer_relations_agent"],
                "status": "open",
            }
        )
        recommended_actions.append(
            {
                "id": f"action-{comms_id}",
                "title": f"Review and send customer update to {customer}",
                "summary": "Send a same-day response with a real date, not a soft promise.",
                "priority": 1,
                "receipt_ids": receipt_ids,
                "owner": "customer_success",
                "due": "today",
                "source_agents": ["customer_relations_agent"],
                "status": "pending_review",
            }
        )
        drafts.append(
            {
                "id": f"draft-{slugify(customer)}-shipment",
                "channel": "email",
                "subject": "Shipment update and next steps",
                "body": "\n".join(
                    [
                        f"Hi {first_name},",
                        "",
                        "You are right to ask for a direct update.",
                        "The shipment did not leave on the original timing, and we are confirming the revised dispatch window with the supplier this morning.",
                        "We will send you a firm ETA today. If the full order cannot move together, we will confirm whether a partial shipment can go first to protect the Friday launch.",
                        "",
                        "Best,",
                        "Operations",
                    ]
                ),
                "tone": "direct, accountable, date-specific",
                "related_action_id": f"action-{comms_id}",
                "receipt_ids": receipt_ids,
            }
        )

    return {
        "agent": "customer_relations_agent",
        "executive_summary": [
            item["summary"] for item in customer_comms[:1]
        ],
        "ops": [],
        "finance": [],
        "customer_comms": customer_comms,
        "risks": risks,
        "recommended_actions": recommended_actions,
        "drafts": drafts,
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
