from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from backend.agents.customer_relations_agent import run_customer_relations_agent
from backend.agents.finance_agent import run_finance_agent
from backend.agents.inbox_agent import run_inbox_agent
from backend.agents.orchestrator import create_daily_brief


def run_with_openclaw_shell(
    business_state: dict[str, Any],
    dispatcher: Callable[[str, Callable[[dict[str, Any]], dict[str, Any]], dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    tasks = {
        "inbox_agent": run_inbox_agent,
        "finance_agent": run_finance_agent,
        "customer_relations_agent": run_customer_relations_agent,
    }

    if dispatcher:
        outputs = [
            dispatcher(task_name, task_callable, business_state)
            for task_name, task_callable in tasks.items()
        ]
        return create_daily_brief(outputs)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(task_callable, business_state)
            for task_callable in tasks.values()
        ]
    return create_daily_brief([future.result() for future in futures])
