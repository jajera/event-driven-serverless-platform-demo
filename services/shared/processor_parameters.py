"""Shared processor parameter definitions used by API and dispatcher services."""

from __future__ import annotations

ALLOWED_PROCESSOR_PARAMETERS: frozenset[str] = frozenset(
    {
        "NAV_DAY_OFFSET",
        "SAVE_PARQUET",
        "SAVE_CSV",
        "SAVE_JSON",
        "SAVE_STATIC_PLOTS",
        "SAVE_INTERACTIVE_PLOTS",
    }
)

