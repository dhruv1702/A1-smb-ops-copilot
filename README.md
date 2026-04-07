# Inbox to Ops Brief

One-screen hackathon prototype for the SME operator concept:

`messy emails + invoices + notes -> daily brief with drafts, cash reminders, and receipts`

## What is in the repo

- `index.html`: single-screen operator UI
- `styles.css`: visual system and responsive layout
- `app.js`: file intake, compile flow, heuristics, and demo data

## How to run

Open [`index.html`](/Users/dhruvverma/Documents/Projects/A1-codex/index.html) directly in a browser, or serve the folder locally:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173`.

## Demo flow

1. Click `Load demo set`
2. Click `Compile business state`
3. Inspect the four cards:
   - Ops
   - Finance
   - Customer comms
   - Risks
4. Click any recommendation to inspect the receipts and citations in the right rail

Helpful deep links:

- `http://127.0.0.1:4173/?demo=1` loads the seeded files
- `http://127.0.0.1:4173/?demo=1&compiled=1` opens directly into the compiled operator brief

## Full demo path

Regenerate the backend demo artifacts used by both the backend and the Next.js frontend:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_demo_bundle.py
```

This writes:

- [`backend/data/demo_inputs/business_state.json`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/data/demo_inputs/business_state.json)
- [`backend/data/demo_inputs/daily_brief.json`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/data/demo_inputs/daily_brief.json)
- [`frontend/public/demo/daily_brief.json`](/Users/dhruvverma/Documents/Projects/A1-codex/frontend/public/demo/daily_brief.json)

Run the frontend app:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex/frontend
npm install
npm run dev
```

`npm run dev` now starts Next.js in polling mode by default to avoid `Watchpack Error (watcher): EMFILE` on this setup.

If you want the non-polling watcher path, use:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex/frontend
npm run dev:fast
```

Frontend demo deep link:

- `http://127.0.0.1:3000/?demo=1&run=1`

Frontend intake modes:

- `GET /api/daily-brief` rebuilds the fixed demo brief from the backend demo fixtures.
- `POST /api/daily-brief` accepts uploaded text files, pasted text, and voice transcript text, then runs the Python ingestion + agent pipeline on those live inputs.

## Notes

- The prototype intentionally stays lightweight: no integrations, no vector DB, no autonomous actions.
- Text files work best for extraction. Binary files are accepted for queueing but not deeply parsed in this version.

## Backend ingestion

The backend ingestion layer normalizes three demo source types into one shared JSON contract at [`backend/schemas/business_state.py`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/schemas/business_state.py):

- `customers`
- `invoices`
- `open_issues`
- `commitments`
- `sops`
- `events`
- `unknowns`
- `source_map`

Each nested record preserves `source_id`, and `source_map` keeps the source `source_type`, `title`, `snippet`, and `date` when one is available.

Run the demo ingestion build:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_demo_business_state.py
```

This writes the demo contract to [`backend/data/demo_inputs/business_state.json`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/data/demo_inputs/business_state.json).

Run backend ingestion tests:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 -m unittest discover -s backend/tests
```

Build a brief directly from inline text inputs:

```bash
cd /Users/dhruvverma/Documents/Projects/A1-codex
python3 backend/scripts/build_daily_brief_from_inputs.py /path/to/input.json /tmp/daily_brief.json
```

Team handoff and contract rules live in [`backend/README.md`](/Users/dhruvverma/Documents/Projects/A1-codex/backend/README.md).
