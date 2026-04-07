"""Build a daily brief from inline intake inputs."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT = Path(__file__).resolve().parents[2]


def ensure_repo_root_on_path() -> Path:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    return ROOT


def parse_reference_date(raw_value: Optional[str]) -> Optional[date]:
    if not raw_value:
        return None
    return date.fromisoformat(raw_value)


def build_daily_brief_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    ensure_repo_root_on_path()

    from backend.ingestion.build_business_state import build_business_state, create_source_document
    from backend.run_daily_brief import build_daily_brief

    raw_inputs = payload.get("inputs", [])
    if not raw_inputs:
        raise ValueError("Payload must include at least one input.")

    sources = [
        create_source_document(
            source_id=raw_input["source_id"],
            title=raw_input["title"],
            text=raw_input["text"],
            source_type=raw_input.get("source_type"),
        )
        for raw_input in raw_inputs
        if raw_input.get("text", "").strip()
    ]

    if not sources:
        raise ValueError("Payload inputs did not include any non-empty text.")

    business_state = build_business_state(
        sources,
        reference_date=parse_reference_date(payload.get("reference_date")),
    )
    return build_daily_brief(business_state)


def read_payload(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_output(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        raise SystemExit("Usage: build_daily_brief_from_inputs.py INPUT_JSON [OUTPUT_JSON]")

    input_path = Path(argv[1])
    output_path = Path(argv[2]) if len(argv) > 2 else None

    daily_brief = build_daily_brief_from_payload(read_payload(input_path))

    if output_path:
        write_output(output_path, daily_brief)
    else:
        sys.stdout.write(json.dumps(daily_brief))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
