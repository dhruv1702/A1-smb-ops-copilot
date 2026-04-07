# Backend Contract

This backend slice owns one thing: building a stable `business_state` contract from demo source inputs.

## Scope

Safe areas for ingestion work:

- [`backend/schemas/business_state.py`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/schemas/business_state.py)
- [`backend/ingestion`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/ingestion)
- [`backend/data/demo_inputs`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/data/demo_inputs)
- [`backend/scripts/build_demo_business_state.py`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/scripts/build_demo_business_state.py)
- [`backend/tests/test_ingestion.py`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/tests/test_ingestion.py)

Avoid changing future agent/orchestrator or frontend work from here.

## Contract Rules

The top-level `business_state` keys are frozen for downstream teammates:

- `customers`
- `invoices`
- `open_issues`
- `commitments`
- `sops`
- `events`
- `unknowns`
- `source_map`

Do not rename these fields.
Do not add new top-level keys casually.
Do not remove `source_id` from any nested record.

If a parser cannot extract a required value, put the gap in `unknowns` instead of inventing new schema.

## Consumer Notes

- Agent/orchestrator work should read [`backend/data/demo_inputs/business_state.json`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/data/demo_inputs/business_state.json) as the canonical demo input.
- Frontend work should consume `business_state` or a later `daily_brief` contract without re-parsing raw files.
- `source_map` is the receipts anchor for evidence display.

## Commands

Build the demo contract:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_demo_business_state.py
```

Build the full demo bundle, including frontend-facing `daily_brief.json`:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_demo_bundle.py
```

Build a `daily_brief` from inline text inputs:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_daily_brief_from_inputs.py /path/to/input.json /tmp/daily_brief.json
```

Run backend ingestion tests:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 -m unittest discover -s backend/tests
```
