import importlib
import json
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.ingestion.build_business_state import (
    SourceDocument,
    build_business_state,
    create_source_document,
    infer_source_type,
    needs_llm_fallback,
)
from backend.ingestion.parse_email import parse_email
from backend.ingestion.parse_invoice import parse_invoice
from backend.ingestion.parse_note import parse_note


DEMO_DIR = ROOT / "backend" / "data" / "demo_inputs"
BUILD_BUSINESS_STATE_MODULE = importlib.import_module("backend.ingestion.build_business_state")


class ParseEmailTests(unittest.TestCase):
    def test_parse_email_extracts_customer_issue_and_receipts(self) -> None:
        text = (DEMO_DIR / "customer_email.txt").read_text()

        result = parse_email(
            source_id="email_acme_shipment_delay",
            title="ACME shipment delay email",
            text=text,
        )

        self.assertEqual(result["customers"][0]["company_name"], "ACME Retail")
        self.assertEqual(result["customers"][0]["contact_name"], "Maya Patel")
        self.assertEqual(result["customers"][0]["contact_email"], "maya@acme-retail.com")
        self.assertEqual(result["customers"][0]["status"], "waiting")

        self.assertEqual(result["open_issues"][0]["issue_type"], "shipment_delay")
        self.assertEqual(result["open_issues"][0]["summary"], "ACME Retail is waiting on an update for PO-7781.")

        self.assertEqual(result["events"][0]["event_type"], "email_received")
        self.assertEqual(result["events"][0]["event_date"], "2026-04-07")
        self.assertEqual(result["source_map"]["email_acme_shipment_delay"]["source_type"], "email")
        self.assertEqual(result["unknowns"], [])

    def test_parse_email_tracks_missing_headers_in_unknowns(self) -> None:
        text = "Subject: Follow up\n\nChecking in on the shipment update."

        result = parse_email(
            source_id="email_missing_headers",
            title="Follow up",
            text=text,
        )

        unknown_fields = {item["field_name"] for item in result["unknowns"]}
        self.assertEqual(unknown_fields, {"date", "company_name", "contact_email"})
        self.assertEqual(result["source_map"]["email_missing_headers"]["title"], "Follow up")

    def test_parse_email_flags_eta_only_follow_up_as_open_issue(self) -> None:
        text = (
            "From: Maya Patel <maya@acme-retail.com>\n"
            "Subject: Shipment update\n"
            "Received: 2026-04-07\n\n"
            "We still do not have a realistic ETA for PO-7781."
        )

        result = parse_email(
            source_id="email_eta_followup",
            title="Shipment update",
            text=text,
        )

        self.assertEqual(result["open_issues"][0]["issue_type"], "shipment_delay")


class ParseInvoiceTests(unittest.TestCase):
    def test_parse_invoice_extracts_invoice_and_marks_overdue(self) -> None:
        text = (DEMO_DIR / "invoice_1042.txt").read_text()

        result = parse_invoice(
            source_id="invoice_1042_bluebird",
            title="Invoice #1042",
            text=text,
            reference_date=date(2026, 4, 7),
        )

        invoice = result["invoices"][0]
        self.assertEqual(invoice["company_name"], "Bluebird Home")
        self.assertEqual(invoice["invoice_number"], "1042")
        self.assertEqual(invoice["amount"], 4860.0)
        self.assertEqual(invoice["currency"], "USD")
        self.assertEqual(invoice["due_date"], "2026-03-26")
        self.assertEqual(invoice["status"], "overdue")

        issue = result["open_issues"][0]
        self.assertEqual(issue["issue_type"], "invoice_collection")
        self.assertIn("overdue by 12 days", issue["summary"])
        self.assertEqual(len(result["events"]), 2)
        self.assertEqual(result["unknowns"], [])

    def test_parse_invoice_tracks_missing_required_fields_in_unknowns(self) -> None:
        text = "Status: Unpaid"

        result = parse_invoice(
            source_id="invoice_missing_fields",
            title="Broken invoice",
            text=text,
            reference_date=date(2026, 4, 7),
        )

        unknown_fields = {item["field_name"] for item in result["unknowns"]}
        self.assertEqual(
            unknown_fields,
            {"issue_date", "due_date", "company_name", "invoice_number", "amount"},
        )
        self.assertEqual(result["invoices"][0]["status"], "unpaid")


class ParseNoteTests(unittest.TestCase):
    def test_parse_note_extracts_commitments_due_hints_and_sops(self) -> None:
        text = (DEMO_DIR / "founder_note.md").read_text()

        result = parse_note(
            source_id="note_founder_fulfillment",
            title="Founder fulfillment note",
            text=text,
        )

        self.assertEqual(len(result["commitments"]), 4)
        self.assertEqual(len(result["sops"]), 4)
        self.assertEqual(result["commitments"][0]["trigger"], "any outbound shipment slips by more than 48 hours")
        self.assertEqual(result["commitments"][0]["due_hint"], "same day")
        self.assertEqual(result["commitments"][1]["due_hint"], "before 11:00")
        self.assertEqual(result["source_map"]["note_founder_fulfillment"]["source_type"], "note")
        self.assertEqual(result["unknowns"], [])

    def test_parse_note_uses_unknowns_when_no_explicit_commitments_exist(self) -> None:
        result = parse_note(
            source_id="note_no_bullets",
            title="Loose note",
            text="Loose note\n\nRemember to think about shipping soon.",
        )

        self.assertEqual(result["commitments"], [])
        self.assertEqual(result["sops"], [])
        self.assertEqual(result["unknowns"][0]["field_name"], "commitments")


class BuildBusinessStateTests(unittest.TestCase):
    def test_build_business_state_matches_demo_fixture(self) -> None:
        sources = [
            SourceDocument(
                source_id="email_acme_shipment_delay",
                source_type="email",
                title="ACME shipment delay email",
                text=(DEMO_DIR / "customer_email.txt").read_text(),
            ),
            SourceDocument(
                source_id="invoice_1042_bluebird",
                source_type="invoice",
                title="Invoice #1042",
                text=(DEMO_DIR / "invoice_1042.txt").read_text(),
            ),
            SourceDocument(
                source_id="note_founder_fulfillment",
                source_type="note",
                title="Founder fulfillment note",
                text=(DEMO_DIR / "founder_note.md").read_text(),
            ),
        ]

        result = build_business_state(sources, reference_date=date(2026, 4, 7))
        expected = json.loads((DEMO_DIR / "business_state.json").read_text())

        self.assertEqual(result, expected)

    def test_build_business_state_rejects_duplicate_source_ids(self) -> None:
        duplicate_sources = [
            SourceDocument(
                source_id="duplicate_source",
                source_type="email",
                title="First",
                text=(DEMO_DIR / "customer_email.txt").read_text(),
            ),
            SourceDocument(
                source_id="duplicate_source",
                source_type="note",
                title="Second",
                text=(DEMO_DIR / "founder_note.md").read_text(),
            ),
        ]

        with self.assertRaises(ValueError):
            build_business_state(duplicate_sources, reference_date=date(2026, 4, 7))

    def test_create_source_document_infers_supported_source_types(self) -> None:
        email_document = create_source_document(
            source_id="email_auto",
            title="Customer email",
            text="From: Maya Patel <maya@acme-retail.com>\nSubject: Shipment update\n\nWe are still waiting.",
        )
        invoice_document = create_source_document(
            source_id="invoice_auto",
            title="Invoice #1042 extracted text",
            text="Invoice #1042\nAmount Due: $4860.00\nDue Date: 2026-03-26",
        )
        note_document = create_source_document(
            source_id="note_auto",
            title="Founder note",
            text="- Call supplier before 11:00 if tracking is missing.\n- Send direct update same day.",
        )

        self.assertEqual(email_document.source_type, "email")
        self.assertEqual(invoice_document.source_type, "invoice")
        self.assertEqual(note_document.source_type, "note")

    def test_infer_source_type_defaults_to_note_for_unstructured_text(self) -> None:
        self.assertEqual(
            infer_source_type(
                title="Loose update",
                text="Need to think about shipping soon and review old notes.",
            ),
            "note",
        )

    def test_needs_llm_fallback_when_note_has_no_structured_commitments(self) -> None:
        source = SourceDocument(
            source_id="note_unstructured",
            source_type="note",
            title="Scanned ops memo",
            text="This is a messy operating memo without bullets.",
        )
        parsed = parse_note(source.source_id, source.title, source.text)
        self.assertTrue(needs_llm_fallback(source, parsed))

    def test_build_business_state_uses_llm_fallback_for_weak_parse_when_enabled(self) -> None:
        source = SourceDocument(
            source_id="note_unstructured",
            source_type="note",
            title="Scanned ops memo",
            text="This is a messy operating memo without bullets.",
        )
        llm_state = {
            "customers": [],
            "invoices": [],
            "open_issues": [],
            "commitments": [
                {
                    "source_id": "note_unstructured",
                    "commitment": "Call supplier before noon.",
                    "trigger": "If shipment status is unclear",
                    "due_hint": "before noon",
                }
            ],
            "sops": [
                {
                    "source_id": "note_unstructured",
                    "title": "Scanned ops memo",
                    "summary": "Call supplier before noon if shipment status is unclear.",
                }
            ],
            "events": [],
            "unknowns": [],
            "source_map": {
                "note_unstructured": {
                    "source_type": "note",
                    "title": "Scanned ops memo",
                    "snippet": "Call supplier before noon if shipment status is unclear.",
                    "date": None,
                }
            },
        }

        with patch.object(BUILD_BUSINESS_STATE_MODULE, "llm_parser_configured", return_value=True), patch.object(
            BUILD_BUSINESS_STATE_MODULE,
            "parse_document_with_llm",
            return_value=llm_state,
        ) as parse_with_llm:
            result = build_business_state(
                [source],
                reference_date=date(2026, 4, 7),
                allow_llm_fallback=True,
            )

        self.assertEqual(result["commitments"], llm_state["commitments"])
        self.assertEqual(result["sops"], llm_state["sops"])
        parse_with_llm.assert_called_once()


if __name__ == "__main__":
    unittest.main()
