"""Deterministic parser for founder notes and SOP text."""

import re
from typing import List, Optional, Tuple

from backend.schemas.business_state import BusinessState, compact_text, empty_business_state


BULLET_PATTERN = re.compile(r"^\s*[-*]\s+(?P<item>.+)$", re.MULTILINE)


def parse_note(source_id: str, title: str, text: str) -> BusinessState:
    state = empty_business_state()
    note_title = _first_non_empty_line(text) or title
    bullet_items = _extract_bullets(text)

    state["source_map"][source_id] = {
        "source_type": "note",
        "title": note_title or title,
        "snippet": compact_text(bullet_items[0] if bullet_items else text),
        "date": None,
    }

    if not bullet_items:
        state["unknowns"].append(
            {
                "source_id": source_id,
                "field_name": "commitments",
                "reason": "No explicit SOP bullets or note commitments were found.",
            }
        )
        return state

    for bullet in bullet_items:
        commitment_text, trigger = _extract_commitment_and_trigger(bullet)
        due_hint = _extract_due_hint(bullet)

        state["sops"].append(
            {
                "source_id": source_id,
                "title": note_title or title,
                "summary": bullet,
            }
        )
        state["commitments"].append(
            {
                "source_id": source_id,
                "commitment": commitment_text,
                "trigger": trigger,
                "due_hint": due_hint,
            }
        )

    return state


def _first_non_empty_line(text: str) -> Optional[str]:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return None


def _extract_bullets(text: str) -> List[str]:
    matches = [match.group("item").strip() for match in BULLET_PATTERN.finditer(text)]
    if matches:
        return matches

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) <= 1:
        return []
    return lines[1:]


def _extract_commitment_and_trigger(bullet: str) -> Tuple[str, Optional[str]]:
    cleaned = bullet.rstrip(". ").strip()
    lowered = cleaned.lower()

    if lowered.startswith("if "):
        trigger, separator, remainder = cleaned[3:].partition(",")
        if separator:
            return remainder.strip(), trigger.strip()

    before_if, separator, after_if = cleaned.partition(" if ")
    if separator:
        return before_if.strip(), after_if.strip()

    before_semicolon, separator, after_semicolon = cleaned.partition(";")
    if separator:
        return after_semicolon.strip(), before_semicolon.strip()

    before_colon, separator, after_colon = cleaned.partition(":")
    if separator and len(before_colon) <= 40:
        return after_colon.strip(), before_colon.strip()

    return cleaned, None


def _extract_due_hint(bullet: str) -> Optional[str]:
    lowered = bullet.lower()
    due_hints = []

    if "same day" in lowered:
        due_hints.append("same day")

    before_match = re.search(r"before\s+\d{1,2}:\d{2}", lowered)
    if before_match:
        due_hints.append(before_match.group(0))

    overdue_matches = re.findall(r"\d+\s+overdue days", lowered)
    due_hints.extend(overdue_matches)

    if not due_hints:
        return None
    return "; ".join(due_hints)
