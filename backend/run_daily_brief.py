from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.agents.customer_relations_agent import run_customer_relations_agent
from backend.agents.finance_agent import run_finance_agent
from backend.agents.inbox_agent import run_inbox_agent
from backend.agents.orchestrator import create_daily_brief


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("business_state.json")
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("daily_brief.json")

    with input_path.open("r", encoding="utf-8") as infile:
        business_state = json.load(infile)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(run_inbox_agent, business_state),
            executor.submit(run_finance_agent, business_state),
            executor.submit(run_customer_relations_agent, business_state),
        ]
    daily_brief = create_daily_brief([future.result() for future in futures])

    with output_path.open("w", encoding="utf-8") as outfile:
        json.dump(daily_brief, outfile, indent=2)
        outfile.write("\n")

    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
