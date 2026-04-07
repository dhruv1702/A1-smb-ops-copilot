"""Ingestion helpers for building the shared business_state contract."""

from backend.ingestion.build_business_state import (
    SourceDocument,
    build_business_state,
    create_source_document,
    infer_source_type,
    needs_llm_fallback,
)

__all__ = [
    "SourceDocument",
    "build_business_state",
    "create_source_document",
    "infer_source_type",
    "needs_llm_fallback",
]
