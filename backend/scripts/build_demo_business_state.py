"""Build backend/data/demo_inputs/business_state.json from the demo fixtures."""

import json
import sys
from datetime import date
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    from backend.ingestion.build_business_state import SourceDocument, build_business_state

    data_dir = root / "backend" / "data" / "demo_inputs"
    output_path = data_dir / "business_state.json"

    sources = [
        SourceDocument(
            source_id="email_acme_shipment_delay",
            source_type="email",
            title="ACME shipment delay email",
            text=(data_dir / "customer_email.txt").read_text(),
        ),
        SourceDocument(
            source_id="invoice_1042_bluebird",
            source_type="invoice",
            title="Invoice #1042",
            text=(data_dir / "invoice_1042.txt").read_text(),
        ),
        SourceDocument(
            source_id="note_founder_fulfillment",
            source_type="note",
            title="Founder fulfillment note",
            text=(data_dir / "founder_note.md").read_text(),
        ),
    ]

    business_state = build_business_state(sources, reference_date=date(2026, 4, 7))
    output_path.write_text(json.dumps(business_state, indent=2) + "\n")
    print("Wrote %s" % output_path.relative_to(root))


if __name__ == "__main__":
    main()
