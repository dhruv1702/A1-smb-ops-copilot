from __future__ import annotations

from typing import Any

from backend.agents.common import merge_receipts
from backend.schemas.daily_brief import DailyBrief


PRIORITY_ORDER = {1: 0, 2: 1, 3: 2, 4: 3}


def _theme_for_item(item: dict[str, Any]) -> str:
    text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
    if any(token in text for token in ("shipment", "eta", "delivery", "partial-ship", "partial ship", "launch")):
        return "customer_trust"
    if any(token in text for token in ("trust", "escalation", "complaint", "sensitive")):
        return "customer_trust"
    if any(token in text for token in ("invoice", "payment", "receivables", "cash", "collections")):
        return "cash_collection"
    return item.get("title", "").strip().lower()


def _fingerprint(item: dict[str, Any], receipt_map: dict[str, dict[str, Any]]) -> str:
    source_ids = sorted(
        {
            receipt_map[receipt_id]["source_id"]
            for receipt_id in item.get("receipt_ids", [])
            if receipt_id in receipt_map
        }
    )
    return f"{'|'.join(source_ids)}::{_theme_for_item(item)}"


def _dedupe_items(items: list[dict[str, Any]], receipt_map: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for item in items:
        key = _fingerprint(item, receipt_map)
        if key in deduped:
            existing = deduped[key]
            existing["receipt_ids"] = sorted(set(existing.get("receipt_ids", []) + item.get("receipt_ids", [])))
            existing["source_agents"] = sorted(set(existing.get("source_agents", []) + item.get("source_agents", [])))
            existing["priority"] = min(existing.get("priority", 4), item.get("priority", 4))
            if len(item.get("summary", "")) > len(existing.get("summary", "")):
                existing["summary"] = item["summary"]
            continue
        deduped[key] = dict(item)
    return sorted(
        deduped.values(),
        key=lambda item: (PRIORITY_ORDER.get(item.get("priority", 4), 99), item.get("title", "")),
    )


def _build_executive_summary(daily_brief: DailyBrief) -> list[str]:
    summary: list[str] = []
    if daily_brief.risks:
        summary.append(daily_brief.risks[0]["summary"])
    if daily_brief.finance:
        summary.append(daily_brief.finance[0]["summary"])
    if daily_brief.recommended_actions:
        summary.append(f"{len(daily_brief.recommended_actions)} prioritized action(s) are ready for review.")
    return summary[:3]


def _dedupe_drafts(drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for draft in drafts:
        key = draft.get("id") or draft.get("subject", "").strip().lower()
        if key in deduped:
            existing = deduped[key]
            existing["receipt_ids"] = sorted(set(existing.get("receipt_ids", []) + draft.get("receipt_ids", [])))
            continue
        deduped[key] = dict(draft)
    return sorted(deduped.values(), key=lambda draft: draft.get("subject", ""))


def create_daily_brief(agent_outputs: list[dict[str, Any]]) -> dict[str, Any]:
    merged_receipts = merge_receipts(*[output.get("receipts", []) for output in agent_outputs])
    receipt_map = {receipt["id"]: receipt for receipt in merged_receipts}
    daily_brief = DailyBrief(
        ops=_dedupe_items([item for output in agent_outputs for item in output.get("ops", [])], receipt_map),
        finance=_dedupe_items([item for output in agent_outputs for item in output.get("finance", [])], receipt_map),
        customer_comms=_dedupe_items(
            [item for output in agent_outputs for item in output.get("customer_comms", [])],
            receipt_map,
        ),
        risks=_dedupe_items([item for output in agent_outputs for item in output.get("risks", [])], receipt_map),
        recommended_actions=_dedupe_items(
            [item for output in agent_outputs for item in output.get("recommended_actions", [])],
            receipt_map,
        ),
        drafts=_dedupe_drafts([item for output in agent_outputs for item in output.get("drafts", [])]),
        receipts=merged_receipts,
    )
    daily_brief.executive_summary = _build_executive_summary(daily_brief)
    return daily_brief.to_dict()
