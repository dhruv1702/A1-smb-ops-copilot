from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Draft:
    id: str
    channel: str
    subject: str
    body: str
    tone: str
    related_action_id: str
    receipt_ids: list[str] = field(default_factory=list)


@dataclass
class BriefItem:
    id: str
    title: str
    summary: str
    priority: int
    receipt_ids: list[str] = field(default_factory=list)
    owner: str = "ops"
    due: str | None = None
    source_agents: list[str] = field(default_factory=list)
    status: str = "open"


@dataclass
class Receipt:
    id: str
    title: str
    source_id: str
    source_name: str
    source_type: str
    excerpt: str


@dataclass
class DailyBrief:
    executive_summary: list[str] = field(default_factory=list)
    ops: list[dict[str, Any]] = field(default_factory=list)
    finance: list[dict[str, Any]] = field(default_factory=list)
    customer_comms: list[dict[str, Any]] = field(default_factory=list)
    risks: list[dict[str, Any]] = field(default_factory=list)
    recommended_actions: list[dict[str, Any]] = field(default_factory=list)
    drafts: list[dict[str, Any]] = field(default_factory=list)
    receipts: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
